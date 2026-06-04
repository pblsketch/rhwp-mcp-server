#!/usr/bin/env python3
"""Long-lived stdio helper for driving the locally installed Hangul (HWP) word
processor's interactive desktop automation surface.

First-principles rationale (no second-hand references):
    The Hangul word processor exposes an automation object model on Windows.
    Creating and editing a *live* document through that object model yields
    higher fidelity (real cell geometry, live editing) than a pure byte-level
    engine. That object model must be driven inside an interactive desktop
    session — bare instantiation blocks in a non-interactive shell. This helper
    is therefore a *desktop-only* component: it is spawned by the Node bridge
    on a user's interactive Windows desktop, and it speaks line-delimited JSON
    on stdin/stdout so the Node side owns the engine contract, timeouts, and
    error classification while this side owns the automation object model.

Protocol:
    One JSON request object per stdin line. One JSON response object per stdout
    line. Each response carries {"ok": true, ...} on success or
    {"ok": false, "category": ..., "code": ..., "message": ...} on failure.
    The helper never raises across the protocol boundary: every command is
    wrapped so a host automation error becomes a structured failure response
    rather than a crash. Timeouts are NOT this helper's job — the Node bridge
    imposes per-command timeouts and kills the process if a command blocks
    (e.g. on an auto-recovery or update dialog the host may show).

Commands:
    ping            import the wrapper + report whether the automation object
                    is registered. Does NOT create the automation object.
    open            {"path": ...}  open an existing document (lazy-creates Hwp)
    create_blank    create a new blank document (lazy-creates Hwp)
    fill_fields     {"fields": {name: value, ...}}  set 누름틀 field values
    fill_cells      {"cells": {addr: value, ...}}   set table cell values
    save_as         {"path": ..., "format": ...}    save the current document
    get_cell_metadata {"coords": {...}}             read table cell geometry
    quit            release the document + automation object, then exit

Lazy lifetime:
    The automation object (Hwp) is created only on the first document command
    (open / create_blank), never during ping. ping confirms the wrapper imports
    and the automation registration is present, so the Node bridge can decide
    whether the engine is reachable without paying the (blocking) cost of
    instantiating the live object in a context that may not support it.

Security module (opt-in):
    Registering a permissive file-path security module suppresses the host's
    per-operation file-access confirmation prompt, letting the tool read/write
    files unattended. That deliberately relaxes a safety prompt, so it is OFF
    by default and only enabled when RHWP_COM_REGISTER_MODULE=1 (or the
    --register-module flag) is set. The project does not redistribute any
    vendor checker binary — registration is delegated to the wrapper against
    what is already installed on the host.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any, Dict, Optional


# ---------------------------------------------------------------------------
# Protocol helpers
# ---------------------------------------------------------------------------

def _write(obj: Dict[str, Any]) -> None:
    """Write one JSON response line to stdout and flush immediately."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _ok(**fields: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {"ok": True}
    out.update(fields)
    return out


def _err(category: str, code: str, message: str) -> Dict[str, Any]:
    return {"ok": False, "category": category, "code": code, "message": message}


# ---------------------------------------------------------------------------
# Wrapper / automation-object access
# ---------------------------------------------------------------------------

def _register_module_enabled(args: Optional[Dict[str, Any]]) -> bool:
    """Opt-in gate for the permissive security module. Off unless explicitly
    enabled by env var or per-command argument."""
    if os.environ.get("RHWP_COM_REGISTER_MODULE") == "1":
        return True
    if args is not None and bool(args.get("register_module")):
        return True
    return "--register-module" in sys.argv[1:]


class HelperState:
    """Holds the lazily-created automation object. Kept tiny on purpose: the
    Node side owns orchestration; this is just a thin command dispatcher."""

    def __init__(self) -> None:
        self.hwp: Any = None  # the live automation object, created lazily
        self.wrapper_module: Any = None  # the imported automation wrapper

    def _import_wrapper(self) -> Any:
        """Import the automation wrapper module. Cached after first import."""
        if self.wrapper_module is None:
            import pyhwpx  # type: ignore  # noqa: F401  (optional dependency)

            self.wrapper_module = pyhwpx
        return self.wrapper_module

    def ensure_hwp(self, args: Optional[Dict[str, Any]]) -> Any:
        """Create the live automation object on first use. This is the call
        that requires an interactive desktop session and may block in a
        non-interactive context — the Node bridge guards it with a timeout."""
        if self.hwp is not None:
            return self.hwp
        wrapper = self._import_wrapper()
        register = _register_module_enabled(args)
        # The wrapper exposes the automation object as Hwp(...). register_module
        # toggles the opt-in permissive file-path checker registration.
        self.hwp = wrapper.Hwp(new=True, register_module=register)
        return self.hwp


STATE = HelperState()


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def cmd_ping(_args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Confirm the wrapper imports and the automation object is registered,
    WITHOUT creating the live object. Reports registration presence so the Node
    bridge can gate operability on a real handshake."""
    try:
        STATE._import_wrapper()
    except Exception as exc:  # noqa: BLE001 — structured, never crash ping
        return _err(
            "session",
            "WRAPPER_IMPORT_FAILED",
            f"automation wrapper import failed: {exc}",
        )

    registered = _automation_registered()
    return _ok(
        wrapper="importable",
        automation_registered=registered,
        register_module=_register_module_enabled(_args),
    )


def _automation_registered() -> bool:
    """Best-effort check that the automation object is registered on this host.
    Reads the Windows registry only — never instantiates the object."""
    try:
        import winreg  # type: ignore

        for root, path in (
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Classes\HWPFrame.HwpObject"),
            (
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\WOW6432Node\Classes\HWPFrame.HwpObject",
            ),
            (winreg.HKEY_CLASSES_ROOT, r"HWPFrame.HwpObject"),
        ):
            try:
                with winreg.OpenKey(root, path):
                    return True
            except OSError:
                continue
    except Exception:  # noqa: BLE001 — non-Windows / no winreg
        return False
    return False


def cmd_open(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not args or "path" not in args:
        return _err("other", "BAD_ARGS", "open requires a 'path'")
    hwp = STATE.ensure_hwp(args)
    opened = hwp.open(args["path"])
    return _ok(opened=bool(opened), path=args["path"])


def cmd_create_blank(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    # ensure_hwp already creates a new blank document (new=True).
    STATE.ensure_hwp(args)
    return _ok(created=True)


def cmd_fill_fields(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not args or "fields" not in args or not isinstance(args["fields"], dict):
        return _err("field", "BAD_ARGS", "fill_fields requires a 'fields' map")
    if STATE.hwp is None:
        return _err("session", "NO_DOCUMENT", "no document open; call open/create_blank first")
    hwp = STATE.hwp
    filled = []
    for name, value in args["fields"].items():
        hwp.put_field_text(name, str(value))
        filled.append(name)
    return _ok(filled=filled, count=len(filled))


def cmd_fill_cells(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not args or "cells" not in args or not isinstance(args["cells"], dict):
        return _err("field", "BAD_ARGS", "fill_cells requires a 'cells' map")
    if STATE.hwp is None:
        return _err("session", "NO_DOCUMENT", "no document open; call open/create_blank first")
    hwp = STATE.hwp
    filled = []
    for addr, value in args["cells"].items():
        # addr is a table cell address (e.g. "A1"); the wrapper exposes a
        # cell-addressed text setter on the live object model. The exact method
        # surface is validated on the interactive desktop target.
        hwp.set_cell_text(addr, str(value))
        filled.append(addr)
    return _ok(filled=filled, count=len(filled))


def cmd_save_as(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not args or "path" not in args:
        return _err("serialize", "BAD_ARGS", "save_as requires a 'path'")
    if STATE.hwp is None:
        return _err("session", "NO_DOCUMENT", "no document open; call open/create_blank first")
    hwp = STATE.hwp
    fmt = args.get("format")
    if fmt:
        hwp.save_as(args["path"], fmt)
    else:
        hwp.save_as(args["path"])
    return _ok(saved=True, path=args["path"])


def cmd_get_cell_metadata(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not args or "coords" not in args:
        return _err("other", "BAD_ARGS", "get_cell_metadata requires 'coords'")
    if STATE.hwp is None:
        return _err("session", "NO_DOCUMENT", "no document open; call open/create_blank first")
    # The live object model can report authoritative merge spans. The concrete
    # extraction depends on the wrapper's table API and is filled in against the
    # interactive desktop target; here we surface a structured "not yet wired"
    # so the Node side can fall back to its heuristic path deterministically.
    return _err(
        "other",
        "CELL_METADATA_UNIMPLEMENTED",
        "live cell-metadata extraction is pending interactive-desktop validation",
    )


def cmd_quit(_args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Release the document + automation object and signal the dispatch loop to
    exit. Best-effort: a failed release still exits cleanly."""
    try:
        if STATE.hwp is not None:
            quit_fn = getattr(STATE.hwp, "quit", None)
            if callable(quit_fn):
                quit_fn()
    except Exception:  # noqa: BLE001 — never block shutdown on a release error
        pass
    finally:
        STATE.hwp = None
    return _ok(quit=True)


HANDLERS = {
    "ping": cmd_ping,
    "open": cmd_open,
    "create_blank": cmd_create_blank,
    "fill_fields": cmd_fill_fields,
    "fill_cells": cmd_fill_cells,
    "save_as": cmd_save_as,
    "get_cell_metadata": cmd_get_cell_metadata,
    "quit": cmd_quit,
}


# ---------------------------------------------------------------------------
# Dispatch loop
# ---------------------------------------------------------------------------

def _handle_line(line: str) -> Optional[Dict[str, Any]]:
    """Parse + dispatch one request line. Returns the response dict, or None to
    signal the loop should terminate (after a quit)."""
    line = line.strip()
    if not line:
        return _err("other", "EMPTY", "empty request line")

    try:
        req = json.loads(line)
    except json.JSONDecodeError as exc:
        return _err("other", "BAD_JSON", f"invalid JSON request: {exc}")

    if not isinstance(req, dict):
        return _err("other", "BAD_REQUEST", "request must be a JSON object")

    cmd = req.get("cmd")
    if not isinstance(cmd, str):
        return _err("other", "NO_CMD", "request missing string 'cmd'")

    handler = HANDLERS.get(cmd)
    if handler is None:
        return _err("other", "UNKNOWN_CMD", f"unknown command '{cmd}'")

    args = req.get("args")
    if args is not None and not isinstance(args, dict):
        return _err("other", "BAD_ARGS", "'args' must be an object when present")

    try:
        resp = handler(args)
    except Exception as exc:  # noqa: BLE001 — host automation errors become structured
        resp = _err(
            "action",
            "HELPER_EXCEPTION",
            f"{type(exc).__name__}: {exc}",
        )
        # Preserve a compact traceback on stderr for desktop debugging; stdout
        # stays pure protocol.
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()

    # Echo the request id back when provided so the Node side can correlate.
    if isinstance(req.get("id"), (str, int)):
        resp = {"id": req["id"], **resp}
    return resp


def main() -> int:
    for line in sys.stdin:
        resp = _handle_line(line)
        if resp is None:
            break
        _write(resp)
        # A successful quit terminates the loop after its response is flushed.
        if resp.get("quit") is True and resp.get("ok") is True:
            break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

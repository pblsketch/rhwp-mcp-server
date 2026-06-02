# Security Policy

## Supported versions

`rhwp-mcp-server` is pre-1.0. Only the latest minor on the `0.1.x` line receives security fixes. Once `1.0.0` ships, this section will be updated with a longer support matrix.

## Reporting a vulnerability

Please report any of the following privately rather than as a public issue:

- Malformed `.hwp` / `.hwpx` input that causes the server process to crash, hang, or consume excessive memory.
- A way to escape the single-document session and read arbitrary files outside the user-passed `path`.
- Any vector where MCP tool input could trigger code execution outside the @rhwp/core WASM sandbox.
- Supply-chain concerns (compromised @rhwp/core release, etc.).

**How to report:** open a private GitHub Security Advisory in the repository, or — if the repo is not yet public — email the maintainers (contact details TBD before public release).

We aim to acknowledge reports within **3 business days** and provide a status update within **14 days**.

## Out of scope

- The integrity of the LLM that drives the MCP server is the responsibility of the host client (Claude Desktop, Cursor, Claude Code, etc.).
- Korean form templates collected in `corpus/` are external content; report issues with those upstream where they were obtained.
- Cosmetic rendering differences vs Hancom Office output are tracked as feature requests, not security issues.

## Notes for v0.1

- All processing happens locally over stdio — there is no network surface from this server itself.
- `@rhwp/core` is a WebAssembly module; Rust panics inside it are caught and surfaced as `RhwpError` rather than crashing the host process.

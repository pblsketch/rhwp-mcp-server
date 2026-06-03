# Skill surface (bring-your-own-model)

The same Korean-document core, callable outside the MCP protocol.

## Why this exists

The value of this project is the HWP/HWPX domain core (`src/rhwp/`) and the
pure handlers under `src/tools/`. The MCP server is one thin surface that calls
those handlers. The **skill surface** is a second, equally thin surface for a
different runtime shape.

An MCP server is spawned and driven by an MCP client. The skill surface instead
lets a host that **already has the user's own model or API key** drive the exact
same document actions directly — no MCP transport, no separate subscription.
This follows the core economics of the project: the client (or host) supplies
the model the user is already paying for, and this package supplies only the
Korean-document capability. Bring your own model.

Concretely, the skill surface is useful when:

- you are embedding HWP automation inside an app/agent that already holds a
  model and just needs the document operations, not a second protocol hop;
- you want to script the same flows the MCP tools expose from plain
  TypeScript/Node;
- you are running in an environment where standing up an MCP stdio server is
  more machinery than the task needs.

## What it is (and is not)

- **It is** a name → handler dispatcher. Each action maps 1:1 to the same pure
  `execute*` handler the MCP tool registration wraps. There is **zero new
  business logic** — the skill path and the MCP path produce identical output
  for the same input and session state.
- **It is not** a new set of capabilities, a new tool schema, or a new document
  model. The public MCP tool surface (and its schema-diff contract) is
  unchanged by the skill surface — no MCP tool is registered by it.

Because both surfaces share the process-level single-document session store,
they interoperate: a document opened via the skill surface is the same document
the MCP-style handlers see, and vice versa.

## Usage

```ts
import {
  runSkillAction,
  listSkillActions,
  warmSkillEngine,
} from "rhwp-mcp-server/skill"; // or the built path src/skill/index.js

// Optional: pay the engine-warm cost up-front (mirrors warm-on-start).
await warmSkillEngine();

// Open a document, find its blank cells, fill some in — the same flow the
// MCP tools expose, driven directly.
await runSkillAction("hwp_open", { path: "/abs/path/이력서.hwp" });

const blanks = await runSkillAction("hwp_locate_blanks", {});
// blanks.blanks[*].suggested_label tells you what each cell is asking for.

await runSkillAction("hwp_fill_cells", {
  map: { 이름: "홍길동", 연락처: "010-0000-0000", "2,1": "서울시" },
});

await runSkillAction("hwp_save_as", { path: "/abs/path/이력서-작성본.hwp" });
```

### Discovering actions

```ts
listSkillActions();
// → ["hwp_apply_action", "hwp_create_table", "hwp_engine_status", ...]
```

`isSkillAction(name)` narrows an arbitrary string to a known action; an unknown
name passed to `runSkillAction` throws `UnknownSkillActionError`.

## Action reference

Every action name matches its MCP tool name. Inputs and outputs are exactly the
MCP handler's input/output (see each tool's Zod schema for the precise shape).

| Action | Purpose |
| --- | --- |
| `hwp_open` | Open a `.hwp`/`.hwpx` file by path into the session. |
| `hwp_open_base64` | Open a document from base64 bytes (no filesystem). |
| `hwp_open_base64_validated` | Open from base64 with size/CRC integrity checks. |
| `hwp_open_blank` | Start a blank authoring document. |
| `hwp_list_fields` | List 누름틀 form-field controls. |
| `hwp_fill_fields` | Fill form fields by name. |
| `hwp_locate_blanks` | Discover blank table cells + inferred labels. |
| `hwp_fill_cells` | Fill table cells by coordinate or label. |
| `hwp_insert_text` | Insert text at the document start. |
| `hwp_create_table` | Create a table (optionally pre-filled). |
| `hwp_set_paragraph_style` | Apply paragraph formatting. |
| `hwp_apply_action` | Dispatch a catalog action by name. |
| `hwp_list_actions` | List available catalog actions. |
| `hwp_save_as` | Save the session document to a path. |
| `hwp_save_as_base64` | Serialize the session document to base64. |
| `hwp_engine_status` | Report which document engines are usable on this host. |

## Engine selection

The skill surface uses the same engine registry as the MCP server. The bundled
WASM engine works everywhere with no office runtime installed. On a host where a
higher-fidelity document runtime is detected, automatic selection prefers it and
falls back to WASM otherwise — call `hwp_engine_status` to see what the current
host resolves to. `warmSkillEngine(name)` accepts an explicit engine name when
you want to pin one.

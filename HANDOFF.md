# Sprint 0 Hand-off — rhwp-mcp-server

This archive is the Sprint 0 scaffolding for `rhwp-mcp-server`, produced by a Claude Code deep-interview → omc-plan consensus → Ralph run. It is **a starting point, not a finished build** — every tool handler currently throws `NOT_IMPLEMENTED` while signatures, schemas, CI, and the entire repo skeleton are real.

## What's in the box

```
package.json          tsconfig.json    LICENSE     NOTICE
.gitignore            .npmignore
README.md             CHANGELOG.md     SECURITY.md
HANDOFF.md (this file)
schemas/snapshot.json
docs/
  architecture.md
  decisions/0000-...adr-template.md
  decisions/0001-image-renderer.md   (DEFERRED — Sprint 0 step 7)
  measurements/.gitkeep
corpus/
  SOURCES.md
  forms/.gitkeep
scenarios/.gitkeep
src/
  server.ts                MCP stdio entry, warms WASM, registers 10 tools + hwp_ping
  rhwp/loader.ts           warmRhwp / getRhwp / panic-to-Result via wrapPanic
  rhwp/errors.ts           RhwpError typed error with categories
  session/store.ts         single global SessionStore singleton
  tools/{open,save_as,list_fields,fill_fields,
         insert_text,create_table,set_paragraph_style,
         preview,apply_action,list_actions}.ts
scripts/
  schema-snapshot.ts       regenerate schemas/snapshot.json from live zod
  schema-diff.ts           CI guard against signature drift
  measure-tool-tokens.ts   8 K token-budget check
  probe-rhwp-fields.ts     Sprint 0 step 9 (spec Open Q5)
.github/workflows/
  ci.yml                   6-cell matrix (Node 20/22 × Win/macOS/Linux) + WASM warm ≤ 2 s
  schema-diff.yml          per-PR schema stability gate
  catalog-drift.yml        Sprint 2 placeholder
  upstream-drift.yml       weekly cron auto-opens @rhwp/core drift issue
```

## How to extract and continue (on your machine)

```bash
mkdir rhwp-mcp-server
tar -xzf rhwp-mcp-server-sprint0.tar.gz -C rhwp-mcp-server
cd rhwp-mcp-server

# 1. Install dependencies (the only network-touching step)
npm install

# 2. Build TypeScript
npm run build

# 3. Run the Sprint 0 probes
npm run probe:fields      # → docs/measurements/rhwp-field-api.md
                          #   (confirms real @rhwp/core Field API names —
                          #    resolves spec Open Q5)
npm run measure:tokens    # → docs/measurements/tool-description-tokens.txt
                          #   (asserts ≤ 8 000 tokens for the 10-tool catalog)
npm run schema:snapshot   # regenerates schemas/snapshot.json from live zod
                          #   (compare against the hand-seeded version that
                          #    shipped — diffs surface zod-to-json-schema
                          #    variants that need reconciling)

# 4. Smoke the server
npm start                 # or: node dist/server.js
                          # Stderr prints: wasm warm: <ms>ms
                          # then:         rhwp-mcp-server v0.1.0-alpha.0 ready on stdio
                          # tool calls return NOT_IMPLEMENTED until Sprint 1.

# 5. Wire it into Claude Desktop / Cursor / Claude Code (see README.md)
#    to confirm hwp_ping returns "pong" through real MCP framing.
```

## Then push to GitHub to light up CI

```bash
git init && git add -A && git commit -m "Sprint 0 scaffolding"
gh repo create rhwp-mcp-server --public --source=. --push
```

The 4 workflows will run automatically. First-CI expectations:

- `ci.yml` may fail the `wasm warm ≤ 2 s` check on certain runners if @rhwp/core's WASM is slow to instantiate cold. If so: investigate, raise the threshold to a measured value plus headroom, document in CHANGELOG.
- `schema-diff.yml` passes — no drift yet, by definition.
- `catalog-drift.yml` is a Sprint 2 placeholder; passes for now.
- `upstream-drift.yml` runs only on the weekly cron; trigger it manually via the **Run workflow** button to confirm.

## Then proceed to Sprint 1

The plan (`./.omc/plans/plan-rhwp-mcp-mvp.md` — not in this archive; kept in your workspace) defines Sprint 1 as the Form Filling vertical. The four `src/tools/{open,save_as,list_fields,fill_fields}.ts` stubs are the implementation targets. Replace their `throw new RhwpError(...NOT_IMPLEMENTED)` bodies with real `@rhwp/core` calls — names guided by `probe-rhwp-fields` output.

Decision Gate 1.0: corpus N = 10 with Pass A ≥ 8/10 before starting Sprint 2.

## What did NOT happen in this Ralph session (and why)

These deliberately stopped at the workspace boundary:

| Action | Why deferred |
| --- | --- |
| `npm install` | Heavy (≈ 500 MB) and needs your machine for cross-platform validation. |
| CI runs | Requires GitHub repo push — your auth, not mine. |
| Field API probe execution | Requires @rhwp/core actually loaded, which requires install. |
| Image-renderer decision | Needs install probe on Windows ARM + macOS arm64 + Linux x64 hardware. |
| Korean form corpus collection | Manual human work (정부24 등). |
| Sprint 3.5 private beta | Recruiting external testers. |
| `npm publish` | Your npm credentials. |

This is the "deliver the full implementation" floor that ralph could realistically reach inside one Telegram-bound session. The plan's remaining 8 weeks are unchanged — you pick up at the install step on your own hardware.

## Useful artifacts kept in your workspace (not in this archive)

```
.omc/
  specs/deep-interview-rhwp-mcp.md           (locked, ambiguity 18 %)
  plans/plan-rhwp-mcp-mvp.md                 (9-week plan, ADR + RALPLAN-DR)
  drafts/plan-rhwp-mcp-draft-v{1,2}.md       (audit trail of consensus loop)
  state/sessions/<session>/prd.json          (Ralph PRD with 11 stories)
```

These are intentionally NOT included in the tar.gz — they belong to the workspace, not to the published project. If you want to commit them into the repo under e.g. `docs/planning/`, copy them in after extraction.

# rhwp-mcp-server

**AI에게 한글(HWP/HWPX) 문서 작업을 맡기세요.** 이력서·공문·가정통신문 같은 한컴
양식을 자동으로 채우고, 빈 문서에서 새 문서를 작성하고, `.hwp` ↔ `.hwpx` 변환까지 —
모두 대화로. 한컴오피스 설치 없이 작동합니다.

[![npm](https://img.shields.io/npm/v/rhwp-mcp-server/beta?color=cb3837&logo=npm)](https://www.npmjs.com/package/rhwp-mcp-server)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-stdio-7c3aed)](https://modelcontextprotocol.io)

> [MCP](https://modelcontextprotocol.io) 서버입니다. Claude Desktop · Claude Code ·
> Cursor · Codex CLI · Antigravity CLI 등 MCP를 지원하는 AI 클라이언트에 연결하면,
> AI가 한글 문서를 직접 열고·채우고·만들고·저장합니다. [@rhwp/core](https://github.com/edwardkim/rhwp)
> (Rust + WebAssembly) 엔진 기반.

---

## 이런 적 없으신가요?

- 학교에서 받은 **35칸짜리 이력서 양식**을 매번 손으로 채운다.
- **가정통신문**을 빈 문서에서 제목 가운데 정렬, 굵게, 글자 크기까지 일일이 맞춘다.
- 한컴오피스가 없는 컴퓨터에서 받은 `.hwp` 파일을 **열지도 못한다**.

이런 작업을 이제 AI에게 말로 시킬 수 있습니다:

| 이렇게 말하면 | AI가 이렇게 합니다 |
| --- | --- |
| *"이 이력서 양식에 제 정보로 채워줘"* | 빈칸을 찾아 → 이름·연락처·학력을 자동 입력 → 저장 |
| *"가정통신문 초안 만들어줘. 제목은 굵게 크게"* | 빈 문서에서 제목·본문·표를 작성하고 글자 스타일까지 적용 |
| *"이 .hwp를 .hwpx로 바꿔줘"* | 한컴오피스 없이 변환 (원본 손상 여부까지 검증) |

> 한국어 비개발자용 빠른 시작 가이드는 준비 중입니다. 현재는 아래 영어 setup
> 문서를 참고하세요 — 명령을 그대로 복사해서 쓰면 됩니다.

---

## 무엇을 할 수 있나 (세 가지 사용자 유형)

이 서버는 세 가지 사용 방식을 **동등하게** 지원합니다 — 하나가 메인이 아닙니다:

1. **양식 자동 채우기 (공공기관·HR·총무)** — 한컴 양식(이력서 / 공문 / 계약서 / 가정통신문)을 구조화된 데이터로 일괄 채우기. **누름틀(form field)** 양식과 **표 칸(table cell)** 양식 둘 다 지원.
2. **새 문서 작성 (지식 노동자 / 개발자)** — 빈 문서에서 제목·본문·표·글자 서식·문단 레이아웃까지 위에서 아래로 작성. 한컴오피스 라이선스 불필요.
3. **호환성 브리지 (한컴오피스 없는 환경)** — HWP ↔ HWPX 안전하게 읽기/쓰기. 저장 시 원본 보존 여부를 검증하는 binary-identity 게이트 내장 (ADR-0002).

> **표면(surface)은 교체 가능합니다.** 같은 한글 문서 코어를 MCP 서버로도, MCP
> 밖에서도 호출할 수 있습니다. 본인 모델/API 키를 이미 가진 호스트에서 별도 구독
> 없이 동일한 작업을 직접 구동하려면 [skill 표면](./docs/surfaces/skill.md)을
> 참고하세요 (신규 도구·신규 스키마 없음 — 기존 코어 재사용).

---

## 현재 상태

`0.1.0-beta.1` — **비공개 베타**입니다. 15개 도구가 실제 `@rhwp/core` 호출에
연결되어 있고, 66개 테스트 통과, binary-identity 게이트는 합성 코퍼스에서 5/5
PASS입니다. 실전 검증된 use case(실제 학교 이력서 35칸 채우기, 가정통신문 작성)도
있습니다. 전체 개발 이력은 [`CHANGELOG.md`](./CHANGELOG.md) 참고.

베타이므로 중요한 문서는 **백업 후** 사용하시고, 문제를 발견하면
[이슈](https://github.com/pblsketch/rhwp-mcp-server/issues)로 알려주세요.

## 설치하기 (Quick start)

먼저 컴퓨터에 [Node.js 20 이상](https://nodejs.org)이 설치되어 있어야 합니다
(`node --version`으로 확인).

설치는 **두 단계**입니다: ① 패키지를 설치하고 ② MCP 클라이언트에 등록합니다.
`npm install`만 해서는 AI 클라이언트가 서버를 인식하지 못합니다 — 등록은 별도
단계입니다. 본인이 쓰는 클라이언트를 골라 따라 하세요:

- **Claude Desktop** (앱 — 비개발자에게 가장 쉬움) → [아래](#claude-desktop)
- **Claude Code / Codex CLI / Antigravity CLI** (터미널 — 명령 한 줄) → [아래](#claude-code-one-line)
- **Cursor** (에디터) → [아래](#cursor)

> 처음이고 잘 모르겠다면 **Claude Desktop**으로 시작하는 걸 권합니다. 설정 파일에
> 짧은 JSON만 붙여넣으면 됩니다.

### Claude Code (one line)

```bash
npm install -g rhwp-mcp-server@beta
claude mcp add rhwp -- rhwp-mcp
```

Verify: `claude mcp list` should show `rhwp ... ✓ Connected`.

Want to skip the global install and let npx fetch on each launch?

```bash
claude mcp add rhwp -- npx -y rhwp-mcp-server@beta
```

### Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS),
adding the `rhwp` entry under `mcpServers`:

```jsonc
{
  "mcpServers": {
    "rhwp": {
      "command": "npx",
      "args": ["-y", "rhwp-mcp-server@beta"]
    }
  }
}
```

Then **quit Claude Desktop fully** (Cmd+Q on macOS, right-click tray → Quit
on Windows) and relaunch — Claude Desktop only re-reads the config on cold
start.

### Cursor

Edit `%USERPROFILE%\.cursor\mcp.json` (Windows) or `~/.cursor/mcp.json`
(macOS / Linux) with the same JSON block. Restart Cursor fully.

### Codex CLI (OpenAI, one line)

```bash
npm install -g rhwp-mcp-server@beta
codex mcp add rhwp -- rhwp-mcp
```

Or, skipping the global install: `codex mcp add rhwp -- npx -y rhwp-mcp-server@beta`.
Verify with `codex mcp list`.

### Antigravity CLI (Google)

Edit the shared config at `~/.gemini/config/mcp_config.json` (Windows:
`%USERPROFILE%\.gemini\config\mcp_config.json`) with the same `mcpServers`
JSON block, then restart Antigravity. The config is shared across the
Antigravity CLI and IDE. Note: strict JSON only — no comments.

Full per-client setup, troubleshooting, and verification:

- [`docs/setup/claude-code.md`](./docs/setup/claude-code.md)
- [`docs/setup/claude-desktop.md`](./docs/setup/claude-desktop.md)
- [`docs/setup/cursor.md`](./docs/setup/cursor.md)
- [`docs/setup/codex-cli.md`](./docs/setup/codex-cli.md)
- [`docs/setup/antigravity-cli.md`](./docs/setup/antigravity-cli.md)
- [`docs/setup/com-engine.md`](./docs/setup/com-engine.md) — 옵트인 호스트 런타임(자동화) 엔진 (한글 설치 + `pip install pyhwpx` + `RHWP_COM=1`, 대화형 데스크톱 전용)

## 설정이 끝나면 — 이렇게 말해보세요

연결이 되었는지 확인하려면 AI에게 먼저 이렇게 물어보세요:

> *"hwp_ping 도구 호출해줘."*

AI가 `pong`이라고 답하면 정상 연결된 것입니다. 그다음 실제 작업을 시켜보세요:

- *"이력서 양식 `~/Documents/resume.hwp`에 이 정보로 채워줘."*
  → 빈칸을 찾아 자동으로 채우고 저장합니다.
- *"가정통신문 초안 만들어줘. 빈 문서에서 시작."*
  → 제목·본문·표를 작성하고 글자 크기/굵기/색상까지 적용합니다.
- *"이 base64 .hwp를 .hwpx로 변환해줘."*
  → 한컴오피스 없이 변환하고 원본 손상 여부까지 검증합니다.

각 사용 유형별 **단계별 실전 예시**는 여기에 있습니다:
- [`form-automation.md`](./docs/persona-examples/form-automation.md) — 실제 학교 이력서 35칸 자동 채우기.
- [`authoring.md`](./docs/persona-examples/authoring.md) — 가정통신문 작성 (제목 스타일 + 본문 + 표).
- [`compat.md`](./docs/persona-examples/compat.md) — base64 전송 + 원본 보존 검증.

---

> **여기서부터는 개발자·고급 사용자용 레퍼런스입니다.** 그냥 쓰기만 할 거라면
> 위의 "설정이 끝나면" 섹션까지만 보셔도 됩니다 — 아래 도구들은 AI가 알아서
> 골라 씁니다.

## Tools — 15 + `hwp_ping`

AI가 자동으로 선택해 호출하는 도구 목록입니다. 직접 외울 필요는 없습니다.

### Form filling (5)

| Tool | Purpose |
| --- | --- |
| `hwp_list_fields` | Enumerate 누름틀 form-field controls (name, type, current value). |
| `hwp_fill_fields(map)` | Bulk-fill 누름틀 by name. Unknown names → `skipped`. |
| `hwp_locate_blanks` | Enumerate empty table cells with a suggested label (left-neighbor → header-row). |
| `hwp_fill_cells(map)` | Fill table cells by `'row,col'` or by inferred label. Unresolvable keys → typed `skipped` reason. |
| `hwp_apply_action(name='setFieldValueByName', …)` | Escape hatch — call any rhwp field API by name. |

### Authoring (4)

| Tool | Purpose |
| --- | --- |
| `hwp_insert_text(text, style?)` | Insert text at document start with optional char-level style (font_size pt, bold, italic, underline, color, font_family). See ADR-0005. |
| `hwp_create_table(rows, cols, data?)` | Insert a table, optionally pre-filled cell-by-cell. |
| `hwp_set_paragraph_style(style)` | Apply paragraph-level layout (alignment, indent, line spacing). |
| `hwp_apply_action(name, params)` | Generic dispatcher — call any rhwp action with explicit coordinates (35 catalog entries across text / table / paragraph / header_footer / page / field / image / math / other). |

### Document I/O (5)

| Tool | Purpose |
| --- | --- |
| `hwp_open(path)` | Open .hwp or .hwpx by filesystem path. |
| `hwp_save_as(path, format?)` | Save current doc by path. Format default `hwpx`. |
| `hwp_open_blank()` | Bootstrap a blank doc without touching the filesystem. |
| `hwp_open_base64(bytes_base64, format?)` | Load a doc from a base64 byte string (no filesystem needed). |
| `hwp_save_as_base64(format)` | Serialize current doc to a base64 byte string + length. |

### Hardened I/O (1)

| Tool | Purpose |
| --- | --- |
| `hwp_open_base64_validated(bytes_base64, expected_bytes?, expected_crc32?)` | Same as `hwp_open_base64` with explicit length + CRC32 integrity checks. Wire-corruption surfaces as a typed `parse/BAD_LENGTH` or `parse/BAD_CHECKSUM`, not a WASM panic. |

### Catalog (2)

| Tool | Purpose |
| --- | --- |
| `hwp_apply_action(name, params)` | Generic dispatcher — invoke any rhwp action by name (insertText, createTable, applyParaFormat, applyCharFormat, replaceAll, insertEquation, insertPicture, createHeaderFooter, setPageDef, …). |
| `hwp_list_actions(category?)` | Discover available actions with JSON Schemas. Categories: text / table / paragraph / header_footer / page / field / image / math / other. |

The 15 + `hwp_ping` smoke tool stay under the **8 K token budget** for tool
descriptions, measured by `npm run measure:tokens`.

## Errors are typed

Every rhwp WASM call flows through `wrapPanic` and surfaces as a typed
`RhwpError` with `category` and `code`. Examples:

- `parse/BAD_BASE64` — base64 input was not valid base64.
- `parse/BAD_LENGTH` — `expected_bytes` mismatch (corruption detected).
- `parse/BAD_CHECKSUM` — CRC32 mismatch (corruption detected).
- `field/FILL_FAILED` — rhwp `setFieldValueByName` returned `ok:false`.
- `action/APPLY_CHAR_FORMAT_FAILED` — rhwp `applyCharFormat` returned `ok:false`.
- `*/WASM_TRAP` — a Rust panic crossed the WASM boundary; the original
  error is preserved in `cause` for diagnosis.

No raw `RuntimeError: unreachable executed` reaches the MCP client.

## Architecture (one paragraph)

A Node.js stdio MCP server holds a **single global rhwp document** in memory
(`SessionStore`). `hwp_open` / `hwp_open_blank` / `hwp_open_base64` /
`hwp_open_base64_validated` load, subsequent tools mutate, `hwp_save_as` /
`hwp_save_as_base64` flush. WASM warms on server start (~30-70 ms after
first load) so the first tool call never pays instantiation cost. Rust
panics from `@rhwp/core` are caught at the WASM boundary by `wrapPanic`
and surfaced as classified `RhwpError`s — no opaque
`unreachable executed` reaches the MCP client. See
[`docs/architecture.md`](./docs/architecture.md) for the full picture and
[`docs/decisions/`](./docs/decisions/) for the 6 accepted ADRs.

## Verification

- **vitest**: `npm test` — 17 files / 66 tests pass (smoke per tool + Sprint 3 corpus-pass logic + Sprint 1.5 binary-identity probe).
- **schema:diff**: `npm run schema:diff` — per-PR drift guard against the locked tool surface; current snapshot is 15 tools clean.
- **gate:binary-identity**: `npm run gate:binary-identity` — Sprint 1.5 / Sprint 3 combined corpus gate (Pass A field round-trip + Pass B binary identity). Current synthetic baseline = 5/5 PASS at Sprint 1.5 90% threshold (auto-escalates to Decision Gate 3.0 ≥ 95% when rated corpus ≥ 30). See ADR-0006.
- **probes**: `npm run probe:fields`, `npm run probe:char-format` — runtime signature confirmations against the pinned `@rhwp/core` version, with markdown reports under `docs/measurements/`.

## Development

```bash
npm ci

npm run dev               # tsx-driven server on stdio
npm run build             # tsc → dist/
npm run test              # vitest
npm run test:watch        # vitest --watch

npm run probe:fields            # → docs/measurements/rhwp-field-api.md
npm run probe:char-format       # → docs/measurements/rhwp-char-format.md
npm run measure:tokens          # tool-description budget check
npm run schema:diff             # CI guard against signature drift
npm run schema:snapshot         # regenerate schemas/snapshot.json
npm run corpus:generate         # synthetic .hwp corpus → corpus/synthetic/
npm run gate:binary-identity    # run Pass A + Pass B corpus gate
npm run generate:catalog-manifest # regenerate src/rhwp/catalog-manifest.json
npm run lint:md                 # markdown lint
```

## Releases

Private beta lives on the `beta` dist-tag:

```bash
npm install -g rhwp-mcp-server@beta
# or
npx rhwp-mcp-server@beta
```

Feedback program details:
[`docs/release/private-beta-program.md`](./docs/release/private-beta-program.md).

## Decision records

| ADR | Subject | Status |
| --- | --- | --- |
| [0001](./docs/decisions/0001-image-renderer.md) | `hwp_preview` image renderer | **Deferred to v0.2** (Sprint 3 prep) |
| [0002](./docs/decisions/0002-binary-save-fallback.md) | Binary-identity Pass B baseline (Sprint 1.5) | Accepted |
| [0003](./docs/decisions/0003-base64-tools.md) | Base64 wire-friendly contract (Sprint 2.5) | Accepted |
| [0004](./docs/decisions/0004-cell-based-fill.md) | Cell-based fill peer to field-based fill (Sprint 2.6) | Accepted |
| [0005](./docs/decisions/0005-char-format-contract.md) | `hwp_insert_text` style → applyCharFormat chain (Sprint 2.7) | Accepted |
| [0006](./docs/decisions/0006-decision-gate-3.md) | Decision Gate 3.0 structure (Pass A + Pass B combined, threshold escalation) | Accepted (structure); verdict pending N=30 corpus |
| [0007](./docs/decisions/0007-engine-abstraction.md) | Engine-neutral `DocumentEngine` abstraction (WASM default, automation engine as capability-gated slot) | Accepted |
| [0008](./docs/decisions/0008-automation-engine-approach.md) | Automation engine via a Python helper (interactive-desktop target, opt-in security module) | Accepted |

## License

MIT — see [LICENSE](./LICENSE). Third-party attributions in [NOTICE](./NOTICE).

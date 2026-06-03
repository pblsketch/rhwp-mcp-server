# Private Beta Program — `rhwp-mcp-server v0.1.0-beta.1`

This document describes the private-beta feedback program that ships
alongside `v0.1.0-beta.1`. It is intended for **3-5 external testers**
who agree to a 3-business-day feedback cycle before public release.

> Status: **Open for tester intake.** Channel + feedback form are still
> being chosen by the maintainer — see "Outstanding maintainer choices"
> below.

## Program shape

- **Duration:** 2 weeks from `v0.1.0-beta.1` publish.
- **Tester count:** 3 → 5 (Korean-language users with regular HWP / HWPX
  workflows). Mix of Form Filler, Document Editor, and Hancom Bridge
  personas to spread coverage.
- **Cadence:** Open-form feedback at any time. Maintainer responds
  within 3 business days per report.
- **Deliverable from testers:** at least one filled feedback form per
  week, covering one real document workflow.
- **Deliverable from maintainer:** acknowledgement within 1 business
  day, full response within 3, and a public CHANGELOG note on every
  shipped fix.

## Eligibility

Open to anyone who can:

1. Install Node 20+ on their primary machine (macOS, Windows, Linux).
2. Use Claude Desktop, Cursor, Claude Code, or an MCP-over-HTTP broker.
3. Work with Korean HWP / HWPX documents at least weekly.
4. Sign off on the "Confidentiality" section below.

No prior MCP or rhwp experience required. Familiarity with 한컴오피스
is helpful but not required.

## How to join

> **TODO (maintainer):** pick a channel from the list under
> "Outstanding maintainer choices" and replace this section with a
> concrete signup instruction.

While the channel is being chosen, prospective testers can open a
GitHub Discussion (private repo) titled "Private beta interest —
[your-name]" with:

- Persona you most closely match (Form Filler / Document Editor /
  Hancom Bridge).
- MCP client you'll be testing through.
- One sentence about a document workflow you'd want to validate.

The maintainer will follow up within 3 business days.

## Feedback form

Each tester fills this template per session. Submit one form per
distinct workflow, not per tool call — a single 이력서 fill or a single
가정통신문 draft = one form.

```markdown
# rhwp-mcp-server beta — Feedback Report

**Tester:** <name or handle>
**Date:** YYYY-MM-DD
**Version:** v0.1.0-beta.X
**Client:** Claude Desktop / Cursor / Claude Code / other (specify)
**OS + Node:** macOS 14 + Node 20.10 / Windows 11 + Node 22.4 / ...
**Persona this session covered:** Form Filler / Document Editor / Hancom Bridge

## 1. What you tried

(One paragraph describing the document workflow. Include the file kind —
이력서 / 공문 / 가정통신문 / 계약서 / etc. — and the goal.)

## 2. Tool sequence

(Either copy from the client's tool-call log, or list the tools in
order. Include any tool that surfaced a typed error.)

1. hwp_open(path=...)
2. hwp_list_fields()
3. ...

## 3. Did it work?

- [ ] Yes, end-to-end.
- [ ] Yes, with one or more workarounds (describe).
- [ ] No (describe blocker).

## 4. Surprises

(Anything that worked but felt unexpected — tool chose the "wrong"
family, an error message was confusing, output looked off after opening
in 한컴오피스, etc.)

## 5. What broke / what was missing

(File names, error codes, screenshots if relevant. Specifics > vibes.)

## 6. What you'd want next

(Top 1-3 things you'd add or change.)

## 7. PII check

- [ ] I confirm no real PII (names, RRNs, addresses, phone numbers) is
      included in this report. If a sample document needs to be shared,
      I've scrubbed it OR I'm sharing it privately with the maintainer
      only.

---

(Optional) Attach sample documents (scrubbed) or screenshots below.
```

Forms can be posted to the chosen feedback channel (GitHub Discussions
in private repo by default — see "Outstanding maintainer choices").

## What the maintainer commits to

- Acknowledge each report within 1 business day.
- Triage with one of: `bug-confirmed`, `enhancement-considered`,
  `working-as-designed-(with-reason)`, or `need-more-info` within 3
  business days.
- Ship fixes for `bug-confirmed` reports as v0.1.0-beta.X+1 within the
  beta window when possible.
- Land every accepted change in CHANGELOG with a reference to the
  reporting tester (handle only, with consent).

## What testers commit to

- One filled feedback form per week minimum.
- One scrubbed sample document per report when the workflow was
  document-specific. Real PII never leaves the tester's machine.
- 3-business-day response window if the maintainer needs more info on
  a report.
- Beta builds are pre-release software. Don't run beta against
  production data without backups.

## Confidentiality

- Tester reports are visible to the maintainer team only during the
  beta window. Aggregated findings (counts, themes, accepted changes)
  may be published in the CHANGELOG / release notes.
- Specific company / institution names will not appear in any public
  artifact unless the tester explicitly approves them.
- Sample documents the tester shares are stored locally on the
  maintainer's machine, never committed to the repo, and deleted at the
  end of the beta window unless the tester asks for them to be retained
  as part of the public test corpus (with explicit re-consent).

## Outstanding maintainer choices

Three items the maintainer must decide before public outreach. Each
choice rewrites a stub in this document:

1. **Channel for tester intake + feedback submission.** Options:
   - GitHub Discussions in `pblsketch/rhwp-mcp-server` (default
     candidate — same place as the repo, low friction).
   - A dedicated Discord or Slack channel (richer back-and-forth, but
     yet another tool).
   - A private email list (lowest friction for non-technical testers).
2. **Recruitment outreach.** Where to advertise the program:
   - Korean dev forums (geek news, FM코리아, etc.).
   - 한컴오피스 user groups (행정실 / 학교 행정 directors).
   - LLM / MCP communities (Anthropic Discord, local meetups).
3. **Public release criteria.** When does beta → 1.0?
   - All `bug-confirmed` reports resolved.
   - No new `bug-confirmed` reports for 3 consecutive business days.
   - Decision Gate 3.0 PASS verdict on N ≥ 30 corpus
     (ADR-0006 — currently pending corpus collection).
   - At least 3 distinct testers reporting "end-to-end" success on
     their primary workflow.

Replace the TODO line in "How to join" with the chosen channel once
decided.

## Publishing the beta

The maintainer runs (separately, with their own npm credentials):

```bash
# Bump if needed:
npm version 0.1.0-beta.1 --no-git-tag-version

# Verify nothing is broken before publishing:
npm ci
npm run build
npm test
npm run schema:diff
npm run gate:binary-identity

# Publish to npm on the `beta` dist-tag:
npm publish --tag beta --access public

# Tag the release:
git tag -a v0.1.0-beta.1 -m "v0.1.0-beta.1 private beta"
git push origin v0.1.0-beta.1
```

These commands are documented here so they're audit-trailed; the
maintainer runs them locally with their own npm token. The repo itself
does not embed credentials.

## After the beta

When the beta closes:

- A summary report goes into `docs/release/v0.1.0-beta.1-postmortem.md`
  with anonymized findings and the list of accepted changes.
- The next release will be `0.1.0-rc.1` or `1.0.0` depending on the
  scope of beta-window changes.

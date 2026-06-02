# Corpus Sources

This directory holds the Korean HWP / HWPX form corpus used to validate round-trip stability per the plan's Sprint 1 / Sprint 3 decision gates.

## Provenance model

Every file added under `corpus/forms/` MUST be accompanied by an entry in this file recording:

1. **Filename** in `corpus/forms/`.
2. **Source** — URL or institution and capture date (YYYY-MM-DD).
3. **License / usage terms** — best-effort transcription. Public-sector Korean forms (정부24 등) are typically Korean Open Government License Type 1; transcribed verbatim.
4. **Failure mode this form represents** — one or more of:
   - `legacy-hwp-field` — uses 5.0 binary form fields
   - `modern-hwpx-field` — uses OWPML semantic fields
   - `multi-page` — > 1 page
   - `with-table` — contains a table
   - `with-image` — contains an embedded image
   - `with-header-footer` — uses 머리말/꼬리말
   - `with-chart-math` — chart or 수식
5. **Substitution policy** if the original was modified (e.g. PII replaced with synthetic).

## Sprint 1 corpus target (N = 10)

| # | Filename | Source | Capture | License | Failure mode |
|---|----------|--------|---------|---------|--------------|
| 1 |          |        |         |         |              |
| 2 |          |        |         |         |              |
| 3 |          |        |         |         |              |
| 4 |          |        |         |         |              |
| 5 |          |        |         |         |              |
| 6 |          |        |         |         |              |
| 7 |          |        |         |         |              |
| 8 |          |        |         |         |              |
| 9 |          |        |         |         |              |
| 10 |         |        |         |         |              |

Plan-mandated mix:
- 5 from 정부24 (이력서 / 사직서 / 신원진술서 / 공문 / 가족관계증명) — mixed `.hwp` and `.hwpx`.
- 3 from 교육 / 학교 가정통신문.
- 2 from 기업 실무 (계약서 / 견적서) — synthetic if needed.

## Sprint 3 expansion to N = 30

The Sprint 1 corpus is augmented with 20 additional forms covering:
- +10 정부24 (신청서 / 증명서 / 동의서 / 위임장 등 다양 양식)
- +5 교육 (생활기록부 / 시험지 / 학생부)
- +5 기업 (회의록 / 보고서 / 제안서)

## How to add a corpus item

```bash
cp ~/Downloads/some-form.hwp corpus/forms/govt24-resume.hwp
# Then update the table above with provenance + failure mode.
git add corpus/forms/govt24-resume.hwp corpus/SOURCES.md
```

The CI corpus-runner step (Sprint 1+) discovers files under `corpus/forms/` automatically.

## PII / confidentiality note

Do NOT check in real personal data. Replace names, RRNs, addresses, phone numbers, and any other PII with synthetic equivalents before adding a form. A small `scripts/scrub-pii.ts` helper lands in Sprint 1 to assist.

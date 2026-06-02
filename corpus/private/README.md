# corpus/private/

Drop your own `.hwp` / `.hwpx` files in this directory.

- **Never committed** — the parent `.gitignore` (`*`) excludes every file
  except itself and this README.
- **Auto-discovered** — `scripts/corpus-runner.ts` enumerates `*.hwp` here
  on every run.
- **PII-safe by design** — there is no upload path; files stay on your
  local disk and only feed the in-process Binary-Identity gate.

If you want a file to be part of the committed corpus, move it to
`corpus/forms/` and add a `SOURCES.md` entry covering license and
provenance.

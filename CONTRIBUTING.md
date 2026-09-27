# Contributing

Guidance for maintainers of this repository. The user-facing usage docs live
in [README.md](./README.md).

## Live task ID verification (maintainer QA)

This repository keeps a live QA script under `scripts/qa/`; it is not part of
the published npm package and is intentionally not documented in the README.
It verifies how the SDK surfaces task identifiers against the real Thordata
`/request` endpoint.

Set `THORDATA_API_KEY` or `THORDATA_API_TOKEN` in the terminal where you run
the command, then execute:

```bash
node scripts/qa/live-task-id.js
# Include the complete API response, with the configured key redacted:
node scripts/qa/live-task-id.js --raw
```

Each run sends exactly two SDK searches, one for `google` and one for
`google_ai_mode`, with `q=pizza`, `json=1`, and `isjson=1`. There are no
automatic retries. These are live requests and may consume credits; they
are not executed by `npm test`.

The report compares SDK `taskId` with explicit `data.task_id` or top-level
`task_id`. `taskIdStatus=FAIL` means an explicit ID was missed or changed.
`INFO` means there is no explicit task ID to compare; `search_metadata.id`
is displayed separately and is not assumed to be the same identifier.
Request errors are reported separately as `requestStatus=FAIL`, including
the business error code and HTTP status when available. The command exits
with code 1 on a request failure or a task ID mismatch.

### Known live behavior (verified 2026-09-20)

- A normal `google` response does not carry an explicit `task_id`; only
  `search_metadata.id` is present, so the script reports `INFO` for this
  engine. Confirm with the backend whether `/request` results are expected to
  include a task ID before treating `INFO` as a defect.
- `google_ai_mode` may fail upstream with "error, Collection failed" and can
  take close to the default 30-second client timeout on success. Increase
  `timeout` when testing this engine.

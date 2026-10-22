---
name: dstack-verify
description: "Drive the notifications screen through remote list and badge states. Use for /dstack-verify."
disable-model-invocation: true
---

# dstack-verify

The script drives `src/notifications/` in headless Chrome. Do not click through the UI by hand when this skill applies.

## Run

When invoked as `/dstack-verify`:

1. Read `<directory of this file>/features/README.md`.
2. Run `node --experimental-strip-types <directory of this file>/scripts/verify.ts prove <feature-id>` for the feature the human named, or `notifications-list` when none was named.
3. Paste pass or fail from stdout and the evidence path under `.dstack-verify/evidence/<feature-id>/`. Stop.

If the script is missing, stop and say so.

| Command | When |
|---|---|
| `prove <feature-id>` | cold verification (launch, doctor, drive, cleanup) |
| `launch` | start server and Chrome; write `.dstack-verify/run.json` |
| `doctor` | read-only health on the launched instance |
| `drive <feature-id>` | assertions and evidence for one feature |
| `cleanup` | stop Chrome and server; keep evidence |

Exit `0` pass, `1` fail, `2` could not run.

Evidence survives cleanup at `.dstack-verify/evidence/<feature-id>/`. Experience scoring stays in `/dstack` (`experience` command), not here.

Keep the feature map current with `/maintain-verification-skill` when the UI changes.

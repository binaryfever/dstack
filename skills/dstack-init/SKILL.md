---
name: dstack-init
description: "Scan the product and write product-rules.md after the human repeats the printed digest. Use for /dstack-init."
disable-model-invocation: true
---

# dstack-init

The script derives the catalog from this repo. Do not hash the file yourself, do not type `###` headings, and do not fix past what the script prints. When the scan finds a design-system package (`packages/ui`, tokens, components, `design-system`, a `dstack-design-system` fence in `DESIGN.md`, or `design-system.figma.json`), those symbols merge into the same show output and digest as product code.

## Run

When invoked as `/dstack-init`:

1. From the product repo, run `node --experimental-strip-types <directory of this file>/scripts/init.ts`.
2. If the script is missing, stop and say so. Do not scan by hand or author `product-rules.md`.
3. Paste stdout and stop. Do not write in this turn.
4. Wait for a later message with `approve <digest>` matching the latest show output. A bare yes is not approval.
5. Run `node --experimental-strip-types <directory of this file>/scripts/init.ts write --approve <digest>` with that digest.
6. Paste the result and stop.

| State | When | Do |
|---|---|---|
| show | stdout starts with `dstack-init show` | paste it, stop |
| write | later message has `approve <digest>` from that show | run `write --approve`, stop |
| unchanged | stdout says `unchanged` | tell the user the catalog matches the scan, stop |
| refuse | exit 2 | relay stderr, stop |

Leave every `*.states.md` untouched. On `digest-mismatch`, run show again and stop. On `unchanged` or `already-citeable`, stop. Proposal application stays in `/dstack-accept`.

`tables-dirty` on show means write will refuse until those tables are out of the diff.

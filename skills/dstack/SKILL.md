---
name: dstack
description: "Build product UI against the repo's product-rules.md. Writes a state table per screen, reuses the components, patterns, and tokens the rules name, and turns a gap seen in two screens into a proposed edit to product-rules.md. Use for /dstack."
disable-model-invocation: true
---

# dstack

Read `product-rules.md` at the repo root. Cite rules by id. If that file is missing, stop and tell the user.

Before any UI code, write `<Screen>.states.md` next to the screen's entry file, or edit the table that is already there.

| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|
| notifications | list | remote | C-async-list | C-empty-state | C-row-skeleton | P-retry-inline | unlisted(NotificationRow) + C-avatar + P-relative-time |
| unread-count | badge | remote | C-badge | C-badge | P-badge-quiet | P-badge-quiet | C-badge |

## Corrections

- C-empty-state: Empty copy names what will appear here, never "No data".

A rule in the `machine` column is a state machine. Fill its slots. Do not wrap it or fork it.

`source` is `remote`, `local`, or `static`. That column decides which state cells are required. Leave a cell blank only when that source does not use the state.

From the product repo, run `node --experimental-strip-types <directory of this file>/scripts/dstack.ts check <table>`.

Fix every error. The error names the rule and its line in `product-rules.md`.

When a reviewer corrects how a rule was used, fix the screen and add `- <rule id>: <what changed>` under `## Corrections`.

Reply with the table, the check result, the notes, and each proposal under `## Rule proposals (not applied)`. Do not edit `product-rules.md` in this change.

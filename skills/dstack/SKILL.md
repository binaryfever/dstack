---
name: dstack
description: "Build one product screen from product-rules.md. Write the state table first, reuse the components, patterns, and tokens the rules name, and propose a rules edit when two screens share a gap. Use for /dstack, building a screen, or writing a state table. Bootstrapping product-rules.md is /dstack-init. Applying a proposal is /dstack-accept. Driving the UI is /dstack-verify. A skill regression is /dstack-eval."
disable-model-invocation: true
---

# dstack

Build one screen. The repo README lists the other skills under Playbooks.

Read `product-rules.md` at the repo root. Cite rules by id. If that file is missing, or it has no `### C-`, `### P-`, or `### T-` heading, stop and tell the user to run `/dstack-init`.

Before any UI code, write `<Screen>.states.md` next to the screen's entry file, or edit the table that is already there. This skill has no sample screen. The columns are the whole pattern. Add one row for each part of the screen you were asked to build. Name that row from the screen. Set `source` to `remote`, `local`, or `static` from how that part loads. A `remote` row fills every state cell. A `local` row fills `empty` and `populated` and leaves `loading` and `failed` blank. A `static` row fills `populated` and leaves the other state cells blank. Cite a rule id from `product-rules.md` when one covers that cell.

| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|

## Corrections

- C-empty-state: Empty copy names what will appear here, never "No data".

A rule in the `machine` column is a state machine. Fill its slots. Do not wrap it or fork it.

`source` is `remote`, `local`, or `static`. That column decides which state cells are required. Leave a cell blank only when that source does not use the state.

From the product repo, run `node --experimental-strip-types <directory of this file>/scripts/dstack.ts check <table>`.

Fix every error. The error names the rule and its line in `product-rules.md`.

When a reviewer corrects how a rule was used, fix the screen and add `- <rule id>: <what changed>` under `## Corrections`.

Reply with the table, the check result, the notes, and each proposal under `## Rule proposals (not applied)`. Do not edit `product-rules.md` in this change. Applying or declining a proposal is `/dstack-accept`. Driving the real UI through the states in the table is `/dstack-verify`. Comparing a skill run with a no-skill run is `/dstack-eval`. When the named skill is missing from this repo, stop.

When the proposals count is above 0, run `node --experimental-strip-types <directory of this file>/scripts/dstack.ts gate <key>` for each proposal key.

Exit 0 pastes that stdout under `## Gate`.

Exit 3 is the reviewer packet. Spawn one readonly generalPurpose reviewer per `interrogate reviewers` entry in `.cursor/rules/pstack-models.mdc`. The prompt is the packet bytes after the packet header, verbatim. Write the score JSON from the packet schema. Run `node --experimental-strip-types <directory of this file>/scripts/dstack.ts gate <key> --panel <file> --hash <64-hex>` with the hash the packet printed. Paste the exit 0 stdout under `## Gate`.

Exit 2 pastes stderr and stops.

`stance  block` does not decline the proposal. `stance  clear` does not accept it.

## Experience

After `dstack check`, score a registered screen with `node --experimental-strip-types <directory of this file>/scripts/dstack.ts experience score <screen-id> --actor agent --judgment <agent-judgment.md>`. Run `experience rubric` for the bars. Write judgment sections only. Leave `no-parallel-card` out of the judgment file.

An experience miss is not a correction bullet and not a rule proposal. Do not edit `product-rules.md` to record it. Driving the live UI remains `/dstack-verify`. When that skill is missing, stop that request.

---
name: dstack-verify
description: "Use for /dstack-verify. Generate a project-local verification skill for the repo you are in, the way pstack's create-verification-skill does. This skill ships no screen."
disable-model-invocation: true
---

# dstack-verify

Generate verification for the product that installed dstack. Run it in that repo. This skill ships no screen. Do not target dstack fixtures, shop demos, or this skill's file contract.

You write the generator's output for the next agent, not for a human. It will be read cold, mid-task, by an agent that has never seen the app.

## Run

When invoked as `/dstack-verify`:

1. Interview the repo, not the user. Answer these from the codebase and ask the human only what you cannot observe:
   - What a person actually touches: a web UI, a CLI, a desktop app, an API, a mobile app, or a library.
   - How the app starts. Prefer the repo's own documented command.
   - How an agent can drive it. Prefer a harness the repo already has.
   - What evidence can be captured.
   - Whether two instances can run side by side.
2. The screen to prove is the one the human asked to build. `/dstack` writes its state table. Drive the states that table's `source` requires: `remote` uses empty, loading, failed, and populated; `local` uses empty and populated; `static` uses populated. If that table is not written yet, stop and say so. Do not invent a screen.
3. Write the product harness under `.dstack-verify/` in that repo:
   - `features/README.md` plus one feature file for the screen. Follow `<directory of this file>/references/feature-map-example/` for the file contract only. Use this repo's real names and selectors. Leave no placeholders.
   - `SKILL.md` or `harness.md` with Launch, Doctor, Drive, Evidence, Cleanup, and Helpers for this repo. Ready means usable, not only that a process answers. Cleanup keeps evidence at `.dstack-verify/evidence/<feature-id>/` and removes only what this run started.
4. If the human named a feature id, prove that one. If none was named and the map has exactly one feature, prove it. If none was named and the map has several, list the ids and stop. Do not invent a default feature id.
5. Run launch, doctor, drive one feature, capture evidence, then cleanup. Confirm the evidence directory still exists after cleanup.
6. Paste pass or fail and the evidence path. Stop.

If the product cannot start, fix that or report it, then stop. Do not weaken a journey to make it pass.

Experience scoring stays in `/dstack`. Keep the map honest later with `/maintain-verification-skill`.

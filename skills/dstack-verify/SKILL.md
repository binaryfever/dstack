---
name: dstack-verify
description: "Use for /dstack-verify, or when a product that installed dstack needs pass/fail proof that a remote surface moves through the states its source requires."
disable-model-invocation: true
---

# dstack-verify

Generate verification for the product that installed dstack. Run it in that product repo. Do not target dstack fixtures, shop demos, or this skill's example names.

## Run

When invoked as `/dstack-verify`:

1. Interview the product from the codebase. Answer surface, run, drive, observe, and isolate. Prefer existing harnesses. Ask the human only what you cannot observe.
2. Find every `*.states.md` row whose `source` is `remote`. Those surfaces are the seed set. Use each row's own surface name and kind. Do not add a surface the table does not have.
3. Write the product harness under `.dstack-verify/` in the product repo:
   - `features/README.md` plus one feature file per seeded surface. Follow `<directory of this file>/references/feature-map-example/`. Use the product's real screen names and selectors. Leave no placeholders.
   - `SKILL.md` or `harness.md` with Launch, Doctor, Drive, Evidence, Cleanup, and Helpers for this product. Ready means usable, not only that a process answers. Cleanup keeps evidence at `.dstack-verify/evidence/<feature-id>/` and removes only what this run started.
4. If the human named a feature id, prove that one. If none was named and the map has exactly one feature, prove it. If none was named and the map has several, list the ids and stop. Do not invent a default feature id.
5. Run launch, doctor, drive one feature, capture evidence, then cleanup. Confirm the evidence directory still exists after cleanup.
6. Paste pass or fail and the evidence path. Stop.

If the product cannot start, fix that or report it, then stop. Do not weaken a journey to make it pass.

Experience scoring stays in `/dstack`. Keep the map honest later with `/maintain-verification-skill`.

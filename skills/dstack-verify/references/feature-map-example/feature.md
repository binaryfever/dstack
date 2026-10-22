# <feature>

One paragraph for the behavior of one state-table row. Use the name from that row.

## Sub-features

- One short id for each state that row's source requires, with one line for what the person sees.

## How to get to it (user POV)

- The entry points in the product that installed dstack.
- Replace this bullet with those paths.

## Driving it with the product harness

Preconditions:

- Doctor reports a healthy instance owned by this run.
- The feature file names the real selectors and commands for this product.

- One labeled step for each required state. Pair the user action with an exact command and an observable result.
- **Proof.** Write screenshots and accessibility snapshots under `.dstack-verify/evidence/<feature-id>/`.

## Gotchas

- Do not add a row the state table does not have.
- Do not call internal setters or test-only endpoints when a user path exists.
- If a precondition is missing, fail the journey and record it here. Do not weaken the journey.

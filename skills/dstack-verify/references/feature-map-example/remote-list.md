# Remote list

A remote list shows what the feed returned: empty copy, a loading state, a failed load with recovery, or populated rows.

## Sub-features

- `list-empty` shows the empty state instead of rows.
- `list-loading` shows the loading state while the feed is in flight.
- `list-failed` shows the failure copy and the product's recovery control.
- `list-populated` shows one row per returned item.

## How to get to it (user POV)

- Open the product route or screen that hosts this list.
- Use the product's real entry points only. Replace this bullet with those paths.

## Driving it with the product harness

Preconditions:

- Doctor reports a healthy instance owned by this run.
- The feature file names the real selectors and commands for this product.

- **Empty.** Reach the empty feed. Assert the empty copy and no rows.
- **Loading.** Reach the in-flight feed. Assert the loading indicator the product uses.
- **Failed.** Reach a failed feed. Assert the failure copy and recovery control.
- **Populated.** Reach a successful feed. Assert row count and one stable row label.
- **Proof.** Write screenshots and accessibility snapshots under `.dstack-verify/evidence/<feature-id>/` for each state.

## Gotchas

- Do not call internal setters or test-only endpoints when a user path exists.
- A recovery control that transitions through loading needs an explicit wait for the end state.
- If a precondition is missing, fail the journey and record it here. Do not weaken the journey.

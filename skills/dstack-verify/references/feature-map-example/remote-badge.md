# Remote badge

A remote badge shows a count from the feed. It stays quiet while empty, loading, or failed, and shows the count when populated.

## Sub-features

- `badge-quiet` keeps the badge hidden or empty for empty, loading, and failed.
- `badge-populated` shows the count when the feed has items to count.

## How to get to it (user POV)

- Open the screen that hosts the badge.
- Replace this bullet with the product's real entry points.

## Driving it with the product harness

Preconditions:

- Doctor reports a healthy instance owned by this run.
- The populated fixture or feed includes a known count.

- **Quiet states.** Reach empty, loading, and failed. Assert the badge stays quiet.
- **Populated.** Reach a successful feed. Assert the visible count and accessible name.
- **Proof.** Write screenshots and accessibility snapshots under `.dstack-verify/evidence/<feature-id>/`.

## Gotchas

- Row-level unread marks are not the badge. Assert the badge control the state table names.
- Counts above the product's cap must match the product's display rule and accessible name.
- If the product has no badge surface, omit this file from the generated map. Do not invent one.

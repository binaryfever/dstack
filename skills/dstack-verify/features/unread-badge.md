# Unread badge

The notifications header can show how many items are unread. The badge stays hidden in empty, loading, and error, and shows the unread count when the list is populated.

## Sub-features

- `badge-quiet` keeps the badge hidden for empty, loading, and error.
- `badge-count` shows the unread count on success, capping display at `99+`.

## How to get to it (user POV)

- Open the notifications page.
- Watch the header beside `Notifications` while switching list states.

## Driving it with dstack-verify

Preconditions:

- Same launch and doctor baseline as the list feature.
- Sample notifications include two unread items in success.

- **Quiet states.** Switch to `Empty`, then `Loading`, then `Error`. Assert no `.badge` element in the header.
- **Success count.** Switch to `Success`. Assert badge text `2` and `aria-label` `2 unread`.
- **Proof.** Write `badge-quiet.png`, `badge-success.png`, and matching `.aria.txt` under `.dstack-verify/evidence/unread-badge/`.

## Gotchas

- Row-level unread dots are separate from the header badge; do not count dots as the badge.
- Badge display uses `99+` for counts above 99 while the accessible name matches the displayed text.

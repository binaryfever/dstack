# Notifications list

The notifications screen shows what arrived from the remote feed: an empty promise, a loading skeleton, a failed load with retry, or populated rows with avatars and relative times.

## Sub-features

- `list-empty` shows the empty illustration and copy instead of rows.
- `list-loading` shows a skeleton with `aria-busy` and screen-reader loading text.
- `list-error` shows the failure copy and a `Retry` control.
- `list-success` shows one row per notification with avatar initials and relative time.

## How to get to it (user POV)

- Open `src/notifications/index.html` in the browser (served from the product repo).
- Use the `Notification state` switcher: `Empty`, `Loading`, `Error`, or `Success`.

## Driving it with dstack-verify

Preconditions:

- `prove notifications-list` or a prior `launch` plus `doctor` reporting a healthy notifications page.

- **Empty.** Click `Empty`. Assert copy `Notifications will show up here.` and no list rows.
- **Loading.** Click `Loading`. Assert `aria-busy="true"` on the skeleton and `Loading notifications` for screen readers.
- **Error.** Click `Error`. Assert `Notifications couldn't be loaded.` and a `Retry` button.
- **Success.** Click `Success`. Assert three populated rows including `Maya Chen mentioned you` and unread dots on unread items.
- **Proof.** For each state, write `empty.png` / `loading.png` / `error.png` / `success.png` and matching `.aria.txt` under `.dstack-verify/evidence/notifications-list/`.

## Gotchas

- `Retry` on the error state animates through loading before success; list-only drives use the switcher instead.
- Relative time strings depend on the fixed `now` in `NotificationList.js`; success assertions match the seeded sample dates.
- The switcher is the only way to reach loading without waiting on retry timing.

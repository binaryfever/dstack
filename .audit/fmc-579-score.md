# FMC-579 score

Scored from files only under sanitized labels Alpha and Beta. The external judge seat failed to spawn (on-demand usage). The coordinator scored both trees against the held rubric, then opened the blind key.

## Blind table

| check | Alpha | Beta |
|---|---|---|
| 1 Screen | 1 | 1 |
| 2 States | 1 | 1 |
| 3 Reuse | 1 | 1 |
| 4 Table | 1 | 0 |
| 5 Rules file | 1 | 1 |
| 6 Openable | 1 | 1 |
| Total | 6/6 | 5/6 |

## Notes before unblinding

**Alpha.** `index.html` paints a notifications header with a badge slot and a list body. Remote list and unread-count cover empty, loading, failed, and populated in code and in `src/notifications/NotificationList.states.md`, which cites `C-async-list`, `C-empty-state`, `C-row-skeleton`, `P-retry-inline`, `C-avatar`, `P-relative-time`, `C-badge`, and `P-badge-quiet`. Kit symbols and `--color-primary` are used. `product-rules.md` matches the planted shop copy. Four sample notices ship in `inbox.js`.

**Beta.** Same screen shape and the four remote outcomes in `screen.js` / `remote.js`. Kit reuse and `--color-primary` are present. `product-rules.md` matches. Five sample notices ship in `remote.js`. No file named `NotificationList.states.md` anywhere in the tree, so check 4 is 0.

## Unblind

| label | arm | skill | total |
|---|---|---|---|
| Alpha | cedar | `/dstack` installed and followed | 6/6 |
| Beta | willow | no skill | 5/6 |

Cedar `dstack check` on `NotificationList.states.md` exited 0 with that exact filename present.

## Chain checks (transcript + code)

Cedar transcript mentions `.cursor/skills/dstack/SKILL.md`, `product-rules.md`, `NotificationList.states.md`, and `dstack check`. Willow transcript mentions `product-rules.md` and kit components, and never names `NotificationList.states.md`. Willow's one `SKILL.md` hit is the poteto-mode path in the builder prompt, not dstack.

## Proof

- Alpha (cedar): 12/12 `inbox.test.js`, headless screenshot of the loading skeleton in `.audit/runs/proof/alpha-populated.png`.
- Beta (willow): 12/12 `behavior.test.js`, `script/check-page.mjs` passed, screenshots under `.audit/runs/proof/willow-shots/` including inbox, empty, failed, and loading.

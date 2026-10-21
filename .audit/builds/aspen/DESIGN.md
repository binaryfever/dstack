# Mentions screen

`mentions.html` fetches `data/mentions.json` and renders that list with the components named in `product-rules.md`. The unseen count in the header is the number of rows whose seen flag is false.

## What the page treats as a mention

A mention has an id, an actor name, a body, a created time, and a seen flag. A place and an avatar image are optional. `parseMentions` in `src/mentions-model.js` is the only code that reads the JSON. A payload that does not match that shape fails the request, so the header cannot skip a broken row and still show a count. `parseMentions` sorts the list newest first.

`projectMentions` turns that list into one view. The status is loading, empty, failed, or populated. While the request is loading or has failed, the unseen count is unknown and the header draws no badge. That matches the quiet badge pattern, where a badge renders nothing until its count arrives. After a successful load, a count of zero is passed to `Badge`, which draws nothing. A count above zero is the badge text. `Badge` already shows `99+` past 99.

`src/mentions-screen.js` fetches the file and passes the four slots into `AsyncList`. Loading is three `RowSkeleton` rows. Empty is one `EmptyState`, with one illustration and the sentence "No mentions yet." Failed is one sentence and a Retry button in the failed slot. Populated rows use `Avatar` and a relative time. A blue dot and a tint mark rows that are still unseen. Both use `var(--color-primary)` from `src/tokens.css`.

A time under seven days renders as a compact label such as `3h`. A time of seven days or older renders a UTC date such as `Oct 5, 2026`. Retry starts the same fetch again. `load` ignores an older response when a newer request is already running.

The fetch uses the same origin as the page. Opening the HTML as a file URL fails, and the failed state shows.

## Rejected shapes

A stored unseen count beside the list can drift, so the header can disagree with the rows.

Mentions copied into the HTML would make the list local.

A second list, a second badge, or a new color token would duplicate `AsyncList`, `Badge`, `EmptyState`, `RowSkeleton`, and `Avatar`.

Clicking a row to mark it seen does not open a detail view, and the click would clear the header count.

Dates in the local timezone would follow the machine. UTC keeps one date everywhere, and a shopper near midnight can see the neighboring day.

Keeping the JSON arrival order would place an old mention above a new one when the file is unsorted.

A new retry component would add a second way to show failure. The failed slot keeps one sentence and a Retry button, and `AsyncList` still owns the switch between states.

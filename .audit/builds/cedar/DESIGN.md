# Notifications

The notifications screen is the shop inbox. The header carries the title and the number of notes still unread. The list under the header is the inbox itself. Both read the same response from the shop.

While that response is still on the way, the count stays off the header and the list shows three placeholder rows. When the shop has nothing to say, the count stays hidden and the page says orders, shipping updates, and shop messages show up here. When the request fails, the count stays off and one sentence plus a Retry button replace the list. When notes arrive, each row shows who sent it, what they said, and when. A note under 7 days old uses a short age such as 3h or 4d. A note that is 7 days old or older shows the date, including the year when the note is from another year. Unread rows are bold, and a bar marks them. The header number is how many of those rows are unread. Zero unread hides the number. A number past 99 shows 99+.

The Shop response control chooses what the remote shop returns. It can return new updates, an empty inbox, or a failed request. Changing it shows the loading rows, then the matching result. Retry asks again for the response that is currently selected.

## Alternatives

A list stored on the page, with no wait and no failure, would have been shorter to build. It would also hide that this inbox depends on the shop. The screen shows the wait, the empty inbox, the failure, and the notes.

A header that shows 0, or a spinner where the count will go, looks busy before the shop has answered. The count appears only after a response, and it stays hidden when nothing is unread.

Empty copy that said "No data" would not tell a shopper what the page is for. The sentence names orders, shipping updates, and shop messages.

A clock time on every row makes a note from earlier today harder to scan. Recent notes use a short age. Older notes use a date.

Separate pages for the wait, the empty inbox, the failure, and the notes would let the header and the list drift apart. One screen owns both, because both come from one response.

Marking a row as read, and opening a note, are not part of this screen. The inbox shows the note and the unread count.

A stack of toasts would sit on top of the shop. A shopper reads this list in order, newest first.

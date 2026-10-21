# Notifications

The notifications screen is the shop inbox. A shopper sees who wrote, what changed, and how many notices are still unread.

## The inbox

The header carries the word Notifications and the unread count. The count is a badge. It stays off the page until the source answers. After an answer, a count of zero hides the badge. A count above 99 shows 99+.

Each notice shows the sender, a summary, a detail line, and a time. A notice from the last week uses a short age such as 3h. An older notice uses a date. Anything under a minute reads now.

Unread notices use a stronger summary and a mark on the sender. Opening a notice marks it read, and the header count drops by one. The notice stays in the list.

The sample inbox includes unread and read notices. The header counts only the unread ones.

## When the source is quiet or down

The list asks a remote source for notices. A Source control on the page can hold that source on one result, so loading, empty, failed, and populated each stay on screen.

While the request is out, the list shows placeholder rows and the header badge is absent.

An empty result shows a willow sprig and the sentence "You're all caught up." There is no second line and no button.

A failed result shows the sentence "Notifications didn't load." and a Retry button in place of the list. Retry sends the same request again.

## Choices

The badge waits for a real count. Showing 0 during the request would tell the shopper the inbox is clear before the shop knows.

The failure stays in the list with Retry. A mark in the header would turn the count into an error flag.

Recent notices use a short age. A full timestamp on a message from this morning reads like a log.

The screen is a list of several notices. One large card would read as a detail page.

The source control stays where you set it. A timer that cycles loading, empty, failure, and the inbox would replace a notice while someone is reading it.

The empty inbox is one sentence and a sprig. A catalog link, a help link, and a second sentence would make an empty inbox into a menu.

Opening a notice updates the count on the page. The sample source does not store that read. Asking it again brings the sample count back, so a fresh request still comes from the source.

| check | Alpha | Beta |
|---|---|---|
| 1 Screen | 1 | 1 |
| 2 States | 1 | 1 |
| 3 Reuse | 1 | 1 |
| 4 Table | 1 | 0 |
| 5 Rules file | 1 | 1 |
| 6 Openable | 1 | 1 |
| Total | 6/6 | 5/6 |

Alpha shows a notification list with the unread count in the header (`/workspace/.audit/runs/Alpha/src/notifications/NotificationList.js`). The list and the unread badge each have empty, loading, failed, and populated states (`/workspace/.audit/runs/Alpha/src/notifications/inbox.js`). The screen calls AsyncList, EmptyState, RowSkeleton, Badge, and Avatar, and the CSS uses `--color-primary` from `/workspace/.audit/runs/Alpha/src/tokens.css`. `/workspace/.audit/runs/Alpha/src/notifications/NotificationList.states.md` cites rule ids from that tree's `product-rules.md`, which matches the expected file byte for byte. The populated sample contains four notifications, and `index.html` links the CSS and script files on disk.

Beta shows a notification list with the unread count in the header (`/workspace/.audit/runs/Beta/src/notifications/screen.js`). The list and the unread badge each have empty, loading, failed, and populated states (`/workspace/.audit/runs/Beta/src/notifications/screen.js`, `/workspace/.audit/runs/Beta/src/notifications/model.js`, `/workspace/.audit/runs/Beta/src/notifications/remote.js`). The screen calls AsyncList, EmptyState, RowSkeleton, Badge, and Avatar, and the CSS uses `--color-primary` from `/workspace/.audit/runs/Beta/src/tokens.css`. `product-rules.md` matches the expected file byte for byte. The inbox sample contains five notifications, and `index.html` links the CSS and script files on disk. The table check is 0 because no file named `NotificationList.states.md` exists under `/workspace/.audit/runs/Beta`.

# NotificationList states

Remote notifications. The product states error and success fill the failed and populated columns. `product-rules.md` names no component, pattern, or token ids, so the list kind and each slot stay unlisted.

| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|
| notifications | unlisted(list) | remote | none | unlisted(EmptyNotifications) | unlisted(NotificationSkeleton) | unlisted(NotificationError) | unlisted(NotificationRow) + unlisted(Avatar) + unlisted(RelativeTime) |
| unread-count | unlisted(badge) | remote | none | unlisted(UnreadBadge) | unlisted(UnreadBadge) | unlisted(UnreadBadge) | unlisted(UnreadBadge) |

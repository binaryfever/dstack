# NotificationList states

| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|
| notifications | list | remote | none | unlisted(EmptyInbox) | unlisted(Spinner) | unlisted(ErrorBanner) | unlisted(NotificationRow) + unlisted(Avatar) + P-relative-time |
| unread-count | badge | remote | C-badge | C-badge | | | C-badge |

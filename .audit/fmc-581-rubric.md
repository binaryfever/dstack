# Rubric (judge only)

Each check is 0 or 1.

1. Screen: mentions list and unread/unseen count in the header.
2. States: every remote surface has empty, loading, failed, and populated.
3. Reuse: `AsyncList`, `EmptyState`, `RowSkeleton`, `Badge`, `Avatar`, and `color.primary`. A parallel stand-in is a miss.
4. Table: `MentionsList.states.md` (exact name) cites rule ids from `product-rules.md`.
5. Rules file: `product-rules.md` is unchanged from the planted shop copy.
6. Openable: more than one populated mention, and the page opens in a browser.

Reference rules file (for citation check only): the planted shop `product-rules.md` with ids C-async-list, C-row-skeleton, C-empty-state, C-badge, C-avatar, P-retry-inline, P-badge-quiet, P-relative-time, T-primary.

Score notification habits as misses when they show up on this Mentions surface (wrong table name, notification copy, notification-only corrections), even if a check script exits 0.

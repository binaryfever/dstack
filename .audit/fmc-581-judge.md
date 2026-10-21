| check | Alpha | Beta |
|---|---|---|
| 1 Screen | 1 | 1 |
| 2 States | 1 | 1 |
| 3 Reuse | 1 | 1 |
| 4 Table | 0 | 1 |
| 5 Rules file | 1 | 1 |
| 6 Openable | 1 | 1 |
| Total | 5/6 | 6/6 |

Alpha. The header reads Mentions and shows an unseen badge. The list renders five mentions from `data/mentions.json`. The list and the badge both have loading, empty, failed, and populated. The screen calls `AsyncList`, `EmptyState`, `RowSkeleton`, `Badge`, and `Avatar`, and it uses `color.primary`. `MentionsList.states.md` is not in the tree. `product-rules.md` matches the expected copy byte for byte. `mentions.html` is HTML, CSS, and JS, and the default feed has more than one mention.

Beta. The header reads Mentions and shows an unseen badge. The list renders four mentions from `mentions.json`. The list and the badge both have loading, empty, failed, and populated. The screen calls `AsyncList`, `EmptyState`, `RowSkeleton`, `Badge`, and `Avatar`, and it uses `color.primary`. `MentionsList.states.md` cites `C-async-list`, `C-empty-state`, `C-row-skeleton`, `P-retry-inline`, `C-avatar`, `P-relative-time`, `C-badge`, and `P-badge-quiet`. `product-rules.md` matches the expected copy byte for byte. `MentionsList.html` is HTML, CSS, and JS, and the default feed has more than one mention.

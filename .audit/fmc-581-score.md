# FMC-581 score

Blind labels: Alpha = aspen (no skill), Beta = spruce (`/dstack`). See `fmc-581-blind-key.txt`.

Judge: `grok-4.7-xhigh` (pstack `arena cross-judge pool`), agent `bc-374c2771-8bbb-5940-a084-ff815b127635`. Notes in `fmc-581-judge.md`.

Coordinator scored the same Alpha/Beta trees before unblinding and matched the judge table.

| check | spruce (`/dstack`) | aspen (no skill) |
|---|---|---|
| 1 Screen | 1 | 1 |
| 2 States | 1 | 1 |
| 3 Reuse | 1 | 1 |
| 4 Table `MentionsList.states.md` | 1 | 0 |
| 5 Rules file unchanged | 1 | 1 |
| 6 Openable | 1 | 1 |
| **Total** | **6/6** | **5/6** |

Spruce `dstack check` exited 0 on `src/mentions/MentionsList.states.md`. Aspen has no `*.states.md`. Neither arm edited `product-rules.md`. No notification-copy or wrong-table-name misses on the Mentions surface.

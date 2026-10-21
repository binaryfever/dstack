# Score these two shop builds

You are scoring finished files only. You do not know how either build was produced.

## Rubric

Each check is 0 or 1. Score Alpha and Beta on the same scale.

1. Screen: notification list and unread count in the header.
2. States: every remote surface has empty, loading, failed, and populated.
3. Reuse: `AsyncList`, `EmptyState`, `RowSkeleton`, `Badge`, `Avatar`, and `color.primary`. A parallel stand-in is a miss.
4. Table: `NotificationList.states.md` cites rule ids from `product-rules.md`.
5. Rules file: `product-rules.md` matches the expected planted copy byte-for-byte (expected file will be attached as a path).
6. Openable: more than one populated notification, and the page is openable as HTML/CSS/JS in a browser (infer from files; you may not have a browser).

## Inputs

- Alpha root: REPLACE_ALPHA
- Beta root: REPLACE_BETA
- Expected product-rules.md: /workspace/.audit/fmc-579-product-rules.expected.md

## Output

Return a markdown table:

| check | Alpha | Beta |
|---|---|---|
| 1 Screen | 0/1 | 0/1 |
| ... | | |
| Total | n/6 | n/6 |

Then one short paragraph of notes per label. Stop. Do not pick a winner beyond the totals. Do not guess which process produced which tree.

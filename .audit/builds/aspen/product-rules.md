# Product rules

## Components

### C-async-list `AsyncList`
Covers: list
Switches between its empty, loading, failed, and populated slots. Pass each slot. Never fork it.

### C-row-skeleton `RowSkeleton`
Covers: list.loading

### C-empty-state `EmptyState`
Covers: list.empty, detail.empty
One illustration, one sentence, at most one action.

### C-badge `Badge`
Covers: badge, badge.empty, badge.populated
Hidden at zero. Shows `99+` above 99.

### C-avatar `Avatar`

## Patterns

### P-retry-inline
Covers: detail.failed
One sentence and a Retry button in place of the content.

### P-badge-quiet
Covers: badge.loading, badge.failed
A badge renders nothing until its count arrives.

### P-relative-time
Under 7 days renders relative ("3h"). Older renders the date.

## Tokens

### T-primary `color.primary`
Value: #1A73E8

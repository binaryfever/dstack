# Product rules

## Components

### C-async-list `AsyncList`
Covers: list
Switches between its empty, loading, failed, and populated slots. Pass each slot. Never fork it.

### C-row-skeleton `RowSkeleton`

### C-empty-state `EmptyState`
One illustration, one sentence, at most one action.

### C-badge `Badge`
Covers: badge
Hidden at zero. Shows `99+` above 99.

### C-avatar `Avatar`

## Patterns

### P-retry-inline
One sentence and a Retry button in place of the content.

### P-badge-quiet
A badge renders nothing until its count arrives.

### P-relative-time
Under 7 days renders relative ("3h"). Older renders the date.

## Tokens

### T-primary `color.primary`
Value: #1A73E8

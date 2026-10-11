# dstack

dstack checks a product screen against `product-rules.md`. The screen gets a state table. The check reuses the components, patterns, and tokens that file already names. The second screen that hits the same gap gets a proposed edit. The check does not apply it.

## Install

Copy `skills/dstack` into the product's `.cursor/skills/dstack` directory, or install this repo as a Cursor plugin. The product repo keeps `product-rules.md` at its root. Run checks from that repo:

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts check src/notifications/NotificationList.states.md
```

`check` with no path reads every `*.states.md` file. Exit 0 means no findings. Exit 1 means fix the findings. Exit 2 means dstack could not run. Notes and proposals do not change the exit code.

Node 22 runs the script. TypeScript is a dev dependency for `npm test` and `npm run typecheck`.

## Write product-rules.md

Each rule is a level-3 heading. `C-` is a component, `P-` is a pattern, and `T-` is a token. A component or token names its code symbol in backticks. `Covers:` lists the states that rule owns. `list` means the whole list, so that rule is the list's state machine. `list.loading` means the loading state. A token has a `Value:` line. Other prose is for people.

```product-rules
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
```

Two rules cannot cover the same state. The check names both headings when they do.

## Accept a proposal

A proposal is a unified diff in the check output. Apply it in a change that does not touch a `*.states.md` file. The next check then tells every screen that still cites the old name to use the new rule. A decline is also a rules edit, such as a `Covers:` line that says the state renders nothing, so the decision lives in `product-rules.md`.

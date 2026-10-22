# Product verification map

This directory is the file contract, the same job as pstack's feature-map example. It is not a screen, and this skill does not ship one. When you generate a map, write it in the repo you are in, from the screen `/dstack` is building.

Replace every placeholder with this product's real paths, commands, and selectors when you generate the map under `.dstack-verify/features/`.

## Baseline preconditions

- Launch the product the way its README or package scripts document.
- Use a disposable data directory or profile when the product supports one.
- Run doctor and require the expected URL or process, build, and isolation.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer ARIA roles, accessible names, and `data-*` handles over coordinates.
- Treat every command as literal.
- Restore seeded data after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an accessibility snapshot and a screenshot with the product identity visible.
- Record the feature id and entry point with every artifact.
- Report an unreachable path with the attempted step and unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Feature file](./feature.md) is the contract for one state-table row. A `remote` row covers empty, loading, failed, and populated. A `local` row covers empty and populated. A `static` row covers populated.

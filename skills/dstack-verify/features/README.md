# Notifications verification map

This directory is the maintained source for verifying the notifications screen. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Serve `src/notifications/` at `http://127.0.0.1:<port>/index.html` from the product repo root.
- Launch headless Chrome with a disposable profile under `.dstack-verify/`.
- Open the notifications page with the in-page state switcher (`Empty`, `Loading`, `Error`, `Success`).
- Run `doctor` and require the page URL, Chrome debug port, and notifications title.
- Never drive a Chrome profile or server that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Use the state switcher buttons (`data-status`) to reach empty, loading, error, and success.
- Prefer accessible names and roles over CSS position.
- Do not delete proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and resulting state for each remote state.
- UI proof includes an accessibility snapshot and a PNG screenshot per state.
- Record the feature id with every artifact.
- Report an unreachable path with the attempted step and unmet precondition.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing user-visible behavior, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with dstack-verify`, and `Gotchas`.

## Features

- [Notifications list](./notifications-list.md) — empty, loading, error, and populated list bodies.
- [Unread badge](./unread-badge.md) — header badge hidden in quiet states and showing unread count in success.

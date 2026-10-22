# dstack

dstack checks a product screen against `product-rules.md`. The screen gets a state table. The check reuses the components, patterns, and tokens that file already names. The second screen that hits the same gap gets a proposed edit. The check does not apply it.

## Playbooks

Each job is its own skill. The playbook tells the agent which job to run. `dstack check` grades the table.

| Skill | Job |
|---|---|
| `/dstack` | Build a screen. Write the state table first, reuse the rules, and run check. |
| `/dstack-init` | Bootstrap `product-rules.md` when the file is missing or has no `### C-`, `### P-`, or `### T-` heading. |
| `/dstack-accept` | Apply or decline a rules proposal. |
| `/dstack-verify` | Drive the real UI through empty, loading, failed, and populated. |
| `/dstack-eval` | Compare a skill run with a no-skill run on the same fixtures. |

Design-system load, Corrections, the interrogate gate, and the experience bar are not playbooks.

## Experience

The experience bar scores empty copy, header hierarchy, parallel cards, and visual correctness. It is not a playbook. Run `dstack.ts experience rubric` to print the bars. Run `dstack.ts experience score spruce --actor agent --judgment .audit/experience/spruce/agent-judgment.md` to score the spruce proofs under `.audit/proof/`. A blind judge runs the same score command with `--actor judge` and a judge judgment file. `dstack check` does not run this command, and this command does not change the check exit code.

## Install

Copy each folder under `skills/` into the product's `.cursor/skills/` directory, or install this repo as a Cursor plugin. The product repo keeps `product-rules.md` at its root. Run checks from that repo:

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts check path/to/Screen.states.md
```

`check` with no path reads every `*.states.md` file. Exit 0 means no findings. Exit 1 means fix the findings. Exit 2 means dstack could not run. Notes and proposals do not change the exit code.

Node 22 runs the script. TypeScript is a dev dependency for `npm test` and `npm run typecheck`.

## Write product-rules.md

A root file with no `### C-`, `### P-`, or `### T-` heading is an empty catalog. Run `/dstack-init`. It scans the product, prints a digest, and writes `product-rules.md` only after you reply `approve <digest>`. It does not edit `*.states.md`. The shop block below is the heading grammar. The scan chooses the ids.

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

The skill for this job is `/dstack-accept`. From the product repo, run one of these commands. `<dstack>` is the same path as in Install.

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts accept [--write] uncovered <kind.state>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts accept [--write] unlisted <CodeName>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts accept [--write] corrected <RuleId>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts decline [--write] uncovered <kind.state>
```

`--write` is the only write. Put it once, before the key or after it. Without `--write`, the command prints the next `product-rules.md` and the caller lines. The command leaves that file unchanged. If stdout says `status  current`, the command did not write. The command does not edit a state table. The command does not commit.

# dstack

dstack is a Cursor skill pack and a Node CLI. It checks a product screen against the root file `product-rules.md`. The screen has a `*.states.md` state table. The check grades reuse of the components, patterns, and tokens that file names. A gap on one screen is a note. The same gap on two or more screens is a proposal. The check leaves `product-rules.md` unchanged.

## Install

Copy each folder under `skills/` into the product repo's `.cursor/skills/` directory, or install this repo as a Cursor plugin. The plugin manifest is `.cursor-plugin/plugin.json`. The product repo keeps `product-rules.md` at its root. A copy install puts `dstack.ts` at `.cursor/skills/dstack/scripts/dstack.ts` and `init.ts` at `.cursor/skills/dstack-init/scripts/init.ts`.

Run commands from the product repo. `<dstack>` means the directory that contains `skills/`.

Node 22 runs the scripts. TypeScript is a dev dependency for `npm test` and `npm run typecheck`.

## Command reference

`check`, `accept`, `decline`, `gate`, and `experience` are subcommands of `skills/dstack/scripts/dstack.ts`. Each subcommand needs a git checkout. Drop the `usage:` prefix when you invoke the script. An unknown subcommand prints the usage block and exits 2. A `check` with extra arguments does the same. Shape errors print the usage block and exit 2. Rejected keys print their own stderr (`Decline names an uncovered coordinate.`, `Bad key ...`).

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts
```

```text
usage: dstack check [table.states.md]
usage: dstack accept [--write] uncovered <kind.state>
usage: dstack accept [--write] unlisted <CodeName>
usage: dstack accept [--write] corrected <RuleId>
usage: dstack decline [--write] uncovered <kind.state>
usage: dstack gate <key>
usage: dstack gate <key> --panel <file> --hash <64-hex>
usage: dstack gate <key> --skip <reason>
usage: dstack experience rubric
usage: dstack experience score <screen> --actor agent|judge --judgment <file>
usage: dstack experience compare <agent-score> <judge-score>
```

The accept and decline contract is under Accept and decline. The gate contract is under Gate. The experience contract is under Experience.

### Check

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts check path/to/Screen.states.md
```

Pass one `*.states.md` path. Omit the path to read every `*.states.md` file git lists in the checkout. A path argument still loads every git-listed `*.states.md`. Findings, notes, and proposals print only when a hit touches that path.

The columns are `surface`, `kind`, `source`, `machine`, `empty`, `loading`, `failed`, and `populated`. `source` is `remote`, `local`, or `static`. `remote` requires empty, loading, failed, and populated. `local` requires empty and populated. `static` requires populated. A state the row's `source` does not use must stay blank. `/dstack-verify` drives those same sets.

Exit 0 means no findings. Exit 1 means fix the findings. Exit 2 means dstack could not run. Notes and proposals are printed with the findings. The findings count selects exit 0 or exit 1.

`check` loads `## Corrections` from `skills/dstack/SKILL.md` next to the script. The shipped bullet is `- C-empty-state: Empty copy names what will appear here, never "No data".` When the table cites that rule, a quoted phrase forbids that phrase in screen source. A hit is a finding. A bullet with no quoted phrase is unchecked. The script prints `<rule> is unchecked: no quoted phrase` on stderr and continues. A missing skill file, or a missing `## Corrections` section, exits 2. A duplicate correction bullet exits 2. A `## Corrections` bullet in a state table is a note on one screen. The same rule on two or more screens is a `corrected` proposal. An unknown rule id in that bullet is a finding.

### Catalog script

`/dstack-init` runs `skills/dstack-init/scripts/init.ts`. It is not a `dstack.ts` subcommand. It needs a git checkout.

```text
node --experimental-strip-types <dstack>/skills/dstack-init/scripts/init.ts
node --experimental-strip-types <dstack>/skills/dstack-init/scripts/init.ts write --approve <digest>
```

The digest is 12 lowercase hex digits. Run the script with no arguments. No-arg init can print show, `dstack-init unchanged <digest>`, or `dstack-init refuse already-citeable`. A show starts with `dstack-init show`. Show prints `tables-dirty:` with `none` or a path list. A later command passes that digest to `write --approve`. The write updates `product-rules.md` when the digest matches, the state tables are clean, and the catalog is not already citeable with a differing scan. A bare yes is not approval. The script leaves every `*.states.md` file unchanged.

A catalog that already matches the scan prints `dstack-init unchanged` and the digest. A catalog that already has rule ids and differs from the scan exits 2 with `dstack-init refuse already-citeable`. A successful write prints `dstack-init wrote` and the digest.

When the scan finds a design-system package, those symbols merge into the same show and the same digest. The package roots are `packages/ui`, `packages/tokens`, `packages/components`, and `packages/design-system`. A `dstack-design-system` fence in `DESIGN.md` adds roots. `design-system.figma.json` adds symbols from that file.

Exit 0 covers show, write, and unchanged. Exit 2 is a refusal or a bad invocation. Write refuses with `dstack-init refuse table-dirty` while those tables remain in the diff. `digest-mismatch` means the digest is stale. Run show again.

## Playbooks

Each job is a skill. The table names the job. The skill file holds the procedure.

| Skill | Job |
|---|---|
| `/dstack` | Build one screen. Write the state table first, reuse the rules, and run `check`. See `skills/dstack/SKILL.md`. |
| `/dstack-init` | Bootstrap `product-rules.md` when the file is missing or has no `### C-`, `### P-`, or `### T-` heading. The catalog script is under Command reference. See `skills/dstack-init/SKILL.md`. |
| `/dstack-accept` | Accept or decline one proposal. The command contract is under Accept and decline. See `skills/dstack-accept/SKILL.md`. |
| `/dstack-verify` | Generate a `.dstack-verify/` harness in the product repo and drive the states `source` requires. Check lists those sets. A missing state table stops the skill. This skill ships no screen. See `skills/dstack-verify/SKILL.md`. |
| `/dstack-eval` | Compare a skill run with a no-skill run. The directory `skills/dstack-eval` is absent. `/dstack` stops when that named skill is missing. |

Design-system load belongs to the catalog script. Corrections belong to `check`. The gate record is under Gate. Experience scoring is under Experience.

## Gate

A proposal means two or more screens share one gap. `gate` records a verdict or a skip for that key. `gate` leaves `product-rules.md` unchanged.

The record path is `<git-dir>/dstack-gates/<encodeURIComponent(key)>.json`. `<git-dir>` comes from `git rev-parse --git-dir` in the checkout. A linked worktree uses that worktree's git directory. `git status` omits the file.

`/dstack` runs `gate` for each proposal key when the proposals count is above 0. `/dstack-accept` runs `gate` when the human names a key on an accept. Decline skips `gate`.

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts gate uncovered list.failed
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts gate uncovered list.failed --panel /tmp/list-failed.panel.json --hash <64 lowercase hex>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts gate unlisted NotificationRow --skip "reason the human wrote"
```

The hash is 64 lowercase hex digits. Exit 0 prints the human text. Exit 3 prints the reviewer packet. Exit 2 is a refusal. A key that is not a live proposal exits 2. A changed proposal hash prints `proposal changed` on stderr, prints a packet on stdout, and exits 2.

## Experience

Experience scores one registered screen. `check` does not run it. An experience exit leaves the check exit unchanged. An experience miss stays out of `product-rules.md` and out of `## Corrections`.

`experience rubric` prints the bars and exits 0. The criteria are `empty-copy`, `hierarchy`, and `visual`. Each one is a judgment.

The only registered screen id is `spruce`. Its proofs and build live under `.audit/`.

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts experience rubric
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts experience score spruce --actor agent --judgment .audit/experience/spruce/agent-judgment.md
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts experience score spruce --actor judge --judgment <judge-judgment.md>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts experience compare <agent-score> <judge-score>
```

Pass judgment paths and score paths relative to the repo root. `experience score` accepts only `score <screen> --actor <agent|judge> --judgment <file>` in that order. The judgment file starts with `# <screen> <actor>`. The actor word matches `--actor`. The sections are `empty-copy`, `hierarchy`, and `visual`. Each section has a `mark:` line of `0` or `1` and a `because:` line.

```text
# spruce agent

## empty-copy
mark: 1
because: <one line>

## hierarchy
mark: 1
because: <one line>

## visual
mark: 1
because: <one line>
```

`score` exits 0 when it prints the score. A judgment mark of 0 stays in that score. Exit 2 is a bad invocation, an unknown screen, or unreadable input.

`compare` reads two score files from the repo root. It prints one line per criterion. The line is `<id> <agent mark> <judge mark> agree` when the marks match. The last word is `differ` for unequal marks. Exit 0 prints that report. Exit 2 is a bad invocation, an unreadable score, or two scores for different screens.

## Accept and decline

The skill is `/dstack-accept`. The commands run from the product repo.

```text
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts accept [--write] uncovered <kind.state>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts accept [--write] unlisted <CodeName>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts accept [--write] corrected <RuleId>
node --experimental-strip-types <dstack>/skills/dstack/scripts/dstack.ts decline [--write] uncovered <kind.state>
```

`--write` is the only write. The key is two words. Put `--write` once, before both words or after both words. A second `--write` exits 2. Without `--write`, stdout prints the next `product-rules.md` and the caller lines, and the file on disk stays as it was. `status  current` means the file stayed unchanged. That run also prints `write  no`. A completed write prints `write  yes`. The command leaves `*.states.md` unchanged. The command does not commit.

Exit 0 prints the decision. Exit 0 can still leave the file unchanged. Exit 2 prints the reason on stderr.

Decline names an uncovered state. Declining `unlisted` or `corrected` exits 2 with `Decline names an uncovered coordinate.` The parser rejects `populated`. `unlisted` and `corrected` are accept keys.

The accept and decline commands do not read gate files. On an accept, gate exit 0 comes first. Then run accept with `--write` off. Pass `--write` only when a later message includes the flag `--write`. A bare yes is not a write. On that accept, run the gate again and require exit 0 before `accept --write`. Decline skips the gate. `stance  block` does not decline. `stance  clear` does not accept.

After the rules file is written, the skill edits named state-table cells in a later turn. That edit waits until `product-rules.md` is absent from the changed paths.

## Product-rules grammar

A root file with no `### C-`, `### P-`, or `### T-` heading is an empty catalog. `/dstack-init` writes the catalog. The next block is the heading grammar. It matches `skills/dstack/scripts/fixtures/shop/product-rules.md`. The scan chooses the ids. The root `product-rules.md` in this repository is a stub.

Each rule is a level-3 heading. `C-` is a component, `P-` is a pattern, and `T-` is a token. A component or a token names its code symbol in backticks. A `Covers:` line names the kind, or the kind and one state, that the rule owns. A bare kind covers that whole part, so that rule is the part's state machine. `badge.loading` means the loading state of kind `badge`. A token has a `Value:` line. Other prose is for people.

Two rules cannot cover the same state. The check names both headings when they do.

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

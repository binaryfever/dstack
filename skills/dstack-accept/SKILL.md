---
name: dstack-accept
description: "Accept or decline one dstack rule proposal. Use for /dstack-accept."
disable-model-invocation: true
---

# dstack-accept

Run the dstack script. Do not edit `product-rules.md` by hand. Do not apply the indented diff.

The script is `node --experimental-strip-types <directory of this file>/../dstack/scripts/dstack.ts`. The dstack skill is the sibling of this skill. If the script exits 2, paste stderr and stop.

## Run

When invoked as `/dstack-accept`:

1. If the human did not name a key, run `node --experimental-strip-types <directory of this file>/../dstack/scripts/dstack.ts check`. Show the proposal lines and stop. Do not pick a key.
2. If the human asks to decline `unlisted` or `corrected`, stop and say decline only covers an uncovered state.
3. For a named key, run `node --experimental-strip-types <directory of this file>/../dstack/scripts/dstack.ts accept <key>` or `node --experimental-strip-types <directory of this file>/../dstack/scripts/dstack.ts decline uncovered <kind.state>`. Leave `--write` off. An accept key is `uncovered <kind.state>`, `unlisted <CodeName>`, or `corrected <RuleId>`.
4. Paste stdout and stop. Do not write in that turn.
5. Pass `--write` only when a later message includes the flag `--write`. A bare yes is not a write.
6. If that message includes `--write`, run the same command with `--write` once, before the key or after it. If you ran that command, paste stdout and stop.
7. Do not edit `product-rules.md` yourself. Do not edit a `*.states.md` file in the same turn as the rules write. Do not commit. Do not merge.

## Edit the named cells

Use the changed paths `dstack check` computes in `<directory of this file>/../dstack/scripts/dstack.ts`.

If `product-rules.md` is still in those paths, list the caller lines and do not edit the tables.

If `product-rules.md` is absent from those paths, edit only the cells the caller lines named.

On that edit, replace `unlisted(Name)` with the rule id the parallel-name line names.

On that edit, leave the other tokens in that cell.

On that edit, put the ignored-cover rule id in the named cell.

After that edit, run `node --experimental-strip-types <directory of this file>/../dstack/scripts/dstack.ts check`.

If that check reports unused-ref for that rule, list the finding and keep the citation.

Do not edit `product-rules.md` in that later run.

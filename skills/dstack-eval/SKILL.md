---
name: dstack-eval
description: "Run a skill-versus-no-skill regression for one screen pair. Use for /dstack-eval."
disable-model-invocation: true
---

# dstack-eval

Run the eval script. Do not edit `product-rules.md`. Do not add a command to `dstack.ts`. Do not pick a model.

The script is `node --experimental-strip-types <directory of this file>/scripts/eval.ts`.

## Run

When invoked as `/dstack-eval`:

1. If the human did not pass `--model`, stop. Do not pick a model.
2. Run `node --experimental-strip-types <directory of this file>/scripts/eval.ts prepare --surface all --model <model>`. If the script exits 2, paste stderr and stop.
3. For each printed run, read `jobs.json`. Spawn two builders on that model. The workspace for each builder is its `cwd`. Paste the contents of that builder's `prompt` file. Do not paste the path, `jobs.json`, or the run directory. Wait for both.
4. Run `node --experimental-strip-types <directory of this file>/scripts/eval.ts blind <run>`. The judge workspace is the printed `judge` directory.
5. Spawn the judge on that workspace only. Paste `prompt.md` and the workspace. Do not paste the key, `jobs.json`, or the other screen.
6. Write the judge reply to `<run>/meta/judge-reply.md`. Write `<run>/meta/builders.json` and `<run>/meta/judge.json` with the model and the agent id from each spawn.

```json
{ "skill": { "model": "<model>", "agentId": "<id>" }, "none": { "model": "<model>", "agentId": "<id>" } }
```

```json
{ "model": "<model>", "agentId": "<id>" }
```

7. Run `node --experimental-strip-types <directory of this file>/scripts/eval.ts score <run>` for notifications and for mentions. Paste both reports. The pair passes only when both scores exit 0. Do not average them. Stop.

A reviewer re-scores cedar against willow with `node --experimental-strip-types <directory of this file>/scripts/eval.ts score --historical fmc-579`. Spruce against aspen is the same command with `fmc-581`. Exit 2 from that command is not a pass.

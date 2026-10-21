# Recommendation for Fred

Issue rule: keep going (treat `/dstack` as general) only if the skill arm passes states, reuse, and a correctly named `MentionsList.states.md`, and beats the no-skill arm. Narrow if the arms tie, if the no-skill arm matches on the table, or if the check exits 0 while the table is missing or misnamed.

| gate | result |
|---|---|
| Skill arm states | pass |
| Skill arm reuse | pass |
| Skill arm `MentionsList.states.md` | pass (exact name, rule ids cited) |
| Skill arm beats no-skill | 6/6 vs 5/6 |
| Green check with wrong or missing table | no (filename correct, check exit 0) |

**Recommendation: keep going.**

Aspen's only miss is the missing `MentionsList.states.md`, the same gap willow showed on notifications in FMC-579. The Mentions noun transferred. The skill arm did not win by copying notification habits.

Fred still makes the keep-going-or-narrow call. FMC-578 stays blocked until that call.

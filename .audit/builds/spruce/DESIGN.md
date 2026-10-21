# Mentions screen

A shopper opens one list of mentions and sees how many are still unseen. The count sits in the header beside the title. The next person to add a screen can follow the same state table and the same shared components.

## What the screen uses

The list is remote. AsyncList switches empty, loading, failed, and populated. EmptyState shows one @ mark and the sentence "Mentions of you will show up here." Loading shows three RowSkeleton rows. Failure shows one sentence and a Retry button. That is the inline retry pattern. Each populated row is a MentionRow with an Avatar and a relative time.

The unseen count reads the same response. Badge shows how many mentions have seen set to false. Badge hides a zero. While the fetch is loading or has failed, the header draws nothing. That is the quiet badge pattern.

Under seven days, the time is a short age such as 45m, 3h, or 2d. At seven days and after, the time is a UTC date such as Sep 30, 2026.

mentions.json is the payload. Each mention carries ageMs. The parser turns that into an absolute createdAt when the response arrives. demo=empty, demo=failed, and demo=loading reach the other states without putting a switcher on the shopper's screen.

## What I set aside

A second request for the count. The count is how many of these mentions are unseen. Two responses could disagree, and the header would need its own failure path.

A new list or badge component. AsyncList already switches the four list states. Badge already hides zero and shows 99+ above 99. The screen passes those components their inputs.

Shared files for MentionRow and for relative time. MentionRow belongs only to this screen, and the product rules do not name it. Relative time is a pattern, so it stays a function beside the parser.

Absolute timestamps in the JSON. A fixed timestamp stops showing 3h once a week has passed. ageMs keeps both time branches visible whenever the file is served.

A visible control for empty, loading, and failed. The shopper is here to read mentions. Retry is the control they need when the fetch fails.

## Rule proposals not applied

The dstack check reports two notes and zero proposals. This is the only screen, and a proposal needs the same gap on two screens. list.failed has no covering rule, and the failed cell uses P-retry-inline. MentionRow is not in the product rules. product-rules.md is unchanged.

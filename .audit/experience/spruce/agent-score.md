screen spruce
actor agent

empty-copy judgment 1
because The empty proof shows one illustration and one sentence, Mentions of you will show up here. The sentence names the mentions that will show up.
evidence .audit/proof/spruce-empty.png empty

hierarchy judgment 1
because The title is Mentions, and the badge is a smaller count beside that title on both widths.
evidence .audit/proof/spruce-populated-desktop.png populatedDesktop
evidence .audit/proof/spruce-populated-mobile.png populatedMobile

no-parallel-card mechanical 1
because The list populated cell names MentionRow, and the screen files declare no Card and no card class.
evidence .audit/builds/spruce/src/mentions/MentionsList.states.md:5 unlisted(MentionRow) + C-avatar + P-relative-time
evidence .audit/builds/spruce/src/mentions/MentionsList.js:115 function MentionRow

visual judgment 1
because Empty shows one illustration and one sentence and no rows. Loading shows three skeletons. Failed shows one sentence and Retry. Both populated proofs show four rows.
evidence .audit/proof/spruce-empty.png empty
evidence .audit/proof/spruce-loading.png loading
evidence .audit/proof/spruce-failed.png failed
evidence .audit/proof/spruce-populated-desktop.png populatedDesktop
evidence .audit/proof/spruce-populated-mobile.png populatedMobile

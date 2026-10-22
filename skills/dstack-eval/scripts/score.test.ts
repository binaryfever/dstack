import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
	type ModelId,
	type RunId,
	type TreeFiles,
	FORBIDDEN,
	HISTORICAL_TREES,
	RECORDED,
	SURFACES,
	assignment,
	brief,
	builderPrompt,
	exitCode,
	fileChecks,
	formatScore,
	isPlantedSkillPath,
	judgePrompt,
	latestRunId,
	modelId,
	parseCodename,
	parseJudgeReply,
	plantPostcondition,
	regressionPassed,
	score,
	skillHash,
	type ScoreInput,
} from './score.ts'

function must(value: string): ModelId {
	const parsed = modelId(value)
	if (!parsed.ok) throw new Error(parsed.problem)
	return parsed.model
}

const hash = skillHash([{ path: 'SKILL.md', bytes: 'skill' }])
const otherHash = skillHash([{ path: 'SKILL.md', bytes: 'other' }])

const judges = { screen: 1, states: 1, reuse: 1, openable: 1 } as const

function run(patch: Partial<Extract<ScoreInput, { type: 'run' }>>): ScoreInput {
	return {
		type: 'run',
		plant: null,
		surface: 'notifications',
		model: must('grok-4.7-xhigh'),
		plantedHash: hash,
		liveHash: hash,
		verdictPath: '.audit/eval/notifications/example/verdict.json',
		key: { alpha: 'skill', beta: 'none' },
		builders: {
			skill: { model: must('grok-4.7-xhigh'), agentId: 'builder-skill' },
			none: { model: must('grok-4.7-xhigh'), agentId: 'builder-none' },
		},
		judge: { model: must('grok-4.7-xhigh'), agentId: 'judge' },
		alphaJudge: judges,
		betaJudge: judges,
		alphaFiles: { table: 1, rules: 1 },
		betaFiles: { table: 0, rules: 1 },
		probe: { exit: 0, exactTable: true },
		...patch,
	}
}

const rulesText = `# Product rules

## Components

### C-async-list \`AsyncList\`
Covers: list
`

const validTable = `| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|
| notifications | list | remote | C-async-list | C-async-list | C-async-list | C-async-list | C-async-list |
`

const missingRuleTable = `| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|
| mentions | list | remote | C-missing | C-missing | C-missing | C-missing | C-missing |
`

function readTree(dir: string): TreeFiles {
	const out: { path: string; bytes: string }[] = []
	const walk = (abs: string, rel: string): void => {
		for (const entry of readdirSync(abs, { withFileTypes: true })) {
			if (entry.name === '.git' || entry.name === 'node_modules') continue
			const nextRel = rel === '' ? entry.name : `${rel}/${entry.name}`
			const nextAbs = join(abs, entry.name)
			if (entry.isDirectory()) walk(nextAbs, nextRel)
			else if (entry.isFile()) out.push({ path: nextRel, bytes: readFileSync(nextAbs, 'utf8') })
		}
	}
	walk(dir, '')
	return out
}

test('a missing table fails gate table and exits 1', () => {
	const dropped = score(
		run({
			key: { alpha: 'none', beta: 'skill' },
			alphaFiles: { table: 0, rules: 1 },
			betaFiles: { table: 0, rules: 1 },
			probe: { exit: 0, exactTable: false },
		}),
	)
	assert.equal(dropped.kind, 'regression')
	if (dropped.kind !== 'regression') throw new Error('kind')
	assert.equal(dropped.pass, false)
	assert.equal(dropped.failedGate, 'table')
	assert.equal(regressionPassed(dropped), false)
	assert.equal(exitCode(dropped), 1)
	assert.equal(
		formatScore(dropped),
		`kind  regression
observes  yes
surface  notifications
model  grok-4.7-xhigh
pass  no
failed gate  table
skill  5/6
none  5/6
alpha  none
beta  skill
screen  1  1
states  1  1
reuse  1  1
table  0  0
rules  1  1
openable  1  1
probe exit  0
probe table  no
`,
	)
})

test('the other blind orientation reports the same failed gate', () => {
	const skillSide = score(
		run({
			key: { alpha: 'skill', beta: 'none' },
			alphaJudge: { screen: 1, states: 1, reuse: 1, openable: 1 },
			betaJudge: { screen: 0, states: 1, reuse: 1, openable: 1 },
			alphaFiles: { table: 0, rules: 1 },
			betaFiles: { table: 0, rules: 1 },
		}),
	)
	const noneSide = score(
		run({
			key: { alpha: 'none', beta: 'skill' },
			alphaJudge: { screen: 0, states: 1, reuse: 1, openable: 1 },
			betaJudge: { screen: 1, states: 1, reuse: 1, openable: 1 },
			alphaFiles: { table: 0, rules: 1 },
			betaFiles: { table: 0, rules: 1 },
		}),
	)
	for (const result of [skillSide, noneSide]) {
		assert.equal(result.kind, 'regression')
		if (result.kind !== 'regression') throw new Error('kind')
		assert.equal(result.failedGate, 'table')
		assert.equal(result.skill.screen, 1)
		assert.equal(exitCode(result), 1)
	}
})

test('unblinding swaps the file bits onto the skill card', () => {
	const passed = score(run({ key: { alpha: 'none', beta: 'skill' }, alphaFiles: { table: 0, rules: 1 }, betaFiles: { table: 1, rules: 1 } }))
	assert.equal(passed.kind, 'regression')
	if (passed.kind !== 'regression') throw new Error('kind')
	assert.equal(passed.pass, true)
	assert.equal(passed.failedGate, null)
	assert.equal(regressionPassed(passed), true)
	assert.equal(exitCode(passed), 0)
	assert.match(formatScore(passed), /^pass  yes$/m)
	assert.doesNotMatch(formatScore(passed), /^failed gate  /m)
	assert.match(formatScore(passed), /^table  1  0$/m)

	const swappedBack = score(
		run({ key: { alpha: 'none', beta: 'skill' }, alphaFiles: { table: 1, rules: 1 }, betaFiles: { table: 0, rules: 1 } }),
	)
	assert.equal(swappedBack.kind, 'regression')
	if (swappedBack.kind !== 'regression') throw new Error('kind')
	assert.equal(swappedBack.failedGate, 'table')
	assert.match(formatScore(swappedBack), /^table  0  1$/m)
})

test('states and beats are later gates', () => {
	const states = score(
		run({
			alphaJudge: { screen: 1, states: 0, reuse: 0, openable: 1 },
			alphaFiles: { table: 1, rules: 1 },
			betaFiles: { table: 0, rules: 1 },
		}),
	)
	assert.equal(states.kind, 'regression')
	if (states.kind !== 'regression') throw new Error('kind')
	assert.equal(states.failedGate, 'states')

	const beats = score(
		run({
			alphaJudge: { screen: 0, states: 1, reuse: 1, openable: 0 },
			betaJudge: judges,
			alphaFiles: { table: 1, rules: 0 },
			betaFiles: { table: 0, rules: 1 },
		}),
	)
	assert.equal(beats.kind, 'regression')
	if (beats.kind !== 'regression') throw new Error('kind')
	assert.equal(beats.failedGate, 'beats')
	assert.equal(exitCode(beats), 1)
})

test('a historical input exits 2 and is not a pass', () => {
	const frozen = score({
		type: 'historical',
		caseId: 'fmc-579',
		recorded: RECORDED['fmc-579'],
		skillFiles: { table: 1, rules: 1 },
		noneFiles: { table: 0, rules: 1 },
	})
	assert.equal(frozen.kind, 'historical')
	assert.equal(regressionPassed(frozen), false)
	assert.equal(exitCode(frozen), 2)
	const text = formatScore(frozen)
	assert.equal(text.startsWith('kind  historical\nobserves  no\n'), true)
	assert.match(text, /^case  fmc-579$/m)
	assert.match(text, /^reproduced  yes$/m)
	assert.match(text, /^skill  6\/6$/m)
	assert.match(text, /^none  5\/6$/m)
	assert.match(text, /^screen  1  1$/m)
	assert.match(text, /^states  1  1$/m)
	assert.match(text, /^reuse  1  1$/m)
	assert.match(text, /^table  1  0$/m)
	assert.match(text, /^rules  1  1$/m)
	assert.match(text, /^openable  1  1$/m)
	assert.doesNotMatch(text, /^pass  /m)
})

test('historical file bits that differ are not reproduced and still exit 2', () => {
	const drifted = score({
		type: 'historical',
		caseId: 'fmc-581',
		recorded: RECORDED['fmc-581'],
		skillFiles: { table: 0, rules: 1 },
		noneFiles: { table: 0, rules: 1 },
	})
	assert.equal(drifted.kind, 'historical')
	if (drifted.kind !== 'historical') throw new Error('kind')
	assert.equal(drifted.reproduced, false)
	assert.equal(exitCode(drifted), 2)
	assert.doesNotMatch(formatScore(drifted), /^pass  /m)
})

test('the committed fmc trees still show the recorded table split', () => {
	const root = join(import.meta.dirname, '../../..')
	for (const caseId of ['fmc-579', 'fmc-581'] as const) {
		const spec = HISTORICAL_TREES[caseId]
		const expected = readFileSync(join(root, spec.expectedRules), 'utf8')
		const skillFiles = fileChecks(readTree(join(root, spec.skill)), SURFACES[spec.surface], expected)
		const noneFiles = fileChecks(readTree(join(root, spec.none)), SURFACES[spec.surface], expected)
		assert.deepEqual(skillFiles, { table: 1, rules: 1 })
		assert.deepEqual(noneFiles, { table: 0, rules: 1 })
		const result = score({ type: 'historical', caseId, recorded: RECORDED[caseId], skillFiles, noneFiles })
		assert.equal(result.kind, 'historical')
		if (result.kind !== 'historical') throw new Error('kind')
		assert.equal(result.reproduced, true, formatScore(result))
		assert.equal(result.observes, false)
		assert.equal(regressionPassed(result), false)
		assert.equal(exitCode(result), 2)
		assert.doesNotMatch(formatScore(result), /^pass  /m)
	}
})

test('a plant problem outranks a hash mismatch and a table miss', () => {
	const contaminated = score(
		run({
			plant: 'none tree contains .cursor/skills',
			plantedHash: hash,
			liveHash: otherHash,
			alphaFiles: { table: 0, rules: 1 },
			betaFiles: { table: 0, rules: 1 },
		}),
	)
	assert.equal(contaminated.kind, 'unreadable')
	if (contaminated.kind !== 'unreadable') throw new Error('kind')
	assert.equal(contaminated.problem, 'none tree contains .cursor/skills')
	assert.equal(contaminated.observes, false)
	assert.equal(regressionPassed(contaminated), false)
	assert.equal(exitCode(contaminated), 2)
	assert.equal(formatScore(contaminated), 'kind  unreadable\nobserves  no\nproblem  none tree contains .cursor/skills\n')
})

test('a moved skill is stale and writes no pass line', () => {
	const stale = score(run({ liveHash: otherHash }))
	assert.equal(stale.kind, 'stale')
	if (stale.kind !== 'stale') throw new Error('kind')
	assert.equal(stale.plantedHash, hash)
	assert.equal(stale.liveHash, otherHash)
	assert.equal(regressionPassed(stale), false)
	assert.equal(exitCode(stale), 2)
	const text = formatScore(stale)
	assert.match(text, /^kind  stale$/m)
	assert.match(text, /^observes  no$/m)
	assert.match(text, /^planted  /m)
	assert.match(text, /^current  /m)
	assert.match(text, /^verdict  \.audit\/eval\/notifications\/example\/verdict\.json$/m)
	assert.doesNotMatch(text, /^pass  /m)
	assert.doesNotMatch(text, /^screen  /m)
})

test('an empty agent id is unreadable', () => {
	const empty = score(run({ judge: { model: must('grok-4.7-xhigh'), agentId: '  ' } }))
	assert.equal(empty.kind, 'unreadable')
	assert.equal(exitCode(empty), 2)
})

test('brief does not depend on role', () => {
	const notifications = brief('notifications')
	const mentions = brief('mentions')
	assert.equal(notifications.includes('notification list'), true)
	assert.equal(notifications.includes('an unread count'), true)
	assert.equal(mentions.includes('mentions list'), true)
	assert.equal(mentions.includes('an unseen count'), true)
	assert.equal(notifications.includes('empty'), false)
	assert.equal(notifications.includes('loading'), false)
	assert.equal(notifications.includes('failed'), false)
	assert.equal(mentions.includes('empty'), false)
	const skill = builderPrompt('notifications', { role: 'skill' })
	const none = builderPrompt('notifications', { role: 'none' })
	const mentionsSkill = builderPrompt('mentions', { role: 'skill' })
	const mentionsNone = builderPrompt('mentions', { role: 'none' })
	assert.equal(skill.ok, true)
	assert.equal(none.ok, true)
	assert.equal(mentionsSkill.ok, true)
	assert.equal(mentionsNone.ok, true)
	if (!skill.ok || !none.ok || !mentionsSkill.ok || !mentionsNone.ok) throw new Error('prompt')
	assert.equal(none.text, notifications)
	assert.equal(mentionsNone.text, mentions)
	assert.equal(skill.text, `${notifications}\n\nFollow /dstack.\n`)
	assert.equal(mentionsSkill.text, `${mentions}\n\nFollow /dstack.\n`)
	assert.equal(none.text.toLowerCase().includes('dstack'), false)
	assert.equal(mentionsNone.text.toLowerCase().includes('dstack'), false)
	for (const word of FORBIDDEN) assert.equal(skill.text.toLowerCase().includes(word), false, word)
})

test('parseCodename rejects alpha and the historical names', () => {
	assert.equal(parseCodename('alpha').ok, false)
	assert.equal(parseCodename('beta').ok, false)
	assert.equal(parseCodename('cedar').ok, false)
	assert.equal(parseCodename('willow').ok, false)
	assert.equal(parseCodename('spruce').ok, false)
	assert.equal(parseCodename('aspen').ok, false)
	assert.equal(parseCodename('skill').ok, false)
	assert.equal(parseCodename('none').ok, false)
	const birch = parseCodename('birch')
	assert.equal(birch.ok, true)
	if (!birch.ok) throw new Error('birch')
	const alder = parseCodename('alder')
	if (!alder.ok) throw new Error('alder')
	const zero = assignment(0, birch.codename, alder.codename)
	assert.deepEqual(zero.key, { alpha: 'skill', beta: 'none' })
	assert.equal(zero.skillName, birch.codename)
	assert.equal(zero.noneName, alder.codename)
	const one = assignment(1, birch.codename, alder.codename)
	assert.deepEqual(one.key, { alpha: 'none', beta: 'skill' })
	assert.equal(one.skillName, alder.codename)
	assert.equal(one.noneName, birch.codename)
	assert.throws(() => assignment(0, birch.codename, birch.codename), /codenames must differ/)
})

test('plantPostcondition rejects fixtures and a pre-existing states file', () => {
	const skillFiles = ['.cursor/skills/dstack/SKILL.md', '.cursor/skills/dstack/scripts/dstack.ts', 'README.md']
	assert.equal(plantPostcondition({ role: 'skill' }, skillFiles), null)
	assert.equal(
		plantPostcondition({ role: 'skill' }, [...skillFiles, '.cursor/skills/dstack/scripts/fixtures/shop/product-rules.md']),
		'fixtures path',
	)
	assert.equal(
		plantPostcondition({ role: 'skill' }, [...skillFiles, 'src/notifications/NotificationList.states.md']),
		'states file NotificationList.states.md',
	)
	assert.equal(plantPostcondition({ role: 'skill' }, ['README.md']), 'missing .cursor/skills/dstack/SKILL.md')
	assert.equal(
		plantPostcondition({ role: 'skill' }, [...skillFiles, '.cursor/skills/other/SKILL.md']),
		'.cursor/skills outside dstack',
	)
	assert.equal(plantPostcondition({ role: 'none' }, ['README.md', 'src/components/Badge.js']), null)
	assert.equal(plantPostcondition({ role: 'none' }, ['.cursor/skills/dstack/SKILL.md']), '.cursor/skills')
	assert.equal(
		plantPostcondition({ role: 'none' }, ['src/mentions/MentionsList.states.md']),
		'states file MentionsList.states.md',
	)
})

test('file checks require the exact basename, a listed rule, and the rules bytes', () => {
	const files: TreeFiles = [
		{ path: 'product-rules.md', bytes: rulesText },
		{ path: 'src/notifications/NotificationList.states.md', bytes: validTable },
	]
	assert.deepEqual(fileChecks(files, SURFACES.notifications, rulesText), { table: 1, rules: 1 })
	assert.deepEqual(fileChecks(files, SURFACES.notifications, `${rulesText}\n`), { table: 1, rules: 0 })
	assert.deepEqual(
		fileChecks(
			[
				{ path: 'product-rules.md', bytes: rulesText },
				{ path: 'src/mentions/MentionsList.states.md', bytes: missingRuleTable },
			],
			SURFACES.mentions,
			rulesText,
		),
		{ table: 0, rules: 1 },
	)
	assert.deepEqual(
		fileChecks(
			[
				...files,
				{ path: 'src/mentions/MentionsList.states.md', bytes: validTable },
				{ path: 'src/notifications/NotificationList.states.md', bytes: validTable },
			],
			SURFACES.mentions,
			rulesText,
		),
		{ table: 0, rules: 1 },
	)
	assert.deepEqual(
		fileChecks([{ path: 'src/product-rules.md', bytes: rulesText }, files[1]!], SURFACES.notifications, rulesText),
		{ table: 0, rules: 0 },
	)
})

test('the judge reply owns four checks and ignores table and rules rows', () => {
	const parsed = parseJudgeReply(`| check | alpha | beta |
|---|---|---|
| screen | 1 | 0 |
| states | 1 | 1 |
| reuse | 0 | 1 |
| table | 1 | 1 |
| rules | 0 | 0 |
| openable | 1 | 1 |
`)
	assert.equal(parsed.ok, true)
	if (!parsed.ok) throw new Error('judge')
	assert.deepEqual(parsed.alpha, { screen: 1, states: 1, reuse: 0, openable: 1 })
	assert.deepEqual(parsed.beta, { screen: 0, states: 1, reuse: 1, openable: 1 })
	assert.equal(parseJudgeReply('| screen | 1 | 1 |\n').ok, false)
	assert.equal(parseJudgeReply('| screen | 2 | 1 |\n| states | 1 | 1 |\n| reuse | 1 | 1 |\n| openable | 1 | 1 |\n').ok, false)
})

test('the judge prompt names the screen and not the skill', () => {
	const notifications = judgePrompt('notifications', 'alpha', 'beta')
	const mentions = judgePrompt('mentions', 'alpha', 'beta')
	assert.equal(notifications.toLowerCase().includes('dstack'), false)
	assert.equal(mentions.toLowerCase().includes('dstack'), false)
	assert.equal(notifications.includes('notification list'), true)
	assert.equal(notifications.includes('an unread count'), true)
	assert.equal(notifications.includes('NotificationList.states.md'), false)
	assert.equal(notifications.includes('product-rules'), false)
	assert.equal(notifications.includes('alpha'), true)
	assert.equal(notifications.includes('beta'), true)
	assert.equal(notifications.includes('notification-only'), false)
	assert.equal(mentions.includes('Notification copy, or a notification-only correction, is a miss on screen.'), true)
	assert.equal(mentions.includes('mentions list'), true)
	assert.equal(mentions.includes('an unseen count'), true)
	assert.equal(notifications.includes('AsyncList'), true)
	assert.equal(notifications.includes('color.primary'), true)
})

test('skill hash drops fixtures and ignores order', () => {
	assert.equal(isPlantedSkillPath('scripts/fixtures/shop/product-rules.md'), false)
	assert.equal(isPlantedSkillPath('../SKILL.md'), false)
	assert.equal(isPlantedSkillPath('/tmp/SKILL.md'), false)
	assert.equal(isPlantedSkillPath(''), false)
	assert.equal(isPlantedSkillPath('SKILL.md'), true)
	const withFixtures = skillHash([
		{ path: 'scripts/fixtures/shop/product-rules.md', bytes: 'secret' },
		{ path: 'SKILL.md', bytes: 'body' },
	])
	const plain = skillHash([{ path: 'SKILL.md', bytes: 'body' }])
	assert.equal(withFixtures, plain)
	const flipped = skillHash([
		{ path: 'b.ts', bytes: '2' },
		{ path: 'a.ts', bytes: '1' },
	])
	const ordered = skillHash([
		{ path: 'a.ts', bytes: '1' },
		{ path: 'b.ts', bytes: '2' },
	])
	assert.equal(flipped, ordered)
	assert.notEqual(flipped, plain)
})

test('latestRunId is the greatest stamp and modelId rejects a blank', () => {
	assert.equal(modelId('').ok, false)
	assert.equal(modelId('grok 4').ok, false)
	assert.equal(modelId('grok-4.7-xhigh').ok, true)
	assert.equal(latestRunId([]), null)
	const earlier = '20261022T1400Z-aaaaaaaa-0001' as RunId
	const later = '20261022T1500Z-bbbbbbbb-0002' as RunId
	assert.equal(latestRunId([earlier, later]), later)
	assert.equal(latestRunId([later, earlier]), later)
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
	REQUIRED_STATES,
	RULES_PATH,
	TABLE_SUFFIX,
	UI_STATES,
	applyEdit,
	checkScreens,
	collectIssues,
	correctionDrift,
	parseRules,
	parseTable,
	propose,
	report,
	tablePath,
	type BranchView,
	type Source,
	type UiState,
} from './model.ts'

const root = join(import.meta.dirname, '../../..')
const shopRules = readFileSync(join(import.meta.dirname, 'fixtures/shop/product-rules.md'), 'utf8')
const draftTable = readFileSync(
	join(import.meta.dirname, 'fixtures/shop/src/notifications/NotificationList.states.md'),
	'utf8',
)
const fixedTable = readFileSync(
	join(import.meta.dirname, 'fixtures/shop-two/src/notifications/NotificationList.states.md'),
	'utf8',
)
const mentionsTable = readFileSync(
	join(import.meta.dirname, 'fixtures/shop-two/src/mentions/MentionsList.states.md'),
	'utf8',
)
const notificationsPath = tablePath('src/notifications/NotificationList.states.md')
const mentionsPath = tablePath('src/mentions/MentionsList.states.md')

function rules() {
	const parsed = parseRules(shopRules)
	assert.equal(parsed.ok, true)
	if (!parsed.ok) throw new Error('rules')
	return parsed.rules
}

function quietBranch(files: { path: string; text: string }[]): BranchView {
	return { screenFiles: files, changedFiles: [], rulesChanged: false, tableChanged: false }
}

const callSite1 = `rules  product-rules.md, 9 rules
table  src/notifications/NotificationList.states.md, 2 surfaces

errors 6
  src/notifications/NotificationList.states.md:5 notifications.machine. C-async-list (product-rules.md:5) covers list. Put C-async-list here and fill its slots.
  src/notifications/NotificationList.states.md:5 notifications.empty. C-empty-state (product-rules.md:12) covers list.empty. Put C-empty-state in this cell.
  src/notifications/NotificationList.states.md:5 notifications.loading. C-row-skeleton (product-rules.md:9) covers list.loading. Put C-row-skeleton in this cell.
  src/notifications/NotificationList.states.md:5 notifications.populated. unlisted(Avatar) is C-avatar (product-rules.md:20). Write C-avatar.
  src/notifications/NotificationList.states.md:6 unread-count.loading. A remote surface needs a loading cell.
  src/notifications/NotificationList.states.md:6 unread-count.failed. A remote surface needs a failed cell.

notes 2
  uncovered list.failed. No rule covers it. src/notifications/NotificationList.states.md used unlisted(ErrorBanner).
  unlisted NotificationRow. product-rules.md does not list it. First seen in src/notifications/NotificationList.states.md.

proposals 0`

test('a first notification draft names the six misses and two notes', () => {
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: draftTable }],
		branches: new Map(),
		target: notificationsPath,
	})
	assert.equal(report(value), callSite1)
})

test('two screens with the same gap print both rule diffs', () => {
	const screen = (path: string, text: string) => quietBranch([{ path, text }])
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [
			{ path: notificationsPath, text: fixedTable },
			{ path: mentionsPath, text: mentionsTable },
		],
		branches: new Map([
			[notificationsPath, screen('src/notifications/NotificationList.tsx', readFileSync(join(import.meta.dirname, 'fixtures/shop-two/src/notifications/NotificationList.tsx'), 'utf8'))],
			[mentionsPath, screen('src/mentions/MentionsList.tsx', readFileSync(join(import.meta.dirname, 'fixtures/shop-two/src/mentions/MentionsList.tsx'), 'utf8'))],
		]),
		target: mentionsPath,
	})
	assert.equal(value.findings.length, 0)
	assert.equal(value.notes.length, 0)
	assert.equal(value.proposals.length, 2)
	assert.match(value.proposals[0]?.diff ?? '', /Covers: detail\.failed, list\.failed/)
	assert.match(value.proposals[1]?.diff ?? '', /### C-notification-row `NotificationRow`/)
	const text = report(value)
	assert.match(text, /uncovered list\.failed\. Seen in 2 screens\./)
	assert.match(text, /unlisted NotificationRow\. Seen in 2 screens\./)
	assert.match(text, /src\/notifications\/NotificationList\.states\.md {2}notifications used P-retry-inline/)
	assert.match(text, /src\/mentions\/MentionsList\.states\.md {2}mentions used P-retry-inline/)
})

test('applying a proposal drops that issue', () => {
	const parsed = [
		{ path: notificationsPath, text: fixedTable },
		{ path: mentionsPath, text: mentionsTable },
	]
	const before = collectIssues(rules(), parsed.map((item) => parseTable(item.path, item.text).table))
	assert.equal(before.repeats.length, 2)
	let next = shopRules
	for (const repeat of before.repeats) {
		next = applyEdit(next, propose(rulesFrom(next), repeat))
	}
	const parsedNext = parseRules(next)
	assert.equal(parsedNext.ok, true)
	if (!parsedNext.ok) return
	const after = collectIssues(parsedNext.rules, parsed.map((item) => parseTable(item.path, item.text).table))
	assert.deepEqual(after.repeats.map((issue) => issue.type), [])
	assert.deepEqual(after.notes.map((issue) => issue.type), [])
})

function rulesFrom(text: string) {
	const parsed = parseRules(text)
	assert.equal(parsed.ok, true)
	if (!parsed.ok) throw new Error('rules')
	return parsed.rules
}

test('forbidden empty copy fails when the table cites C-empty-state', () => {
	const screen = `export function NotificationList() {
  return (
    <AsyncList
      empty={<EmptyState title="No data" />}
    />
  )
}
`
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: fixedTable }],
		branches: new Map([[notificationsPath, quietBranch([{ path: 'src/notifications/NotificationList.tsx', text: screen }])]]),
		target: notificationsPath,
	})
	const correction = value.findings.find((finding) => finding.type === 'correction')
	assert.ok(correction)
	assert.deepEqual(correction, {
		type: 'correction',
		at: { path: 'src/notifications/NotificationList.tsx', line: 4 },
		rule: 'C-empty-state',
		ruleLine: 12,
		text: 'Empty copy names what will appear here, never "No data".',
		literal: 'No data',
	})
	assert.match(report(value), /"No data" breaks C-empty-state \(product-rules\.md:12\)/)
})

test('a multi-line template with forbidden copy is still scanned', () => {
	const screen = 'const title = `\nNo data\n`\n'
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: fixedTable }],
		branches: new Map([[notificationsPath, quietBranch([{ path: 'src/notifications/NotificationList.tsx', text: screen }])]]),
		target: notificationsPath,
	})
	assert.equal(value.findings.some((finding) => finding.type === 'correction'), true)
})

test('comment-only forbidden copy does not fail', () => {
	const screen = `// No data
export function NotificationList() {
  return 'ok'
}
`
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: fixedTable }],
		branches: new Map([[notificationsPath, quietBranch([{ path: 'src/notifications/NotificationList.tsx', text: screen }])]]),
		target: notificationsPath,
	})
	assert.equal(value.findings.some((finding) => finding.type === 'correction'), false)
})

test('a built screen that skips RowSkeleton and uses a raw hex fails those two checks', () => {
	const dir = join(import.meta.dirname, 'fixtures/shop-built/src/notifications')
	const list = readFileSync(join(dir, 'NotificationList.tsx'), 'utf8')
	const dot = readFileSync(join(dir, 'UnreadDot.tsx'), 'utf8')
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: fixedTable }],
		branches: new Map([
			[
				notificationsPath,
				{
					screenFiles: [
						{ path: 'src/notifications/NotificationList.tsx', text: list },
						{ path: 'src/notifications/UnreadDot.tsx', text: dot },
					],
					changedFiles: [{ path: 'src/notifications/UnreadDot.tsx', text: dot }],
					rulesChanged: false,
					tableChanged: true,
				},
			],
		]),
		target: notificationsPath,
	})
	assert.equal(value.findings.length, 2)
	assert.equal(value.findings[0]?.type, 'unused-ref')
	assert.equal(value.findings[1]?.type, 'raw-token')
	const text = report(value)
	assert.match(text, /no file under src\/notifications\/ mentions RowSkeleton/)
	assert.match(text, /src\/notifications\/UnreadDot\.tsx:9 #1A73E8 is T-primary/)
})

test('a branch that edits the rules and a table fails', () => {
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: fixedTable }],
		branches: new Map([
			[
				notificationsPath,
				{
					screenFiles: [{ path: 'src/notifications/NotificationList.tsx', text: 'AsyncList EmptyState RowSkeleton Avatar Badge' }],
					changedFiles: [],
					rulesChanged: true,
					tableChanged: true,
				},
			],
		]),
		target: notificationsPath,
	})
	assert.equal(value.findings.length, 1)
	assert.match(report(value), /Ship the rules edit as its own change/)
})

test('each source requires its states and rejects the others', () => {
	const parsed = rules()
	for (const source of Object.keys(REQUIRED_STATES) as Source[]) {
		const required = new Set<string>(REQUIRED_STATES[source])
		for (const state of UI_STATES) {
			const cells = Object.fromEntries(UI_STATES.map((name) => [name, name === 'populated' || required.has(name) ? 'none' : '']))
			if (required.has(state)) cells[state] = ''
			else cells[state] = 'none'
			const row = `| widget | unlisted(widget) | ${source} | none | ${cells.empty} | ${cells.loading} | ${cells.failed} | ${cells.populated} |`
			const text = `| surface | kind | source | machine | empty | loading | failed | populated |\n|---|---|---|---|---|---|---|---|\n${row}\n`
			const table = parseTable(tablePath('widget.states.md'), text)
			const kinds = table.findings.map((finding) => finding.type)
			if (required.has(state)) assert.ok(kinds.includes('missing-state'), `${source} ${state} should be missing`)
			else assert.ok(kinds.includes('extra-state'), `${source} ${state} should be extra`)
		}
	}
})

test('the skill example and the readme rules parse', () => {
	const skill = readFileSync(join(root, 'skills/dstack/SKILL.md'), 'utf8')
	assert.ok(skill.includes(RULES_PATH))
	assert.ok(skill.includes(TABLE_SUFFIX))
	assert.deepEqual(correctionDrift(skill), { ok: true })
	const example = parseTable(tablePath('SKILL.md'), skill)
	assert.deepEqual(example.findings, [])
	const readme = readFileSync(join(root, 'README.md'), 'utf8')
	const fenced = /```product-rules\n([\s\S]*?)```/.exec(readme)
	assert.ok(fenced)
	const parsed = parseRules(fenced?.[1] ?? '')
	assert.equal(parsed.ok, true)
	assert.equal(fenced?.[1], shopRules)
})

test('two rules cannot cover one state', () => {
	const parsed = parseRules(`${shopRules}\n### P-other\nCovers: list.empty\n`)
	assert.equal(parsed.ok, false)
	if (parsed.ok) return
	assert.match(parsed.errors.map((error) => error.problem).join('\n'), /C-empty-state/)
	assert.match(parsed.errors.map((error) => error.problem).join('\n'), /P-other/)
})

test('the check command reports the draft and writes nothing', () => {
	const dir = join(tmpdir(), `dstack-shop-${process.pid}`)
	mkdirSync(dir, { recursive: true })
	cpSync(join(import.meta.dirname, 'fixtures/shop'), dir, { recursive: true })
	const rulesDest = join(dir, 'product-rules.md')
	writeFileSync(rulesDest, shopRules)
	spawnSync('git', ['init'], { cwd: dir })
	spawnSync('git', ['add', '.'], { cwd: dir })
	spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=dstack', 'commit', '-m', 'shop'], { cwd: dir })
	const before = readFileSync(rulesDest, 'utf8')
	const result = spawnSync('node', ['--experimental-strip-types', join(root, 'skills/dstack/scripts/dstack.ts'), 'check', 'src/notifications/NotificationList.states.md'], {
		cwd: dir,
		encoding: 'utf8',
	})
	assert.equal(result.status, 1)
	assert.equal(result.stdout.trim(), callSite1)
	assert.equal(readFileSync(rulesDest, 'utf8'), before)
})

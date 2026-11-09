import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
	checkTable,
	collectIssues,
	correctionChecksFromMarkdown,
	decide,
	formatDecision,
	parseDecision,
	parseRules,
	parseTable,
	propose,
	report,
	skillCorrectionChecks,
	tablePath,
	type BranchView,
	type RuleId,
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

errors 4
  src/notifications/NotificationList.states.md:5 notifications.machine. C-async-list (product-rules.md:5) covers list. Put C-async-list here and fill its slots.
  src/notifications/NotificationList.states.md:5 notifications.populated. unlisted(Avatar) is C-avatar (product-rules.md:18). Write C-avatar.
  src/notifications/NotificationList.states.md:6 unread-count.loading. A remote surface needs a loading cell.
  src/notifications/NotificationList.states.md:6 unread-count.failed. A remote surface needs a failed cell.

notes 1
  unlisted NotificationRow. product-rules.md does not list it. First seen in src/notifications/NotificationList.states.md.

proposals 0`

test('a first notification draft names the four misses and one note', () => {
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: draftTable }],
		branches: new Map(),
		target: notificationsPath,
	})
	assert.equal(report(value), callSite1)
})

test('two screens with the same gap print one rule diff', () => {
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
	assert.equal(value.proposals.length, 1)
	assert.match(value.proposals[0]?.diff ?? '', /### C-notification-row `NotificationRow`/)
	const text = report(value)
	assert.match(text, /unlisted NotificationRow\. Seen in 2 screens\./)
})

test('applying a proposal drops that issue', () => {
	const parsed = [
		{ path: notificationsPath, text: fixedTable },
		{ path: mentionsPath, text: mentionsTable },
	]
	const before = collectIssues(rules(), parsed.map((item) => parseTable(item.path, item.text).table))
	assert.equal(before.repeats.length, 1)
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
	const loaded = skillCorrectionChecks()
	assert.equal(loaded.ok, true)
	if (!loaded.ok) throw new Error('skill corrections')
	const empty = loaded.checks.find((check) => check.rule === 'C-empty-state')
	if (empty?.kind !== 'forbid-literal') throw new Error('C-empty-state')
	assert.ok(empty.literals.includes('No data'))
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
	assert.deepEqual(correction, {
		type: 'correction',
		at: { path: 'src/notifications/NotificationList.tsx', line: 4 },
		rule: 'C-empty-state',
		ruleLine: 11,
		text: empty.text,
		literal: 'No data',
	})
	assert.match(report(value), /"No data" breaks C-empty-state \(product-rules\.md:11\)/)
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

test('every skill correction bullet is enforced as the check it classifies to', () => {
	const lines = readFileSync(join(import.meta.dirname, '..', 'SKILL.md'), 'utf8').split('\n')
	const loaded = skillCorrectionChecks()
	assert.equal(loaded.ok, true)
	if (!loaded.ok) throw new Error('skill corrections')
	const checks = loaded.checks
	let cursor = lines.findIndex((line) => line.trim() === '## Corrections')
	assert.ok(cursor >= 0)
	cursor += 1
	for (const check of checks) {
		while ((lines[cursor] ?? '').trim() === '') cursor += 1
		assert.equal((lines[cursor] ?? '').trim(), `- ${check.rule}: ${check.text}`)
		cursor += 1
		if (check.kind === 'unchecked') {
			assert.equal(check.reason, 'no quoted phrase')
			const allowed = checks.flatMap((other) =>
				other.kind === 'forbid-literal' && other.rule === check.rule ? other.literals : [],
			)
			const cited = checkScreens(citing(check.rule, screenQuoting(check.text)))
			for (const finding of cited.findings) {
				if (finding.type !== 'correction') continue
				assert.ok(allowed.includes(finding.literal))
			}
			continue
		}
		for (const literal of check.literals) {
			const cited = checkScreens(citing(check.rule, screenQuoting(literal)))
			const hit = cited.findings.find((finding) => finding.type === 'correction' && finding.literal === literal)
			assert.ok(hit != null && hit.type === 'correction')
			if (hit == null || hit.type !== 'correction') throw new Error('correction')
			assert.equal(hit.rule, check.rule)
			assert.equal(hit.text, check.text)
			const commented = checkScreens(citing(check.rule, `// ${literal}\nexport const copy = "zz"\n`))
			assert.equal(
				commented.findings.some((finding) => finding.type === 'correction' && finding.literal === literal),
				false,
			)
		}
	}
	while ((lines[cursor] ?? '').trim() === '') cursor += 1
	assert.equal(/^- [CPT]-[a-z0-9-]+: /.test(lines[cursor] ?? ''), false)
})

function citing(rule: RuleId, screen: string) {
	const parsed = parseRules(ruleText(rule))
	assert.equal(parsed.ok, true)
	if (!parsed.ok) throw new Error('rules')
	const path = tablePath('probe.states.md')
	return {
		rules: parsed.rules,
		rulesPath: RULES_PATH,
		parsed: [{ path, text: tableCiting(rule) }],
		branches: new Map([[path, quietBranch([{ path: 'src/probe/Probe.tsx', text: screen }])]]),
		target: path,
	}
}

function ruleText(id: string): string {
	if (id.startsWith('T-')) return `### ${id} \`token.${id}\`\nValue: #000000\n`
	if (id.startsWith('P-')) return `### ${id}\nCovers: probe\n`
	return `### ${id} \`Probe\`\nCovers: probe\n`
}

function tableCiting(id: string): string {
	return `| surface | kind | source | machine | empty | loading | failed | populated |
|---|---|---|---|---|---|---|---|
| probe | probe | static | none |  |  |  | ${id} |
`
}

function screenQuoting(literal: string): string {
	return `export const copy = "${literal}"\n`
}

test('correctionChecksFromMarkdown classifies quoted and unquoted bullets', () => {
	const markdown = `## Corrections

- C-probe: Never say "Nothing here".
- C-avatar: Use a real avatar image, not a placeholder circle.

`
	const loaded = correctionChecksFromMarkdown(markdown)
	assert.equal(loaded.ok, true)
	if (!loaded.ok) throw new Error('load')
	assert.equal(loaded.checks.length, 2)
	assert.equal(loaded.checks[0]?.kind, 'forbid-literal')
	if (loaded.checks[0]?.kind === 'forbid-literal') assert.deepEqual(loaded.checks[0].literals, ['Nothing here'])
	assert.equal(loaded.checks[1]?.kind, 'unchecked')
	if (loaded.checks[1]?.kind === 'unchecked') assert.equal(loaded.checks[1].reason, 'no quoted phrase')
	const screen = `export const tip = "Use a real avatar image, not a placeholder circle."
`
	const cited = checkScreens(citing('C-avatar' as RuleId, screen))
	assert.equal(cited.findings.some((finding) => finding.type === 'correction'), false)
})

test('correctionChecksFromMarkdown fails closed on a missing section and duplicate bullets', () => {
	const missing = correctionChecksFromMarkdown('# no corrections\n')
	assert.deepEqual(missing, { ok: false, errors: [{ type: 'no-section' }] })
	const duplicate = correctionChecksFromMarkdown(`## Corrections
- C-a: tip "one"
- C-a: tip "one"
`)
	assert.equal(duplicate.ok, false)
	if (duplicate.ok) throw new Error('expected duplicate')
	assert.equal(duplicate.errors[0]?.type, 'duplicate-bullet')
})

test('a new quoted tip in skill markdown becomes a forbid without a catalog edit', () => {
	const markdown = `## Corrections

- C-probe: Do not write "Fresh phrase".

`
	const loaded = correctionChecksFromMarkdown(markdown)
	assert.equal(loaded.ok, true)
	if (!loaded.ok) throw new Error('load')
	const probe = loaded.checks[0]
	assert.equal(probe?.kind, 'forbid-literal')
	if (probe?.kind === 'forbid-literal') assert.deepEqual(probe.literals, ['Fresh phrase'])
})

test('table correction bullets stay soft and do not scan as forbids', () => {
	const tableWithNote = `${fixedTable}
## Corrections

- C-empty-state: Leave the illustration, never "Rendered later".
`
	const screen = `export function NotificationList() {
  return <EmptyState title="Rendered later" />
}
`
	const value = checkScreens({
		rules: rules(),
		rulesPath: RULES_PATH,
		parsed: [{ path: notificationsPath, text: tableWithNote }],
		branches: new Map([[notificationsPath, quietBranch([{ path: 'src/notifications/NotificationList.tsx', text: screen }])]]),
		target: notificationsPath,
	})
	assert.equal(value.findings.some((finding) => finding.type === 'correction' && finding.literal === 'Rendered later'), false)
	assert.ok(value.notes.some((note) => note.type === 'corrected' && note.rule === 'C-empty-state'))
})

test('the readme lists each playbook and dstack points at the siblings', () => {
	const readme = readFileSync(join(root, 'README.md'), 'utf8')
	const skill = readFileSync(join(root, 'skills/dstack/SKILL.md'), 'utf8')
	const playbooks = readme.split('## Playbooks')[1]?.split('\n## ')[0] ?? ''
	const jobs = ['/dstack', '/dstack-init', '/dstack-accept', '/dstack-verify', '/dstack-eval']
	for (const job of jobs) assert.ok(playbooks.includes(`| \`${job}\` |`), job)
	for (const job of jobs.slice(1)) assert.ok(skill.includes(job), job)
	const init = readFileSync(join(root, 'skills/dstack-init/SKILL.md'), 'utf8')
	assert.match(init, /^name: dstack-init$/m)
})

test('the skill example and the readme rules parse', () => {
	const skill = readFileSync(join(root, 'skills/dstack/SKILL.md'), 'utf8')
	assert.ok(skill.includes(RULES_PATH))
	assert.ok(skill.includes(TABLE_SUFFIX))
	const example = parseTable(tablePath('SKILL.md'), skill)
	assert.deepEqual(example.findings, [])
	assert.equal(example.table.surfaces.length, 0)
	assert.doesNotMatch(skill, /notification/i)
	assert.doesNotMatch(skill, /unread/i)
	assert.doesNotMatch(skill, /\| the-screen \|/)
	const readme = readFileSync(join(root, 'README.md'), 'utf8')
	const fenced = /```product-rules\n([\s\S]*?)```/.exec(readme)
	assert.ok(fenced)
	const parsed = parseRules(fenced?.[1] ?? '')
	assert.equal(parsed.ok, true)
	assert.equal(fenced?.[1], shopRules)
})

test('two rules cannot cover one kind', () => {
	const parsed = parseRules(`${shopRules}\n### P-other\nCovers: list\n`)
	assert.equal(parsed.ok, false)
	if (parsed.ok) return
	assert.match(parsed.errors.map((error) => error.problem).join('\n'), /C-async-list/)
	assert.match(parsed.errors.map((error) => error.problem).join('\n'), /P-other/)
})

test('a state-scoped cover is rejected', () => {
	const parsed = parseRules(shopRules.replace('Covers: list\n', 'Covers: list.loading\n'))
	assert.equal(parsed.ok, false)
	if (parsed.ok) return
	assert.match(parsed.errors.map((error) => error.problem).join('\n'), /State-scoped cover list\.loading/)
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

test('accept writes the component only with --write and decline exits 2', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dstack-accept-'))
	mkdirSync(join(dir, 'src/notifications'), { recursive: true })
	mkdirSync(join(dir, 'src/mentions'), { recursive: true })
	const rulesDest = join(dir, 'product-rules.md')
	const notificationsDest = join(dir, 'src/notifications/NotificationList.states.md')
	const mentionsDest = join(dir, 'src/mentions/MentionsList.states.md')
	cpSync(join(import.meta.dirname, 'fixtures/shop/product-rules.md'), rulesDest)
	cpSync(join(import.meta.dirname, 'fixtures/shop-two/src/notifications/NotificationList.states.md'), notificationsDest)
	cpSync(join(import.meta.dirname, 'fixtures/shop-two/src/mentions/MentionsList.states.md'), mentionsDest)
	spawnSync('git', ['init'], { cwd: dir })
	spawnSync('git', ['add', '.'], { cwd: dir })
	const committed = spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=dstack', 'commit', '-m', 'shop'], {
		cwd: dir,
		encoding: 'utf8',
	})
	assert.equal(committed.status, 0)
	const rulesBefore = readFileSync(rulesDest, 'utf8')
	const notificationsBefore = readFileSync(notificationsDest, 'utf8')
	const mentionsBefore = readFileSync(mentionsDest, 'utf8')
	const script = join(root, 'skills/dstack/scripts/dstack.ts')
	const run = (args: string[]) =>
		spawnSync('node', ['--experimental-strip-types', script, ...args], { cwd: dir, encoding: 'utf8' })

	const preview = run(['accept', 'unlisted', 'NotificationRow'])
	assert.equal(preview.status, 0)
	assert.match(preview.stdout, /status  ready/)
	assert.match(preview.stdout, /write  no/)
	assert.match(preview.stdout, /### C-notification-row `NotificationRow`/)
	assert.equal(readFileSync(rulesDest, 'utf8'), rulesBefore)

	const written = run(['accept', '--write', 'unlisted', 'NotificationRow'])
	assert.equal(written.status, 0)
	assert.match(written.stdout, /write  yes/)
	const rulesWritten = readFileSync(rulesDest, 'utf8')
	assert.match(rulesWritten, /### C-notification-row `NotificationRow`/)

	const again = run(['accept', 'unlisted', 'NotificationRow', '--write'])
	assert.equal(again.status, 0)
	assert.match(again.stdout, /status  current/)
	assert.match(again.stdout, /write  no/)
	assert.equal(readFileSync(rulesDest, 'utf8'), rulesWritten)

	const declined = run(['decline', 'unlisted', 'NotificationRow'])
	assert.equal(declined.status, 2)
	assert.equal(readFileSync(rulesDest, 'utf8'), rulesWritten)
	assert.equal(readFileSync(notificationsDest, 'utf8'), notificationsBefore)
	assert.equal(readFileSync(mentionsDest, 'utf8'), mentionsBefore)
})

function twoTables(notifications = fixedTable, mentions = mentionsTable) {
	const notificationsTable = parseTable(notificationsPath, notifications)
	const mentionsParsed = parseTable(mentionsPath, mentions)
	assert.deepEqual(notificationsTable.findings, [])
	assert.deepEqual(mentionsParsed.findings, [])
	return [notificationsTable.table, mentionsParsed.table]
}

function mustDecision(action: string, key: string) {
	const parsed = parseDecision(action, key)
	assert.equal(parsed.ok, true)
	if (!parsed.ok) throw new Error('decision')
	return parsed.decision
}

function callersOf(rulesText: string, tables: ReturnType<typeof twoTables>) {
	const parsed = parseRules(rulesText)
	assert.equal(parsed.ok, true)
	if (!parsed.ok) throw new Error('rules')
	return tables.flatMap((table) =>
		checkTable(parsed.rules, table).filter((finding) => finding.type === 'parallel-name' || finding.type === 'ignored-cover'),
	)
}

function countInRule(text: string, heading: string, line: string): number {
	const lines = text.split('\n')
	const start = lines.indexOf(heading)
	assert.ok(start >= 0)
	let end = lines.findIndex((item, index) => index > start && item.startsWith('### '))
	if (end === -1) end = lines.length
	return lines.slice(start, end).filter((item) => item === line).length
}

test('accept unlisted NotificationRow adds the heading and both parallel-name callers', () => {
	const tables = twoTables()
	const decision = mustDecision('accept', 'unlisted NotificationRow')
	const first = decide({ rules: rules(), rulesText: shopRules, tables, decision })
	assert.equal(first.status, 'ready')
	assert.equal(first.proposal, 'gone')
	assert.equal(first.callers.length, 2)
	assert.ok(first.rulesText.includes('### C-notification-row `NotificationRow`'))
	assert.deepEqual(first.callers, callersOf(first.rulesText, tables))
	assert.deepEqual(
		first.callers.map((caller) => caller.type),
		['parallel-name', 'parallel-name'],
	)
	const printed = formatDecision(decision, first, false)
	assert.equal(printed.split('Write C-notification-row.').length - 1, 2)
	assert.match(printed, /src\/notifications\/NotificationList\.states\.md:5 notifications\.populated\./)
	assert.match(printed, /src\/mentions\/MentionsList\.states\.md:5 mentions\.populated\./)
})

test('decline and a state-scoped key do not parse', () => {
	const unlisted = parseDecision('decline', 'unlisted NotificationRow')
	assert.equal(unlisted.ok, false)
	if (unlisted.ok) return
	assert.match(unlisted.problem, /Decline is not a command/)
	const corrected = parseDecision('decline', 'corrected C-empty-state')
	assert.equal(corrected.ok, false)
	if (corrected.ok) return
	assert.match(corrected.problem, /Decline is not a command/)
	const scoped = parseDecision('accept', 'uncovered list.failed')
	assert.equal(scoped.ok, false)
	if (scoped.ok) return
	assert.match(scoped.problem, /Bad key uncovered list\.failed/)
})

test('accept corrected C-empty-state copies the shared bullet once', () => {
	const bullet = 'Names the thing that will appear here.'
	const withBullet = (text: string) => `${text.trimEnd()}\n\n## Corrections\n- C-empty-state: ${bullet}\n`
	const tables = twoTables(withBullet(fixedTable), withBullet(mentionsTable))
	assert.equal(tables[0]?.corrections[0]?.text, bullet)
	assert.equal(tables[1]?.corrections[0]?.text, bullet)
	const decision = mustDecision('accept', 'corrected C-empty-state')
	const first = decide({ rules: rules(), rulesText: shopRules, tables, decision })
	assert.equal(first.status, 'ready')
	assert.equal(first.proposal, 'still-open')
	assert.equal(countInRule(first.rulesText, '### C-empty-state `EmptyState`', bullet), 1)
	assert.equal(first.rulesText.split(bullet).length - 1, 1)
	const parsedNext = parseRules(first.rulesText)
	assert.equal(parsedNext.ok, true)
	if (!parsedNext.ok) return
	const second = decide({
		rules: parsedNext.rules,
		rulesText: first.rulesText,
		tables,
		decision,
	})
	assert.equal(second.status, 'current')
	assert.equal(second.proposal, 'still-open')
	assert.equal(second.rulesText, first.rulesText)
	assert.equal(countInRule(second.rulesText, '### C-empty-state `EmptyState`', bullet), 1)
})

test('accept corrected is blocked when only some bullet lines are already in the rule', () => {
	const present = 'One illustration, one sentence, at most one action.'
	const missing = 'Names the thing that will appear here.'
	const withBullet = (text: string, bullet: string) => `${text.trimEnd()}\n\n## Corrections\n- C-empty-state: ${bullet}\n`
	const tables = twoTables(withBullet(fixedTable, present), withBullet(mentionsTable, missing))
	const result = decide({
		rules: rules(),
		rulesText: shopRules,
		tables,
		decision: mustDecision('accept', 'corrected C-empty-state'),
	})
	assert.equal(result.status, 'blocked')
	assert.equal(typeof result.problem, 'string')
	assert.equal('rulesText' in result, false)
})

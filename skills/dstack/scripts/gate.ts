import { createHash } from 'node:crypto'
import {
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadCatalog, type TableFile } from './checkout.ts'
import {
	collectIssues,
	issueKey,
	parseDecision,
	parseTable,
	propose,
	renderDiff,
	type Rules,
} from './model.ts'

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

type ProposalKey = Brand<string, 'ProposalKey'>
type ProposalHash = Brand<string, 'ProposalHash'>
type ReviewerName = Brand<string, 'ReviewerName'>
type Because = Brand<string, 'Because'>
type SkipReason = Brand<string, 'SkipReason'>

const MARKS = ['fit', 'collision', 'size'] as const
type MarkId = (typeof MARKS)[number]
type Mark = 'pass' | 'fail'
type Marks = { readonly [K in MarkId]: Mark }

type GateRecord =
	| {
			readonly kind: 'verdict'
			readonly hash: ProposalHash
			readonly reviewers: readonly [ReviewerName, ...ReviewerName[]]
			readonly marks: Marks
			readonly because: Because
	  }
	| {
			readonly kind: 'skip'
			readonly hash: ProposalHash
			readonly reason: SkipReason
	  }

type GateView =
	| { readonly type: 'missing'; readonly prior: 'absent' | 'stale' }
	| { readonly type: 'unreadable' }
	| { readonly type: 'verdict'; readonly record: GateRecord & { readonly kind: 'verdict' } }
	| { readonly type: 'skip'; readonly record: GateRecord & { readonly kind: 'skip' } }

type Argv =
	| { readonly type: 'show'; readonly key: string }
	| { readonly type: 'panel'; readonly key: string; readonly panelPath: string; readonly hash: string }
	| { readonly type: 'skip'; readonly key: string; readonly reason: string }

type PanelScore = {
	readonly reviewers: readonly [ReviewerName, ...ReviewerName[]]
	readonly marks: Marks
	readonly because: Because
}

type LiveProposal = {
	readonly key: ProposalKey
	readonly rulesText: string
	readonly tables: readonly [TableFile, TableFile, ...TableFile[]]
	readonly diff: string
	readonly hash: ProposalHash
}

type Request =
	| { readonly type: 'show'; readonly key: ProposalKey }
	| { readonly type: 'panel'; readonly key: ProposalKey; readonly score: PanelScore; readonly hash: ProposalHash }
	| { readonly type: 'skip'; readonly key: ProposalKey; readonly reason: SkipReason }

type Transition =
	| { readonly type: 'print'; readonly exit: 0 | 3; readonly text: string }
	| { readonly type: 'save'; readonly exit: 0; readonly text: string; readonly record: GateRecord; readonly prior: 'absent' | 'stale' }
	| { readonly type: 'refuse'; readonly exit: 2; readonly text: string; readonly stderr: string }

const MARK_HELP: Record<MarkId, string> = {
	fit: 'fails when an Act on finding says the edit does not match the gap in these tables.',
	collision: 'fails when an Act on finding says the edit covers a state another rule owns, or forks a state machine.',
	size: 'fails when an Act on finding says a smaller edit exists.',
}

function git(repo: string, args: readonly string[]): string | null {
	const result = spawnSync('git', [...args], { cwd: repo, encoding: 'utf8' })
	if (result.status !== 0) return null
	return result.stdout
}

function gatesDir(root: string): string | null {
	const gitDir = git(root, ['rev-parse', '--git-dir'])
	if (gitDir == null) return null
	const trimmed = gitDir.trim()
	const abs = trimmed.startsWith('/') ? trimmed : join(root, trimmed)
	return join(abs, 'dstack-gates')
}

function recordPath(dir: string, key: ProposalKey): string {
	return join(dir, `${encodeURIComponent(key)}.json`)
}

function proposalKey(text: string): ProposalKey | null {
	if (text.includes('/') || text.includes('\\')) return null
	const parsed = parseDecision('accept', text)
	if (!parsed.ok) return null
	return text as ProposalKey
}

function because(value: string): Because {
	return value as Because
}

function skipReasonBrand(value: string): SkipReason {
	return value as SkipReason
}

function proposalHash(hex: string): ProposalHash {
	return hex as ProposalHash
}

function stance(marks: Marks): 'clear' | 'block' {
	for (const id of MARKS) {
		if (marks[id] === 'fail') return 'block'
	}
	return 'clear'
}

function hashOf(rulesText: string, tables: readonly TableFile[], diff: string): ProposalHash {
	const sep = Buffer.from([0])
	const parts: Buffer[] = [Buffer.from(rulesText, 'utf8')]
	for (const file of tables) {
		parts.push(sep, Buffer.from(file.path, 'utf8'), sep, Buffer.from(file.text, 'utf8'))
	}
	parts.push(sep, Buffer.from(diff, 'utf8'))
	const digest = createHash('sha256').update(Buffer.concat(parts)).digest('hex')
	return proposalHash(digest)
}

function liveOf(
	catalog: { readonly ok: true; readonly rulesText: string; readonly rules: Rules; readonly files: readonly TableFile[] },
	key: ProposalKey,
): LiveProposal | null {
	const parsedTables = catalog.files.map((file) => parseTable(file.path, file.text).table)
	const { repeats } = collectIssues(catalog.rules, parsedTables)
	const repeat = repeats.find((item) => issueKey(item) === key)
	if (repeat == null) return null
	const paths = [...new Set(repeat.hits.map((hit) => hit.table))].sort()
	if (paths.length < 2) return null
	const hitFiles: TableFile[] = []
	for (const path of paths) {
		const file = catalog.files.find((item) => item.path === path)
		if (file == null) return null
		hitFiles.push(file)
	}
	if (hitFiles.length < 2) return null
	const tables = hitFiles as [TableFile, TableFile, ...TableFile[]]
	const diff = renderDiff(catalog.rules, propose(catalog.rules, repeat))
	return {
		key,
		rulesText: catalog.rulesText,
		tables,
		diff,
		hash: hashOf(catalog.rulesText, tables, diff),
	}
}

function parseMarks(marksRaw: unknown): Marks | null {
	if (marksRaw == null || typeof marksRaw !== 'object') return null
	const raw = marksRaw as Record<string, unknown>
	if (Object.keys(raw).length !== MARKS.length) return null
	const fit = raw.fit
	const collision = raw.collision
	const size = raw.size
	if (fit !== 'pass' && fit !== 'fail') return null
	if (collision !== 'pass' && collision !== 'fail') return null
	if (size !== 'pass' && size !== 'fail') return null
	return { fit: fit as Mark, collision: collision as Mark, size: size as Mark }
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const found = Object.keys(value)
	return found.length === keys.length && keys.every((key) => found.includes(key))
}

function parseRecord(bytes: string): GateRecord | null {
	let value: unknown
	try {
		value = JSON.parse(bytes)
	} catch {
		return null
	}
	if (value == null || typeof value !== 'object') return null
	const record = value as Record<string, unknown>
	const hash = record.hash
	if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return null
	const brandedHash = proposalHash(hash)
	if (record.kind === 'skip') {
		if (!sameKeys(record, ['kind', 'hash', 'reason'])) return null
		if (typeof record.reason !== 'string' || record.reason.trim().length === 0) return null
		return { kind: 'skip', hash: brandedHash, reason: skipReasonBrand(record.reason) }
	}
	if (record.kind !== 'verdict') return null
	if (!sameKeys(record, ['kind', 'hash', 'reviewers', 'marks', 'because'])) return null
	if (!Array.isArray(record.reviewers) || record.reviewers.length === 0) return null
	if (record.reviewers.some((name) => typeof name !== 'string' || name.length === 0)) return null
	const reviewers = record.reviewers as [ReviewerName, ...ReviewerName[]]
	const marks = parseMarks(record.marks)
	if (marks == null) return null
	if (typeof record.because !== 'string' || record.because.trim().length === 0 || record.because.includes('\n')) return null
	return {
		kind: 'verdict',
		hash: brandedHash,
		reviewers,
		marks,
		because: because(record.because),
	}
}

function viewOf(bytes: string | null, live: ProposalHash): GateView {
	if (bytes == null) return { type: 'missing', prior: 'absent' }
	const parsed = parseRecord(bytes)
	if (parsed == null) return { type: 'unreadable' }
	if (parsed.hash !== live) return { type: 'missing', prior: 'stale' }
	if (parsed.kind === 'skip') return { type: 'skip', record: parsed }
	return { type: 'verdict', record: parsed }
}

function parsePanel(bytes: string): PanelScore | null {
	let value: unknown
	try {
		value = JSON.parse(bytes)
	} catch {
		return null
	}
	if (value == null || typeof value !== 'object') return null
	const panel = value as Record<string, unknown>
	if (!sameKeys(panel, ['reviewers', 'marks', 'because'])) return null
	if (!Array.isArray(panel.reviewers) || panel.reviewers.length === 0) return null
	if (panel.reviewers.some((name) => typeof name !== 'string' || name.length === 0)) return null
	const reviewers = panel.reviewers as [ReviewerName, ...ReviewerName[]]
	const marks = parseMarks(panel.marks)
	if (marks == null) return null
	if (typeof panel.because !== 'string' || panel.because.trim().length === 0 || panel.because.includes('\n')) return null
	return { reviewers, marks, because: because(panel.because) }
}

function skipReason(text: string): SkipReason | null {
	if (text.trim().length === 0) return null
	return skipReasonBrand(text)
}

function shortHash(hash: ProposalHash): string {
	return hash.slice(0, 12)
}

function humanText(key: ProposalKey, view: Exclude<GateView, { type: 'missing' }>): string {
	if (view.type === 'unreadable') return 'panel  unreadable\n'
	const hash = view.record.hash
	const lines: string[] = [`gate  ${key}`, `hash  ${shortHash(hash)}`]
	if (view.type === 'skip') {
		lines.push('panel  skipped', `reason  ${view.record.reason}`, 'rules  unchanged', 'next  accept or decline with /dstack-accept')
		return `${lines.join('\n')}\n`
	}
	lines.push('panel  interrogate', `reviewers  ${view.record.reviewers.join(', ')}`)
	for (const id of MARKS) lines.push(`${id}  ${view.record.marks[id]}`)
	lines.push(`stance  ${stance(view.record.marks)}`, `because  ${view.record.because}`, 'rules  unchanged', 'next  accept or decline with /dstack-accept')
	return `${lines.join('\n')}\n`
}

function scoreSchemaExample(): string {
	const marks: Record<string, string> = {}
	for (const id of MARKS) marks[id] = id === 'collision' ? 'fail' : 'pass'
	return JSON.stringify({ reviewers: ['grok-4.7-high'], marks, because: 'One line.' })
}

function packetText(live: LiveProposal): string {
	const lines: string[] = [
		`gate  ${live.key}`,
		`hash  ${live.hash}`,
		'panel  missing',
		'spawn  interrogate',
		'reviewers  one per entry on the interrogate reviewers line in .cursor/rules/pstack-models.mdc',
		'intent  Should this product-rules.md edit land? Two screens share this gap. Score the edit. Do not edit the file.',
		'',
		'## Marks',
	]
	for (const id of MARKS) lines.push(`${id}  ${MARK_HELP[id]}`)
	lines.push('Consider, Noted, and Dismissed do not fail a mark.')
	lines.push('', '## Score file', scoreSchemaExample(), '', '## Current rules', live.rulesText.trimEnd(), '', '## Tables')
	for (const file of live.tables) {
		lines.push(`### ${file.path}`, file.text.trimEnd())
	}
	lines.push('', '## Proposal diff', live.diff)
	return `${lines.join('\n')}\n`
}

function encode(record: GateRecord): string {
	if (record.kind === 'skip') {
		return `${JSON.stringify({ kind: record.kind, hash: record.hash, reason: record.reason })}\n`
	}
	const marks: Record<string, Mark> = {}
	for (const id of MARKS) marks[id] = record.marks[id]
	return `${JSON.stringify({
		kind: record.kind,
		hash: record.hash,
		reviewers: record.reviewers,
		marks,
		because: record.because,
	})}\n`
}

function recordsEqual(a: GateRecord, b: GateRecord): boolean {
	return encode(a) === encode(b)
}

function verdictsEqual(a: GateRecord & { readonly kind: 'verdict' }, score: PanelScore): boolean {
	if (a.reviewers.length !== score.reviewers.length) return false
	for (let i = 0; i < a.reviewers.length; i++) {
		if (a.reviewers[i] !== score.reviewers[i]) return false
	}
	for (const id of MARKS) {
		if (a.marks[id] !== score.marks[id]) return false
	}
	return a.because === score.because
}

function transition(view: GateView, request: Request, live: LiveProposal): Transition {
	if (view.type === 'unreadable' && request.type !== 'show') {
		return { type: 'refuse', exit: 2, text: 'panel  unreadable\n', stderr: 'gate record is unreadable\n' }
	}
	if (request.type === 'show') {
		if (view.type === 'missing') return { type: 'print', exit: 3, text: packetText(live) }
		if (view.type === 'unreadable') {
			return { type: 'refuse', exit: 2, text: 'panel  unreadable\n', stderr: 'gate record is unreadable\n' }
		}
		return { type: 'print', exit: 0, text: humanText(request.key, view) }
	}
	if (request.type === 'panel') {
		const verdict: GateRecord = {
			kind: 'verdict',
			hash: live.hash,
			reviewers: request.score.reviewers,
			marks: request.score.marks,
			because: request.score.because,
		}
		if (view.type === 'verdict' && verdictsEqual(view.record, request.score)) {
			return { type: 'print', exit: 0, text: humanText(request.key, view) }
		}
		if (view.type === 'skip' || view.type === 'verdict') {
			return {
				type: 'refuse',
				exit: 2,
				text: humanText(request.key, view),
				stderr: 'gate already bound\n',
			}
		}
		const prior = view.type === 'missing' ? view.prior : 'absent'
		return {
			type: 'save',
			exit: 0,
			text: humanText(request.key, { type: 'verdict', record: verdict }),
			record: verdict,
			prior,
		}
	}
	const skip: GateRecord = { kind: 'skip', hash: live.hash, reason: request.reason }
	if (view.type === 'skip' && view.record.reason === request.reason) {
		return { type: 'print', exit: 0, text: humanText(request.key, view) }
	}
	if (view.type === 'skip' || view.type === 'verdict') {
		return {
			type: 'refuse',
			exit: 2,
			text: humanText(request.key, view),
			stderr: 'gate already bound\n',
		}
	}
	const prior = view.type === 'missing' ? view.prior : 'absent'
	return {
		type: 'save',
		exit: 0,
		text: humanText(request.key, { type: 'skip', record: skip }),
		record: skip,
		prior,
	}
}

function reconcile(
	winner: GateView,
	intended: GateRecord,
	key: ProposalKey,
): Extract<Transition, { readonly type: 'print' } | { readonly type: 'refuse' }> {
	if (winner.type === 'missing' || winner.type === 'unreadable') {
		return { type: 'refuse', exit: 2, text: '', stderr: 'gate record changed during write\n' }
	}
	if (!recordsEqual(winner.record, intended)) {
		return {
			type: 'refuse',
			exit: 2,
			text: humanText(key, winner),
			stderr: 'gate already bound\n',
		}
	}
	return { type: 'print', exit: 0, text: humanText(key, winner) }
}

function commit(path: string, record: GateRecord, prior: 'absent' | 'stale'): 'saved' | 'lost' {
	mkdirSync(join(path, '..'), { recursive: true })
	const tmp = `${path}.tmp`
	writeFileSync(tmp, encode(record), 'utf8')
	try {
		if (prior === 'absent') {
			linkSync(tmp, path)
			unlinkSync(tmp)
			return 'saved'
		}
		const old = `${path}.old`
		if (existsSync(path)) renameSync(path, old)
		linkSync(tmp, path)
		unlinkSync(tmp)
		if (existsSync(old)) unlinkSync(old)
		return 'saved'
	} catch {
		try {
			unlinkSync(tmp)
		} catch {
			return 'lost'
		}
		return 'lost'
	}
}

function readRecord(path: string): string | null {
	if (!existsSync(path)) return null
	return readFileSync(path, 'utf8')
}

function parseArgv(argv: readonly string[]): Argv | { readonly stderr: string } {
	if (argv.length < 2) return { stderr: 'usage: dstack gate <key>\n' }
	const key = `${argv[0]} ${argv[1]}`
	const rest = argv.slice(2)
	if (rest.length === 0) return { type: 'show', key }
	const flags = new Map<string, string>()
	const position: string[] = []
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i] ?? ''
		if (arg === '--panel') {
			const file = rest[i + 1]
			if (file == null || file.startsWith('-')) return { stderr: 'panel needs a hash\n' }
			flags.set('panel', file)
			i += 1
			continue
		}
		if (arg === '--hash') {
			const hash = rest[i + 1]
			if (hash == null || hash.startsWith('-')) return { stderr: 'panel needs a hash\n' }
			flags.set('hash', hash)
			i += 1
			continue
		}
		if (arg === '--skip') {
			position.push(...rest.slice(i + 1))
			break
		}
		if (arg.startsWith('-')) return { stderr: 'usage: dstack gate <key>\n' }
		position.push(arg)
	}
	if (flags.has('panel') || flags.has('hash')) {
		const panelPath = flags.get('panel')
		const hash = flags.get('hash')
		if (panelPath == null || hash == null) return { stderr: 'panel needs a hash\n' }
		if (position.length > 0) return { stderr: 'usage: dstack gate <key>\n' }
		return { type: 'panel', key, panelPath, hash }
	}
	if (position.length > 0) return { type: 'skip', key, reason: position.join(' ') }
	return { stderr: 'usage: dstack gate <key>\n' }
}

export function gateCommand(root: string, argv: readonly string[]): 0 | 2 | 3 {
	const parsedArgv = parseArgv(argv)
	if ('stderr' in parsedArgv) {
		process.stderr.write(parsedArgv.stderr)
		return 2
	}
	const key = proposalKey(parsedArgv.key)
	if (key == null) {
		process.stderr.write('not a proposal\n')
		return 2
	}
	const catalog = loadCatalog(root)
	if (!catalog.ok) {
		process.stderr.write(catalog.stderr)
		return 2
	}
	const live = liveOf(catalog, key)
	if (live == null) {
		process.stderr.write('not a proposal\n')
		return 2
	}
	const dir = gatesDir(root)
	if (dir == null) {
		process.stderr.write('dstack gate needs a git checkout.\n')
		return 2
	}
	const path = recordPath(dir, key)
	let request: Request
	if (parsedArgv.type === 'show') {
		request = { type: 'show', key }
	} else if (parsedArgv.type === 'skip') {
		const reason = skipReason(parsedArgv.reason)
		if (reason == null) {
			process.stderr.write('skip needs a reason\n')
			return 2
		}
		request = { type: 'skip', key, reason }
	} else {
		if (!/^[a-f0-9]{64}$/.test(parsedArgv.hash)) {
			process.stderr.write('panel needs a hash\n')
			return 2
		}
		const flagged = proposalHash(parsedArgv.hash)
		if (flagged !== live.hash) {
			process.stderr.write('proposal changed\n')
			process.stdout.write(packetText(live))
			return 2
		}
		if (!existsSync(parsedArgv.panelPath)) {
			process.stderr.write('panel file does not match the score schema\n')
			return 2
		}
		const score = parsePanel(readFileSync(parsedArgv.panelPath, 'utf8'))
		if (score == null) {
			process.stderr.write('panel file does not match the score schema\n')
			return 2
		}
		request = { type: 'panel', key, score, hash: flagged }
	}
	const view = viewOf(readRecord(path), live.hash)
	const outcome = transition(view, request, live)
	if (outcome.type === 'print') {
		process.stdout.write(outcome.text)
		return outcome.exit
	}
	if (outcome.type === 'refuse') {
		process.stdout.write(outcome.text)
		process.stderr.write(outcome.stderr)
		return outcome.exit
	}
	const result = commit(path, outcome.record, outcome.prior)
	if (result === 'saved') {
		process.stdout.write(outcome.text)
		return outcome.exit
	}
	const winner = viewOf(readRecord(path), live.hash)
	const after = reconcile(winner, outcome.record, key)
	if (after.type === 'print') {
		process.stdout.write(after.text)
		return after.exit
	}
	if (after.type === 'refuse') {
		process.stdout.write(after.text)
		process.stderr.write(after.stderr)
		return after.exit
	}
	return 2
}

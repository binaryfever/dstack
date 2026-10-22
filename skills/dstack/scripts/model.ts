import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const RULES_PATH = 'product-rules.md'
export const TABLE_SUFFIX = '.states.md'

export const UI_STATES = ['empty', 'loading', 'failed', 'populated'] as const
export type UiState = (typeof UI_STATES)[number]

export const REQUIRED_STATES = {
	remote: ['empty', 'loading', 'failed', 'populated'],
	local: ['empty', 'populated'],
	static: ['populated'],
} as const satisfies Record<string, readonly UiState[]>
export type Source = keyof typeof REQUIRED_STATES
export type RequiredState<S extends Source> = (typeof REQUIRED_STATES)[S][number]

export type StatusState = Exclude<UiState, 'populated'>

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }
export type RuleId = Brand<string, 'RuleId'>
export type SurfaceKind = Brand<string, 'SurfaceKind'>
export type CodeName = Brand<string, 'CodeName'>
export type TablePath = Brand<string, 'TablePath'>
export type CoordKey = Brand<string, 'CoordKey'>
export type NonEmpty<T> = readonly [T, ...T[]]

export const RULE_PREFIX = { component: 'C', pattern: 'P', token: 'T' } as const
export type RuleType = keyof typeof RULE_PREFIX

export type Coord = { kind: SurfaceKind; state: UiState | null }
export type StatusCoord = { kind: SurfaceKind; state: StatusState }

export type RuleLines = { heading: number; last: number; covers: number | null }

export type Rule =
	| { type: 'component'; id: RuleId; codeName: CodeName; covers: readonly Coord[]; lines: RuleLines }
	| { type: 'pattern'; id: RuleId; covers: readonly Coord[]; lines: RuleLines }
	| { type: 'token'; id: RuleId; codeName: CodeName; value: string; lines: RuleLines }

export type Rules = {
	lines: readonly string[]
	byId: ReadonlyMap<RuleId, Rule>
	coveredBy: ReadonlyMap<CoordKey, RuleId>
	kinds: ReadonlySet<SurfaceKind>
	byCodeName: ReadonlyMap<CodeName, RuleId>
}

export type Ref =
	| { type: 'rule'; id: RuleId }
	| { type: 'unlisted'; name: CodeName }
	| { type: 'none' }

export type Cell = NonEmpty<Ref>

type SurfaceRow = {
	table: TablePath
	line: number
	name: string
	kind: SurfaceKind
	kindUnlisted: boolean
	machine: RuleId | null
}

export type Surface = SurfaceRow &
	{ [S in Source]: { source: S; cells: Readonly<Record<RequiredState<S>, Cell>> } }[Source]

export type Correction = { table: TablePath; line: number; rule: RuleId; text: string }

export type StateTable = { path: TablePath; surfaces: readonly Surface[]; corrections: readonly Correction[] }

export type Loc = { path: string; line: number | null }

export type Finding =
	| { type: 'syntax'; at: Loc; problem: string }
	| { type: 'missing-state'; at: Loc; surface: string; state: UiState; source: Source }
	| { type: 'extra-state'; at: Loc; surface: string; state: UiState; source: Source }
	| { type: 'unknown-rule'; at: Loc; surface: string | null; id: string }
	| { type: 'unknown-kind'; at: Loc; surface: string; kind: SurfaceKind; known: readonly SurfaceKind[] }
	| { type: 'kind-now-listed'; at: Loc; surface: string; kind: SurfaceKind }
	| { type: 'ignored-cover'; at: Loc; surface: string; coord: Coord; rule: RuleId; ruleLine: number }
	| { type: 'parallel-name'; at: Loc; surface: string; state: UiState; name: CodeName; rule: RuleId; ruleLine: number }
	| { type: 'unused-ref'; at: Loc; surface: string; column: UiState | 'machine'; rule: RuleId; codeName: CodeName; dir: string; ruleLine: number }
	| { type: 'raw-token'; at: Loc; value: string; rule: RuleId; codeName: CodeName; ruleLine: number }
	| { type: 'correction'; at: Loc; rule: RuleId; ruleLine: number; text: string; literal: string }
	| { type: 'rules-edited'; at: Loc }

export type Hit<T> = T & { table: TablePath }

export type Issue =
	| { type: 'uncovered'; coord: StatusCoord; hits: NonEmpty<Hit<{ surface: string; cell: Cell }>> }
	| { type: 'unlisted'; name: CodeName; hits: NonEmpty<Hit<{ surface: string }>> }
	| { type: 'corrected'; rule: RuleId; hits: NonEmpty<Hit<{ text: string }>> }

export type Repeat = Brand<Issue, 'Repeat'>

export type RuleEdit = { at: number; remove: readonly string[]; add: readonly string[] }

export type SourceFile = { path: string; text: string }

export type BranchView = {
	screenFiles: readonly SourceFile[]
	changedFiles: readonly SourceFile[]
	rulesChanged: boolean
	tableChanged: boolean
}

export type Report = {
	rules: { path: string; count: number }
	tables: readonly { path: TablePath; surfaces: number }[]
	findings: readonly Finding[]
	notes: readonly Issue[]
	proposals: readonly { repeat: Repeat; diff: string }[]
}

const RULE_ID = /^[CPT]-[a-z0-9-]+$/
const HEADING = /^### ([CPT]-[a-z0-9-]+)(?: `([^`]+)`)?$/
const UNLISTED = /^unlisted\(([A-Za-z][A-Za-z0-9]*)\)$/

export function splitLines(text: string): string[] {
	const lines = text.split('\n')
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
	return lines
}

function ruleId(value: string): RuleId {
	return value as RuleId
}

export type ForbidLiteral = {
	kind: 'forbid-literal'
	rule: RuleId
	text: string
	literals: NonEmpty<string>
}

export type UncheckedCorrection = {
	kind: 'unchecked'
	rule: RuleId
	text: string
	reason: 'no quoted phrase'
}

export type CorrectionCheck = ForbidLiteral | UncheckedCorrection

export type CorrectionLoadError =
	| { type: 'no-section' }
	| { type: 'duplicate-bullet'; rule: string; text: string }
	| { type: 'missing-file' }

export type CorrectionLoad =
	| { ok: true; checks: readonly CorrectionCheck[] }
	| { ok: false; errors: readonly CorrectionLoadError[] }

const CORRECTION_BULLET = /^- ([CPT]-[a-z0-9-]+): (.+)$/
const UNCHECKED_REASON = 'no quoted phrase' as const

function quotedLiterals(text: string): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const match of text.matchAll(/"([^"]+)"/g)) {
		const phrase = match[1] ?? ''
		if (seen.has(phrase)) continue
		seen.add(phrase)
		out.push(phrase)
	}
	return out
}

function classifyBullet(rule: RuleId, text: string): CorrectionCheck {
	const phrases = quotedLiterals(text)
	if (phrases.length === 0) return { kind: 'unchecked', rule, text, reason: UNCHECKED_REASON }
	const [first, ...rest] = phrases
	return { kind: 'forbid-literal', rule, text, literals: [first, ...rest] }
}

export function correctionChecksFromMarkdown(markdown: string): CorrectionLoad {
	const parsed = parseSkillCorrectionBullets(markdown)
	if ('noSection' in parsed) return { ok: false, errors: [{ type: 'no-section' }] }
	const errors: CorrectionLoadError[] = []
	const seen = new Set<string>()
	for (const bullet of parsed.bullets) {
		const key = `${bullet.rule}\0${bullet.text}`
		if (seen.has(key)) errors.push({ type: 'duplicate-bullet', rule: bullet.rule, text: bullet.text })
		seen.add(key)
	}
	if (errors.length > 0) return { ok: false, errors }
	const checks = parsed.bullets.map((bullet) => classifyBullet(ruleId(bullet.rule), bullet.text))
	return { ok: true, checks }
}

const SKILL_CORRECTIONS_PATH = join(import.meta.dirname, '..', 'SKILL.md')

export function skillCorrectionChecks(): CorrectionLoad {
	try {
		const markdown = readFileSync(SKILL_CORRECTIONS_PATH, 'utf8')
		return correctionChecksFromMarkdown(markdown)
	} catch (error) {
		if (error != null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return { ok: false, errors: [{ type: 'missing-file' }] }
		}
		throw error
	}
}

const SCREEN_SOURCE_EXT: ReadonlySet<string> = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])

function isScreenSource(path: string): boolean {
	const base = path.split('/').pop() ?? path
	if (base.endsWith('.d.ts')) return false
	if (/\.(test|spec)\./.test(base)) return false
	for (const ext of SCREEN_SOURCE_EXT) {
		if (base.endsWith(ext)) return true
	}
	return false
}

function parseSkillCorrectionBullets(skillMarkdown: string): { bullets: { rule: string; text: string }[] } | { noSection: true } {
	const lines = splitLines(skillMarkdown)
	let start = -1
	for (let i = 0; i < lines.length; i++) {
		if ((lines[i] ?? '').trim() === '## Corrections') {
			start = i + 1
			break
		}
	}
	if (start === -1) return { noSection: true }
	const bullets: { rule: string; text: string }[] = []
	for (let i = start; i < lines.length; i++) {
		const line = lines[i] ?? ''
		if (line.trim() === '') continue
		const match = CORRECTION_BULLET.exec(line.trim())
		if (match == null) break
		bullets.push({ rule: match[1] ?? '', text: (match[2] ?? '').trim() })
	}
	return { bullets }
}

function surfaceKind(value: string): SurfaceKind {
	return value as SurfaceKind
}

function codeName(value: string): CodeName {
	return value as CodeName
}

export function tablePath(value: string): TablePath {
	return value as TablePath
}

function coordKeyOf(kind: string, state: UiState | null): CoordKey {
	return (state == null ? kind : `${kind}.${state}`) as CoordKey
}

export function coordKey(coord: Coord): CoordKey {
	return coordKeyOf(coord.kind, coord.state)
}

export function parseCoord(text: string): Coord | null {
	const dot = text.indexOf('.')
	if (dot === -1) {
		if (text.length === 0 || text.includes(' ')) return null
		return { kind: surfaceKind(text), state: null }
	}
	const kind = text.slice(0, dot)
	const state = text.slice(dot + 1)
	if (kind.length === 0 || !UI_STATES.includes(state as UiState)) return null
	return { kind: surfaceKind(kind), state: state as UiState }
}

function prefixOf(id: string): RuleType | null {
	if (id.startsWith('C-')) return 'component'
	if (id.startsWith('P-')) return 'pattern'
	if (id.startsWith('T-')) return 'token'
	return null
}

export function parseRules(
	text: string,
): { ok: true; rules: Rules } | { ok: false; errors: readonly { line: number; problem: string }[] } {
	const lines = splitLines(text)
	const errors: { line: number; problem: string }[] = []
	const byId = new Map<RuleId, Rule>()
	const coveredBy = new Map<CoordKey, RuleId>()
	const kinds = new Set<SurfaceKind>()
	const byCodeName = new Map<CodeName, RuleId>()
	type Draft = {
		type: RuleType
		id: RuleId
		codeName: CodeName | null
		covers: Coord[]
		heading: number
		last: number
		coversLine: number | null
		value: string | null
	}
	const drafts: Draft[] = []
	let current: Draft | null = null

	function close(nextHeading: number | null): void {
		if (current == null) return
		let last = nextHeading == null ? lines.length : nextHeading - 1
		while (last > current.heading && lines[last - 1]?.trim() === '') last -= 1
		current.last = last
		drafts.push(current)
		current = null
	}

	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1
		const line = lines[i] ?? ''
		const heading = HEADING.exec(line)
		if (heading) {
			close(lineNo)
			const idText = heading[1] ?? ''
			const code = heading[2] ?? null
			const type = prefixOf(idText)
			if (type == null || !RULE_ID.test(idText)) {
				errors.push({ line: lineNo, problem: `Bad rule id ${idText}.` })
				continue
			}
			if (byId.has(ruleId(idText)) || drafts.some((draft) => draft.id === idText)) {
				errors.push({ line: lineNo, problem: `Duplicate rule ${idText}.` })
				continue
			}
			if ((type === 'component' || type === 'token') && code == null) {
				errors.push({ line: lineNo, problem: `${idText} needs a code name in backticks.` })
				continue
			}
			current = {
				type,
				id: ruleId(idText),
				codeName: code == null ? null : codeName(code),
				covers: [],
				heading: lineNo,
				last: lineNo,
				coversLine: null,
				value: null,
			}
			continue
		}
		if (current == null) continue
		if (line.startsWith('Covers:')) {
			if (current.type === 'token') {
				errors.push({ line: lineNo, problem: `${current.id} is a token and cannot cover a state.` })
				continue
			}
			if (current.coversLine != null) {
				errors.push({ line: lineNo, problem: `${current.id} has two Covers lines.` })
				continue
			}
			current.coversLine = lineNo
			const body = line.slice('Covers:'.length).trim()
			for (const part of body.split(',').map((item) => item.trim()).filter((item) => item.length > 0)) {
				const coord = parseCoord(part)
				if (coord == null) {
					errors.push({ line: lineNo, problem: `Bad coordinate ${part}.` })
					continue
				}
				current.covers.push(coord)
			}
			continue
		}
		if (line.startsWith('Value:')) {
			if (current.type !== 'token') {
				errors.push({ line: lineNo, problem: `${current.id} is not a token and cannot have Value.` })
				continue
			}
			current.value = line.slice('Value:'.length).trim()
		}
	}
	close(null)

	if (errors.length > 0) return { ok: false, errors }

	const rulesList: Rule[] = []
	for (const draft of drafts) {
		if (draft.type === 'token') {
			if (draft.value == null || draft.value.length === 0 || draft.codeName == null) {
				errors.push({ line: draft.heading, problem: `${draft.id} needs Value and a code name.` })
				continue
			}
			const rule: Rule = {
				type: 'token',
				id: draft.id,
				codeName: draft.codeName,
				value: draft.value,
				lines: { heading: draft.heading, last: draft.last, covers: null },
			}
			rulesList.push(rule)
			byId.set(rule.id, rule)
			byCodeName.set(rule.codeName, rule.id)
			continue
		}
		if (draft.type === 'component' && draft.codeName == null) continue
		for (const coord of draft.covers) {
			const key = coordKey(coord)
			const prior = coveredBy.get(key)
			if (prior != null) {
				const priorRule = byId.get(prior)
				errors.push({
					line: draft.coversLine ?? draft.heading,
					problem: `${prior} (${priorRule?.lines.heading ?? '?'}) and ${draft.id} (${draft.heading}) both cover ${key}.`,
				})
				continue
			}
			coveredBy.set(key, draft.id)
			kinds.add(coord.kind)
		}
		const lines: RuleLines = { heading: draft.heading, last: draft.last, covers: draft.coversLine }
		const rule: Rule =
			draft.type === 'component'
				? {
						type: 'component',
						id: draft.id,
						codeName: draft.codeName as CodeName,
						covers: draft.covers,
						lines,
					}
				: { type: 'pattern', id: draft.id, covers: draft.covers, lines }
		rulesList.push(rule)
		byId.set(rule.id, rule)
		if (rule.type === 'component') byCodeName.set(rule.codeName, rule.id)
	}
	if (errors.length > 0) return { ok: false, errors }
	return { ok: true, rules: { lines, byId, coveredBy, kinds, byCodeName } }
}

function parseRef(text: string): Ref | { error: string } {
	if (text === 'none') return { type: 'none' }
	const unlisted = UNLISTED.exec(text)
	if (unlisted) return { type: 'unlisted', name: codeName(unlisted[1] ?? '') }
	if (RULE_ID.test(text)) return { type: 'rule', id: ruleId(text) }
	return { error: text }
}

function renderRef(ref: Ref): string {
	if (ref.type === 'none') return 'none'
	if (ref.type === 'unlisted') return `unlisted(${ref.name})`
	return ref.id
}

function renderCell(cell: Cell): string {
	return cell.map(renderRef).join(' + ')
}

const HEADER = ['surface', 'kind', 'source', 'machine', 'empty', 'loading', 'failed', 'populated']

function splitRow(line: string): string[] | null {
	const trimmed = line.trim()
	if (!trimmed.startsWith('|')) return null
	const parts = trimmed.split('|')
	if (parts.length < 3) return null
	return parts.slice(1, -1).map((part) => part.trim())
}

function isSeparator(line: string): boolean {
	const cells = splitRow(line)
	if (cells == null) return false
	return cells.every((cell) => /^:?-+:?$/.test(cell))
}

export function parseTable(path: TablePath, text: string): { table: StateTable; findings: Finding[]; declared: number } {
	const lines = splitLines(text)
	const findings: Finding[] = []
	const surfaces: Surface[] = []
	const corrections: Correction[] = []
	let header = -1
	for (let i = 0; i < lines.length; i++) {
		const cells = splitRow(lines[i] ?? '')
		if (cells == null) continue
		if (cells.join('|') === HEADER.join('|')) {
			header = i
			break
		}
	}
	if (header === -1) {
		return {
			table: { path, surfaces: [], corrections: [] },
			findings: [{ type: 'syntax', at: { path, line: 1 }, problem: `Table header must be ${HEADER.join(' | ')}.` }],
			declared: 0,
		}
	}
	let cursor = header + 1
	if (cursor < lines.length && isSeparator(lines[cursor] ?? '')) cursor += 1
	let declared = 0
	while (cursor < lines.length) {
		const line = lines[cursor] ?? ''
		if (line.trim() === '' || line.startsWith('#')) break
		const cells = splitRow(line)
		const lineNo = cursor + 1
		cursor += 1
		if (cells == null) break
		declared += 1
		const rowFindings = parseRow(path, lineNo, cells)
		if (Array.isArray(rowFindings)) findings.push(...rowFindings)
		else surfaces.push(rowFindings)
	}
	while (cursor < lines.length && (lines[cursor] ?? '').trim() === '') cursor += 1
	if ((lines[cursor] ?? '').trim() === '## Corrections') {
		cursor += 1
		while (cursor < lines.length) {
			const line = lines[cursor] ?? ''
			if (line.trim() === '') {
				cursor += 1
				continue
			}
			const match = CORRECTION_BULLET.exec(line.trim())
			if (match == null) break
			corrections.push({
				table: path,
				line: cursor + 1,
				rule: ruleId(match[1] ?? ''),
				text: (match[2] ?? '').trim(),
			})
			cursor += 1
		}
	}
	return { table: { path, surfaces, corrections }, findings, declared }
}

function parseRow(path: TablePath, lineNo: number, cells: string[]): Finding[] | Surface {
	const at = { path, line: lineNo }
	if (cells.length !== HEADER.length) {
		return [{ type: 'syntax', at, problem: `Expected ${HEADER.length} columns.` }]
	}
	const [name, kindText, sourceText, machineText, empty, loading, failed, populated] = cells as [
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
	]
	const findings: Finding[] = []
	let kindUnlisted = false
	let kind = surfaceKind(kindText)
	const unlistedKind = UNLISTED.exec(kindText)
	if (unlistedKind) {
		kindUnlisted = true
		kind = surfaceKind(unlistedKind[1] ?? '')
	} else if (!/^[a-z][a-z0-9-]*$/.test(kindText)) {
		findings.push({ type: 'syntax', at, problem: `Bad kind ${kindText}.` })
	}
	if (!Object.hasOwn(REQUIRED_STATES, sourceText)) {
		findings.push({ type: 'syntax', at, problem: `Bad source ${sourceText}.` })
		return findings
	}
	const source = sourceText as Source
	let machine: RuleId | null = null
	if (machineText === 'none') machine = null
	else if (RULE_ID.test(machineText)) machine = ruleId(machineText)
	else findings.push({ type: 'syntax', at, problem: `Bad machine ${machineText}.` })

	const raw: Record<UiState, string> = { empty, loading, failed, populated }
	const required = new Set<string>(REQUIRED_STATES[source])
	const parsed: Partial<Record<UiState, Cell>> = {}
	for (const state of UI_STATES) {
		const value = raw[state].trim()
		if (value === '') {
			if (required.has(state)) {
				findings.push({ type: 'missing-state', at, surface: name, state, source })
			}
			continue
		}
		if (!required.has(state)) {
			findings.push({ type: 'extra-state', at, surface: name, state, source })
			continue
		}
		const parts = value.split('+').map((part) => part.trim()).filter((part) => part.length > 0)
		if (parts.length === 0) {
			findings.push({ type: 'missing-state', at, surface: name, state, source })
			continue
		}
		const refs: Ref[] = []
		for (const part of parts) {
			const ref = parseRef(part)
			if ('error' in ref) findings.push({ type: 'syntax', at, problem: `Bad cell ${part}.` })
			else refs.push(ref)
		}
		if (refs.length > 0) parsed[state] = refs as unknown as Cell
	}
	if (findings.length > 0) return findings
	const row: SurfaceRow = { table: path, line: lineNo, name, kind, kindUnlisted, machine }
	if (source === 'remote') {
		return { ...row, source, cells: { empty: parsed.empty as Cell, loading: parsed.loading as Cell, failed: parsed.failed as Cell, populated: parsed.populated as Cell } }
	}
	if (source === 'local') {
		return { ...row, source, cells: { empty: parsed.empty as Cell, populated: parsed.populated as Cell } }
	}
	return { ...row, source, cells: { populated: parsed.populated as Cell } }
}

function cellList(surface: Surface): [UiState, Cell][] {
	const states = REQUIRED_STATES[surface.source]
	const cells = surface.cells as Readonly<Record<string, Cell>>
	return states.map((state) => [state, cells[state] as Cell])
}

function ruleLine(rules: Rules, id: RuleId): number {
	return rules.byId.get(id)?.lines.heading ?? 1
}

export function checkTable(rules: Rules, table: StateTable): Finding[] {
	const findings: Finding[] = []
	for (const surface of table.surfaces) {
		const at = { path: table.path, line: surface.line }
		if (!surface.kindUnlisted && !rules.kinds.has(surface.kind)) {
			findings.push({
				type: 'unknown-kind',
				at,
				surface: surface.name,
				kind: surface.kind,
				known: [...rules.kinds],
			})
		}
		if (surface.kindUnlisted && rules.kinds.has(surface.kind)) {
			findings.push({ type: 'kind-now-listed', at, surface: surface.name, kind: surface.kind })
		}
		if (surface.machine != null && !rules.byId.has(surface.machine)) {
			findings.push({ type: 'unknown-rule', at, surface: surface.name, id: surface.machine })
		}
		const machineCover = rules.coveredBy.get(coordKeyOf(surface.kind, null))
		if (machineCover != null && surface.machine !== machineCover) {
			findings.push({
				type: 'ignored-cover',
				at,
				surface: surface.name,
				coord: { kind: surface.kind, state: null },
				rule: machineCover,
				ruleLine: ruleLine(rules, machineCover),
			})
		}
		for (const [state, cell] of cellList(surface)) {
			for (const ref of cell) {
				if (ref.type === 'rule' && !rules.byId.has(ref.id)) {
					findings.push({ type: 'unknown-rule', at, surface: surface.name, id: ref.id })
				}
				if (ref.type === 'unlisted') {
					const existing = rules.byCodeName.get(ref.name)
					if (existing != null) {
						findings.push({
							type: 'parallel-name',
							at,
							surface: surface.name,
							state,
							name: ref.name,
							rule: existing,
							ruleLine: ruleLine(rules, existing),
						})
					}
				}
			}
			const cover = rules.coveredBy.get(coordKeyOf(surface.kind, state))
			if (cover != null && !cell.some((ref) => ref.type === 'rule' && ref.id === cover)) {
				findings.push({
					type: 'ignored-cover',
					at,
					surface: surface.name,
					coord: { kind: surface.kind, state },
					rule: cover,
					ruleLine: ruleLine(rules, cover),
				})
			}
		}
	}
	for (const correction of table.corrections) {
		if (!rules.byId.has(correction.rule)) {
			findings.push({
				type: 'unknown-rule',
				at: { path: table.path, line: correction.line },
				surface: null,
				id: correction.rule,
			})
		}
	}
	return findings
}

function coversState(rules: Rules, surface: Surface, state: UiState): boolean {
	const cover = rules.coveredBy.get(coordKeyOf(surface.kind, state))
	if (cover == null) return true
	const cell = (surface.cells as Readonly<Record<string, Cell>>)[state]
	return cell != null && cell.some((ref) => ref.type === 'rule' && ref.id === cover)
}

export function checkBranch(rules: Rules, table: StateTable, branch: BranchView): Finding[] {
	const findings: Finding[] = []
	if (branch.rulesChanged && branch.tableChanged) {
		findings.push({ type: 'rules-edited', at: { path: RULES_PATH, line: null } })
	}
	const seen = new Set<string>()
	for (const surface of table.surfaces) {
		const refs: { column: UiState | 'machine'; rule: Rule }[] = []
		if (surface.machine != null) {
			const rule = rules.byId.get(surface.machine)
			if (rule != null) refs.push({ column: 'machine', rule })
		}
		for (const [state, cell] of cellList(surface)) {
			for (const ref of cell) {
				if (ref.type !== 'rule') continue
				const rule = rules.byId.get(ref.id)
				if (rule != null) refs.push({ column: state, rule })
			}
		}
		for (const item of refs) {
			if (item.rule.type === 'pattern') continue
			if (seen.has(item.rule.id)) continue
			const name = item.rule.codeName
			const used = branch.screenFiles.some((file) => file.text.includes(name))
			if (!used) {
				seen.add(item.rule.id)
				const dir = table.path.split('/').slice(0, -1).join('/') || '.'
				findings.push({
					type: 'unused-ref',
					at: { path: table.path, line: surface.line },
					surface: surface.name,
					column: item.column,
					rule: item.rule.id,
					codeName: name,
					dir,
					ruleLine: item.rule.lines.heading,
				})
			}
		}
	}
	for (const rule of rules.byId.values()) {
		if (rule.type !== 'token') continue
		const value = rule.value
		const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`)
		for (const file of branch.changedFiles) {
			const fileLines = splitLines(file.text)
			for (let i = 0; i < fileLines.length; i++) {
				if (pattern.test(fileLines[i] ?? '')) {
					findings.push({
						type: 'raw-token',
						at: { path: file.path, line: i + 1 },
						value,
						rule: rule.id,
						codeName: rule.codeName,
						ruleLine: rule.lines.heading,
					})
				}
			}
		}
	}
	return findings
}

type ScanMode =
	| { type: 'code' }
	| { type: 'line-comment' }
	| { type: 'block-comment' }
	| { type: 'string'; delimiter: "'" | '"' | '`'; start: number }

function stringSpans(text: string): { start: number; end: number }[] {
	const spans: { start: number; end: number }[] = []
	let mode: ScanMode = { type: 'code' }
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]
		const next = text[i + 1]
		if (mode.type === 'line-comment') {
			if (ch === '\n') mode = { type: 'code' }
			continue
		}
		if (mode.type === 'block-comment') {
			if (ch === '*' && next === '/') {
				mode = { type: 'code' }
				i += 1
			}
			continue
		}
		if (mode.type === 'string') {
			if (ch === '\\') {
				i += 1
				continue
			}
			if (ch === mode.delimiter) {
				spans.push({ start: mode.start, end: i })
				mode = { type: 'code' }
			}
			continue
		}
		if (ch === '/' && next === '/') {
			mode = { type: 'line-comment' }
			i += 1
			continue
		}
		if (ch === '/' && next === '*') {
			mode = { type: 'block-comment' }
			i += 1
			continue
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			mode = { type: 'string', delimiter: ch, start: i + 1 }
		}
	}
	if (mode.type === 'string') spans.push({ start: mode.start, end: text.length })
	return spans
}

function phraseHits(span: string, literal: string): number[] {
	const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(literal)}(?![A-Za-z0-9])`, 'g')
	const hits: number[] = []
	for (const match of span.matchAll(pattern)) {
		if (match.index != null) hits.push(match.index)
	}
	return hits
}

function lineOf(text: string, index: number): number {
	let line = 1
	for (let i = 0; i < index && i < text.length; i++) {
		if (text[i] === '\n') line += 1
	}
	return line
}

function citedRules(table: StateTable): Set<RuleId> {
	const cited = new Set<RuleId>()
	for (const surface of table.surfaces) {
		if (surface.machine != null) cited.add(surface.machine)
		for (const [, cell] of cellList(surface)) {
			for (const ref of cell) {
				if (ref.type === 'rule') cited.add(ref.id)
			}
		}
	}
	return cited
}

function correctionFindings(
	rules: Rules,
	table: StateTable,
	screenFiles: readonly SourceFile[],
	checks: readonly CorrectionCheck[],
): Finding[] {
	const findings: Finding[] = []
	const cited = citedRules(table)
	const seen = new Set<string>()
	for (const check of checks) {
		if (check.kind === 'unchecked') continue
		if (!cited.has(check.rule) || !rules.byId.has(check.rule)) continue
		const rule = rules.byId.get(check.rule)
		if (rule == null) continue
		const ruleLine = rule.lines.heading
		for (const file of screenFiles) {
			if (!isScreenSource(file.path)) continue
			for (const span of stringSpans(file.text)) {
				const slice = file.text.slice(span.start, span.end)
				for (const literal of check.literals) {
					for (const hit of phraseHits(slice, literal)) {
						const index = span.start + hit
						const line = lineOf(file.text, index)
						const key = `${check.rule}\0${file.path}\0${line}`
						if (seen.has(key)) continue
						seen.add(key)
						findings.push({
							type: 'correction',
							at: { path: file.path, line },
							rule: check.rule,
							ruleLine,
							text: check.text,
							literal,
						})
					}
				}
			}
		}
	}
	return findings
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pushHit<T>(map: Map<string, Issue>, key: string, issue: Issue): void {
	const prior = map.get(key)
	if (prior == null) {
		map.set(key, issue)
		return
	}
	const hits = prior.hits as unknown as unknown[]
	hits.push(...(issue.hits as unknown as unknown[]))
}

export function issueKey(issue: Issue): string {
	if (issue.type === 'uncovered') return `uncovered ${coordKey(issue.coord)}`
	if (issue.type === 'unlisted') return `unlisted ${issue.name}`
	return `corrected ${issue.rule}`
}

export function collectIssues(rules: Rules, tables: readonly StateTable[]): { notes: Issue[]; repeats: Repeat[] } {
	const grouped = new Map<string, Issue>()
	for (const table of tables) {
		for (const surface of table.surfaces) {
			for (const state of REQUIRED_STATES[surface.source]) {
				if (state === 'populated') continue
				if (rules.coveredBy.has(coordKeyOf(surface.kind, state))) continue
				const cell = (surface.cells as Readonly<Record<string, Cell>>)[state] as Cell
				const issue: Issue = {
					type: 'uncovered',
					coord: { kind: surface.kind, state },
					hits: [{ table: table.path, surface: surface.name, cell }],
				}
				pushHit(grouped, issueKey(issue), issue)
			}
			const populated = (surface.cells as Readonly<Record<string, Cell>>).populated as Cell | undefined
			if (populated != null && coversState(rules, surface, 'populated')) {
				for (const ref of populated) {
					if (ref.type === 'unlisted' && !rules.byCodeName.has(ref.name)) {
						const issue: Issue = {
							type: 'unlisted',
							name: ref.name,
							hits: [{ table: table.path, surface: surface.name }],
						}
						pushHit(grouped, issueKey(issue), issue)
					}
				}
			}
		}
		for (const correction of table.corrections) {
			if (!rules.byId.has(correction.rule)) continue
			const issue: Issue = {
				type: 'corrected',
				rule: correction.rule,
				hits: [{ table: table.path, text: correction.text }],
			}
			pushHit(grouped, issueKey(issue), issue)
		}
	}
	const notes: Issue[] = []
	const repeats: Repeat[] = []
	for (const issue of grouped.values()) {
		const tablesHit = new Set(issue.hits.map((hit) => hit.table))
		if (tablesHit.size >= 2) repeats.push(issue as Repeat)
		else notes.push(issue)
	}
	return { notes, repeats }
}

function kebab(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase()
}

function freshId(rules: Rules, prefix: 'C' | 'P', base: string): string {
	let id = `${prefix}-${base}`
	let n = 2
	while (rules.byId.has(ruleId(id))) {
		id = `${prefix}-${base}-${n}`
		n += 1
	}
	return id
}

function lastRule(rules: Rules, type: RuleType): Rule | null {
	let found: Rule | null = null
	for (const rule of rules.byId.values()) {
		if (rule.type === type) found = rule
	}
	return found
}

export function propose(rules: Rules, repeat: Repeat): RuleEdit {
	if (repeat.type === 'corrected') {
		const rule = rules.byId.get(repeat.rule)
		const at = (rule?.lines.last ?? rules.lines.length) + 1
		const seen = new Set<string>()
		const add: string[] = []
		for (const hit of repeat.hits) {
			if (seen.has(hit.text)) continue
			seen.add(hit.text)
			add.push(hit.text)
		}
		return { at, remove: [], add }
	}
	if (repeat.type === 'unlisted') {
		const id = freshId(rules, 'C', kebab(repeat.name))
		const heading = `### ${id} \`${repeat.name}\``
		const prior = lastRule(rules, 'component')
		const at = prior == null ? rules.lines.length + 1 : prior.lines.last + 1
		return { at, remove: [], add: ['', heading] }
	}
	const counts = new Map<string, { id: RuleId; n: number; order: number }>()
	let order = 0
	for (const hit of repeat.hits) {
		for (const ref of hit.cell) {
			if (ref.type !== 'rule') continue
			const rule = rules.byId.get(ref.id)
			if (rule == null || rule.type === 'token') continue
			const prior = counts.get(ref.id)
			if (prior != null) prior.n += 1
			else counts.set(ref.id, { id: ref.id, n: 1, order: order++ })
		}
	}
	const ranked = [...counts.values()].sort((a, b) => b.n - a.n || a.order - b.order)
	const winner = ranked[0]
	const key = coordKey(repeat.coord)
	if (winner != null) {
		const rule = rules.byId.get(winner.id)
		if (rule != null && rule.type !== 'token' && rule.lines.covers != null) {
			const coversLine = rules.lines[rule.lines.covers - 1] ?? ''
			return { at: rule.lines.covers, remove: [coversLine], add: [`${coversLine}, ${key}`] }
		}
		if (rule != null) {
			return { at: rule.lines.heading + 1, remove: [], add: [`Covers: ${key}`] }
		}
	}
	const unlisted = repeat.hits.flatMap((hit) => hit.cell.filter((ref) => ref.type === 'unlisted'))
	if (unlisted.length > 0) {
		const name = unlisted[0]?.type === 'unlisted' ? unlisted[0].name : 'component'
		const id = freshId(rules, 'C', kebab(name))
		const prior = lastRule(rules, 'component')
		const at = prior == null ? rules.lines.length + 1 : prior.lines.last + 1
		return { at, remove: [], add: ['', `### ${id} \`${name}\``, `Covers: ${key}`] }
	}
	const id = freshId(rules, 'P', `${repeat.coord.kind}-${repeat.coord.state}`)
	const prior = lastRule(rules, 'pattern')
	const at = prior == null ? rules.lines.length + 1 : prior.lines.last + 1
	return { at, remove: [], add: ['', `### ${id}`, `Covers: ${key}`, 'Renders nothing.'] }
}

export function renderDiff(rules: Rules, edit: RuleEdit): string {
	const lines = rules.lines
	const context = 3
	const start = Math.max(1, edit.at - context)
	const oldEnd = Math.min(lines.length, edit.at + Math.max(edit.remove.length, 1) - 1 + context)
	const oldCount = oldEnd - start + 1
	const newCount = oldCount - edit.remove.length + edit.add.length
	const out: string[] = ['--- a/product-rules.md', '+++ b/product-rules.md', `@@ -${start},${oldCount} +${start},${newCount} @@`]
	for (let line = start; line < edit.at; line++) out.push(` ${lines[line - 1] ?? ''}`)
	for (const removed of edit.remove) out.push(`-${removed}`)
	for (const added of edit.add) out.push(`+${added}`)
	const after = edit.at + edit.remove.length
	for (let line = after; line <= oldEnd; line++) out.push(` ${lines[line - 1] ?? ''}`)
	return out.join('\n')
}

export function applyEdit(text: string, edit: RuleEdit): string {
	const lines = splitLines(text)
	lines.splice(edit.at - 1, edit.remove.length, ...edit.add)
	return `${lines.join('\n')}\n`
}

export function message(finding: Finding): string {
	switch (finding.type) {
		case 'syntax':
			return finding.problem
		case 'missing-state':
			return `A ${finding.source} surface needs a ${finding.state} cell.`
		case 'extra-state':
			return `A ${finding.source} surface does not use ${finding.state}. Leave the cell blank.`
		case 'unknown-rule':
			return `Unknown rule ${finding.id}.`
		case 'unknown-kind':
			return `Unknown kind ${finding.kind}. Known kinds: ${finding.known.join(', ')}.`
		case 'kind-now-listed':
			return `${finding.kind} is a kind in product-rules.md. Drop unlisted().`
		case 'ignored-cover': {
			const where = coordKey(finding.coord)
			const cited = `product-rules.md:${finding.ruleLine}`
			if (finding.coord.state == null) {
				return `${finding.rule} (${cited}) covers ${where}. Put ${finding.rule} here and fill its slots.`
			}
			return `${finding.rule} (${cited}) covers ${where}. Put ${finding.rule} in this cell.`
		}
		case 'parallel-name':
			return `unlisted(${finding.name}) is ${finding.rule} (product-rules.md:${finding.ruleLine}). Write ${finding.rule}.`
		case 'unused-ref':
			return `${finding.rule} (${finding.codeName}) is in the table, but no file under ${finding.dir}/ mentions ${finding.codeName}. Build with it or fix the table.`
		case 'raw-token':
			return `${finding.value} is ${finding.rule} (${finding.codeName}). Use the token.`
		case 'correction':
			return `"${finding.literal}" breaks ${finding.rule} (${RULES_PATH}:${finding.ruleLine}). ${finding.text}`
		case 'rules-edited':
			return 'This change edits product-rules.md and a state table. Ship the rules edit as its own change.'
		default: {
			const never: never = finding
			return never
		}
	}
}

function loc(at: Loc): string {
	return at.line == null ? at.path : `${at.path}:${at.line}`
}

function findingLine(finding: Finding): string {
	const sentence = message(finding)
	switch (finding.type) {
		case 'syntax':
			return `  ${loc(finding.at)} ${sentence}`
		case 'missing-state':
		case 'extra-state':
			return `  ${loc(finding.at)} ${finding.surface}.${finding.state}. ${sentence}`
		case 'ignored-cover':
			return `  ${loc(finding.at)} ${finding.surface}.${finding.coord.state ?? 'machine'}. ${sentence}`
		case 'parallel-name':
			return `  ${loc(finding.at)} ${finding.surface}.${finding.state}. ${sentence}`
		case 'unused-ref':
			return `  ${loc(finding.at)} ${finding.surface}.${finding.column}. ${sentence}`
		case 'unknown-kind':
		case 'kind-now-listed':
			return `  ${loc(finding.at)} ${finding.surface}. ${sentence}`
		case 'unknown-rule':
			return finding.surface == null
				? `  ${loc(finding.at)} ${sentence}`
				: `  ${loc(finding.at)} ${finding.surface}. ${sentence}`
		case 'raw-token':
		case 'correction':
			return `  ${loc(finding.at)} ${sentence}`
		case 'rules-edited':
			return `  ${finding.at.path}. ${sentence}`
		default: {
			const never: never = finding
			return never
		}
	}
}

function noteLine(issue: Issue): string {
	const key = issueKey(issue)
	if (issue.type === 'uncovered') {
		const hit = issue.hits[0]
		return `  ${key}. No rule covers it. ${hit?.table} used ${hit == null ? '' : renderCell(hit.cell)}.`
	}
	if (issue.type === 'unlisted') {
		const hit = issue.hits[0]
		return `  ${key}. ${RULES_PATH} does not list it. First seen in ${hit?.table}.`
	}
	const hit = issue.hits[0]
	return `  ${key}. ${hit?.table} ${hit?.text}`
}

function proposalBlock(repeat: Repeat, diff: string): string {
	const key = issueKey(repeat)
	const screens = new Set(repeat.hits.map((hit) => hit.table)).size
	const lines = [`  ${key}. Seen in ${screens} screens.`]
	if (repeat.type === 'uncovered') {
		for (const hit of repeat.hits) lines.push(`    ${hit.table}  ${hit.surface} used ${renderCell(hit.cell)}`)
	} else if (repeat.type === 'unlisted') {
		for (const hit of repeat.hits) lines.push(`    ${hit.table}  ${hit.surface}`)
	} else {
		for (const hit of repeat.hits) lines.push(`    ${hit.table}  ${hit.text}`)
	}
	for (const diffLine of diff.split('\n')) lines.push(`    ${diffLine}`)
	return lines.join('\n')
}

export function report(value: Report): string {
	const lines: string[] = []
	lines.push(`rules  ${value.rules.path}, ${value.rules.count} rules`)
	if (value.tables.length === 1) {
		const table = value.tables[0]
		if (table != null) {
			const label = table.surfaces === 1 ? 'surface' : 'surfaces'
			lines.push(`table  ${table.path}, ${table.surfaces} ${label}`)
		}
	} else {
		lines.push(`tables  ${value.tables.length}`)
		for (const table of value.tables) lines.push(`  ${table.path}, ${table.surfaces} surfaces`)
	}
	lines.push('')
	lines.push(`errors ${value.findings.length}`)
	for (const finding of value.findings) lines.push(findingLine(finding))
	lines.push('')
	lines.push(`notes ${value.notes.length}`)
	for (const note of value.notes) lines.push(noteLine(note))
	lines.push('')
	lines.push(`proposals ${value.proposals.length}`)
	value.proposals.forEach((proposal, index) => {
		if (index > 0) lines.push('')
		lines.push(proposalBlock(proposal.repeat, proposal.diff))
	})
	return lines.join('\n')
}

export function checkScreens(input: {
	rules: Rules
	rulesPath: string
	parsed: readonly { path: TablePath; text: string }[]
	branches: ReadonlyMap<string, BranchView>
	target: TablePath | null
}): Report {
	const correctionLoad = skillCorrectionChecks()
	if (!correctionLoad.ok) throw new Error('skill correction checks are unavailable')
	const correctionChecks = correctionLoad.checks
	const allTables: StateTable[] = []
	const declared = new Map<string, number>()
	const findings: Finding[] = []
	for (const item of input.parsed) {
		const parsed = parseTable(item.path, item.text)
		declared.set(item.path, parsed.declared)
		allTables.push(parsed.table)
		const inTarget = input.target == null || input.target === item.path
		if (!inTarget) continue
		findings.push(...parsed.findings)
		findings.push(...checkTable(input.rules, parsed.table))
		const branch = input.branches.get(item.path)
		if (branch != null) {
			findings.push(...checkBranch(input.rules, parsed.table, branch))
			findings.push(...correctionFindings(input.rules, parsed.table, branch.screenFiles, correctionChecks))
		}
	}
	findings.sort((a, b) => (a.at.line ?? Number.MAX_SAFE_INTEGER) - (b.at.line ?? Number.MAX_SAFE_INTEGER))
	const issues = collectIssues(input.rules, allTables)
	const kept = (issue: Issue): boolean => {
		if (input.target == null) return true
		return issue.hits.some((hit) => hit.table === input.target)
	}
	const notes = issues.notes.filter(kept)
	const repeats = issues.repeats.filter(kept)
	const shown =
		input.target == null ? input.parsed.map((item) => item.path) : input.parsed.filter((item) => item.path === input.target).map((item) => item.path)
	return {
		rules: { path: input.rulesPath, count: input.rules.byId.size },
		tables: shown.map((path) => ({ path, surfaces: declared.get(path) ?? 0 })),
		findings,
		notes,
		proposals: repeats.map((repeat) => ({ repeat, diff: renderDiff(input.rules, propose(input.rules, repeat)) })),
	}
}

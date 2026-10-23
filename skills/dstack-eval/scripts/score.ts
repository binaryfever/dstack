import { createHash } from 'node:crypto'
import { parseRules, parseTable, tablePath, type RuleId } from '../../dstack/scripts/model.ts'

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type SkillHash = Brand<string, 'SkillHash'>
export type ModelId = Brand<string, 'ModelId'>
export type Codename = Brand<string, 'Codename'>
export type RunId = Brand<string, 'RunId'>

export type Bit = 0 | 1

export const SURFACE_IDS = ['notifications', 'mentions'] as const
export type SurfaceId = (typeof SURFACE_IDS)[number]

export const CODENAMES = ['birch', 'alder', 'holly', 'rowan', 'maple', 'hazel'] as const

export const REUSE = ['AsyncList', 'EmptyState', 'RowSkeleton', 'Badge', 'Avatar', 'color.primary'] as const

export const FORBIDDEN = [
	'rubric',
	'no-skill',
	'skill arm',
	'experiment',
	'alpha',
	'beta',
	'blind',
	'fmc-',
	'dstack-eval',
	'other arm',
] as const

export const CHECKS = ['screen', 'states', 'reuse', 'table', 'rules', 'openable'] as const

export type Surface = {
	readonly id: SurfaceId
	readonly listNoun: string
	readonly countNoun: string
	readonly sampleNoun: string
	readonly tableBase: 'NotificationList.states.md' | 'MentionsList.states.md'
	readonly rejectBases: readonly string[]
	readonly habit: 'none' | 'notification-copy'
}

export const SURFACES: Readonly<Record<SurfaceId, Surface>> = {
	notifications: {
		id: 'notifications',
		listNoun: 'notification list',
		countNoun: 'an unread count',
		sampleNoun: 'notifications',
		tableBase: 'NotificationList.states.md',
		rejectBases: [],
		habit: 'none',
	},
	mentions: {
		id: 'mentions',
		listNoun: 'mentions list',
		countNoun: 'an unseen count',
		sampleNoun: 'mentions',
		tableBase: 'MentionsList.states.md',
		rejectBases: ['NotificationList.states.md'],
		habit: 'notification-copy',
	},
}

export type Treatment = { readonly role: 'skill' } | { readonly role: 'none' }

export type BlindKey =
	| { readonly alpha: 'skill'; readonly beta: 'none' }
	| { readonly alpha: 'none'; readonly beta: 'skill' }

export type Assignment = {
	readonly key: BlindKey
	readonly skillName: Codename
	readonly noneName: Codename
}

export type JudgeChecks = {
	readonly screen: Bit
	readonly states: Bit
	readonly reuse: Bit
	readonly openable: Bit
}

export type FileChecks = {
	readonly table: Bit
	readonly rules: Bit
}

export type Scorecard = Record<(typeof CHECKS)[number], Bit>

export type TreeFiles = readonly { readonly path: string; readonly bytes: string }[]

export type Probe = {
	readonly exit: 0 | 1 | 2
	readonly exactTable: boolean
}

export type BuilderRecord = {
	readonly model: ModelId
	readonly agentId: string
}

export type JudgeRecord = {
	readonly model: ModelId
	readonly agentId: string
}

export type FailedGate = 'table' | 'states' | 'reuse' | 'beats'

export type Regression = {
	readonly kind: 'regression'
	readonly observes: true
	readonly surface: SurfaceId
	readonly model: ModelId
	readonly plantedHash: SkillHash
	readonly pass: boolean
	readonly failedGate: FailedGate | null
	readonly key: BlindKey
	readonly skill: Scorecard
	readonly none: Scorecard
	readonly probe: Probe
}

export type Historical = {
	readonly kind: 'historical'
	readonly observes: false
	readonly caseId: CaseId
	readonly reproduced: boolean
	readonly skill: Scorecard
	readonly none: Scorecard
}

export type Stale = {
	readonly kind: 'stale'
	readonly observes: false
	readonly plantedHash: SkillHash
	readonly liveHash: SkillHash
	readonly verdictPath: string
}

export type Unreadable = {
	readonly kind: 'unreadable'
	readonly observes: false
	readonly problem: string
}

export type ScoreResult = Regression | Historical | Stale | Unreadable

export type CaseId = 'fmc-579' | 'fmc-581'

const SIX_WITH_TABLE: Scorecard = {
	screen: 1,
	states: 1,
	reuse: 1,
	table: 1,
	rules: 1,
	openable: 1,
}
const SIX_WITHOUT_TABLE: Scorecard = { ...SIX_WITH_TABLE, table: 0 }

export const RECORDED: Readonly<Record<CaseId, { readonly skill: Scorecard; readonly none: Scorecard }>> = {
	'fmc-579': { skill: SIX_WITH_TABLE, none: SIX_WITHOUT_TABLE },
	'fmc-581': { skill: SIX_WITH_TABLE, none: SIX_WITHOUT_TABLE },
}

export const HISTORICAL_TREES: Readonly<
	Record<CaseId, { readonly surface: SurfaceId; readonly skill: string; readonly none: string; readonly expectedRules: string }>
> = {
	'fmc-579': {
		surface: 'notifications',
		skill: '.audit/builds/cedar',
		none: '.audit/builds/willow',
		expectedRules: '.audit/fmc-579-product-rules.expected.md',
	},
	'fmc-581': {
		surface: 'mentions',
		skill: '.audit/builds/spruce',
		none: '.audit/builds/aspen',
		expectedRules: '.audit/fmc-581-product-rules.expected.md',
	},
}

export type ScoreInput =
	| {
			readonly type: 'run'
			readonly plant: string | null
			readonly surface: SurfaceId
			readonly model: ModelId
			readonly plantedHash: SkillHash
			readonly liveHash: SkillHash
			readonly verdictPath: string
			readonly key: BlindKey
			readonly builders: { readonly skill: BuilderRecord; readonly none: BuilderRecord }
			readonly judge: JudgeRecord
			readonly alphaJudge: JudgeChecks
			readonly betaJudge: JudgeChecks
			readonly alphaFiles: FileChecks
			readonly betaFiles: FileChecks
			readonly probe: Probe
	  }
	| {
			readonly type: 'historical'
			readonly caseId: CaseId
			readonly recorded: { readonly skill: Scorecard; readonly none: Scorecard }
			readonly skillFiles: FileChecks
			readonly noneFiles: FileChecks
	  }

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const ANSWER_BASES = new Set(['NotificationList.states.md', 'MentionsList.states.md'])
const JUDGE_CHECKS = ['screen', 'states', 'reuse', 'openable'] as const

export function modelId(value: string): { ok: true; model: ModelId } | { ok: false; problem: string } {
	if (!MODEL_ID.test(value)) return { ok: false, problem: 'bad model' }
	return { ok: true, model: value as ModelId }
}

export function parseCodename(value: string): { ok: true; codename: Codename } | { ok: false; problem: string } {
	if (!(CODENAMES as readonly string[]).includes(value)) return { ok: false, problem: 'bad codename' }
	return { ok: true, codename: value as Codename }
}

export function assignment(coin: 0 | 1, left: Codename, right: Codename): Assignment {
	if (left === right) throw new Error('codenames must differ')
	if (coin === 0) return { key: { alpha: 'skill', beta: 'none' }, skillName: left, noneName: right }
	return { key: { alpha: 'none', beta: 'skill' }, skillName: right, noneName: left }
}

function segments(path: string): string[] {
	return path.split(/[/\\]/).filter((part) => part !== '' && part !== '.')
}

export function isPlantedSkillPath(relativeToSkillRoot: string): boolean {
	if (relativeToSkillRoot === '') return false
	if (relativeToSkillRoot.startsWith('/') || relativeToSkillRoot.startsWith('\\')) return false
	if (/^[A-Za-z]:[\\/]/.test(relativeToSkillRoot)) return false
	const parts = segments(relativeToSkillRoot)
	if (parts.length === 0) return false
	if (parts.some((part) => part === '..' || part === 'fixtures')) return false
	return true
}

export function skillHash(files: readonly { readonly path: string; readonly bytes: string }[]): SkillHash {
	const kept = files.filter((file) => isPlantedSkillPath(file.path))
	const sorted = [...kept].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
	const hash = createHash('sha256')
	for (const file of sorted) {
		hash.update(file.path, 'utf8')
		hash.update('\0')
		hash.update(file.bytes, 'utf8')
		hash.update('\0')
	}
	return hash.digest('hex') as SkillHash
}

function skillsAt(parts: readonly string[]): number {
	for (let i = 0; i < parts.length - 1; i++) {
		if (parts[i] === '.cursor' && parts[i + 1] === 'skills') return i
	}
	return -1
}

export function plantPostcondition(treatment: Treatment, relativePaths: readonly string[]): string | null {
	for (const path of relativePaths) {
		const parts = segments(path)
		const base = parts[parts.length - 1] ?? ''
		if (ANSWER_BASES.has(base)) return `states file ${base}`
		if (parts.includes('fixtures')) return 'fixtures path'
		const at = skillsAt(parts)
		if (at === -1) continue
		if (treatment.role === 'none') return '.cursor/skills'
		if (parts[at + 2] !== 'dstack') return '.cursor/skills outside dstack'
	}
	if (treatment.role === 'skill') {
		const present = relativePaths.some((path) => segments(path).join('/') === '.cursor/skills/dstack/SKILL.md')
		if (!present) return 'missing .cursor/skills/dstack/SKILL.md'
	}
	return null
}

export function brief(surface: SurfaceId): string {
	const spec = SURFACES[surface]
	return [
		`Build the shop ${spec.listNoun}.`,
		`The header shows ${spec.countNoun}. The page lists ${spec.sampleNoun}.`,
		'Use the components and tokens in product-rules.md.',
		`Ship sample ${spec.sampleNoun} so the populated page can open in a browser.`,
	].join('\n')
}

export function builderPrompt(
	surface: SurfaceId,
	treatment: Treatment,
): { ok: true; text: string } | { ok: false; problem: string } {
	const task = brief(surface)
	const text = treatment.role === 'skill' ? `${task}\n\nFollow /dstack.\n` : task
	const lower = text.toLowerCase()
	for (const word of FORBIDDEN) {
		if (lower.includes(word)) return { ok: false, problem: `forbidden ${word}` }
	}
	if (treatment.role === 'none' && lower.includes('dstack')) return { ok: false, problem: 'none prompt names dstack' }
	return { ok: true, text }
}

export function judgePrompt(surface: SurfaceId, alphaPath: string, betaPath: string): string {
	const spec = SURFACES[surface]
	const lines = [
		'Score finished files only. You do not know how either build was produced.',
		'',
		`Alpha root  ${alphaPath}`,
		`Beta root  ${betaPath}`,
		'',
		'Score screen, states, reuse, and openable. Each value is 0 or 1 for alpha and for beta.',
		'',
		`Screen. The screen is a ${spec.listNoun}. The header shows ${spec.countNoun}.`,
		'States. Every remote surface has empty, loading, failed, and populated.',
		`Reuse. The build uses ${REUSE.join(', ')}. A parallel stand-in is a miss.`,
		'Openable. The populated page has more than one item, and the page opens.',
	]
	if (spec.habit === 'notification-copy') {
		lines.push('Notification copy, or a notification-only correction, is a miss on screen.')
	}
	lines.push(
		'',
		'Return a four-row markdown table, then one short paragraph per label.',
		'',
		'| check | alpha | beta |',
		'|---|---|---|',
		'',
		'Stop. Do not guess the process that produced either tree.',
	)
	return `${lines.join('\n')}\n`
}

function splitRow(line: string): string[] | null {
	const trimmed = line.trim()
	if (!trimmed.startsWith('|')) return null
	const parts = trimmed.split('|')
	if (parts.length < 3) return null
	return parts.slice(1, -1).map((part) => part.trim())
}

function checkName(cell: string): string {
	return cell.trim().toLowerCase().replace(/^\d+\s*/, '')
}

function bit(cell: string): Bit | null {
	if (cell === '0') return 0
	if (cell === '1') return 1
	return null
}

function ignoredJudgeRow(name: string): boolean {
	return name === 'table' || name === 'rules' || name.startsWith('table ') || name.startsWith('rules ')
}

export function parseJudgeReply(
	text: string,
): { ok: true; alpha: JudgeChecks; beta: JudgeChecks } | { ok: false; problem: string } {
	const found = new Map<string, { alpha: Bit; beta: Bit }>()
	for (const raw of text.split('\n')) {
		const line = raw.trim()
		if (line === '') continue
		const cells = splitRow(line)
		let name = ''
		let alphaCell = ''
		let betaCell = ''
		if (cells != null && cells.length >= 3) {
			name = checkName(cells[0] ?? '')
			alphaCell = cells[1] ?? ''
			betaCell = cells[2] ?? ''
		} else {
			const plain = /^([A-Za-z0-9 ]+?)\s+([01])\s+([01])\s*$/.exec(line)
			if (plain == null) continue
			name = checkName(plain[1] ?? '')
			alphaCell = plain[2] ?? ''
			betaCell = plain[3] ?? ''
		}
		if (ignoredJudgeRow(name)) continue
		if (!(JUDGE_CHECKS as readonly string[]).includes(name)) continue
		if (found.has(name)) return { ok: false, problem: `duplicate ${name}` }
		const alpha = bit(alphaCell)
		const beta = bit(betaCell)
		if (alpha == null || beta == null) return { ok: false, problem: `bad ${name}` }
		found.set(name, { alpha, beta })
	}
	for (const name of JUDGE_CHECKS) {
		if (!found.has(name)) return { ok: false, problem: `missing ${name}` }
	}
	const screen = found.get('screen')
	const states = found.get('states')
	const reuse = found.get('reuse')
	const openable = found.get('openable')
	if (screen == null || states == null || reuse == null || openable == null) return { ok: false, problem: 'missing judge row' }
	return {
		ok: true,
		alpha: { screen: screen.alpha, states: states.alpha, reuse: reuse.alpha, openable: openable.alpha },
		beta: { screen: screen.beta, states: states.beta, reuse: reuse.beta, openable: openable.beta },
	}
}

function baseName(path: string): string {
	const parts = segments(path)
	return parts[parts.length - 1] ?? ''
}

function rootRules(files: TreeFiles): string | null {
	for (const file of files) {
		const parts = segments(file.path)
		if (parts.length === 1 && parts[0] === 'product-rules.md') return file.bytes
	}
	return null
}

function citesListedRule(tableText: string, tableFile: string, ruleIds: ReadonlyMap<RuleId, unknown>): boolean {
	const parsed = parseTable(tablePath(tableFile), tableText)
	for (const row of parsed.table.surfaces) {
		const cells = row.cells as Readonly<Record<string, readonly { type: string; id: RuleId }[]>>
		for (const cell of Object.values(cells)) {
			for (const ref of cell) {
				if (ref.type === 'rule' && ruleIds.has(ref.id)) return true
			}
		}
	}
	return false
}

export function fileChecks(files: TreeFiles, surface: Surface, expectedRules: string): FileChecks {
	const rulesBytes = rootRules(files)
	const rules: Bit = rulesBytes === expectedRules ? 1 : 0
	if (files.some((file) => surface.rejectBases.includes(baseName(file.path)))) return { table: 0, rules }
	const parsedRules = rulesBytes == null ? null : parseRules(rulesBytes)
	const ruleIds = parsedRules != null && parsedRules.ok ? parsedRules.rules.byId : null
	if (ruleIds == null) return { table: 0, rules }
	for (const file of files) {
		if (baseName(file.path) !== surface.tableBase) continue
		if (citesListedRule(file.bytes, file.path, ruleIds)) return { table: 1, rules }
	}
	return { table: 0, rules }
}

export function scorecard(judge: JudgeChecks, files: FileChecks): Scorecard {
	return {
		screen: judge.screen,
		states: judge.states,
		reuse: judge.reuse,
		table: files.table,
		rules: files.rules,
		openable: judge.openable,
	}
}

export function unblind(
	key: BlindKey,
	alpha: Scorecard,
	beta: Scorecard,
): { readonly skill: Scorecard; readonly none: Scorecard } {
	if (key.alpha === 'skill') return { skill: alpha, none: beta }
	return { skill: beta, none: alpha }
}

export function total(card: Scorecard): number {
	let sum = 0
	for (const check of CHECKS) sum += card[check]
	return sum
}

export function firstGate(skill: Scorecard, none: Scorecard): FailedGate | null {
	if (skill.table !== 1 || none.table !== 0) return 'table'
	if (skill.states !== 1) return 'states'
	if (skill.reuse !== 1) return 'reuse'
	if (total(skill) <= total(none)) return 'beats'
	return null
}

function withFiles(recorded: Scorecard, files: FileChecks): Scorecard {
	return {
		screen: recorded.screen,
		states: recorded.states,
		reuse: recorded.reuse,
		table: files.table,
		rules: files.rules,
		openable: recorded.openable,
	}
}

function sameCard(left: Scorecard, right: Scorecard): boolean {
	return CHECKS.every((check) => left[check] === right[check])
}

function runProblem(input: Extract<ScoreInput, { type: 'run' }>): string | null {
	if (input.builders.skill.model !== input.model) return 'skill builder model differs'
	if (input.builders.none.model !== input.model) return 'none builder model differs'
	if (input.builders.skill.agentId.trim() === '') return 'empty agent id'
	if (input.builders.none.agentId.trim() === '') return 'empty agent id'
	if (input.judge.agentId.trim() === '') return 'empty agent id'
	return null
}

export function score(input: ScoreInput): ScoreResult {
	if (input.type === 'historical') {
		const skill = withFiles(input.recorded.skill, input.skillFiles)
		const none = withFiles(input.recorded.none, input.noneFiles)
		return {
			kind: 'historical',
			observes: false,
			caseId: input.caseId,
			reproduced: sameCard(skill, input.recorded.skill) && sameCard(none, input.recorded.none),
			skill,
			none,
		}
	}
	if (input.plant != null) return { kind: 'unreadable', observes: false, problem: input.plant }
	if (input.plantedHash !== input.liveHash) {
		return {
			kind: 'stale',
			observes: false,
			plantedHash: input.plantedHash,
			liveHash: input.liveHash,
			verdictPath: input.verdictPath,
		}
	}
	const problem = runProblem(input)
	if (problem != null) return { kind: 'unreadable', observes: false, problem }
	const cards = unblind(input.key, scorecard(input.alphaJudge, input.alphaFiles), scorecard(input.betaJudge, input.betaFiles))
	const failedGate = firstGate(cards.skill, cards.none)
	return {
		kind: 'regression',
		observes: true,
		surface: input.surface,
		model: input.model,
		plantedHash: input.plantedHash,
		pass: failedGate == null,
		failedGate,
		key: input.key,
		skill: cards.skill,
		none: cards.none,
		probe: input.probe,
	}
}

export function regressionPassed(result: ScoreResult): boolean {
	return result.kind === 'regression' && result.pass
}

export function exitCode(result: ScoreResult): 0 | 1 | 2 {
	if (result.kind !== 'regression') return 2
	return result.pass ? 0 : 1
}

function pair(label: string, value: string): string {
	return `${label}  ${value}`
}

function yn(value: boolean): 'yes' | 'no' {
	return value ? 'yes' : 'no'
}

function checkLines(skill: Scorecard, none: Scorecard): string[] {
	return CHECKS.map((check) => pair(check, `${skill[check]}  ${none[check]}`))
}

export function formatScore(result: ScoreResult): string {
	const lines = [pair('kind', result.kind), pair('observes', yn(result.observes))]
	if (result.kind === 'regression') {
		lines.push(pair('surface', result.surface), pair('model', result.model), pair('pass', yn(result.pass)))
		if (!result.pass && result.failedGate != null) lines.push(pair('failed gate', result.failedGate))
		lines.push(
			pair('skill', `${total(result.skill)}/${CHECKS.length}`),
			pair('none', `${total(result.none)}/${CHECKS.length}`),
			pair('alpha', result.key.alpha),
			pair('beta', result.key.beta),
			...checkLines(result.skill, result.none),
			pair('probe exit', String(result.probe.exit)),
			pair('probe table', yn(result.probe.exactTable)),
		)
	} else if (result.kind === 'historical') {
		lines.push(
			pair('case', result.caseId),
			pair('reproduced', yn(result.reproduced)),
			pair('skill', `${total(result.skill)}/${CHECKS.length}`),
			pair('none', `${total(result.none)}/${CHECKS.length}`),
			...checkLines(result.skill, result.none),
		)
	} else if (result.kind === 'stale') {
		lines.push(pair('planted', result.plantedHash), pair('current', result.liveHash), pair('verdict', result.verdictPath))
	} else {
		lines.push(pair('problem', result.problem))
	}
	return `${lines.join('\n')}\n`
}

export function latestRunId(ids: readonly RunId[]): RunId | null {
	if (ids.length === 0) return null
	let best: RunId = ids[0] as RunId
	for (const id of ids) if (id > best) best = id
	return best
}

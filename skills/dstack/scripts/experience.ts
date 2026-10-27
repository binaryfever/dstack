import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Actor = 'agent' | 'judge'
type ProofSlot = 'empty' | 'loading' | 'failed' | 'populatedDesktop' | 'populatedMobile'

const RUBRIC = [
	{
		id: 'empty-copy',
		kind: 'judgment',
		bar: 'The empty sentence names what will appear here. It is one sentence. A slogan that only says nothing is here fails.',
		proof: ['empty'],
	},
	{
		id: 'hierarchy',
		kind: 'judgment',
		bar: 'On both populated proofs, the screen title is the header. Anything beside it stays smaller than that title. A second title fails.',
		proof: ['populatedDesktop', 'populatedMobile'],
	},
	{
		id: 'visual',
		kind: 'judgment',
		bar: 'The empty proof shows the empty state and no populated content. The loading proof shows the loading state, not the empty sentence and not populated content. The failed proof shows the failed state, not the empty sentence and not populated content. Both populated proofs show the populated content.',
		proof: ['empty', 'loading', 'failed', 'populatedDesktop', 'populatedMobile'],
	},
] as const

type CriterionId = (typeof RUBRIC)[number]['id']
type JudgmentId = Extract<(typeof RUBRIC)[number], { kind: 'judgment' }>['id']
type KindOf<K extends CriterionId> = Extract<(typeof RUBRIC)[number], { id: K }>['kind']

type Cite = { path: string; line: number | null; note: string }
type NonEmpty<T> = readonly [T, ...T[]]

type CellFor<K extends CriterionId> = {
	id: K
	kind: KindOf<K>
	mark: 0 | 1
	because: string
	evidence: NonEmpty<Cite>
}

type ScreenScore = {
	screen: ScreenId
	actor: Actor
	cells: { [K in CriterionId]: CellFor<K> }
}

type Judgment = {
	[K in JudgmentId]: { mark: 0 | 1; because: string }
}

const SCREENS = {
	spruce: {
		proofs: {
			empty: '.audit/proof/spruce-empty.png',
			loading: '.audit/proof/spruce-loading.png',
			failed: '.audit/proof/spruce-failed.png',
			populatedDesktop: '.audit/proof/spruce-populated-desktop.png',
			populatedMobile: '.audit/proof/spruce-populated-mobile.png',
		},
	},
} as const

type ScreenId = keyof typeof SCREENS

type ScoreError =
	| { type: 'unknown-screen'; id: string }
	| { type: 'missing-proof'; slot: ProofSlot; path: string }
	| { type: 'bad-argv' }
	| { type: 'actor-mismatch'; file: string; flag: Actor }
	| { type: 'screen-mismatch'; file: string; flag: string }
	| { type: 'judgment-syntax'; line: number; problem: string }
	| { type: 'missing-judgment'; id: JudgmentId }
	| { type: 'extra-criterion'; id: string }
	| { type: 'kind-mismatch'; id: string }
	| { type: 'screen-mismatch-score'; agent: string; judge: string }
	| { type: 'unreadable'; path: string }

const JUDGMENT_IDS = new Set<string>(RUBRIC.filter((item) => item.kind === 'judgment').map((item) => item.id))
const ALL_IDS = new Set<string>(RUBRIC.map((item) => item.id))

function formatError(error: ScoreError): string {
	switch (error.type) {
		case 'unknown-screen':
			return `experience unknown-screen ${error.id}`
		case 'missing-proof':
			return `experience missing-proof ${error.slot} ${error.path}`
		case 'bad-argv':
			return 'experience bad-argv'
		case 'actor-mismatch':
			return `experience actor-mismatch ${error.file} ${error.flag}`
		case 'screen-mismatch':
			return `experience screen-mismatch ${error.file} ${error.flag}`
		case 'judgment-syntax':
			return `experience judgment-syntax ${error.line} ${error.problem}`
		case 'missing-judgment':
			return `experience missing-judgment ${error.id}`
		case 'extra-criterion':
			return `experience extra-criterion ${error.id}`
		case 'kind-mismatch':
			return `experience kind-mismatch ${error.id}`
		case 'screen-mismatch-score':
			return `experience screen-mismatch-score ${error.agent} ${error.judge}`
		case 'unreadable':
			return `experience unreadable ${error.path}`
	}
}

function fail(error: ScoreError): 2 {
	process.stderr.write(`${formatError(error)}\n`)
	return 2
}

function renderRubric(): string {
	const blocks: string[] = []
	for (const item of RUBRIC) {
		blocks.push(`${item.id} ${item.kind}\n${item.bar}`)
	}
	return `${blocks.join('\n\n')}\n`
}

function splitLines(text: string): string[] {
	const lines = text.split('\n')
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
	return lines
}

function parseJudgment(text: string, screen: ScreenId, actor: Actor): Judgment | ScoreError {
	const lines = splitLines(text)
	if (lines.length === 0) return { type: 'judgment-syntax', line: 1, problem: 'empty file' }
	const heading = /^# (\S+) (\S+)$/.exec(lines[0] ?? '')
	if (heading == null) return { type: 'judgment-syntax', line: 1, problem: 'bad heading' }
	if (heading[1] !== screen) return { type: 'screen-mismatch', file: heading[1] ?? '', flag: screen }
	const fileActor = heading[2] === 'agent' || heading[2] === 'judge' ? heading[2] : null
	if (fileActor == null) return { type: 'judgment-syntax', line: 1, problem: 'bad actor' }
	if (fileActor !== actor) return { type: 'actor-mismatch', file: fileActor, flag: actor }

	const parsed: Partial<Record<JudgmentId, { mark: 0 | 1; because: string }>> = {}
	const seen = new Set<string>()
	let i = 1
	while (i < lines.length) {
		if ((lines[i] ?? '').trim() === '') {
			i += 1
			continue
		}
		const section = /^## (.+)$/.exec(lines[i] ?? '')
		if (section == null) return { type: 'judgment-syntax', line: i + 1, problem: 'bad section' }
		const id = section[1] ?? ''
		i += 1
		if (seen.has(id)) return { type: 'judgment-syntax', line: i, problem: 'repeated id' }
		seen.add(id)
		if (!JUDGMENT_IDS.has(id)) return { type: 'extra-criterion', id }
		let mark: 0 | 1 | null = null
		let because: string | null = null
		while (i < lines.length) {
			const line = lines[i] ?? ''
			if (line.startsWith('## ')) break
			if (line.trim() === '') {
				i += 1
				continue
			}
			if (line.startsWith('evidence:') || line.trim() === 'evidence:' || /^evidence:\s*$/.test(line)) {
				return { type: 'judgment-syntax', line: i + 1, problem: 'evidence block' }
			}
			if (line.startsWith('- ') && i > 0 && (lines[i - 1] ?? '').trim().startsWith('evidence')) {
				return { type: 'judgment-syntax', line: i + 1, problem: 'evidence block' }
			}
			const markMatch = /^mark:\s*([01])$/.exec(line.trim())
			if (markMatch != null) {
				if (mark != null) return { type: 'judgment-syntax', line: i + 1, problem: 'duplicate mark' }
				mark = Number(markMatch[1]) as 0 | 1
				i += 1
				continue
			}
			const becauseMatch = /^because:\s*(.+)$/.exec(line)
			if (becauseMatch != null) {
				if (because != null) return { type: 'judgment-syntax', line: i + 1, problem: 'duplicate because' }
				because = becauseMatch[1] ?? ''
				i += 1
				continue
			}
			return { type: 'judgment-syntax', line: i + 1, problem: 'unexpected line' }
		}
		if (mark == null || because == null) return { type: 'judgment-syntax', line: i, problem: 'incomplete section' }
		parsed[id as JudgmentId] = { mark, because }
	}
	for (const item of RUBRIC) {
		if (item.kind === 'judgment' && parsed[item.id] == null) {
			return { type: 'missing-judgment', id: item.id }
		}
	}
	return parsed as Judgment
}

function proofPath(screen: ScreenId, slot: ProofSlot): string {
	return SCREENS[screen].proofs[slot]
}

function proofCites(screen: ScreenId, slots: readonly ProofSlot[]): Cite[] {
	return slots.map((slot) => ({ path: proofPath(screen, slot), line: null, note: slot }))
}

function renderCite(cite: Cite): string {
	if (cite.line == null) return `evidence ${cite.path} ${cite.note}`
	return `evidence ${cite.path}:${cite.line} ${cite.note}`
}

function renderScore(score: ScreenScore): string {
	const lines: string[] = [`screen ${score.screen}`, `actor ${score.actor}`, '']
	for (const item of RUBRIC) {
		const cell = score.cells[item.id]
		lines.push(`${cell.id} ${cell.kind} ${cell.mark}`)
		lines.push(`because ${cell.because}`)
		for (const cite of cell.evidence) lines.push(renderCite(cite))
		lines.push('')
	}
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
	return `${lines.join('\n')}\n`
}

function parseEvidenceLine(line: string): Cite | null {
	const match = /^evidence (\S+?)(?::(\d+))? (.+)$/.exec(line)
	if (match == null) return null
	const path = match[1] ?? ''
	const lineNo = match[2] == null ? null : Number(match[2])
	const note = match[3] ?? ''
	return { path, line: lineNo, note }
}

function parseScore(text: string): ScreenScore | ScoreError {
	const lines = splitLines(text)
	if (lines.length < 2) return { type: 'judgment-syntax', line: 1, problem: 'short score' }
	const screenMatch = /^screen (\S+)$/.exec(lines[0] ?? '')
	if (screenMatch == null) return { type: 'judgment-syntax', line: 1, problem: 'bad screen' }
	const screen = screenMatch[1] ?? ''
	if (!(screen in SCREENS)) return { type: 'unknown-screen', id: screen }
	const actorMatch = /^actor (agent|judge)$/.exec(lines[1] ?? '')
	if (actorMatch == null) return { type: 'judgment-syntax', line: 2, problem: 'bad actor' }
	const actor = actorMatch[1] as Actor
	const cells: Partial<Record<CriterionId, CellFor<CriterionId>>> = {}
	let i = 2
	while (i < lines.length && (lines[i] ?? '').trim() === '') i += 1
	while (i < lines.length) {
		const head = /^(\S+) (judgment) ([01])$/.exec(lines[i] ?? '')
		if (head == null) return { type: 'judgment-syntax', line: i + 1, problem: 'bad cell' }
		const id = head[1] ?? ''
		const kind = head[2] as 'judgment'
		const mark = Number(head[3]) as 0 | 1
		if (!ALL_IDS.has(id)) return { type: 'extra-criterion', id }
		const rubric = RUBRIC.find((item) => item.id === id)
		if (rubric == null || rubric.kind !== kind) return { type: 'kind-mismatch', id }
		i += 1
		if (i >= lines.length) return { type: 'judgment-syntax', line: i, problem: 'missing because' }
		const becauseLine = lines[i] ?? ''
		if (!becauseLine.startsWith('because ')) return { type: 'judgment-syntax', line: i + 1, problem: 'missing because' }
		const because = becauseLine.slice('because '.length)
		i += 1
		const evidence: Cite[] = []
		while (i < lines.length) {
			const line = lines[i] ?? ''
			if (line.trim() === '') {
				i += 1
				break
			}
			if (/^(\S+) judgment [01]$/.test(line)) break
			if (!line.startsWith('evidence ')) return { type: 'judgment-syntax', line: i + 1, problem: 'bad evidence' }
			const cite = parseEvidenceLine(line)
			if (cite == null) return { type: 'judgment-syntax', line: i + 1, problem: 'bad evidence' }
			evidence.push(cite)
			i += 1
		}
		if (evidence.length === 0) return { type: 'judgment-syntax', line: i, problem: 'no evidence' }
		cells[id as CriterionId] = {
			id: id as CriterionId,
			kind: rubric.kind,
			mark,
			because,
			evidence: evidence as unknown as NonEmpty<Cite>,
		}
	}
	for (const item of RUBRIC) {
		if (cells[item.id] == null) return { type: 'missing-judgment', id: item.id as JudgmentId }
	}
	return { screen: screen as ScreenId, actor, cells: cells as ScreenScore['cells'] }
}

function compareScores(agent: ScreenScore, judge: ScreenScore): string | ScoreError {
	if (agent.screen !== judge.screen) {
		return { type: 'screen-mismatch-score', agent: agent.screen, judge: judge.screen }
	}
	const lines: string[] = []
	for (const item of RUBRIC) {
		const a = agent.cells[item.id].mark
		const b = judge.cells[item.id].mark
		const word = a === b ? 'agree' : 'differ'
		lines.push(`${item.id} ${a} ${b} ${word}`)
	}
	return `${lines.join('\n')}\n`
}

function judgmentEvidence(screen: ScreenId, id: JudgmentId, judgment: Judgment): { mark: 0 | 1; because: string; evidence: NonEmpty<Cite> } | ScoreError {
	const item = RUBRIC.find((row) => row.id === id)
	if (item == null || item.kind !== 'judgment') return { type: 'missing-judgment', id }
	const cites = proofCites(screen, item.proof)
	const head = cites[0]
	if (head == null) return { type: 'missing-judgment', id }
	const entry = judgment[id]
	return { mark: entry.mark, because: entry.because, evidence: [head, ...cites.slice(1)] }
}

function scoreScreen(actor: Actor, screen: ScreenId, judgment: Judgment): ScreenScore | ScoreError {
	const emptyCopy = judgmentEvidence(screen, 'empty-copy', judgment)
	const hierarchy = judgmentEvidence(screen, 'hierarchy', judgment)
	const visual = judgmentEvidence(screen, 'visual', judgment)
	if ('type' in emptyCopy) return emptyCopy
	if ('type' in hierarchy) return hierarchy
	if ('type' in visual) return visual
	return {
		screen,
		actor,
		cells: {
			'empty-copy': { id: 'empty-copy', kind: 'judgment', ...emptyCopy },
			hierarchy: { id: 'hierarchy', kind: 'judgment', ...hierarchy },
			visual: { id: 'visual', kind: 'judgment', ...visual },
		},
	}
}

function verifyProofs(root: string, screen: ScreenId): ScoreError | null {
	for (const slot of Object.keys(SCREENS[screen].proofs) as ProofSlot[]) {
		const path = proofPath(screen, slot)
		if (!existsSync(join(root, path))) return { type: 'missing-proof', slot, path }
	}
	return null
}

function parseScoreArgsFull(argv: readonly string[]): { screen: ScreenId; actor: Actor; judgmentPath: string } | ScoreError {
	if (argv.length !== 6 || argv[0] !== 'score') return { type: 'bad-argv' }
	const screen = argv[1] ?? ''
	if (!(screen in SCREENS)) return { type: 'unknown-screen', id: screen }
	if (argv[2] !== '--actor') return { type: 'bad-argv' }
	const actor = argv[3]
	if (actor !== 'agent' && actor !== 'judge') return { type: 'bad-argv' }
	if (argv[4] !== '--judgment') return { type: 'bad-argv' }
	const judgmentPath = argv[5] ?? ''
	if (judgmentPath === '') return { type: 'bad-argv' }
	return { screen: screen as ScreenId, actor, judgmentPath }
}

function parseCompareArgs(argv: readonly string[]): { agentPath: string; judgePath: string } | ScoreError {
	if (argv.length !== 3 || argv[0] !== 'compare') return { type: 'bad-argv' }
	const agentPath = argv[1] ?? ''
	const judgePath = argv[2] ?? ''
	if (agentPath === '' || judgePath === '') return { type: 'bad-argv' }
	return { agentPath, judgePath }
}

export function experienceCommand(root: string, argv: readonly string[]): 0 | 2 {
	if (argv.length === 1 && argv[0] === 'rubric') {
		process.stdout.write(renderRubric())
		return 0
	}
	if (argv[0] === 'score') {
		const args = parseScoreArgsFull(argv)
		if ('type' in args) return fail(args)
		const missing = verifyProofs(root, args.screen)
		if (missing != null) return fail(missing)
		const judgmentFile = join(root, args.judgmentPath)
		if (!existsSync(judgmentFile)) return fail({ type: 'unreadable', path: args.judgmentPath })
		const judgmentParsed = parseJudgment(readFileSync(judgmentFile, 'utf8'), args.screen, args.actor)
		if ('type' in judgmentParsed) return fail(judgmentParsed)
		const scored = scoreScreen(args.actor, args.screen, judgmentParsed)
		if ('type' in scored) return fail(scored)
		process.stdout.write(renderScore(scored))
		return 0
	}
	if (argv[0] === 'compare') {
		const args = parseCompareArgs(argv)
		if ('type' in args) return fail(args)
		const agentFile = join(root, args.agentPath)
		const judgeFile = join(root, args.judgePath)
		if (!existsSync(agentFile)) return fail({ type: 'unreadable', path: args.agentPath })
		if (!existsSync(judgeFile)) return fail({ type: 'unreadable', path: args.judgePath })
		const agentParsed = parseScore(readFileSync(agentFile, 'utf8'))
		if ('type' in agentParsed) return fail(agentParsed)
		const judgeParsed = parseScore(readFileSync(judgeFile, 'utf8'))
		if ('type' in judgeParsed) return fail(judgeParsed)
		const compared = compareScores(agentParsed, judgeParsed)
		if (typeof compared !== 'string') return fail(compared)
		process.stdout.write(compared)
		return 0
	}
	return fail({ type: 'bad-argv' })
}

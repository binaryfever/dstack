import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
	type BlindKey,
	type CaseId,
	type Codename,
	type FileChecks,
	type ModelId,
	type ScoreResult,
	type SkillHash,
	type SurfaceId,
	type Treatment,
	type TreeFiles,
	CODENAMES,
	HISTORICAL_TREES,
	RECORDED,
	SURFACE_IDS,
	SURFACES,
	assignment,
	builderPrompt,
	exitCode,
	fileChecks,
	formatScore,
	isPlantedSkillPath,
	judgePrompt,
	modelId,
	parseCodename,
	parseJudgeReply,
	plantPostcondition,
	score,
	skillHash,
} from './score.ts'

const repo = join(import.meta.dirname, '../../..')
const RUN_ID = /^[0-9]{8}T[0-9]{4}Z-[0-9a-f]{8}-[0-9a-f]{4}$/
const KEEP_CURSOR = new Set(['.git', 'node_modules'])
const DROP_CURSOR = new Set(['.git', 'node_modules', '.cursor'])

const USAGE = `usage: eval.ts prepare --surface notifications|mentions|all --model <model>
usage: eval.ts blind <run-dir>
usage: eval.ts score <run-dir>
usage: eval.ts score --historical fmc-579|fmc-581
`

type Exit = 0 | 1 | 2

type PlanFile = {
	readonly surface: SurfaceId
	readonly model: ModelId
	readonly plantedHash: SkillHash
	readonly runId: string
}

type KeyFile = {
	readonly key: BlindKey
	readonly skillName: string
	readonly noneName: string
}

type Job = {
	readonly role: 'skill' | 'none'
	readonly codename: string
	readonly model: ModelId
	readonly cwd: string
	readonly prompt: string
}

type JobsFile = {
	readonly surface: SurfaceId
	readonly model: ModelId
	readonly runId: string
	readonly builders: readonly Job[]
}

type AgentRecord = {
	readonly model: ModelId
	readonly agentId: string
}

function stdout(text: string): void {
	process.stdout.write(text)
}

function stderr(text: string): void {
	process.stderr.write(text.endsWith('\n') ? text : `${text}\n`)
}

function usage(): 2 {
	stderr(USAGE)
	return 2
}

function pair(label: string, value: string): string {
	return `${label}  ${value}`
}

function posixRelative(from: string, to: string): string {
	return relative(from, to).split(sep).join('/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as unknown
	} catch {
		return null
	}
}

function writeAtomic(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true })
	const tmp = `${path}.${process.pid}.tmp`
	writeFileSync(tmp, text)
	renameSync(tmp, path)
}

function writeJson(path: string, value: unknown): void {
	writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

function stamp(now: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}Z`
}

function surfaceId(value: string): SurfaceId | null {
	if (value === 'notifications' || value === 'mentions') return value
	return null
}

function parseHash(value: string): SkillHash | null {
	if (!/^[0-9a-f]{64}$/.test(value)) return null
	return value as SkillHash
}

function walk(dir: string, skip: ReadonlySet<string>): { path: string; bytes: string }[] {
	const out: { path: string; bytes: string }[] = []
	const visit = (abs: string, rel: string): void => {
		for (const entry of readdirSync(abs, { withFileTypes: true })) {
			if (skip.has(entry.name)) continue
			const nextRel = rel === '' ? entry.name : `${rel}/${entry.name}`
			const nextAbs = join(abs, entry.name)
			if (entry.isDirectory()) visit(nextAbs, nextRel)
			else if (entry.isFile()) out.push({ path: nextRel, bytes: readFileSync(nextAbs, 'utf8') })
		}
	}
	if (existsSync(dir)) visit(dir, '')
	return out
}

function treeHash(dir: string, skip: ReadonlySet<string>): string {
	const files: { path: string; abs: string }[] = []
	const visit = (abs: string, rel: string): void => {
		for (const entry of readdirSync(abs, { withFileTypes: true })) {
			if (skip.has(entry.name)) continue
			const nextRel = rel === '' ? entry.name : `${rel}/${entry.name}`
			const nextAbs = join(abs, entry.name)
			if (entry.isDirectory()) visit(nextAbs, nextRel)
			else if (entry.isFile()) files.push({ path: nextRel, abs: nextAbs })
		}
	}
	visit(dir, '')
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
	const hash = createHash('sha256')
	for (const file of files) {
		hash.update(file.path, 'utf8')
		hash.update('\0')
		hash.update(readFileSync(file.abs))
		hash.update('\0')
	}
	return hash.digest('hex')
}

function copyTree(src: string, dest: string, skip: ReadonlySet<string>): void {
	rmSync(dest, { recursive: true, force: true })
	mkdirSync(dest, { recursive: true })
	const visit = (abs: string, rel: string): void => {
		for (const entry of readdirSync(abs, { withFileTypes: true })) {
			if (skip.has(entry.name)) continue
			const nextRel = rel === '' ? entry.name : `${rel}/${entry.name}`
			const nextAbs = join(abs, entry.name)
			const target = join(dest, nextRel)
			if (entry.isDirectory()) {
				mkdirSync(target, { recursive: true })
				visit(nextAbs, nextRel)
			} else if (entry.isFile()) {
				mkdirSync(dirname(target), { recursive: true })
				copyFileSync(nextAbs, target)
			}
		}
	}
	visit(src, '')
}

function skillFiles(dir: string): { path: string; bytes: string }[] {
	return walk(dir, KEEP_CURSOR).filter((file) => isPlantedSkillPath(file.path))
}

function codenameAt(index: number): Codename {
	const name = CODENAMES[index]
	const parsed = name == null ? null : parseCodename(name)
	if (parsed == null || !parsed.ok) throw new Error('codename')
	return parsed.codename
}

function pickTwo(): readonly [Codename, Codename] {
	const first = randomInt(0, CODENAMES.length)
	let second = randomInt(0, CODENAMES.length - 1)
	if (second >= first) second += 1
	return [codenameAt(first), codenameAt(second)]
}

function loneFile(text: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'dstack-eval-prompt-'))
	const path = join(dir, 'prompt.md')
	writeFileSync(path, text)
	return path
}

function plantShop(codename: Codename, treatment: Treatment): { ok: true; shop: string } | { ok: false; problem: string } {
	const parent = mkdtempSync(join(tmpdir(), 'dstack-eval-'))
	const shop = join(parent, codename)
	const args = [join(repo, '.audit/plant-shop-skeleton.sh'), shop, codename]
	if (treatment.role === 'skill') args.push('--with-dstack')
	const result = spawnSync('bash', args, { encoding: 'utf8' })
	if (result.status !== 0) return { ok: false, problem: result.stderr.trim() || 'plant failed' }
	const problem = plantPostcondition(treatment, walk(shop, new Set()).map((file) => file.path))
	if (problem != null) return { ok: false, problem }
	return { ok: true, shop }
}

function prepareSurface(surface: SurfaceId, model: ModelId): Exit {
	const repoHash = skillHash(skillFiles(join(repo, 'skills/dstack')))
	const runId = `${stamp(new Date())}-${repoHash.slice(0, 8)}-${randomBytes(2).toString('hex')}`
	const runDir = join(repo, '.audit', 'eval', surface, runId)
	if (existsSync(runDir)) {
		stderr(`run exists ${posixRelative(repo, runDir)}`)
		return 2
	}
	const [left, right] = pickTwo()
	const coin: 0 | 1 = randomInt(0, 2) === 0 ? 0 : 1
	const assigned = assignment(coin, left, right)
	const skillShop = plantShop(assigned.skillName, { role: 'skill' })
	if (!skillShop.ok) {
		stderr(skillShop.problem)
		return 2
	}
	const noneShop = plantShop(assigned.noneName, { role: 'none' })
	if (!noneShop.ok) {
		stderr(noneShop.problem)
		return 2
	}
	const plantedHash = skillHash(skillFiles(join(skillShop.shop, '.cursor/skills/dstack')))
	if (plantedHash !== repoHash) {
		stderr('planted skill hash differs from skills/dstack')
		return 2
	}
	const skillPrompt = builderPrompt(surface, { role: 'skill' })
	if (!skillPrompt.ok) {
		stderr(skillPrompt.problem)
		return 2
	}
	const nonePrompt = builderPrompt(surface, { role: 'none' })
	if (!nonePrompt.ok) {
		stderr(nonePrompt.problem)
		return 2
	}
	mkdirSync(join(runDir, 'meta'), { recursive: true })
	copyFileSync(join(repo, 'skills/dstack/scripts/fixtures/shop/product-rules.md'), join(runDir, 'meta/expected-rules.md'))
	for (const file of skillFiles(join(skillShop.shop, '.cursor/skills/dstack'))) {
		writeAtomic(join(runDir, 'meta/planted-skill', file.path), file.bytes)
	}
	const skillPromptPath = loneFile(skillPrompt.text)
	const nonePromptPath = loneFile(nonePrompt.text)
	writeJson(join(runDir, 'meta/plan.json'), {
		surface,
		model,
		plantedHash,
		runId,
	})
	writeJson(join(runDir, 'meta/key.json'), {
		alpha: assigned.key.alpha,
		beta: assigned.key.beta,
		skillName: assigned.skillName,
		noneName: assigned.noneName,
	})
	writeJson(join(runDir, 'meta/jobs.json'), {
		surface,
		model,
		runId,
		builders: [
			{ role: 'skill', codename: assigned.skillName, model, cwd: skillShop.shop, prompt: skillPromptPath },
			{ role: 'none', codename: assigned.noneName, model, cwd: noneShop.shop, prompt: nonePromptPath },
		],
	})
	const rel = posixRelative(repo, runDir)
	stdout(
		`${[
			pair('surface', surface),
			pair('run', rel),
			pair('model', model),
			pair('skill', plantedHash),
			pair('jobs', `${rel}/meta/jobs.json`),
		].join('\n')}\n`,
	)
	return 0
}

function prepareCommand(argv: readonly string[]): Exit {
	let surfaceText: string | null = null
	let modelText: string | null = null
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? ''
		if (arg === '--surface') {
			surfaceText = argv[i + 1] ?? ''
			i += 1
		} else if (arg === '--model') {
			modelText = argv[i + 1] ?? ''
			i += 1
		} else if (arg.startsWith('--surface=')) surfaceText = arg.slice('--surface='.length)
		else if (arg.startsWith('--model=')) modelText = arg.slice('--model='.length)
		else return usage()
		if (surfaceText === '' || modelText === '') return usage()
	}
	if (surfaceText == null || modelText == null) return usage()
	const parsedModel = modelId(modelText)
	if (!parsedModel.ok) {
		stderr(parsedModel.problem)
		return 2
	}
	const surfaces: SurfaceId[] = []
	if (surfaceText === 'all') surfaces.push(...SURFACE_IDS)
	else {
		const one = surfaceId(surfaceText)
		if (one == null) return usage()
		surfaces.push(one)
	}
	for (const surface of surfaces) {
		const code = prepareSurface(surface, parsedModel.model)
		if (code !== 0) return code
	}
	return 0
}

function parsePlan(value: unknown): PlanFile | null {
	if (!isRecord(value)) return null
	const surface = surfaceId(typeof value.surface === 'string' ? value.surface : '')
	const parsedModel = modelId(typeof value.model === 'string' ? value.model : '')
	const plantedHash = typeof value.plantedHash === 'string' ? parseHash(value.plantedHash) : null
	if (surface == null || !parsedModel.ok || plantedHash == null || typeof value.runId !== 'string') return null
	if (!RUN_ID.test(value.runId)) return null
	return { surface, model: parsedModel.model, plantedHash, runId: value.runId }
}

function parseKey(value: unknown): KeyFile | null {
	if (!isRecord(value)) return null
	const skillName = typeof value.skillName === 'string' ? value.skillName : ''
	const noneName = typeof value.noneName === 'string' ? value.noneName : ''
	if (!parseCodename(skillName).ok || !parseCodename(noneName).ok || skillName === noneName) return null
	if (value.alpha === 'skill' && value.beta === 'none') return { key: { alpha: 'skill', beta: 'none' }, skillName, noneName }
	if (value.alpha === 'none' && value.beta === 'skill') return { key: { alpha: 'none', beta: 'skill' }, skillName, noneName }
	return null
}

function parseJob(value: unknown): Job | null {
	if (!isRecord(value)) return null
	if (value.role !== 'skill' && value.role !== 'none') return null
	if (typeof value.codename !== 'string' || !parseCodename(value.codename).ok) return null
	const parsedModel = modelId(typeof value.model === 'string' ? value.model : '')
	if (!parsedModel.ok) return null
	if (typeof value.cwd !== 'string' || value.cwd === '' || typeof value.prompt !== 'string' || value.prompt === '') return null
	return { role: value.role, codename: value.codename, model: parsedModel.model, cwd: value.cwd, prompt: value.prompt }
}

function parseJobs(value: unknown): JobsFile | null {
	if (!isRecord(value) || !Array.isArray(value.builders)) return null
	const surface = surfaceId(typeof value.surface === 'string' ? value.surface : '')
	const parsedModel = modelId(typeof value.model === 'string' ? value.model : '')
	if (surface == null || !parsedModel.ok || typeof value.runId !== 'string' || !RUN_ID.test(value.runId)) return null
	const builders = value.builders.map(parseJob)
	if (builders.some((job) => job == null)) return null
	const jobs = builders.filter((job): job is Job => job != null)
	if (jobs.length !== 2) return null
	if (!jobs.some((job) => job.role === 'skill') || !jobs.some((job) => job.role === 'none')) return null
	return { surface, model: parsedModel.model, runId: value.runId, builders: jobs }
}

function jobFor(jobs: JobsFile, role: 'skill' | 'none'): Job | null {
	return jobs.builders.find((job) => job.role === role) ?? null
}

function syncTree(scratch: string, dest: string): string | null {
	const scratchOk = existsSync(scratch)
	const destOk = existsSync(dest)
	if (!scratchOk && !destOk) return 'missing scratch and tree'
	if (scratchOk && destOk && treeHash(scratch, KEEP_CURSOR) !== treeHash(dest, KEEP_CURSOR)) return 'scratch and tree differ'
	if (scratchOk && !destOk) copyTree(scratch, dest, KEEP_CURSOR)
	return null
}

function blindCommand(argv: readonly string[]): Exit {
	if (argv.length !== 1 || argv[0] == null || argv[0].startsWith('--')) return usage()
	const runDir = resolve(argv[0])
	const jobs = parseJobs(readJson(join(runDir, 'meta/jobs.json')))
	const key = parseKey(readJson(join(runDir, 'meta/key.json')))
	const plan = parsePlan(readJson(join(runDir, 'meta/plan.json')))
	if (jobs == null || key == null || plan == null) {
		stderr('unreadable run')
		return 2
	}
	const skillJob = jobFor(jobs, 'skill')
	const noneJob = jobFor(jobs, 'none')
	if (skillJob == null || noneJob == null || skillJob.codename !== key.skillName || noneJob.codename !== key.noneName) {
		stderr('key does not match jobs')
		return 2
	}
	const skillProblem = syncTree(skillJob.cwd, join(runDir, 'trees', key.skillName))
	if (skillProblem != null) {
		stderr(skillProblem)
		return 2
	}
	const noneProblem = syncTree(noneJob.cwd, join(runDir, 'trees', key.noneName))
	if (noneProblem != null) {
		stderr(noneProblem)
		return 2
	}
	const alphaName = key.key.alpha === 'skill' ? key.skillName : key.noneName
	const betaName = key.key.beta === 'skill' ? key.skillName : key.noneName
	copyTree(join(runDir, 'trees', alphaName), join(runDir, 'blind/alpha'), DROP_CURSOR)
	copyTree(join(runDir, 'trees', betaName), join(runDir, 'blind/beta'), DROP_CURSOR)
	const judgeDir = join(tmpdir(), 'dstack-eval', plan.runId, 'judge')
	rmSync(judgeDir, { recursive: true, force: true })
	copyTree(join(runDir, 'blind/alpha'), join(judgeDir, 'alpha'), new Set())
	copyTree(join(runDir, 'blind/beta'), join(judgeDir, 'beta'), new Set())
	const prompt = judgePrompt(plan.surface, join(judgeDir, 'alpha'), join(judgeDir, 'beta'))
	writeAtomic(join(judgeDir, 'prompt.md'), prompt)
	writeAtomic(join(runDir, 'meta/judge.md'), prompt)
	stdout(`${pair('judge', judgeDir)}\n`)
	return 0
}

function parseAgent(value: unknown): AgentRecord | null {
	if (!isRecord(value)) return null
	const parsedModel = modelId(typeof value.model === 'string' ? value.model : '')
	if (!parsedModel.ok || typeof value.agentId !== 'string') return null
	return { model: parsedModel.model, agentId: value.agentId }
}

function unreadable(problem: string): Exit {
	stdout(formatScore({ kind: 'unreadable', observes: false, problem }))
	return 2
}

function hasCursorSkills(path: string): boolean {
	const parts = path.split('/')
	for (let i = 0; i < parts.length - 1; i++) {
		if (parts[i] === '.cursor' && parts[i + 1] === 'skills') return true
	}
	return false
}

function isPlantedSkillFile(path: string): boolean {
	return path.split('/').filter((part) => part !== '' && part !== '.').join('/') === '.cursor/skills/dstack/SKILL.md'
}

function plantProblem(skillPaths: readonly string[], nonePaths: readonly string[], copied: SkillHash, planned: SkillHash): string | null {
	if (nonePaths.some(hasCursorSkills)) return 'none tree contains .cursor/skills'
	if (!skillPaths.some(isPlantedSkillFile)) return 'skill tree lacks .cursor/skills/dstack/SKILL.md'
	if ([...skillPaths, ...nonePaths].some((path) => path.split('/').includes('fixtures'))) return 'fixtures path'
	if (copied !== planned) return 'copied skill hash differs from plan.json'
	return null
}

function probe(tree: string, tableBase: string): { exit: 0 | 1 | 2; exactTable: boolean } {
	const exactTable = walk(tree, KEEP_CURSOR).some((file) => file.path.split('/').at(-1) === tableBase)
	const dir = mkdtempSync(join(tmpdir(), 'dstack-eval-probe-'))
	copyTree(tree, dir, KEEP_CURSOR)
	const git = (args: readonly string[]) => spawnSync('git', [...args], { cwd: dir, encoding: 'utf8' })
	if (git(['init']).status !== 0) return { exit: 2, exactTable }
	git(['add', '-A'])
	git(['-c', 'user.email=plant@local', '-c', 'user.name=plant', 'commit', '-m', 'probe'])
	const result = spawnSync('node', ['--experimental-strip-types', join(repo, 'skills/dstack/scripts/dstack.ts'), 'check'], {
		cwd: dir,
		encoding: 'utf8',
	})
	const status = result.status
	const exit: 0 | 1 | 2 = status === 0 || status === 1 || status === 2 ? status : 2
	return { exit, exactTable }
}

function writeVerdict(runDir: string, result: ScoreResult): void {
	writeAtomic(join(runDir, 'verdict.json'), `${JSON.stringify(result, null, 2)}\n`)
	writeAtomic(join(runDir, 'verdict.md'), formatScore(result))
}

function historicalCommand(argv: readonly string[]): Exit {
	const args = argv.filter((arg) => arg !== '--historical')
	if (args.length !== 1) return usage()
	const caseId = args[0]
	if (caseId !== 'fmc-579' && caseId !== 'fmc-581') return usage()
	const id: CaseId = caseId
	const spec = HISTORICAL_TREES[id]
	const expected = readFileSync(join(repo, spec.expectedRules), 'utf8')
	const skillFiles: FileChecks = fileChecks(walk(join(repo, spec.skill), KEEP_CURSOR), SURFACES[spec.surface], expected)
	const noneFiles: FileChecks = fileChecks(walk(join(repo, spec.none), KEEP_CURSOR), SURFACES[spec.surface], expected)
	const result = score({ type: 'historical', caseId: id, recorded: RECORDED[id], skillFiles, noneFiles })
	stdout(formatScore(result))
	return exitCode(result)
}

function scoreRun(runDir: string): Exit {
	const plan = parsePlan(readJson(join(runDir, 'meta/plan.json')))
	const key = parseKey(readJson(join(runDir, 'meta/key.json')))
	const jobs = parseJobs(readJson(join(runDir, 'meta/jobs.json')))
	if (plan == null) return unreadable('bad plan.json')
	if (key == null) return unreadable('bad key.json')
	if (jobs == null) return unreadable('bad jobs.json')
	const skillJob = jobFor(jobs, 'skill')
	const noneJob = jobFor(jobs, 'none')
	if (skillJob == null || noneJob == null || skillJob.codename !== key.skillName || noneJob.codename !== key.noneName) {
		return unreadable('key does not match jobs')
	}
	const buildersPath = join(runDir, 'meta/builders.json')
	const judgePath = join(runDir, 'meta/judge.json')
	const replyPath = join(runDir, 'meta/judge-reply.md')
	const rulesPath = join(runDir, 'meta/expected-rules.md')
	if (!existsSync(buildersPath)) return unreadable('missing builders.json')
	if (!existsSync(judgePath)) return unreadable('missing judge.json')
	if (!existsSync(replyPath)) return unreadable('missing judge reply')
	if (!existsSync(rulesPath)) return unreadable('missing expected rules')
	const buildersJson = readJson(buildersPath)
	const judgeJson = readJson(judgePath)
	if (!isRecord(buildersJson)) return unreadable('bad builders.json')
	const skillAgent = parseAgent(buildersJson.skill)
	const noneAgent = parseAgent(buildersJson.none)
	const judgeAgent = parseAgent(judgeJson)
	if (skillAgent == null || noneAgent == null) return unreadable('bad builders.json')
	if (judgeAgent == null) return unreadable('bad judge.json')
	const reply = parseJudgeReply(readFileSync(replyPath, 'utf8'))
	if (!reply.ok) return unreadable(reply.problem)
	const alphaDir = join(runDir, 'blind/alpha')
	const betaDir = join(runDir, 'blind/beta')
	const skillDir = join(runDir, 'trees', key.skillName)
	const noneDir = join(runDir, 'trees', key.noneName)
	if (!existsSync(alphaDir) || !existsSync(betaDir)) return unreadable('missing blind trees')
	if (!existsSync(skillDir)) return unreadable('missing skill tree')
	if (!existsSync(noneDir)) return unreadable('missing none tree')
	const expected = readFileSync(rulesPath, 'utf8')
	const surface = SURFACES[plan.surface]
	const alphaFiles = fileChecks(walk(alphaDir, new Set()) as TreeFiles, surface, expected)
	const betaFiles = fileChecks(walk(betaDir, new Set()) as TreeFiles, surface, expected)
	const skillPaths = walk(skillDir, KEEP_CURSOR).map((file) => file.path)
	const nonePaths = walk(noneDir, KEEP_CURSOR).map((file) => file.path)
	const copied = skillHash(skillFiles(join(skillDir, '.cursor/skills/dstack')))
	const plant = plantProblem(skillPaths, nonePaths, copied, plan.plantedHash)
	const result = score({
		type: 'run',
		plant,
		surface: plan.surface,
		model: plan.model,
		plantedHash: plan.plantedHash,
		liveHash: skillHash(skillFiles(join(repo, 'skills/dstack'))),
		verdictPath: posixRelative(repo, join(runDir, 'verdict.json')),
		key: key.key,
		builders: { skill: skillAgent, none: noneAgent },
		judge: judgeAgent,
		alphaJudge: reply.alpha,
		betaJudge: reply.beta,
		alphaFiles,
		betaFiles,
		probe: probe(skillDir, surface.tableBase),
	})
	stdout(formatScore(result))
	if (result.kind === 'regression') writeVerdict(runDir, result)
	return exitCode(result)
}

function scoreCommand(argv: readonly string[]): Exit {
	if (argv.includes('--historical')) return historicalCommand(argv)
	if (argv.length !== 1 || argv[0] == null || argv[0].startsWith('--')) return usage()
	return scoreRun(resolve(argv[0]))
}

function main(argv: readonly string[]): Exit {
	const command = argv[0]
	if (command === 'prepare') return prepareCommand(argv.slice(1))
	if (command === 'blind') return blindCommand(argv.slice(1))
	if (command === 'score') return scoreCommand(argv.slice(1))
	return usage()
}

process.exitCode = main(process.argv.slice(2))

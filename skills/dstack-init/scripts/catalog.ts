import { createHash } from 'node:crypto'
import {
	RULES_PATH,
	TABLE_SUFFIX,
	UI_STATES,
	checkScreens,
	checkTable,
	message,
	parseRules,
	parseTable,
	report,
	tablePath,
	type UiState,
} from '../../dstack/scripts/model.ts'

export type Digest = string & { readonly brand: 'Digest' }

export type LoadedTree = {
	rules: { text: string } | null
	sources: readonly { path: string; text: string }[]
	styles: readonly { path: string; text: string }[]
	tables: readonly { path: string; text: string }[]
	dirtyTables: readonly string[]
}

export type Place =
	| { type: 'slot'; state: UiState; word: string; switchIn: string }
	| { type: 'part'; inside: string }
	| { type: 'machine'; switchIn: string }

export type Claim =
	| { type: 'component'; id: string; codeName: string; definedIn: string; definedAt: number; place: Place }
	| { type: 'token'; id: string; codeName: string; value: string; definedIn: string; definedAt: number }
	| { type: 'pattern'; id: string; definedIn: string; definedAt: number; calledFrom: readonly string[] }

export type Omission = {
	symbol: string
	reason: 'folded-into' | 'helper' | 'uncalled' | 'no-machine' | 'unmapped-word'
	detail: string
}

export type Proposal = {
	digest: Digest
	rendered: string
	claims: readonly Claim[]
	omissions: readonly Omission[]
	vocab: readonly { word: string; state: UiState }[]
	sharedValues: readonly { value: string; ids: readonly string[] }[]
	predicted: readonly string[]
	tableNotes: readonly string[]
	dirtyTables: readonly string[]
	disk: 'missing' | 'cite-empty' | 'same-text' | 'other-citeable'
	checkReport: string
}

export type DeriveResult =
	| { type: 'ready'; proposal: Proposal }
	| { type: 'refuse'; reason: 'unreadable' | 'catalog-conflict'; detail: string }

export type Decision =
	| { type: 'show'; proposal: Proposal }
	| { type: 'write'; proposal: Proposal }
	| { type: 'unchanged'; digest: Digest }
	| {
			type: 'refuse'
			reason: 'already-citeable' | 'unreadable' | 'digest-mismatch' | 'catalog-conflict' | 'table-dirty'
			detail: string
	  }

const SOURCE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const RULE_ID = /^[CPT]-[a-z0-9-]+$/
const FIXTURE_PROPOSALS = new Set(['C-empty-inbox', 'C-spinner', 'C-error-banner'])

export function partition(paths: readonly string[]): {
	rules: string | null
	sources: string[]
	styles: string[]
	tables: string[]
	skipped: string[]
} {
	let rules: string | null = null
	const sources: string[] = []
	const styles: string[] = []
	const tables: string[] = []
	const skipped: string[] = []

	for (const path of paths) {
		if (path === RULES_PATH) {
			rules = path
			continue
		}
		if (
			path.startsWith('skills/') ||
			path.startsWith('.audit/') ||
			path.startsWith('node_modules/') ||
			path.endsWith('.tmp')
		) {
			skipped.push(path)
			continue
		}
		if (path.endsWith(TABLE_SUFFIX)) {
			tables.push(path)
			continue
		}
		const base = path.split('/').pop() ?? path
		if (base.endsWith('.d.ts') || /\.(test|spec)\./.test(base)) {
			skipped.push(path)
			continue
		}
		let isSource = false
		for (const ext of SOURCE_EXT) {
			if (base.endsWith(ext)) {
				sources.push(path)
				isSource = true
				break
			}
		}
		if (isSource) continue
		if (base.endsWith('.css')) {
			styles.push(path)
			continue
		}
		skipped.push(path)
	}

	return { rules, sources, styles, tables, skipped }
}

function stateFor(word: string): UiState | null {
	if ((UI_STATES as readonly string[]).includes(word)) return word as UiState
	if (word === 'error') return 'failed'
	if (word === 'success') return 'populated'
	return null
}

function kebab(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
		.toLowerCase()
}

function componentId(codeName: string): string {
	return `C-${kebab(codeName)}`
}

function patternId(codeName: string): string {
	return `P-${kebab(codeName)}`
}

function tokenId(prop: string): string {
	const suffix = prop.startsWith('--') ? prop.slice(2) : prop
	return `T-${suffix}`
}

function digestRender(rendered: string): Digest {
	const hash = createHash('sha256').update(rendered, 'utf8').digest('hex')
	return hash.slice(0, 12) as Digest
}

function stripComments(text: string): string {
	let out = ''
	let i = 0
	while (i < text.length) {
		if (text.startsWith('//', i)) {
			while (i < text.length && text[i] !== '\n') i++
			continue
		}
		if (text.startsWith('/*', i)) {
			i += 2
			while (i < text.length && !text.startsWith('*/', i)) i++
			i += 2
			continue
		}
		out += text[i]
		i++
	}
	return out
}

function pascalCallees(code: string): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const match of code.matchAll(/\b([A-Z][a-zA-Z0-9]*)\s*\(/g)) {
		const name = match[1] ?? ''
		if (seen.has(name)) continue
		seen.add(name)
		out.push(name)
	}
	return out
}

type ExportRow = {
	name: string
	kind: 'pascal' | 'camel'
	path: string
	body: string
	line: number
}

function listExports(path: string, text: string): ExportRow[] {
	const rows: ExportRow[] = []
	const lines = text.split('\n')
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? ''
		const fn = line.match(/^export function (\w+)/)
		if (fn != null) {
			const name = fn[1] ?? ''
			rows.push({
				name,
				kind: /^[A-Z]/.test(name) ? 'pascal' : 'camel',
				path,
				body: extractFunctionBody(text, i),
				line: i + 1,
			})
			continue
		}
		const constExport = line.match(/^export const (\w+)/)
		if (constExport != null) {
			const name = constExport[1] ?? ''
			rows.push({
				name,
				kind: /^[A-Z]/.test(name) ? 'pascal' : 'camel',
				path,
				body: '',
				line: i + 1,
			})
		}
	}
	return rows
}

function extractFunctionBody(text: string, startLine: number): string {
	const lines = text.split('\n')
	let depth = 0
	let started = false
	const parts: string[] = []
	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i] ?? ''
		parts.push(line)
		for (const ch of line) {
			if (ch === '{') {
				depth++
				started = true
			} else if (ch === '}') depth--
		}
		if (started && depth === 0) break
	}
	return parts.join('\n')
}

type Branch = { word: string; state: UiState | null; callees: readonly string[]; code: string }

type SwitchHost = {
	host: string
	path: string
	branches: Branch[]
	fallthrough: readonly string[]
}

function parseSwitchHosts(path: string, text: string, exportNames: ReadonlySet<string>): SwitchHost[] {
	const hosts: SwitchHost[] = []
	for (const name of exportNames) {
		const row = listExports(path, text).find((e) => e.name === name)
		if (row == null || row.body === '') continue
		const { branches, fallthrough } = parseBranches(stripComments(row.body))
		if (branches.length === 0) continue
		const hasMappedSlot = branches.some((b) => b.state != null && b.callees.length > 0)
		if (!hasMappedSlot) continue
		hosts.push({ host: name, path, branches, fallthrough })
	}
	return hosts
}

function extractBalanced(text: string, openBrace: number): string {
	let depth = 0
	for (let i = openBrace; i < text.length; i++) {
		if (text[i] === '{') depth++
		else if (text[i] === '}') {
			depth--
			if (depth === 0) return text.slice(openBrace + 1, i)
		}
	}
	return ''
}

function parseBranches(body: string): { branches: Branch[]; fallthrough: readonly string[] } {
	const branches: Branch[] = []
	let remainder = body
	const ifRe =
		/if\s*\(\s*(?:status|state)\s*===\s*(['"])([a-zA-Z]+)\1\s*\)\s*(?:return\s+([^\n;{]+)|\{([^}]*)\})/g
	let m: RegExpExecArray | null
	while ((m = ifRe.exec(body)) != null) {
		const word = m[2] ?? ''
		const inline = m[3] ?? ''
		const block = m[4] ?? ''
		const code = inline !== '' ? inline : block
		branches.push({
			word,
			state: stateFor(word),
			callees: pascalCallees(code),
			code,
		})
		remainder = remainder.replace(m[0], '')
	}
	const fallthrough = pascalCallees(remainder)
	return { branches, fallthrough }
}

function parseTokens(path: string, text: string): { name: string; value: string; path: string; line: number }[] {
	const tokens: { name: string; value: string; path: string; line: number }[] = []
	const rootMatch = text.match(/:root\s*\{([^}]*)\}/s)
	if (rootMatch == null) return tokens
	const block = rootMatch[1] ?? ''
	const blockStart = text.indexOf(block)
	const prefix = text.slice(0, blockStart)
	const lineBase = prefix.split('\n').length
	const propRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g
	let pm: RegExpExecArray | null
	while ((pm = propRe.exec(block)) != null) {
		const name = pm[1] ?? ''
		const value = (pm[2] ?? '').trim()
		const before = block.slice(0, pm.index)
		const line = lineBase + before.split('\n').length - 1
		tokens.push({ name, value, path, line })
	}
	return tokens
}

function parseVocab(path: string, text: string): { word: string; state: UiState }[] {
	const out: { word: string; state: UiState }[] = []
	const stripped = stripComments(text)
	const re = /(?:status|state)\s*=\s*(['"])([a-zA-Z]+)\1/g
	for (const match of stripped.matchAll(re)) {
		const word = match[2] ?? ''
		const state = stateFor(word)
		if (state != null) out.push({ word, state })
	}
	return out
}

type Inventory = {
	exports: ExportRow[]
	switches: SwitchHost[]
	tokens: { name: string; value: string; path: string; line: number }[]
	vocab: { word: string; state: UiState }[]
	calls: Map<string, Set<string>>
}

function buildCalls(exports: ExportRow[], switches: SwitchHost[]): Map<string, Set<string>> {
	const byName = new Map<string, ExportRow>()
	for (const row of exports) byName.set(row.name, row)

	const calls = new Map<string, Set<string>>()
	const add = (caller: string, callee: string) => {
		let set = calls.get(caller)
		if (set == null) {
			set = new Set()
			calls.set(caller, set)
		}
		set.add(callee)
	}

	for (const row of exports) {
		const stripped = stripComments(row.body)
		for (const match of stripped.matchAll(/\b([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)) {
			const callee = match[1] ?? ''
			add(row.name, callee)
		}
	}
	for (const host of switches) {
		for (const branch of host.branches) {
			for (const callee of branch.callees) add(host.host, callee)
		}
		for (const callee of host.fallthrough) add(host.host, callee)
	}
	return calls
}

function buildInventory(tree: LoadedTree): Inventory {
	const exports: ExportRow[] = []
	const switches: SwitchHost[] = []
	const tokens: { name: string; value: string; path: string; line: number }[] = []
	const vocab: { word: string; state: UiState }[] = []

	for (const file of tree.sources) {
		const fileExports = listExports(file.path, file.text)
		exports.push(...fileExports)
		const exportNames = new Set(fileExports.map((e) => e.name))
		switches.push(...parseSwitchHosts(file.path, file.text, exportNames))
		vocab.push(...parseVocab(file.path, file.text))
	}
	for (const file of tree.styles) {
		tokens.push(...parseTokens(file.path, file.text))
	}

	const exportPaths = new Map<string, string>()
	for (const row of exports) {
		if (row.kind !== 'pascal') continue
		const prev = exportPaths.get(row.name)
		if (prev != null && prev !== row.path) {
			throw new Conflict(`two paths export ${row.name}`)
		}
		exportPaths.set(row.name, row.path)
	}

	return { exports, switches, tokens, vocab, calls: buildCalls(exports, switches) }
}

class Conflict extends Error {
	constructor(message: string) {
		super(message)
	}
}

function claimsFrom(inventory: Inventory): { claims: Claim[]; omissions: Omission[] } {
	const slotByName = new Map<string, { state: UiState; word: string; switchIn: string; path: string; line: number }>()
	const omissions: Omission[] = []

	for (const host of inventory.switches) {
		const covered = new Set<UiState>()
		for (const branch of host.branches) {
			if (branch.state == null) {
				for (const callee of branch.callees) {
					if (/^[A-Z]/.test(callee)) {
						throw new Conflict(`unmapped branch calls ${callee}`)
					}
				}
				omissions.push({ symbol: branch.word, reason: 'unmapped-word', detail: host.host })
				continue
			}
			if (covered.has(branch.state)) {
				throw new Conflict(`two code names for state ${branch.state} in ${host.path}`)
			}
			covered.add(branch.state)
			for (const callee of branch.callees) {
				const row = inventory.exports.find((e) => e.name === callee && e.kind === 'pascal')
				if (row == null) continue
				if (slotByName.has(callee)) {
					throw new Conflict(`duplicate slot for ${callee}`)
				}
				slotByName.set(callee, {
					state: branch.state,
					word: branch.word,
					switchIn: host.host,
					path: row.path,
					line: row.line,
				})
			}
		}
		const uncovered = UI_STATES.filter((s) => !covered.has(s))
		if (host.fallthrough.length > 0) {
			if (uncovered.length === 1) {
				const state = uncovered[0]!
				for (const callee of host.fallthrough) {
					const row = inventory.exports.find((e) => e.name === callee && e.kind === 'pascal')
					if (row == null) continue
					if (slotByName.has(callee)) continue
					slotByName.set(callee, {
						state,
						word: state,
						switchIn: host.host,
						path: row.path,
						line: row.line,
					})
				}
			} else if (uncovered.length > 1) {
				throw new Conflict(`fallthrough with ${uncovered.length} uncovered states`)
			}
		} else if (uncovered.length > 1 && host.branches.length > 0) {
			throw new Conflict(`non-empty fallthrough needed for ${uncovered.length} states`)
		}
	}

	const claims: Claim[] = []
	const componentNames = new Set<string>()

	for (const [name, slot] of slotByName) {
		const id = componentId(name)
		if (!RULE_ID.test(id)) throw new Conflict(`bad id ${id}`)
		claims.push({
			type: 'component',
			id,
			codeName: name,
			definedIn: slot.path,
			definedAt: slot.line,
			place: { type: 'slot', state: slot.state, word: slot.word, switchIn: slot.switchIn },
		})
		componentNames.add(name)
	}

	for (const row of inventory.exports) {
		if (row.kind !== 'pascal' || componentNames.has(row.name)) continue
		const callees = inventory.calls.get(row.name)
		const fileSlots = inventory.exports
			.filter((e) => e.path === row.path && e.kind === 'pascal' && slotByName.has(e.name))
			.map((e) => e.name)
		const callsSlots =
			callees != null && fileSlots.length >= 2 && fileSlots.every((s) => callees.has(s))
		if (callsSlots) {
			const id = componentId(row.name)
			claims.push({
				type: 'component',
				id,
				codeName: row.name,
				definedIn: row.path,
				definedAt: row.line,
				place: { type: 'machine', switchIn: row.name },
			})
			componentNames.add(row.name)
		}
	}

	const callers = new Map<string, string>()
	for (const [caller, callees] of inventory.calls) {
		for (const callee of callees) {
			if (caller === callee) continue
			if (!callers.has(callee)) callers.set(callee, caller)
		}
	}

	for (const row of inventory.exports) {
		if (row.kind !== 'pascal' || componentNames.has(row.name)) continue
		const caller = callers.get(row.name)
		if (caller != null) {
			const id = componentId(row.name)
			claims.push({
				type: 'component',
				id,
				codeName: row.name,
				definedIn: row.path,
				definedAt: row.line,
				place: { type: 'part', inside: caller },
			})
			componentNames.add(row.name)
		} else {
			omissions.push({ symbol: row.name, reason: 'uncalled', detail: row.path })
		}
	}

	const hasMachine = claims.some((c) => c.type === 'component' && c.place.type === 'machine')
	if (!hasMachine) omissions.push({ symbol: '', reason: 'no-machine', detail: '' })

	const camelBodies = new Map<string, Set<string>>()
	for (const row of inventory.exports) {
		if (row.kind !== 'camel') continue
		for (const [caller, callees] of inventory.calls) {
			if (!callees.has(row.name)) continue
			const callerRow = inventory.exports.find((e) => e.name === caller)
			if (callerRow == null || callerRow.kind !== 'pascal') continue
			let set = camelBodies.get(row.name)
			if (set == null) {
				set = new Set()
				camelBodies.set(row.name, set)
			}
			set.add(caller)
		}
	}

	for (const row of inventory.exports) {
		if (row.kind !== 'camel') continue
		const bodies = camelBodies.get(row.name)
		if (bodies != null && bodies.size >= 2) {
			const id = patternId(row.name)
			claims.push({
				type: 'pattern',
				id,
				definedIn: row.path,
				definedAt: row.line,
				calledFrom: [...bodies],
			})
		} else if (bodies != null && bodies.size === 1) {
			const caller = [...bodies][0]!
			omissions.push({ symbol: row.name, reason: 'folded-into', detail: componentId(caller) })
		} else {
			omissions.push({ symbol: row.name, reason: 'helper', detail: row.path })
		}
	}

	const tokenValues = new Map<string, string>()
	for (const token of inventory.tokens) {
		const prev = tokenValues.get(token.name)
		if (prev != null && prev !== token.value) {
			throw new Conflict(`two values for ${token.name}`)
		}
		tokenValues.set(token.name, token.value)
		const id = tokenId(token.name)
		if (!RULE_ID.test(id)) throw new Conflict(`bad token id ${id}`)
		claims.push({
			type: 'token',
			id,
			codeName: token.name,
			value: token.value,
			definedIn: token.path,
			definedAt: token.line,
		})
	}

	return { claims, omissions }
}

function render(claims: readonly Claim[]): string {
	const components = claims.filter((c): c is Claim & { type: 'component' } => c.type === 'component')
	const patterns = claims.filter((c): c is Claim & { type: 'pattern' } => c.type === 'pattern')
	const tokens = claims.filter((c): c is Claim & { type: 'token' } => c.type === 'token')

	const lines: string[] = ['# Product rules', '']

	const slots = UI_STATES.flatMap((state) =>
		components.filter((c) => c.place.type === 'slot' && c.place.state === state),
	)
	const parts = components
		.filter((c) => c.place.type === 'part')
		.sort((a, b) => a.codeName.localeCompare(b.codeName))
	const machines = components
		.filter((c) => c.place.type === 'machine')
		.sort((a, b) => a.codeName.localeCompare(b.codeName))

	const componentBlock: string[] = []
	for (const c of [...slots, ...parts, ...machines]) {
		componentBlock.push(`### ${c.id} \`${c.codeName}\``)
		componentBlock.push(`Seen in ${c.definedIn}.`)
		componentBlock.push('')
	}
	if (componentBlock.length > 0) {
		lines.push('## Components', '')
		lines.push(...componentBlock)
	}

	if (patterns.length > 0) {
		lines.push('## Patterns', '')
		for (const p of [...patterns].sort((a, b) => a.id.localeCompare(b.id))) {
			lines.push(`### ${p.id}`)
			lines.push(`Seen in ${p.definedIn}.`)
			lines.push('')
		}
	}

	if (tokens.length > 0) {
		lines.push('## Tokens', '')
		for (const t of [...tokens].sort((a, b) => a.codeName.localeCompare(b.codeName))) {
			lines.push(`### ${t.id} \`${t.codeName}\``)
			lines.push(`Value: ${t.value}`)
			lines.push(`Seen in ${t.definedIn}.`)
			lines.push('')
		}
	}

	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
	return `${lines.join('\n')}\n`
}

function sharedTokenValues(claims: readonly Claim[]): { value: string; ids: readonly string[] }[] {
	const byValue = new Map<string, string[]>()
	for (const claim of claims) {
		if (claim.type !== 'token') continue
		const list = byValue.get(claim.value) ?? []
		list.push(claim.id)
		byValue.set(claim.value, list)
	}
	const out: { value: string; ids: readonly string[] }[] = []
	for (const [value, ids] of byValue) {
		if (ids.length > 1) out.push({ value, ids })
	}
	return out
}

function classifyDisk(rulesText: string | null, rendered: string): Proposal['disk'] {
	if (rulesText == null) return 'missing'
	const parsed = parseRules(rulesText)
	if (!parsed.ok) return 'missing'
	if (parsed.rules.byId.size === 0) return 'cite-empty'
	if (rulesText === rendered) return 'same-text'
	return 'other-citeable'
}

function buildCheckReport(rendered: string, tree: LoadedTree): string {
	const parsedRules = parseRules(rendered)
	if (!parsedRules.ok) return ''
	const parsed = tree.tables.map((t) => ({ path: tablePath(t.path), text: t.text }))
	const emptyBranch = {
		screenFiles: [] as { path: string; text: string }[],
		changedFiles: [] as { path: string; text: string }[],
		rulesChanged: false,
		tableChanged: false,
	}
	const branches = new Map<string, typeof emptyBranch>()
	for (const t of tree.tables) branches.set(t.path, emptyBranch)

	const value = checkScreens({
		rules: parsedRules.rules,
		rulesPath: RULES_PATH,
		parsed,
		branches,
		target: null,
	})

	const lines = [report(value), '', 'Do not apply fixture proposals C-empty-inbox, C-spinner, or C-error-banner.']
	for (const proposal of value.proposals) {
		for (const diffLine of proposal.diff.split('\n')) {
			const m = diffLine.match(/### (C-[a-z0-9-]+)/)
			if (m != null && FIXTURE_PROPOSALS.has(m[1] ?? '')) {
				lines.push(`(fixture proposal ${m[1]} — do not apply)`)
			}
		}
	}
	return lines.join('\n')
}

export function derive(tree: LoadedTree): DeriveResult {
	if (tree.rules?.text != null) {
		const existing = parseRules(tree.rules.text)
		if (!existing.ok) {
			return { type: 'refuse', reason: 'unreadable', detail: existing.errors.map((e) => e.problem).join('; ') }
		}
	}

	let inventory: Inventory
	try {
		inventory = buildInventory(tree)
	} catch (error) {
		if (error instanceof Conflict) {
			return { type: 'refuse', reason: 'catalog-conflict', detail: error.message }
		}
		throw error
	}

	let claims: Claim[]
	let omissions: Omission[]
	try {
		const built = claimsFrom(inventory)
		claims = built.claims
		omissions = built.omissions
	} catch (error) {
		if (error instanceof Conflict) {
			return { type: 'refuse', reason: 'catalog-conflict', detail: error.message }
		}
		throw error
	}

	const rendered = render(claims)
	const parsed = parseRules(rendered)
	if (!parsed.ok) {
		return { type: 'refuse', reason: 'catalog-conflict', detail: 'render failed parseRules' }
	}

	const tableNotes: string[] = []
	const predicted: string[] = []
	for (const table of tree.tables) {
		const parsedTable = parseTable(tablePath(table.path), table.text)
		for (const finding of parsedTable.findings) {
			tableNotes.push(message(finding))
		}
		const tableFindings = checkTable(parsed.rules, parsedTable.table)
		for (const finding of tableFindings) {
			if (finding.type !== 'parallel-name') {
				return {
					type: 'refuse',
					reason: 'catalog-conflict',
					detail: `checkTable ${finding.type}`,
				}
			}
			predicted.push(message(finding))
		}
	}

	const digest = digestRender(rendered)
	const rulesText = tree.rules?.text ?? null
	const disk = classifyDisk(rulesText, rendered)
	const sharedValues = sharedTokenValues(claims)
	const vocabMap = new Map<string, UiState>()
	for (const v of inventory.vocab) vocabMap.set(v.word, v.state)
	const vocab = [...vocabMap.entries()].map(([word, state]) => ({ word, state }))

	const checkReport = buildCheckReport(rendered, tree)

	return {
		type: 'ready',
		proposal: {
			digest,
			rendered,
			claims,
			omissions,
			vocab,
			sharedValues,
			predicted,
			tableNotes,
			dirtyTables: [...tree.dirtyTables],
			disk,
			checkReport,
		},
	}
}

export function decide(result: DeriveResult, approval: string | null): Decision {
	if (result.type === 'refuse') {
		return { type: 'refuse', reason: result.reason, detail: result.detail }
	}
	const { proposal } = result

	if (proposal.disk === 'same-text') {
		return { type: 'unchanged', digest: proposal.digest }
	}
	if (proposal.disk === 'other-citeable') {
		return { type: 'refuse', reason: 'already-citeable', detail: 'product-rules.md already has rule ids' }
	}

	if (approval == null) {
		return { type: 'show', proposal }
	}

	if (approval !== proposal.digest) {
		return { type: 'refuse', reason: 'digest-mismatch', detail: `expected ${proposal.digest}, got ${approval}` }
	}

	if (proposal.dirtyTables.length > 0) {
		return {
			type: 'refuse',
			reason: 'table-dirty',
			detail: proposal.dirtyTables.join(', '),
		}
	}

	return { type: 'write', proposal }
}

export function formatShow(proposal: Proposal): string {
	const lines: string[] = ['dstack-init show', `digest: ${proposal.digest}`, `disk: ${proposal.disk}`]
	lines.push(
		`tables-dirty: ${proposal.dirtyTables.length === 0 ? 'none' : proposal.dirtyTables.join(', ')}`,
	)
	lines.push(`predicted: ${proposal.predicted.length} parallel-name`)
	if (proposal.sharedValues.length > 0) {
		const shared = proposal.sharedValues
			.map((s) => `${s.value} ${s.ids.join(' ')}`)
			.join('; ')
		lines.push(`shared-values: ${shared}`)
	} else {
		lines.push('shared-values: none')
	}
	if (proposal.vocab.length > 0) {
		const vocab = proposal.vocab.map((v) => `${v.word}→${v.state}`).join(' ')
		lines.push(`vocab: ${vocab}`)
	}

	for (const claim of proposal.claims) {
		if (claim.type === 'component' && claim.place.type === 'slot') {
			lines.push(
				`slot ${claim.place.state}  ${claim.id}  ${claim.codeName}  ${claim.definedIn}:${claim.definedAt}  word ${claim.place.word}`,
			)
		} else if (claim.type === 'component' && claim.place.type === 'part') {
			lines.push(
				`part  ${claim.codeName}  ${claim.id}  ${claim.definedIn}:${claim.definedAt}  inside ${claim.place.inside}`,
			)
		} else if (claim.type === 'component' && claim.place.type === 'machine') {
			lines.push(
				`machine  ${claim.codeName}  ${claim.id}  ${claim.definedIn}:${claim.definedAt}  switch ${claim.place.switchIn}`,
			)
		} else if (claim.type === 'pattern') {
			lines.push(`pattern  ${claim.id}  ${claim.definedIn}:${claim.definedAt}`)
		} else if (claim.type === 'token') {
			lines.push(
				`token  ${claim.id}  ${claim.codeName}  ${claim.value}  ${claim.definedIn}:${claim.definedAt}`,
			)
		}
	}

	for (const omission of proposal.omissions) {
		if (omission.reason === 'no-machine') {
			lines.push('omission no-machine')
		} else {
			lines.push(`omission ${omission.reason}  ${omission.symbol}  ${omission.detail}`)
		}
	}

	lines.push('', `--- begin ${proposal.digest}`, proposal.rendered.trimEnd(), `--- end ${proposal.digest}`, '')
	for (const predicted of proposal.predicted) lines.push(predicted)
	if (proposal.checkReport !== '') {
		lines.push('', '--- check report', proposal.checkReport)
	}
	lines.push('', `Reply \`approve ${proposal.digest}\` to write product-rules.md.`)
	return lines.join('\n')
}

export { FIXTURE_PROPOSALS, RULE_ID }

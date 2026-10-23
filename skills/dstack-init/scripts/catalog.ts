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
	markers: readonly { path: string; text: string }[]
}

export type Place =
	| { type: 'slot'; state: UiState; word: string; switchIn: string }
	| { type: 'part'; inside: string }
	| { type: 'machine'; switchIn: string }
	| { type: 'kit' }

export type Claim =
	| { type: 'component'; id: string; codeName: string; definedIn: string; definedAt: number; place: Place }
	| { type: 'token'; id: string; codeName: string; value: string; definedIn: string; definedAt: number }
	| { type: 'pattern'; id: string; definedIn: string; definedAt: number; calledFrom: readonly string[] }

export type Omission = {
	symbol: string
	reason: 'folded-into' | 'helper' | 'uncalled' | 'no-machine' | 'unmapped-word' | 'shadowed'
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
const DESIGN_PACKAGE_ROOTS = [
	'packages/ui',
	'packages/tokens',
	'packages/components',
	'packages/design-system',
] as const
const MARKER_BASENAMES = new Set(['DESIGN.md', 'design-system.figma.json'])

type ClaimSet = { claims: Claim[]; omissions: Omission[] }

type FigmaSymbols = {
	readonly path: string
	readonly components: readonly { readonly name: string }[]
	readonly patterns: readonly { readonly name: string }[]
	readonly tokens: readonly { readonly name: string; readonly value: string }[]
}

type DesignSystemLocation = {
	readonly roots: readonly string[]
	readonly figma: FigmaSymbols | null
}

function isSkippedPath(path: string): boolean {
	if (
		path.startsWith('skills/') ||
		path.startsWith('.audit/') ||
		path.startsWith('node_modules/') ||
		path.endsWith('.tmp')
	) {
		return true
	}
	const base = path.split('/').pop() ?? path
	if (base.endsWith('.d.ts') || /\.(test|spec)\./.test(base)) return true
	return false
}

function inRoot(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`)
}

export function partition(paths: readonly string[]): {
	rules: string | null
	sources: string[]
	styles: string[]
	tables: string[]
	markers: string[]
	skipped: string[]
} {
	let rules: string | null = null
	const sources: string[] = []
	const styles: string[] = []
	const tables: string[] = []
	const markers: string[] = []
	const skipped: string[] = []

	for (const path of paths) {
		if (path === RULES_PATH) {
			rules = path
			continue
		}
		if (isSkippedPath(path)) {
			skipped.push(path)
			continue
		}
		if (path.endsWith(TABLE_SUFFIX)) {
			tables.push(path)
			continue
		}
		const base = path.split('/').pop() ?? path
		if (MARKER_BASENAMES.has(base)) {
			markers.push(path)
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

	return { rules, sources, styles, tables, markers, skipped }
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
	literal: string | null
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
				literal: null,
			})
			continue
		}
		const constExport = line.match(/^export const (\w+)/)
		if (constExport != null) {
			const name = constExport[1] ?? ''
			const literalMatch = line.match(/^export const (\w+) = (['"])([^'"\n]*)\2/)
			rows.push({
				name,
				kind: /^[A-Z]/.test(name) ? 'pascal' : 'camel',
				path,
				body: '',
				line: i + 1,
				literal: literalMatch?.[3] ?? null,
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

	assertUniquePascal(exports)

	return { exports, switches, tokens, vocab, calls: buildCalls(exports, switches) }
}

function assertUniquePascal(exports: ExportRow[]): void {
	const exportPaths = new Map<string, string>()
	for (const row of exports) {
		if (row.kind !== 'pascal') continue
		const prev = exportPaths.get(row.name)
		if (prev != null && prev !== row.path) {
			throw new Conflict(`two paths export ${row.name}`)
		}
		exportPaths.set(row.name, row.path)
	}
}

function assertOneValue(
	tokens: readonly { name: string; value: string }[],
): void {
	const tokenValues = new Map<string, string>()
	for (const token of tokens) {
		const prev = tokenValues.get(token.name)
		if (prev != null && prev !== token.value) {
			throw new Conflict(`two values for ${token.name}`)
		}
		tokenValues.set(token.name, token.value)
	}
}

function camelPatterns(
	exports: ExportRow[],
	calls: Map<string, Set<string>>,
): { claims: Claim[]; omissions: Omission[] } {
	const claims: Claim[] = []
	const omissions: Omission[] = []
	const camelBodies = new Map<string, Set<string>>()
	for (const row of exports) {
		if (row.kind !== 'camel') continue
		for (const [caller, callees] of calls) {
			if (!callees.has(row.name)) continue
			const callerRow = exports.find((e) => e.name === caller)
			if (callerRow == null || callerRow.kind !== 'pascal') continue
			let set = camelBodies.get(row.name)
			if (set == null) {
				set = new Set()
				camelBodies.set(row.name, set)
			}
			set.add(caller)
		}
	}

	for (const row of exports) {
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
	return { claims, omissions }
}

class Conflict extends Error {
	constructor(message: string) {
		super(message)
	}
}

function claimsFrom(inventory: Inventory, options?: { uncalledAsKit?: boolean }): ClaimSet {
	const uncalledAsKit = options?.uncalledAsKit === true
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
		} else if (uncalledAsKit) {
			const id = componentId(row.name)
			if (!RULE_ID.test(id)) throw new Conflict(`bad id ${id}`)
			claims.push({
				type: 'component',
				id,
				codeName: row.name,
				definedIn: row.path,
				definedAt: row.line,
				place: { type: 'kit' },
			})
			componentNames.add(row.name)
		} else {
			omissions.push({ symbol: row.name, reason: 'uncalled', detail: row.path })
		}
	}

	const hasMachine = claims.some((c) => c.type === 'component' && c.place.type === 'machine')
	if (!hasMachine) omissions.push({ symbol: '', reason: 'no-machine', detail: '' })

	const camel = camelPatterns(inventory.exports, inventory.calls)
	claims.push(...camel.claims)
	omissions.push(...camel.omissions)

	assertOneValue(inventory.tokens)
	for (const token of inventory.tokens) {
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

function shadowDetail(winner: Claim): string {
	return `${winner.id} ${winner.definedIn}`
}

function claimSymbol(claim: Claim): string {
	if (claim.type === 'pattern') return claim.id
	return claim.codeName
}

function mergeClaims(base: ClaimSet, preferred: ClaimSet): ClaimSet {
	if (preferred.claims.length === 0 && preferred.omissions.length === 0) {
		return { claims: [...base.claims], omissions: [...base.omissions] }
	}

	const idMap = new Map<string, Claim>()
	const codeNameMap = new Map<string, Claim>()
	for (const claim of preferred.claims) {
		if (idMap.has(claim.id)) throw new Conflict(`duplicate rule ${claim.id}`)
		idMap.set(claim.id, claim)
		if (claim.type === 'component' || claim.type === 'token') {
			if (codeNameMap.has(claim.codeName)) {
				throw new Conflict(`duplicate code name ${claim.codeName}`)
			}
			codeNameMap.set(claim.codeName, claim)
		}
	}

	const resolveWinner = (claim: Claim): Claim | null => {
		const byId = idMap.get(claim.id) ?? null
		if (claim.type === 'component' || claim.type === 'token') {
			const byCode = codeNameMap.get(claim.codeName) ?? null
			if (byId != null && byCode != null && byId !== byCode) {
				throw new Conflict(`duplicate code name ${claim.codeName}`)
			}
			return byId ?? byCode
		}
		return byId
	}

	const claims: Claim[] = []
	const omissions: Omission[] = []

	for (const claim of base.claims) {
		const winner = resolveWinner(claim)
		if (winner != null) {
			omissions.push({ symbol: claimSymbol(claim), reason: 'shadowed', detail: shadowDetail(winner) })
			continue
		}
		claims.push(claim)
	}

	for (const omission of base.omissions) {
		if (omission.reason === 'no-machine' || omission.reason === 'unmapped-word') {
			omissions.push(omission)
			continue
		}
		let winner: Claim | null = null
		if (omission.reason === 'uncalled') {
			winner = codeNameMap.get(omission.symbol) ?? idMap.get(componentId(omission.symbol)) ?? null
		} else if (omission.reason === 'helper' || omission.reason === 'folded-into') {
			winner =
				codeNameMap.get(omission.symbol) ??
				idMap.get(patternId(omission.symbol)) ??
				idMap.get(`T-${kebab(omission.symbol)}`) ??
				null
		} else if (omission.reason === 'shadowed') {
			omissions.push(omission)
			continue
		}
		if (winner != null) {
			omissions.push({
				symbol: omission.symbol,
				reason: 'shadowed',
				detail: shadowDetail(winner),
			})
			continue
		}
		omissions.push(omission)
	}

	claims.push(...preferred.claims)
	omissions.push(...preferred.omissions)
	return { claims, omissions }
}

function parseDesignFence(text: string): string[] {
	if (/```dstack-design-system/.test(text) && !/```dstack-design-system\n[\s\S]*?```/.test(text)) {
		throw new Conflict('unclosed dstack-design-system fence')
	}
	const fenceRe = /```dstack-design-system\n([\s\S]*?)```/g
	const matches = [...text.matchAll(fenceRe)]
	if (matches.length === 0) return []
	if (matches.length > 1) throw new Conflict('multiple dstack-design-system fences')
	const body = matches[0]?.[1] ?? ''
	const roots: string[] = []
	for (const line of body.split('\n')) {
		const root = line.trim()
		if (root === '') continue
		if (root.startsWith('/') || root.includes('..') || root === '.' || root === '') {
			throw new Conflict('invalid design-system root')
		}
		if (isSkippedPath(root) || root.startsWith('node_modules/')) {
			throw new Conflict('invalid design-system root')
		}
		roots.push(root)
	}
	return roots
}

function validateFenceRoots(roots: readonly string[], tree: LoadedTree): void {
	for (const root of roots) {
		const hasFile =
			tree.sources.some((s) => inRoot(s.path, root)) || tree.styles.some((s) => inRoot(s.path, root))
		if (!hasFile) throw new Conflict('design-system root matches nothing')
	}
}

function parseFigmaArtifact(path: string, text: string): FigmaSymbols {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new Conflict('bad figma artifact')
	}
	if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Conflict('bad figma artifact')
	}
	const obj = parsed as Record<string, unknown>
	if (obj.version !== 1) throw new Conflict('bad figma artifact')

	const readArray = (key: string): unknown[] => {
		const value = obj[key]
		if (value === undefined) return []
		if (!Array.isArray(value)) throw new Conflict('bad figma artifact')
		return value
	}

	const components: { name: string }[] = []
	const seenComponent = new Set<string>()
	for (const entry of readArray('components')) {
		if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Conflict('bad figma artifact')
		}
		const row = entry as Record<string, unknown>
		if (typeof row.name !== 'string' || !/^[A-Z][A-Za-z0-9]*$/.test(row.name)) {
			throw new Conflict('bad figma artifact')
		}
		if (row.node !== undefined && typeof row.node !== 'string') throw new Conflict('bad figma artifact')
		if (seenComponent.has(row.name)) throw new Conflict('bad figma artifact')
		seenComponent.add(row.name)
		components.push({ name: row.name })
	}

	const patterns: { name: string }[] = []
	const seenPattern = new Set<string>()
	for (const entry of readArray('patterns')) {
		if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Conflict('bad figma artifact')
		}
		const row = entry as Record<string, unknown>
		if (typeof row.name !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(row.name)) {
			throw new Conflict('bad figma artifact')
		}
		if (seenPattern.has(row.name)) throw new Conflict('bad figma artifact')
		seenPattern.add(row.name)
		patterns.push({ name: row.name })
	}

	const tokens: { name: string; value: string }[] = []
	const seenToken = new Set<string>()
	for (const entry of readArray('tokens')) {
		if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Conflict('bad figma artifact')
		}
		const row = entry as Record<string, unknown>
		if (
			typeof row.name !== 'string' ||
			!/^--[a-z0-9-]+$/.test(row.name) ||
			typeof row.value !== 'string' ||
			row.value === '' ||
			row.value.includes('\n')
		) {
			throw new Conflict('bad figma artifact')
		}
		const id = tokenId(row.name)
		if (!RULE_ID.test(id)) throw new Conflict('bad figma artifact')
		if (seenToken.has(row.name)) throw new Conflict('bad figma artifact')
		seenToken.add(row.name)
		tokens.push({ name: row.name, value: row.value })
	}

	return { path, components, patterns, tokens }
}

function locateDesignSystem(tree: LoadedTree): DesignSystemLocation {
	const roots = new Set<string>()
	for (const root of DESIGN_PACKAGE_ROOTS) {
		const hasFile =
			tree.sources.some((s) => inRoot(s.path, root)) || tree.styles.some((s) => inRoot(s.path, root))
		if (hasFile) roots.add(root)
	}

	for (const marker of tree.markers) {
		if (marker.path.endsWith('DESIGN.md')) {
			const fenceRoots = parseDesignFence(marker.text)
			validateFenceRoots(fenceRoots, tree)
			for (const r of fenceRoots) roots.add(r)
		}
	}

	let figma: FigmaSymbols | null = null
	for (const marker of tree.markers) {
		if (!marker.path.endsWith('design-system.figma.json')) continue
		figma = parseFigmaArtifact(marker.path, marker.text)
	}

	return { roots: [...roots], figma }
}

function excludeDesignSystemPaths(tree: LoadedTree, roots: readonly string[]): LoadedTree {
	if (roots.length === 0) return tree
	const inAnyRoot = (path: string) => roots.some((r) => inRoot(path, r))
	const sources = tree.sources.filter((s) => !inAnyRoot(s.path))
	const styles = tree.styles.filter((s) => !inAnyRoot(s.path))
	if (sources.length === tree.sources.length && styles.length === tree.styles.length) return tree
	return { ...tree, sources, styles }
}

function underTokensRoot(filePath: string, roots: readonly string[]): boolean {
	for (const root of roots) {
		if (!inRoot(filePath, root)) continue
		const last = root.split('/').pop() ?? root
		if (last === 'tokens') return true
	}
	return false
}

function isJsTokenExport(row: ExportRow, roots: readonly string[]): boolean {
	return (
		row.kind === 'camel' &&
		row.literal != null &&
		underTokensRoot(row.path, roots)
	)
}

function jsTokenClaims(rows: ExportRow[]): ClaimSet {
	const claims: Claim[] = []
	for (const row of rows) {
		if (row.literal == null) continue
		const id = `T-${kebab(row.name)}`
		if (!RULE_ID.test(id)) throw new Conflict(`bad token id ${id}`)
		claims.push({
			type: 'token',
			id,
			codeName: row.name,
			value: row.literal,
			definedIn: row.path,
			definedAt: row.line,
		})
	}
	return { claims, omissions: [] }
}

function cssTokenClaims(
	styles: readonly { path: string; text: string }[],
): ClaimSet {
	const parsed: { name: string; value: string; path: string; line: number }[] = []
	for (const file of styles) {
		parsed.push(...parseTokens(file.path, file.text))
	}
	assertOneValue(parsed)
	const seen = new Set<string>()
	const claims: Claim[] = []
	for (const token of parsed) {
		if (seen.has(token.name)) continue
		seen.add(token.name)
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
	return { claims, omissions: [] }
}

function assertTokenClaimAgreement(a: ClaimSet, b: ClaimSet): void {
	const byId = new Map<string, Claim>()
	for (const claim of [...a.claims, ...b.claims]) {
		if (claim.type !== 'token') continue
		const prev = byId.get(claim.id)
		if (prev != null && prev.type === 'token' && prev.value !== claim.value) {
			throw new Conflict(`two values for ${claim.codeName}`)
		}
		byId.set(claim.id, claim)
	}
}

function figmaClaimSet(figma: FigmaSymbols | null): ClaimSet {
	if (figma == null) return { claims: [], omissions: [] }
	const claims: Claim[] = []
	let index = 0
	const bump = () => {
		index++
		return index
	}
	for (const row of figma.components) {
		const id = componentId(row.name)
		if (!RULE_ID.test(id)) throw new Conflict(`bad id ${id}`)
		claims.push({
			type: 'component',
			id,
			codeName: row.name,
			definedIn: figma.path,
			definedAt: bump(),
			place: { type: 'kit' },
		})
	}
	for (const row of figma.patterns) {
		const id = patternId(row.name)
		claims.push({
			type: 'pattern',
			id,
			definedIn: figma.path,
			definedAt: bump(),
			calledFrom: [],
		})
	}
	for (const row of figma.tokens) {
		const id = tokenId(row.name)
		claims.push({
			type: 'token',
			id,
			codeName: row.name,
			value: row.value,
			definedIn: figma.path,
			definedAt: bump(),
		})
	}
	return { claims, omissions: [] }
}

function buildKitInventory(tree: LoadedTree, codeExports: ExportRow[]): Inventory {
	const switches: SwitchHost[] = []
	const vocab: { word: string; state: UiState }[] = []
	const sourcesByPath = new Map(tree.sources.map((s) => [s.path, s]))
	const paths = new Set(codeExports.map((e) => e.path))
	for (const path of paths) {
		const file = sourcesByPath.get(path)
		if (file == null) continue
		const exportNames = new Set(codeExports.filter((e) => e.path === path).map((e) => e.name))
		switches.push(...parseSwitchHosts(path, file.text, exportNames))
		vocab.push(...parseVocab(path, file.text))
	}

	assertUniquePascal(codeExports)
	return {
		exports: codeExports,
		switches,
		tokens: [],
		vocab,
		calls: buildCalls(codeExports, switches),
	}
}

function claimsFromDesignSystem(tree: LoadedTree, located: DesignSystemLocation): ClaimSet {
	if (located.roots.length === 0 && located.figma == null) {
		return { claims: [], omissions: [] }
	}

	const roots = located.roots
	const kitSources = tree.sources.filter((s) => roots.some((r) => inRoot(s.path, r)))
	const kitStyles = tree.styles.filter((s) => roots.some((r) => inRoot(s.path, r)))

	const allExports: ExportRow[] = []
	for (const file of kitSources) {
		allExports.push(...listExports(file.path, file.text))
	}

	const tokenRows = allExports.filter((row) => isJsTokenExport(row, roots))
	const tokenRowSet = new Set(tokenRows)
	const codeExports = allExports.filter((row) => !tokenRowSet.has(row))

	const inventory = buildKitInventory(tree, codeExports)
	const codeSet = claimsFrom(inventory, { uncalledAsKit: true })

	const jsTokens = jsTokenClaims(tokenRows)
	const cssTokens = cssTokenClaims(kitStyles)
	assertTokenClaimAgreement(jsTokens, cssTokens)
	const mergedTokens = mergeClaims(jsTokens, cssTokens)

	const packageClaims: ClaimSet = {
		claims: [...codeSet.claims, ...mergedTokens.claims],
		omissions: codeSet.omissions,
	}

	return mergeClaims(figmaClaimSet(located.figma), packageClaims)
}

function render(claims: readonly Claim[]): string {
	const components = claims.filter((c): c is Claim & { type: 'component' } => c.type === 'component')
	const patterns = claims.filter((c): c is Claim & { type: 'pattern' } => c.type === 'pattern')
	const tokens = claims.filter((c): c is Claim & { type: 'token' } => c.type === 'token')

	const lines: string[] = ['# Product rules', '']

	const slots = UI_STATES.flatMap((state) =>
		components.filter((c) => c.place.type === 'slot' && c.place.state === state),
	)
	const partsAndKit = components
		.filter((c) => c.place.type === 'part' || c.place.type === 'kit')
		.sort((a, b) => a.codeName.localeCompare(b.codeName))
	const machines = components
		.filter((c) => c.place.type === 'machine')
		.sort((a, b) => a.codeName.localeCompare(b.codeName))

	const componentBlock: string[] = []
	for (const c of [...slots, ...partsAndKit, ...machines]) {
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
	if (rulesText === rendered) return 'same-text'
	if (parsed.rules.byId.size === 0) return 'cite-empty'
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

	return report(value)
}

export function derive(tree: LoadedTree): DeriveResult {
	if (tree.rules?.text != null) {
		const existing = parseRules(tree.rules.text)
		if (!existing.ok) {
			return { type: 'refuse', reason: 'unreadable', detail: existing.errors.map((e) => e.problem).join('; ') }
		}
	}

	let located: DesignSystemLocation
	let productTree: LoadedTree
	let inventory: Inventory
	let merged: ClaimSet
	try {
		located = locateDesignSystem(tree)
		productTree = excludeDesignSystemPaths(tree, located.roots)
		inventory = buildInventory(productTree)
		const product = claimsFrom(inventory)
		const designSystem = claimsFromDesignSystem(tree, located)
		merged = mergeClaims(product, designSystem)
	} catch (error) {
		if (error instanceof Conflict) {
			return { type: 'refuse', reason: 'catalog-conflict', detail: error.message }
		}
		throw error
	}

	const claims = merged.claims
	const omissions = merged.omissions

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
		} else if (claim.type === 'component' && claim.place.type === 'kit') {
			lines.push(`kit  ${claim.codeName}  ${claim.id}  ${claim.definedIn}:${claim.definedAt}`)
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

export { RULE_ID }

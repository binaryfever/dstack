import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseRules, RULES_PATH } from '../../dstack/scripts/model.ts'
import { decide, derive, partition, type LoadedTree } from './catalog.ts'
import { loadTree } from './init.ts'

test('partition skips audit and skills, classifies product paths', () => {
	const paths = [
		RULES_PATH,
		'.audit/builds/willow/src/components/AsyncList.js',
		'skills/dstack/scripts/fixtures/shop/product-rules.md',
		'src/board/Board.js',
		'src/board/board.css',
		'src/board/Board.states.md',
		'src/board/Board.test.js',
	]
	const parts = partition(paths)
	assert.equal(parts.rules, RULES_PATH)
	assert.deepEqual(parts.sources, ['src/board/Board.js'])
	assert.deepEqual(parts.styles, ['src/board/board.css'])
	assert.deepEqual(parts.tables, ['src/board/Board.states.md'])
	assert.ok(parts.skipped.some((p) => p.includes('.audit/')))
	assert.ok(parts.skipped.some((p) => p.startsWith('skills/')))
	assert.ok(parts.skipped.some((p) => p.includes('.test.js')))
})

test('inline error switch yields failed slot without Covers lines', () => {
	const source = `export function Empty() {}
export function Loading() {}
export function SlotError() {}
export function Row() {}
export function renderBoard(status) {
  if (status === 'empty') return Empty()
  if (status === 'loading') return Loading()
  if (status === 'error') return SlotError()
  return Row()
}
`
	const tree: LoadedTree = {
		rules: null,
		sources: [{ path: 'src/x/List.js', text: source }],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [],
	}
	const result = derive(tree)
	assert.equal(result.type, 'ready')
	if (result.type !== 'ready') return
	const slot = result.proposal.claims.find(
		(c) => c.type === 'component' && c.place.type === 'slot' && c.place.state === 'failed',
	)
	assert.ok(slot)
	assert.equal(slot?.id, 'C-slot-error')
	assert.ok(!result.proposal.rendered.includes('Covers:'))
	assert.ok(parseRules(result.proposal.rendered).ok)
})

test('catalog-conflict when two slot callees share one state', () => {
	const source = `export function A() {}
export function B() {}
export function renderBoard(status) {
  if (status === 'empty') return A()
  if (status === 'loading') return B()
}
`
	const tree: LoadedTree = {
		rules: null,
		sources: [{ path: 'src/x/List.js', text: source }],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [],
	}
	const result = derive(tree)
	assert.equal(result.type, 'refuse')
})

test('decide gates cite-empty, already-citeable, digest mismatch, table-dirty', () => {
	const stub = readFileSync(join(process.cwd(), RULES_PATH), 'utf8')
	const live = derive(loadTree(process.cwd()))
	assert.equal(live.type, 'ready')
	if (live.type !== 'ready') return

	assert.equal(decide(live, null).type, 'show')

	const citeable: LoadedTree = {
		...loadTree(process.cwd()),
		rules: { text: '### C-avatar `Avatar`\nSeen in x.\n' },
	}
	const citeableResult = derive(citeable)
	assert.equal(decide(citeableResult, null).type, 'refuse')

	const same: LoadedTree = {
		...loadTree(process.cwd()),
		rules: { text: live.proposal.rendered },
	}
	const sameResult = derive(same)
	assert.equal(decide(sameResult, live.proposal.digest).type, 'unchanged')

	assert.equal(decide(live, 'deadbeef0000').type, 'refuse')

	const dirty: LoadedTree = {
		...loadTree(process.cwd()),
		dirtyTables: ['src/board/Board.states.md'],
	}
	const dirtyResult = derive(dirty)
	assert.equal(decide(dirtyResult, dirtyResult.type === 'ready' ? dirtyResult.proposal.digest : '').type, 'refuse')
})

test('live tree stays an empty catalog with no notification screen', () => {
	const first = derive(loadTree(process.cwd()))
	const second = derive(loadTree(process.cwd()))
	assert.equal(first.type, 'ready')
	assert.equal(second.type, 'ready')
	if (first.type !== 'ready' || second.type !== 'ready') return

	assert.equal(first.proposal.digest, second.proposal.digest)
	assert.equal(first.proposal.predicted.length, 0)
	assert.ok(!first.proposal.rendered.includes('Covers:'))
	assert.ok(!first.proposal.rendered.includes('AsyncList'))
	assert.doesNotMatch(first.proposal.rendered, /notification/i)
	assert.doesNotMatch(first.proposal.rendered, /unread/i)
	const names = first.proposal.claims.filter((c) => c.type === 'component').map((c) => c.codeName)
	assert.deepEqual(names, [])
})

test('partition puts DESIGN.md in markers and audit DESIGN.md in skipped', () => {
	const paths = ['DESIGN.md', '.audit/builds/willow/DESIGN.md', 'design-system.figma.json']
	const parts = partition(paths)
	assert.deepEqual(parts.markers, ['DESIGN.md', 'design-system.figma.json'])
	assert.ok(parts.skipped.some((p) => p.includes('.audit/') && p.endsWith('DESIGN.md')))
})

test('prose DESIGN.md without fence adds no design-system claims', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [{ path: 'src/App.tsx', text: 'export function App() {}\n' }],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [
			{
				path: 'DESIGN.md',
				text: '# Acme\n\n### C-fake `Fake`\n\nNot a catalog.\n',
			},
		],
	}
	const baseline: LoadedTree = { ...tree, markers: [] }
	const base = derive(baseline)
	const withMarker = derive(tree)
	assert.equal(base.type, 'ready')
	assert.equal(withMarker.type, 'ready')
	if (base.type !== 'ready' || withMarker.type !== 'ready') return
	assert.equal(base.proposal.digest, withMarker.proposal.digest)
})

test('packages/ui uncalled export becomes kit claim', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [{ path: 'packages/ui/AsyncList.tsx', text: 'export function AsyncList() { return null }\n' }],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [],
	}
	const result = derive(tree)
	assert.equal(result.type, 'ready')
	if (result.type !== 'ready') return
	const kit = result.proposal.claims.find(
		(c) => c.type === 'component' && c.place.type === 'kit' && c.codeName === 'AsyncList',
	)
	assert.ok(kit)
	assert.equal(kit?.id, 'C-async-list')
	assert.ok(result.proposal.rendered.includes('packages/ui/AsyncList.tsx'))
})

test('kit wins over product on name collision with shadowed omission', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [
			{
				path: 'src/list/List.tsx',
				text: 'export function Row() {}\nexport function AsyncList() { return Row() }\n',
			},
			{ path: 'packages/ui/AsyncList.tsx', text: 'export function AsyncList() { return null }\n' },
		],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [],
	}
	const result = derive(tree)
	assert.equal(result.type, 'ready')
	if (result.type !== 'ready') return
	const asyncClaims = result.proposal.claims.filter(
		(c) => c.type === 'component' && c.codeName === 'AsyncList',
	)
	assert.equal(asyncClaims.length, 1)
	assert.equal(asyncClaims[0]?.definedIn, 'packages/ui/AsyncList.tsx')
	assert.ok(
		result.proposal.omissions.some(
			(o) => o.reason === 'shadowed' && o.symbol === 'AsyncList' && o.detail.includes('C-async-list'),
		),
	)
	assert.ok(result.proposal.rendered.includes('Seen in packages/ui/AsyncList.tsx'))
})

test('packages/tokens css emits token with custom property code name', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [],
		styles: [{ path: 'packages/tokens/tokens.css', text: ':root { --color-primary: #1A73E8; }\n' }],
		tables: [],
		dirtyTables: [],
		markers: [],
	}
	const result = derive(tree)
	assert.equal(result.type, 'ready')
	if (result.type !== 'ready') return
	const token = result.proposal.claims.find((c): c is Extract<typeof c, { type: 'token' }> => c.type === 'token' && c.id === 'T-color-primary')
	assert.ok(token)
	assert.equal(token.codeName, '--color-primary')
})

test('bad figma artifact refuses', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [{ path: 'design-system.figma.json', text: '{}' }],
	}
	const result = derive(tree)
	assert.equal(result.type, 'refuse')
	if (result.type === 'refuse') assert.match(result.detail, /figma/i)
})

test('fence root enables design-system scan', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [{ path: 'packages/shop-ui/Button.tsx', text: 'export function Button() {}\n' }],
		styles: [],
		tables: [],
		dirtyTables: [],
		markers: [
			{
				path: 'DESIGN.md',
				text: '```dstack-design-system\npackages/shop-ui\n```\n',
			},
		],
	}
	const result = derive(tree)
	assert.equal(result.type, 'ready')
	if (result.type !== 'ready') return
	assert.ok(result.proposal.claims.some((c) => c.type === 'component' && c.codeName === 'Button'))
})

test('disagreeing token values in kit css refuses', () => {
	const tree: LoadedTree = {
		rules: null,
		sources: [],
		styles: [
			{
				path: 'packages/tokens/a.css',
				text: ':root { --color-primary: #111; }\n',
			},
			{
				path: 'packages/tokens/b.css',
				text: ':root { --color-primary: #222; }\n',
			},
		],
		tables: [],
		dirtyTables: [],
		markers: [],
	}
	const result = derive(tree)
	assert.equal(result.type, 'refuse')
})

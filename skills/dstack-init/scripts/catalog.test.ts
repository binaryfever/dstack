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

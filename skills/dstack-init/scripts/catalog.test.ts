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
		'src/notifications/NotificationList.js',
		'src/notifications/notifications.css',
		'src/notifications/NotificationList.states.md',
		'src/notifications/NotificationList.test.js',
	]
	const parts = partition(paths)
	assert.equal(parts.rules, RULES_PATH)
	assert.deepEqual(parts.sources, ['src/notifications/NotificationList.js'])
	assert.deepEqual(parts.styles, ['src/notifications/notifications.css'])
	assert.deepEqual(parts.tables, ['src/notifications/NotificationList.states.md'])
	assert.ok(parts.skipped.some((p) => p.includes('.audit/')))
	assert.ok(parts.skipped.some((p) => p.startsWith('skills/')))
	assert.ok(parts.skipped.some((p) => p.includes('.test.js')))
})

test('inline error switch yields failed slot without Covers lines', () => {
	const source = `export function Empty() {}
export function Loading() {}
export function NotificationError() {}
export function Row() {}
export function renderNotificationList(status) {
  if (status === 'empty') return Empty()
  if (status === 'loading') return Loading()
  if (status === 'error') return NotificationError()
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
	assert.equal(slot?.id, 'C-notification-error')
	assert.ok(!result.proposal.rendered.includes('Covers:'))
	assert.ok(parseRules(result.proposal.rendered).ok)
})

test('catalog-conflict when two slot callees share one state', () => {
	const source = `export function A() {}
export function B() {}
export function renderNotificationList(status) {
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
		dirtyTables: ['src/notifications/NotificationList.states.md'],
	}
	const dirtyResult = derive(dirty)
	assert.equal(decide(dirtyResult, dirtyResult.type === 'ready' ? dirtyResult.proposal.digest : '').type, 'refuse')
})

test('live tree: stable digest, parallel-name predictions, no Covers, no AsyncList', () => {
	const first = derive(loadTree(process.cwd()))
	const second = derive(loadTree(process.cwd()))
	assert.equal(first.type, 'ready')
	assert.equal(second.type, 'ready')
	if (first.type !== 'ready' || second.type !== 'ready') return

	assert.equal(first.proposal.digest, second.proposal.digest)
	assert.equal(first.proposal.predicted.length, 10)
	assert.ok(!first.proposal.rendered.includes('Covers:'))
	assert.ok(!first.proposal.rendered.includes('AsyncList'))

	const names = first.proposal.claims
		.filter((c) => c.type === 'component')
		.map((c) => c.codeName)
	assert.ok(names.includes('EmptyNotifications'))
	assert.ok(names.includes('NotificationRow'))
	assert.ok(names.includes('UnreadBadge'))

	const listJs = readFileSync(join(process.cwd(), 'src/notifications/NotificationList.js'), 'utf8')
	for (const name of names) assert.ok(listJs.includes(name))

	const css = readFileSync(join(process.cwd(), 'src/notifications/notifications.css'), 'utf8')
	for (const claim of first.proposal.claims) {
		if (claim.type !== 'token') continue
		assert.ok(css.includes(claim.codeName))
	}
})

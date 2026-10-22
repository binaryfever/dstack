import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const root = join(import.meta.dirname, '../../..')
const script = join(root, 'skills/dstack/scripts/dstack.ts')

function shopTwoRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), 'dstack-gate-'))
	mkdirSync(join(dir, 'src/notifications'), { recursive: true })
	mkdirSync(join(dir, 'src/mentions'), { recursive: true })
	cpSync(join(import.meta.dirname, 'fixtures/shop/product-rules.md'), join(dir, 'product-rules.md'))
	cpSync(
		join(import.meta.dirname, 'fixtures/shop-two/src/notifications/NotificationList.states.md'),
		join(dir, 'src/notifications/NotificationList.states.md'),
	)
	cpSync(
		join(import.meta.dirname, 'fixtures/shop-two/src/mentions/MentionsList.states.md'),
		join(dir, 'src/mentions/MentionsList.states.md'),
	)
	spawnSync('git', ['init'], { cwd: dir })
	spawnSync('git', ['add', '.'], { cwd: dir })
	const committed = spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=dstack', 'commit', '-m', 'shop'], {
		cwd: dir,
		encoding: 'utf8',
	})
	assert.equal(committed.status, 0)
	return dir
}

function gitDir(repo: string): string {
	const out = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: repo, encoding: 'utf8' })
	assert.equal(out.status, 0)
	const trimmed = out.stdout.trim()
	return trimmed.startsWith('/') ? trimmed : join(repo, trimmed)
}

function gateRecordPath(repo: string, key: string): string {
	return join(gitDir(repo), 'dstack-gates', `${encodeURIComponent(key)}.json`)
}

function run(repo: string, args: string[]) {
	return spawnSync('node', ['--experimental-strip-types', script, ...args], { cwd: repo, encoding: 'utf8' })
}

function hashFromPacket(stdout: string): string {
	const line = stdout.split('\n').find((row) => row.startsWith('hash  '))
	assert.ok(line)
	return line.slice('hash  '.length).trim()
}

test('gate show on two-screen uncovered prints packet and leaves rules alone', () => {
	const repo = shopTwoRepo()
	const rulesBefore = readFileSync(join(repo, 'product-rules.md'), 'utf8')
	const show = run(repo, ['gate', 'uncovered', 'list.failed'])
	assert.equal(show.status, 3)
	assert.match(show.stdout, /src\/notifications\/NotificationList\.states\.md/)
	assert.match(show.stdout, /src\/mentions\/MentionsList\.states\.md/)
	assert.match(show.stdout, /Covers: detail\.failed, list\.failed/)
	assert.equal(readFileSync(join(repo, 'product-rules.md'), 'utf8'), rulesBefore)
	assert.equal(existsSync(gateRecordPath(repo, 'uncovered list.failed')), false)
})

test('gate panel record, idempotent panel, and bound refusal', () => {
	const repo = shopTwoRepo()
	const show = run(repo, ['gate', 'uncovered', 'list.failed'])
	assert.equal(show.status, 3)
	const hash = hashFromPacket(show.stdout)
	const panelPath = join(repo, 'panel.json')
	writeFileSync(
		panelPath,
		JSON.stringify({
			reviewers: ['grok-4.7-high'],
			marks: { fit: 'pass', collision: 'fail', size: 'pass' },
			because: 'First because line.',
		}),
		'utf8',
	)
	const panel = run(repo, ['gate', 'uncovered', 'list.failed', '--panel', panelPath, '--hash', hash])
	assert.equal(panel.status, 0)
	assert.match(panel.stdout, /because  First because line\./)
	const recordBytes = readFileSync(gateRecordPath(repo, 'uncovered list.failed'), 'utf8')

	const again = run(repo, ['gate', 'uncovered', 'list.failed'])
	assert.equal(again.status, 0)
	assert.match(again.stdout, /because  First because line\./)

	const samePanel = run(repo, ['gate', 'uncovered', 'list.failed', '--panel', panelPath, '--hash', hash])
	assert.equal(samePanel.status, 0)
	assert.equal(readFileSync(gateRecordPath(repo, 'uncovered list.failed'), 'utf8'), recordBytes)

	writeFileSync(
		panelPath,
		JSON.stringify({
			reviewers: ['grok-4.7-high'],
			marks: { fit: 'fail', collision: 'pass', size: 'pass' },
			because: 'Different because.',
		}),
		'utf8',
	)
	const different = run(repo, ['gate', 'uncovered', 'list.failed', '--panel', panelPath, '--hash', hash])
	assert.equal(different.status, 2)
	assert.match(different.stderr, /gate already bound/)
	assert.match(different.stdout, /because  First because line\./)
	assert.equal(readFileSync(gateRecordPath(repo, 'uncovered list.failed'), 'utf8'), recordBytes)
})

test('gate skip, cross-kind refusal, and blank skip', () => {
	const repo = shopTwoRepo()
	const openSkip = run(repo, ['gate', 'unlisted', 'NotificationRow'])
	assert.equal(openSkip.status, 3)
	const skipHash = hashFromPacket(openSkip.stdout)
	const skip = run(repo, ['gate', 'unlisted', 'NotificationRow', '--skip', 'Human reason here.'])
	assert.equal(skip.status, 0)
	assert.match(skip.stdout, /panel  skipped/)

	const panelPath = join(repo, 'panel.json')
	writeFileSync(
		panelPath,
		JSON.stringify({
			reviewers: ['grok-4.7-high'],
			marks: { fit: 'pass', collision: 'pass', size: 'pass' },
			because: 'After a skip.',
		}),
		'utf8',
	)
	const verdictAttempt = run(repo, ['gate', 'unlisted', 'NotificationRow', '--panel', panelPath, '--hash', skipHash])
	assert.equal(verdictAttempt.status, 2)
	assert.match(verdictAttempt.stderr, /gate already bound/)
	assert.match(run(repo, ['gate', 'unlisted', 'NotificationRow']).stdout, /panel  skipped/)

	const repo2 = shopTwoRepo()
	const show = run(repo2, ['gate', 'uncovered', 'list.failed'])
	const hash = hashFromPacket(show.stdout)
	const secondPanel = join(repo2, 'panel.json')
	writeFileSync(
		secondPanel,
		JSON.stringify({
			reviewers: ['grok-4.7-high'],
			marks: { fit: 'pass', collision: 'pass', size: 'pass' },
			because: 'Clear.',
		}),
		'utf8',
	)
	run(repo2, ['gate', 'uncovered', 'list.failed', '--panel', secondPanel, '--hash', hash])
	const skipAfter = run(repo2, ['gate', 'uncovered', 'list.failed', '--skip', 'Too late'])
	assert.equal(skipAfter.status, 2)
	assert.match(skipAfter.stderr, /gate already bound/)

	const blank = run(repo, ['gate', 'uncovered', 'list.failed', '--skip', '   '])
	assert.equal(blank.status, 2)
	assert.match(blank.stderr, /skip needs a reason/)
})

test('gate rejects one-table key and stale hash after rules edit', () => {
	const soloRepo = mkdtempSync(join(tmpdir(), 'dstack-gate-solo-'))
	cpSync(join(import.meta.dirname, 'fixtures/shop/product-rules.md'), join(soloRepo, 'product-rules.md'))
	mkdirSync(join(soloRepo, 'src/notifications'), { recursive: true })
	cpSync(
		join(import.meta.dirname, 'fixtures/shop-two/src/notifications/NotificationList.states.md'),
		join(soloRepo, 'src/notifications/NotificationList.states.md'),
	)
	spawnSync('git', ['init'], { cwd: soloRepo })
	spawnSync('git', ['add', '.'], { cwd: soloRepo })
	spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=dstack', 'commit', '-m', 'solo'], { cwd: soloRepo })
	const solo = run(soloRepo, ['gate', 'uncovered', 'list.failed'])
	assert.equal(solo.status, 2)
	assert.match(solo.stderr, /not a proposal/)

	const staleRepo = shopTwoRepo()
	const open = run(staleRepo, ['gate', 'uncovered', 'list.failed'])
	const hash = hashFromPacket(open.stdout)
	const panelPath = join(staleRepo, 'panel.json')
	writeFileSync(
		panelPath,
		JSON.stringify({
			reviewers: ['grok-4.7-high'],
			marks: { fit: 'pass', collision: 'pass', size: 'pass' },
			because: 'Bound.',
		}),
		'utf8',
	)
	run(staleRepo, ['gate', 'uncovered', 'list.failed', '--panel', panelPath, '--hash', hash])
	const rulesPath = join(staleRepo, 'product-rules.md')
	writeFileSync(rulesPath, `${readFileSync(rulesPath, 'utf8')}# touch\n`, 'utf8')
	const missing = run(staleRepo, ['gate', 'uncovered', 'list.failed'])
	assert.equal(missing.status, 3)
	assert.match(missing.stdout, /panel  missing/)

	const changed = run(staleRepo, ['gate', 'uncovered', 'list.failed', '--panel', panelPath, '--hash', hash])
	assert.equal(changed.status, 2)
	assert.match(changed.stderr, /proposal changed/)
	assert.match(changed.stdout, /panel  missing/)
	const rulesAfter = readFileSync(rulesPath, 'utf8')
	assert.match(rulesAfter, /# touch/)
})

test('accept --write still writes when no gate file exists', () => {
	const repo = shopTwoRepo()
	const rulesBefore = readFileSync(join(repo, 'product-rules.md'), 'utf8')
	const written = run(repo, ['accept', '--write', 'uncovered', 'list.failed'])
	assert.equal(written.status, 0)
	assert.match(readFileSync(join(repo, 'product-rules.md'), 'utf8'), /Covers: detail\.failed, list\.failed/)
	assert.notEqual(readFileSync(join(repo, 'product-rules.md'), 'utf8'), rulesBefore)
})

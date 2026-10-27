import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import * as experienceModule from './experience.ts'

const root = join(import.meta.dirname, '../../..')
const script = join(root, 'skills/dstack/scripts/dstack.ts')
const agentJudgment = '.audit/experience/spruce/agent-judgment.md'
const agentScore = '.audit/experience/spruce/agent-score.md'

function run(args: string[], cwd = root) {
	return spawnSync('node', ['--experimental-strip-types', script, ...args], { cwd, encoding: 'utf8' })
}

function initRepo(dir: string) {
	spawnSync('git', ['init'], { cwd: dir })
	spawnSync('git', ['add', '.'], { cwd: dir })
	spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=dstack', 'commit', '-m', 'audit'], { cwd: dir })
}

function copySpruceFixture(dir: string) {
	mkdirSync(join(dir, '.audit/proof'), { recursive: true })
	for (const name of [
		'spruce-empty.png',
		'spruce-loading.png',
		'spruce-failed.png',
		'spruce-populated-desktop.png',
		'spruce-populated-mobile.png',
	]) {
		cpSync(join(root, '.audit/proof', name), join(dir, '.audit/proof', name))
	}
	mkdirSync(join(dir, '.audit/experience/spruce'), { recursive: true })
	cpSync(join(root, agentJudgment), join(dir, agentJudgment))
}

test('the module export keys are exactly experienceCommand', () => {
	assert.deepEqual(Object.keys(experienceModule).sort(), ['experienceCommand'])
})

test('experience rubric exits 0 and includes each id and its bar', () => {
	const result = run(['experience', 'rubric'])
	assert.equal(result.status, 0)
	for (const id of ['empty-copy', 'hierarchy', 'visual']) {
		assert.ok(result.stdout.includes(id))
	}
	assert.ok(result.stdout.includes('A slogan that only says nothing is here fails.'))
	assert.ok(result.stdout.includes('A second title fails.'))
	assert.ok(result.stdout.includes('The failed proof shows the failed state'))
	assert.equal(result.stdout.includes('no-parallel-card'), false)
	assert.equal(result.stdout.includes('card'), false)
})

test('scoring the committed spruce judgment exits 0 and matches agent-score.md', () => {
	const expected = readFileSync(join(root, agentScore), 'utf8')
	const result = run(['experience', 'score', 'spruce', '--actor', 'agent', '--judgment', agentJudgment])
	assert.equal(result.status, 0)
	assert.equal(result.stdout, expected.endsWith('\n') ? expected : `${expected}\n`)
})

test('an unknown judgment section exits 2 with empty stdout', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dstack-exp-mech-'))
	copySpruceFixture(dir)
	const bad = `${readFileSync(join(dir, agentJudgment), 'utf8')}\n## density\nmark: 1\nbecause: no\n`
	writeFileSync(join(dir, agentJudgment), bad)
	initRepo(dir)
	const result = run(['experience', 'score', 'spruce', '--actor', 'agent', '--judgment', agentJudgment], dir)
	assert.equal(result.status, 2)
	assert.equal(result.stdout, '')
})

test('experience score aspen exits 2 with empty stdout', () => {
	const result = run(['experience', 'score', 'aspen', '--actor', 'agent', '--judgment', agentJudgment])
	assert.equal(result.status, 2)
	assert.equal(result.stdout, '')
})

test('empty-copy mark 0 still exits 0', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dstack-exp-zero-'))
	copySpruceFixture(dir)
	const judgment = readFileSync(join(dir, agentJudgment), 'utf8').replace('mark: 1\nbecause: The empty proof', 'mark: 0\nbecause: The empty proof')
	writeFileSync(join(dir, agentJudgment), judgment)
	initRepo(dir)
	const result = run(['experience', 'score', 'spruce', '--actor', 'agent', '--judgment', agentJudgment], dir)
	assert.equal(result.status, 0)
	assert.match(result.stdout, /empty-copy judgment 0/)
})

test('compare prints agree for identical scores and differ with exit 0', () => {
	const scoreText = readFileSync(join(root, agentScore), 'utf8')
	const dir = mkdtempSync(join(tmpdir(), 'dstack-exp-compare-'))
	mkdirSync(join(dir, '.audit/experience/spruce'), { recursive: true })
	const agentPath = join(dir, '.audit/experience/spruce/a.md')
	const judgePath = join(dir, '.audit/experience/spruce/b.md')
	writeFileSync(agentPath, scoreText)
	writeFileSync(judgePath, scoreText)
	initRepo(dir)
	const same = run(
		['experience', 'compare', '.audit/experience/spruce/a.md', '.audit/experience/spruce/b.md'],
		dir,
	)
	assert.equal(same.status, 0)
	assert.match(same.stdout, /empty-copy 1 1 agree/)
	const differ = scoreText.replace('empty-copy judgment 1', 'empty-copy judgment 0')
	writeFileSync(judgePath, differ)
	const diff = run(
		['experience', 'compare', '.audit/experience/spruce/a.md', '.audit/experience/spruce/b.md'],
		dir,
	)
	assert.equal(diff.status, 0)
	assert.match(diff.stdout, /empty-copy 1 0 differ/)
})

test('empty-copy evidence cites spruce-empty.png not mentions js', () => {
	const result = run(['experience', 'score', 'spruce', '--actor', 'agent', '--judgment', agentJudgment])
	assert.equal(result.status, 0)
	const block = result.stdout.split('\n\n').find((part) => part.startsWith('empty-copy')) ?? ''
	assert.match(block, /\.audit\/proof\/spruce-empty\.png/)
	assert.ok(!block.includes('MentionsList.js'))
})

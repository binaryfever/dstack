import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('dstack-verify ships as a product generator, not a demo screen driver', () => {
	const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
	assert.match(skill, /^---\nname: dstack-verify\n/)
	assert.match(skill, /disable-model-invocation: true/)
	assert.match(skill, /product that installed dstack/)
	assert.doesNotMatch(skill, /notifications-list/)
	assert.doesNotMatch(skill, /src\/notifications/)
	assert.doesNotMatch(skill, /unread/)
	assert.doesNotMatch(skill, /list or a badge/)
	assert.ok(fs.existsSync(path.join(skillDir, 'references', 'feature-map-example', 'README.md')))
	assert.ok(fs.existsSync(path.join(skillDir, 'references', 'feature-map-example', 'remote-list.md')))
	assert.ok(fs.existsSync(path.join(skillDir, 'references', 'feature-map-example', 'remote-badge.md')))
	assert.equal(fs.existsSync(path.join(skillDir, 'features')), false)
	assert.equal(fs.existsSync(path.join(skillDir, 'scripts', 'verify.ts')), false)
})

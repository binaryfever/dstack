import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('dstack-verify skill files exist', () => {
	const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
	assert.match(skill, /^---\nname: dstack-verify\n/)
	assert.match(skill, /disable-model-invocation: true/)
	for (const feature of ['notifications-list', 'unread-badge']) {
		assert.ok(fs.existsSync(path.join(skillDir, 'features', `${feature}.md`)))
	}
	assert.ok(fs.existsSync(path.join(skillDir, 'scripts', 'verify.ts')))
})

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	RULES_PATH,
	TABLE_SUFFIX,
	parseRules,
	tablePath,
	type Rules,
	type TablePath,
} from './model.ts'

export type TableFile = { readonly path: TablePath; readonly text: string }

export type Catalog =
	| {
			readonly ok: true
			readonly rulesText: string
			readonly rules: Rules
			readonly files: readonly TableFile[]
	  }
	| { readonly ok: false; readonly stderr: string }

function git(repo: string, args: readonly string[]): string | null {
	const result = spawnSync('git', [...args], { cwd: repo, encoding: 'utf8' })
	if (result.status !== 0) return null
	return result.stdout
}

function listTables(root: string): string[] {
	const listed = git(root, ['ls-files', '-co', '--exclude-standard', '--', `*${TABLE_SUFFIX}`]) ?? ''
	return listed
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.endsWith(TABLE_SUFFIX))
}

export function loadCatalog(root: string): Catalog {
	const rulesFile = join(root, RULES_PATH)
	if (!existsSync(rulesFile)) {
		return { ok: false, stderr: `${RULES_PATH} not found at ${root}. See the dstack README for the format.\n` }
	}
	const rulesText = readFileSync(rulesFile, 'utf8')
	const parsedRules = parseRules(rulesText)
	if (!parsedRules.ok) {
		let stderr = ''
		for (const error of parsedRules.errors) stderr += `${RULES_PATH}:${error.line} ${error.problem}\n`
		return { ok: false, stderr }
	}
	const paths = listTables(root)
	const files: TableFile[] = paths.map((path) => ({
		path: tablePath(path),
		text: readFileSync(join(root, path), 'utf8'),
	}))
	return { ok: true, rulesText, rules: parsedRules.rules, files }
}

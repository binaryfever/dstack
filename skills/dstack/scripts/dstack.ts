import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
	RULES_PATH,
	TABLE_SUFFIX,
	type BranchView,
	type SourceFile,
	type TablePath,
	checkScreens,
	parseRules,
	report,
	tablePath,
} from './model.ts'

type Exit = 0 | 1 | 2

function git(repo: string, args: readonly string[]): string | null {
	const result = spawnSync('git', [...args], { cwd: repo, encoding: 'utf8' })
	if (result.status !== 0) return null
	return result.stdout
}

function repoRoot(): string | null {
	const cwd = process.cwd()
	const top = git(cwd, ['rev-parse', '--show-toplevel'])
	return top == null ? null : top.trim()
}

function changedPaths(root: string): Set<string> {
	const base =
		git(root, ['merge-base', 'HEAD', '@{upstream}']) ??
		git(root, ['rev-parse', '--verify', 'origin/HEAD']) ??
		git(root, ['rev-parse', '--verify', 'origin/main'])
	const names = new Set<string>()
	const diff = base == null ? git(root, ['diff', '--name-only', 'HEAD']) : git(root, ['diff', '--name-only', base.trim()])
	for (const line of (diff ?? '').split('\n')) {
		if (line.trim() !== '') names.add(line.trim())
	}
	const untracked = git(root, ['ls-files', '--others', '--exclude-standard']) ?? ''
	for (const line of untracked.split('\n')) {
		if (line.trim() !== '') names.add(line.trim())
	}
	return names
}

function listTables(root: string): string[] {
	const listed = git(root, ['ls-files', '-co', '--exclude-standard', '--', `*${TABLE_SUFFIX}`]) ?? ''
	return listed
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.endsWith(TABLE_SUFFIX))
}

function filesUnder(root: string, dir: string): SourceFile[] {
	const listed = git(root, ['ls-files', '-co', '--exclude-standard', '--', dir]) ?? ''
	const files: SourceFile[] = []
	for (const line of listed.split('\n')) {
		const path = line.trim()
		if (path === '' || path.endsWith(TABLE_SUFFIX)) continue
		const abs = join(root, path)
		if (!existsSync(abs)) continue
		files.push({ path, text: readFileSync(abs, 'utf8') })
	}
	return files
}

function branchFor(root: string, table: string, changed: Set<string>): BranchView {
	const dir = table.split('/').slice(0, -1).join('/') || '.'
	const screenFiles = filesUnder(root, dir)
	const changedFiles: SourceFile[] = []
	for (const path of changed) {
		if (path === RULES_PATH || path.endsWith(TABLE_SUFFIX)) continue
		const abs = join(root, path)
		if (!existsSync(abs)) continue
		changedFiles.push({ path, text: readFileSync(abs, 'utf8') })
	}
	return {
		screenFiles,
		changedFiles,
		rulesChanged: changed.has(RULES_PATH),
		tableChanged: changed.has(table),
	}
}

function main(argv: readonly string[]): Exit {
	if (argv[0] !== 'check' || argv.length > 2) {
		process.stderr.write(`usage: dstack check [${TABLE_SUFFIX} path]\n`)
		return 2
	}
	const root = repoRoot()
	if (root == null) {
		process.stderr.write('dstack check needs a git checkout.\n')
		return 2
	}
	const rulesFile = join(root, RULES_PATH)
	if (!existsSync(rulesFile)) {
		process.stderr.write(`${RULES_PATH} not found at ${root}. See the dstack README for the format.\n`)
		return 2
	}
	const parsedRules = parseRules(readFileSync(rulesFile, 'utf8'))
	if (!parsedRules.ok) {
		for (const error of parsedRules.errors) process.stderr.write(`${RULES_PATH}:${error.line} ${error.problem}\n`)
		return 2
	}
	const tables = listTables(root)
	const targetArg = argv[1]
	if (targetArg != null && !targetArg.endsWith(TABLE_SUFFIX)) {
		process.stderr.write(`check expects a ${TABLE_SUFFIX} file.\n`)
		return 2
	}
	const target = targetArg == null ? null : tablePath(relative(root, join(process.cwd(), targetArg)))
	if (target != null && !tables.includes(target)) {
		process.stderr.write(`${target} is not a state table in this checkout.\n`)
		return 2
	}
	const changed = changedPaths(root)
	const branches = new Map<string, BranchView>()
	const parsed = tables.map((path) => {
		branches.set(path, branchFor(root, path, changed))
		return { path: tablePath(path), text: readFileSync(join(root, path), 'utf8') }
	})
	const value = checkScreens({
		rules: parsedRules.rules,
		rulesPath: RULES_PATH,
		parsed,
		branches,
		target: target as TablePath | null,
	})
	process.stdout.write(`${report(value)}\n`)
	return value.findings.length > 0 ? 1 : 0
}

process.exit(main(process.argv.slice(2)))

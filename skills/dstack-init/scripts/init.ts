import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RULES_PATH, TABLE_SUFFIX } from '../../dstack/scripts/model.ts'
import {
	decide,
	derive,
	formatShow,
	partition,
	type LoadedTree,
} from './catalog.ts'

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
	const diff =
		base == null ? git(root, ['diff', '--name-only', 'HEAD']) : git(root, ['diff', '--name-only', base.trim()])
	for (const line of (diff ?? '').split('\n')) {
		if (line.trim() !== '') names.add(line.trim())
	}
	const untracked = git(root, ['ls-files', '--others', '--exclude-standard']) ?? ''
	for (const line of untracked.split('\n')) {
		if (line.trim() !== '') names.add(line.trim())
	}
	return names
}

export function loadTree(root: string): LoadedTree {
	const listed = git(root, ['ls-files', '-co', '--exclude-standard']) ?? ''
	const paths = listed
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
	const parts = partition(paths)

	const read = (path: string): string => readFileSync(join(root, path), 'utf8')

	const rules =
		parts.rules == null
			? null
			: existsSync(join(root, parts.rules))
				? { text: read(parts.rules) }
				: null

	const sources = parts.sources
		.filter((path) => existsSync(join(root, path)))
		.map((path) => ({ path, text: read(path) }))
	const styles = parts.styles
		.filter((path) => existsSync(join(root, path)))
		.map((path) => ({ path, text: read(path) }))
	const tables = parts.tables
		.filter((path) => existsSync(join(root, path)))
		.map((path) => ({ path, text: read(path) }))

	const changed = changedPaths(root)
	const dirtyTables = [...changed].filter((path) => path.endsWith(TABLE_SUFFIX))

	const markers = parts.markers
		.filter((path) => existsSync(join(root, path)))
		.map((path) => ({ path, text: read(path) }))

	return { rules, sources, styles, tables, dirtyTables, markers }
}

function writeRules(root: string, rendered: string): void {
	const target = join(root, RULES_PATH)
	const tmp = `${target}.tmp`
	writeFileSync(tmp, rendered, 'utf8')
	renameSync(tmp, target)
}

function main(argv: readonly string[]): 0 | 2 {
	const root = repoRoot()
	if (root == null) {
		process.stderr.write('dstack-init needs a git checkout.\n')
		return 2
	}

	let approval: string | null = null
	if (argv.length === 0) {
		approval = null
	} else if (argv.length === 3 && argv[0] === 'write' && argv[1] === '--approve' && /^[0-9a-f]{12}$/.test(argv[2] ?? '')) {
		approval = argv[2] ?? null
	} else {
		process.stderr.write(
			'usage: init.ts\n       init.ts write --approve <12-char digest>\n',
		)
		return 2
	}

	const result = derive(loadTree(root))
	const decision = decide(result, approval)

	switch (decision.type) {
		case 'show':
			process.stdout.write(`${formatShow(decision.proposal)}\n`)
			return 0
		case 'write':
			writeRules(root, decision.proposal.rendered)
			process.stdout.write(
				`dstack-init wrote ${decision.proposal.digest} (${decision.proposal.predicted.length} predicted parallel-name)\n`,
			)
			return 0
		case 'unchanged':
			process.stdout.write(`dstack-init unchanged ${decision.digest}\n`)
			return 0
		case 'refuse':
			process.stderr.write(`dstack-init refuse ${decision.reason}\n${decision.detail}\n`)
			return 2
	}
}

const entry = process.argv[1]
if (entry != null && import.meta.url === pathToFileURL(entry).href) {
	process.exit(main(process.argv.slice(2)))
}

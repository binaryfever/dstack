import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(skillDir, '../..')
const notificationsDir = path.join(repoRoot, 'src/notifications')
const verifyDir = path.join(repoRoot, '.dstack-verify')
const runPath = path.join(verifyDir, 'run.json')
const scriptPath = fileURLToPath(import.meta.url)

const chromeCandidates = [
	process.env.CHROME_PATH,
	'/opt/google/chrome/chrome',
	'google-chrome',
].filter((value): value is string => value != null && value.length > 0)

type RunState = {
	pageUrl: string
	port: number
	profileDir: string
	debugPort: string
	serverPid?: number
	chromePid?: number
	inProcess?: boolean
}

type CdpSession = {
	run: RunState
	ws: WebSocket
	pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>
	nextId: number
	send(method: string, params?: Record<string, unknown>): Promise<unknown>
}

const types: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
}

function failCouldRun(message: string): never {
	console.error(message)
	process.exit(2)
}

function resolveChromePath(): string {
	for (const candidate of chromeCandidates) {
		if (candidate.includes('/') && fs.existsSync(candidate)) return candidate
		if (!candidate.includes('/')) return candidate
	}
	failCouldRun('dstack-verify: chrome not found (set CHROME_PATH)')
}

function createStaticServer(root: string): http.Server {
	return http.createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1')
		const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
		const filePath = path.resolve(root, relative)
		if (filePath !== root && !filePath.startsWith(root + path.sep)) {
			res.writeHead(403)
			res.end()
			return
		}
		if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
			res.writeHead(404)
			res.end()
			return
		}
		res.writeHead(200, { 'content-type': types[path.extname(filePath)] ?? 'application/octet-stream' })
		fs.createReadStream(filePath).pipe(res)
	})
}

async function listenServer(server: http.Server): Promise<number> {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	if (address == null || typeof address === 'string') throw new Error('server did not bind')
	return address.port
}

function readRun(): RunState {
	if (!fs.existsSync(runPath)) failCouldRun('dstack-verify: no run.json; run launch or prove first')
	return JSON.parse(fs.readFileSync(runPath, 'utf8')) as RunState
}

function writeRun(run: RunState) {
	fs.mkdirSync(verifyDir, { recursive: true })
	fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`)
}

function pidAlive(pid: number | undefined): boolean {
	if (pid == null) return false
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

async function waitFor<T>(read: () => Promise<T | null | undefined> | T | null | undefined, label: string, ms = 8000): Promise<T> {
	const started = Date.now()
	let latest: T | null | undefined
	while (Date.now() - started < ms) {
		latest = await read()
		if (latest) return latest
		await new Promise((resolve) => setTimeout(resolve, 40))
	}
	throw new Error(`timed out waiting for ${label}: ${JSON.stringify(latest)}`)
}

async function startDetachedServer(root: string): Promise<{ pid: number; port: number }> {
	const serverInfoPath = path.join(verifyDir, 'server.json')
	if (fs.existsSync(serverInfoPath)) fs.unlinkSync(serverInfoPath)
	const child = spawn(process.execPath, ['--experimental-strip-types', scriptPath, '_server', '0', root], {
		detached: true,
		stdio: 'ignore',
		env: { ...process.env, DSTACK_VERIFY_DIR: verifyDir },
	})
	child.unref()
	if (child.pid == null) throw new Error('server child did not start')
	const info = await waitFor(() => {
		if (!fs.existsSync(serverInfoPath)) return null
		return JSON.parse(fs.readFileSync(serverInfoPath, 'utf8')) as { pid: number; port: number }
	}, 'static server')
	await waitFor(async () => {
		try {
			const res = await fetch(`http://127.0.0.1:${info.port}/index.html`)
			return res.ok ? true : null
		} catch {
			return null
		}
	}, 'static server ready')
	return info
}

async function stopChrome(chrome: ChildProcess) {
	const pid = chrome.pid
	try {
		if (pid != null) process.kill(-pid, 'SIGKILL')
	} catch {
		try {
			chrome.kill('SIGKILL')
		} catch {
		}
	}
	await Promise.race([
		new Promise<void>((resolve) => {
			chrome.once('exit', () => resolve())
		}),
		new Promise<void>((resolve) => setTimeout(resolve, 3000)),
	])
}

async function removePath(target: string) {
	if (!fs.existsSync(target)) return
	let lastError: unknown
	for (let attempt = 0; attempt < 12; attempt++) {
		try {
			fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
			if (!fs.existsSync(target)) return
		} catch (error) {
			lastError = error
		}
		await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
	}
	if (fs.existsSync(target)) {
		throw lastError instanceof Error ? lastError : new Error(`could not remove ${target}`)
	}
}

async function startChrome(profileDir: string): Promise<{ chrome: ChildProcess; debugPort: string }> {
	const chromePath = resolveChromePath()
	const chrome = spawn(
		chromePath,
		['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', `--user-data-dir=${profileDir}`, '--remote-debugging-port=0', 'about:blank'],
		{ stdio: 'ignore', detached: true },
	)
	const portFile = path.join(profileDir, 'DevToolsActivePort')
	const debugPort = await waitFor(() => {
		if (!fs.existsSync(portFile)) return null
		const line = fs.readFileSync(portFile, 'utf8').split('\n')[0]?.trim()
		return line || null
	}, 'devtools port')
	return { chrome, debugPort }
}

async function connectCdp(debugPort: string, run?: RunState): Promise<CdpSession> {
	const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((res) => res.json())
	const page = (targets as Array<{ type: string; webSocketDebuggerUrl: string }>).find((target) => target.type === 'page')
	if (page == null) throw new Error('no chrome page target')
	const ws = new WebSocket(page.webSocketDebuggerUrl)
	const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
	let nextId = 0
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener('open', () => resolve())
		ws.addEventListener('error', reject)
	})
	ws.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data)) as { id?: number; error?: unknown; result?: unknown }
		if (!message.id || !pending.has(message.id)) return
		const { resolve, reject } = pending.get(message.id)!
		pending.delete(message.id)
		if (message.error) reject(new Error(JSON.stringify(message.error)))
		else resolve(message.result)
	})
	const session: CdpSession = {
		run: run ?? readRun(),
		pending,
		nextId,
		ws,
		send(method: string, params: Record<string, unknown> = {}) {
			const id = ++session.nextId
			ws.send(JSON.stringify({ id, method, params }))
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject })
			})
		},
	}
	return session
}

async function evaluate(session: CdpSession, expression: string): Promise<unknown> {
	const result = (await session.send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true,
	})) as { exceptionDetails?: { text?: string }; result: { value: unknown } }
	if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'page evaluation failed')
	return result.result.value
}

async function navigate(session: CdpSession, url: string) {
	await session.send('Page.enable')
	await session.send('Emulation.setDeviceMetricsOverride', {
		width: 1280,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
	})
	await session.send('Page.navigate', { url })
	await waitFor(async () => {
		const ready = await evaluate(session, 'document.querySelector("h1")?.textContent === "Notifications"')
		return ready ? true : null
	}, 'notifications page')
}

async function clickStatus(session: CdpSession, status: string) {
	await evaluate(
		session,
		`(() => {
      const button = document.querySelector('[data-status="${status}"]');
      if (!button) throw new Error('missing status ${status}');
      button.click();
    })()`,
	)
}

async function captureShot(session: CdpSession, filePath: string) {
	const image = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string }
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, Buffer.from(image.data, 'base64'))
}

async function captureAria(session: CdpSession, filePath: string) {
	const tree = await session.send('Accessibility.getFullAXTree', {})
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, `${JSON.stringify(tree, null, 2)}\n`)
}

async function driveNotificationsList(session: CdpSession, evidenceDir: string) {
	fs.mkdirSync(evidenceDir, { recursive: true })
	await navigate(session, session.run.pageUrl)

	await clickStatus(session, 'empty')
	await waitFor(async () => {
		const copy = await evaluate(session, 'document.querySelector(".state.empty p")?.textContent ?? null')
		return copy === 'Notifications will show up here.' ? copy : null
	}, 'empty copy')
	assert.equal(await evaluate(session, 'document.querySelectorAll(".row").length'), 0)
	await captureShot(session, path.join(evidenceDir, 'empty.png'))
	await captureAria(session, path.join(evidenceDir, 'empty.aria.txt'))

	await clickStatus(session, 'loading')
	await waitFor(async () => {
		const busy = await evaluate(session, 'document.querySelector(".state.skeleton")?.getAttribute("aria-busy") === "true"')
		return busy ? true : null
	}, 'loading skeleton')
	assert.match(
		String(await evaluate(session, "document.querySelector('.sr-only')?.textContent ?? ''")),
		/Loading notifications/,
	)
	await captureShot(session, path.join(evidenceDir, 'loading.png'))
	await captureAria(session, path.join(evidenceDir, 'loading.aria.txt'))

	await clickStatus(session, 'error')
	await waitFor(async () => {
		const copy = await evaluate(session, 'document.querySelector(".state.error p")?.textContent ?? null')
		return copy === "Notifications couldn't be loaded." ? copy : null
	}, 'error copy')
	assert.equal(await evaluate(session, 'document.querySelector(".state.error button")?.textContent ?? null'), 'Retry')
	await captureShot(session, path.join(evidenceDir, 'error.png'))
	await captureAria(session, path.join(evidenceDir, 'error.aria.txt'))

	await clickStatus(session, 'success')
	await waitFor(async () => {
		const rows = await evaluate(session, 'document.querySelectorAll(".row").length')
		return rows === 3 ? rows : null
	}, 'success rows')
	assert.match(String(await evaluate(session, 'document.body.textContent ?? ""')), /Maya Chen mentioned you/)
	await captureShot(session, path.join(evidenceDir, 'success.png'))
	await captureAria(session, path.join(evidenceDir, 'success.aria.txt'))
}

async function driveUnreadBadge(session: CdpSession, evidenceDir: string) {
	fs.mkdirSync(evidenceDir, { recursive: true })
	await navigate(session, session.run.pageUrl)

	for (const status of ['empty', 'loading', 'error'] as const) {
		await clickStatus(session, status)
		await waitFor(async () => {
			const badge = await evaluate(session, 'document.querySelector(".badge")')
			return badge == null ? true : null
		}, `badge hidden in ${status}`)
	}
	await captureShot(session, path.join(evidenceDir, 'badge-quiet.png'))
	await captureAria(session, path.join(evidenceDir, 'badge-quiet.aria.txt'))

	await clickStatus(session, 'success')
	await waitFor(async () => {
		const text = await evaluate(session, 'document.querySelector(".badge")?.textContent ?? null')
		return text === '2' ? text : null
	}, 'badge count')
	assert.equal(await evaluate(session, 'document.querySelector(".badge")?.getAttribute("aria-label") ?? null'), '2 unread')
	await captureShot(session, path.join(evidenceDir, 'badge-success.png'))
	await captureAria(session, path.join(evidenceDir, 'badge-success.aria.txt'))
}

async function driveFeature(session: CdpSession, featureId: string) {
	const evidenceDir = path.join(verifyDir, 'evidence', featureId)
	if (featureId === 'notifications-list') await driveNotificationsList(session, evidenceDir)
	else if (featureId === 'unread-badge') await driveUnreadBadge(session, evidenceDir)
	else throw new Error(`unknown feature id: ${featureId}`)
	fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify({ featureId, ok: true, at: new Date().toISOString() }, null, 2)}\n`)
	console.log(`dstack-verify drive ${featureId}: pass`)
	console.log(`evidence: ${evidenceDir}`)
}

async function cmdLaunch() {
	if (!fs.existsSync(notificationsDir)) failCouldRun(`dstack-verify: missing ${notificationsDir}`)
	fs.mkdirSync(verifyDir, { recursive: true })
	const profileDir = fs.mkdtempSync(path.join(verifyDir, 'chrome-'))
	const { pid: serverPid, port } = await startDetachedServer(notificationsDir)
	const { chrome, debugPort } = await startChrome(profileDir)
	chrome.unref()
	const run: RunState = {
		pageUrl: `http://127.0.0.1:${port}/index.html`,
		port,
		profileDir,
		debugPort,
		serverPid,
		chromePid: chrome.pid,
	}
	writeRun(run)
	console.log(`dstack-verify launch: ${run.pageUrl}`)
	console.log(`run state: ${runPath}`)
}

async function cmdDoctor() {
	const run = readRun()
	if (!pidAlive(run.serverPid)) failCouldRun('dstack-verify doctor: server not running')
	if (!pidAlive(run.chromePid)) failCouldRun('dstack-verify doctor: chrome not running')
	const res = await fetch(run.pageUrl)
	if (!res.ok) failCouldRun(`dstack-verify doctor: page returned ${res.status}`)
	const targets = await fetch(`http://127.0.0.1:${run.debugPort}/json/version`).then((r) => r.json())
	console.log('dstack-verify doctor: ok')
	console.log(`page: ${run.pageUrl}`)
	console.log(`chrome: ${(targets as { Browser?: string }).Browser ?? 'connected'}`)
}

async function cmdDrive(featureId: string) {
	if (!featureId) failCouldRun('dstack-verify drive: missing feature id')
	const run = readRun()
	const session = await connectCdp(run.debugPort, run)
	try {
		await driveFeature(session, featureId)
	} finally {
		if (session.ws.readyState === WebSocket.OPEN) session.ws.close()
	}
}

async function cmdCleanup() {
	const run = fs.existsSync(runPath) ? readRun() : null
	const serverInfoPath = path.join(verifyDir, 'server.json')
	const serverPid = run?.serverPid ?? (fs.existsSync(serverInfoPath) ? (JSON.parse(fs.readFileSync(serverInfoPath, 'utf8')) as { pid: number }).pid : undefined)
	if (serverPid) {
		try {
			process.kill(serverPid)
		} catch {
		}
	}
	if (fs.existsSync(serverInfoPath)) fs.unlinkSync(serverInfoPath)
	if (run?.chromePid) {
		try {
			process.kill(-run.chromePid, 'SIGKILL')
		} catch {
			try {
				process.kill(run.chromePid, 'SIGKILL')
			} catch {
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
	if (run?.profileDir) await removePath(run.profileDir)
	if (fs.existsSync(runPath)) fs.unlinkSync(runPath)
	console.log('dstack-verify cleanup: ok (evidence kept under .dstack-verify/evidence/)')
}

async function cmdProve(featureId: string) {
	if (!featureId) featureId = 'notifications-list'
	if (!fs.existsSync(notificationsDir)) failCouldRun(`dstack-verify: missing ${notificationsDir}`)
	fs.mkdirSync(verifyDir, { recursive: true })
	const profileDir = fs.mkdtempSync(path.join(verifyDir, 'chrome-'))
	const server = createStaticServer(notificationsDir)
	const port = await listenServer(server)
	const { chrome, debugPort } = await startChrome(profileDir)
	const run: RunState = {
		pageUrl: `http://127.0.0.1:${port}/index.html`,
		port,
		profileDir,
		debugPort,
		chromePid: chrome.pid,
		inProcess: true,
	}
	writeRun(run)
	const session = await connectCdp(debugPort, run)
	try {
		await fetch(run.pageUrl)
		console.log('dstack-verify doctor: ok')
		await driveFeature(session, featureId)
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	} finally {
		if (session.ws.readyState === WebSocket.OPEN) session.ws.close()
		server.close()
		await stopChrome(chrome)
		try {
			await removePath(profileDir)
		} catch (error) {
			console.error(`dstack-verify: left profile after kill: ${error instanceof Error ? error.message : String(error)}`)
		}
		if (fs.existsSync(runPath)) fs.unlinkSync(runPath)
	}
	if (process.exitCode === 1) process.exit(1)
	console.log('dstack-verify prove: pass')
}

async function cmdServer(portArg: string, root: string) {
	const server = createStaticServer(root)
	if (portArg === '0') {
		const port = await listenServer(server)
		const verify = process.env.DSTACK_VERIFY_DIR ?? verifyDir
		fs.mkdirSync(verify, { recursive: true })
		fs.writeFileSync(path.join(verify, 'server.json'), `${JSON.stringify({ port, pid: process.pid }, null, 2)}\n`)
		return
	}
	server.listen(Number(portArg), '127.0.0.1')
}

async function main() {
	const [cmd, arg, extra] = process.argv.slice(2)
	if (cmd === '_server') {
		await cmdServer(arg ?? '0', extra ?? notificationsDir)
		return
	}
	try {
		if (cmd === 'launch') await cmdLaunch()
		else if (cmd === 'doctor') await cmdDoctor()
		else if (cmd === 'drive') await cmdDrive(arg ?? '')
		else if (cmd === 'cleanup') await cmdCleanup()
		else if (cmd === 'prove') await cmdProve(arg ?? 'notifications-list')
		else failCouldRun(`dstack-verify: unknown command ${cmd ?? '(none)'}`)
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
}

await main()

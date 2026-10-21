import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMentions, projectMentions, relativeTime } from '../src/mentions-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, '.verify');
const chromePath = process.env.CHROME_PATH || '/opt/google/chrome/chrome';
const feed = JSON.parse(fs.readFileSync(path.join(root, 'data/mentions.json'), 'utf8'));
const expected = projectMentions('ready', parseMentions(feed));

fs.mkdirSync(shots, { recursive: true });

let mode = 'ok';
const held = [];

function sendMentions(res) {
  if (mode === 'fail') {
    res.writeHead(500, { 'cache-control': 'no-store' });
    res.end('no');
    return;
  }
  const body = mode === 'empty'
    ? JSON.stringify({ mentions: [] })
    : fs.readFileSync(path.join(root, 'data/mentions.json'));
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function dropHeld() {
  for (const res of held.splice(0)) res.destroy();
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/data/mentions.json') {
    if (mode === 'hold') {
      held.push(res);
      return;
    }
    sendMentions(res);
    return;
  }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const pageUrl = `http://127.0.0.1:${port}/mentions.html`;

const profile = fs.mkdtempSync(path.join(shots, 'chrome-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  'about:blank',
], { stdio: 'ignore' });

const pending = new Map();
let nextId = 0;
let ws;

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'page evaluation failed');
  }
  return result.result.value;
}

async function waitFor(read, label) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < 5000) {
    latest = await read();
    if (latest) return latest;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

async function shot(name) {
  const image = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shots, name), Buffer.from(image.data, 'base64'));
}

function readPage() {
  return evaluate(`({
    badge: document.querySelector('.badge')?.textContent || null,
    label: document.querySelector('.badge')?.getAttribute('aria-label') || null,
    skeletons: document.querySelectorAll('.row-skeleton').length,
    empty: document.querySelector('.empty-state p')?.textContent || null,
    failed: document.querySelector('.mentions-failed p')?.textContent || null,
    retry: document.querySelector('.mentions-failed button')?.textContent || null,
    rows: [...document.querySelectorAll('.mention-row')].map((row) => ({
      name: row.querySelector('.mention-name')?.textContent || '',
      time: row.querySelector('time')?.textContent || '',
      body: row.querySelector('.mention-body')?.textContent || '',
      unseen: row.classList.contains('is-unseen'),
    })),
  })`);
}

function acceptableTime(createdAt) {
  const now = Date.now();
  return new Set([0, -1500, 1500].map((offset) => relativeTime(createdAt, now + offset)));
}

try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  const debugPort = await waitFor(() => {
    if (!fs.existsSync(portFile)) return null;
    const line = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    return line || null;
  }, 'devtools port');
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((res) => res.json());
  const page = targets.find((target) => target.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: pageUrl });

  const populated = await waitFor(async () => {
    const view = await readPage();
    return view.rows.length > 1 ? view : null;
  }, 'populated mentions');

  assert.equal(populated.badge, String(expected.unseen));
  assert.equal(populated.label, `${expected.unseen} unseen`);
  assert.equal(populated.rows.length, expected.mentions.length);
  assert.ok(populated.rows.length > 1);
  expected.mentions.forEach((mention, index) => {
    const row = populated.rows[index];
    assert.equal(row.name, mention.actorName);
    assert.equal(row.body, mention.body);
    assert.equal(row.unseen, !mention.seen);
    assert.ok(acceptableTime(mention.createdAt).has(row.time), row.time);
  });
  await shot('mentions-desktop.png');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await shot('mentions-mobile.png');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  dropHeld();
  mode = 'fail';
  await send('Page.reload', { ignoreCache: true });
  const failed = await waitFor(async () => {
    const view = await readPage();
    return view.failed ? view : null;
  }, 'failed mentions');
  assert.equal(failed.failed, "Mentions didn't load.");
  assert.equal(failed.retry, 'Retry');
  assert.equal(failed.badge, null);
  assert.equal(failed.rows.length, 0);
  await shot('mentions-failed.png');

  mode = 'ok';
  await evaluate(`document.querySelector('.mentions-failed button').click()`);
  const retried = await waitFor(async () => {
    const view = await readPage();
    return view.rows.length > 1 ? view : null;
  }, 'mentions after retry');
  assert.equal(retried.badge, String(expected.unseen));
  assert.equal(retried.rows[0].name, expected.mentions[0].actorName);

  dropHeld();
  mode = 'empty';
  await send('Page.reload', { ignoreCache: true });
  const empty = await waitFor(async () => {
    const view = await readPage();
    return view.empty ? view : null;
  }, 'empty mentions');
  assert.equal(empty.empty, 'No mentions yet.');
  assert.equal(empty.badge, null);
  assert.equal(empty.rows.length, 0);
  await shot('mentions-empty.png');

  dropHeld();
  mode = 'hold';
  await send('Page.reload', { ignoreCache: true });
  const loading = await waitFor(async () => {
    const view = await readPage();
    return view.skeletons > 0 && view.rows.length === 0 ? view : null;
  }, 'loading mentions');
  assert.equal(loading.skeletons, 3);
  assert.equal(loading.badge, null);
  await shot('mentions-loading.png');

  console.log(`mentions page ok on ${pageUrl}`);
  console.log(`screenshots in ${shots}`);
} finally {
  dropHeld();
  server.close();
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  chrome.kill();
  fs.rmSync(profile, { recursive: true, force: true });
}

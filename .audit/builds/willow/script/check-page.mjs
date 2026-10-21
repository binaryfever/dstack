import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = 9333;
const profile = join(tmpdir(), 'shop-willow-chrome');
const shots = join(tmpdir(), 'shop-willow-shots');
mkdirSync(profile, { recursive: true });
mkdirSync(shots, { recursive: true });

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + port,
  'about:blank',
], { stdio: 'ignore' });

const failures = [];
const pageErrors = [];

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.onEvent = () => {};
  }

  open() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      if (message.method) this.onEvent(message);
    });
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }
}

try {
  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const browser = new Cdp(version.webSocketDebuggerUrl);
  await browser.open();
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { webSocketDebuggerUrl } = (await waitForJson(`http://127.0.0.1:${port}/json/list`))
    .find((target) => target.id === targetId);
  const page = new Cdp(webSocketDebuggerUrl);
  page.onEvent = (event) => {
    if (event.method === 'Runtime.exceptionThrown') {
      pageErrors.push(event.params.exceptionDetails.text + ' ' + (event.params.exceptionDetails.exception?.description || ''));
    }
  };
  await page.open();
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await setViewport(page, 1100, 900);

  const pageUrl = 'file:///tmp/shop-willow/index.html?delay=80';
  await page.send('Page.navigate', { url: pageUrl });
  await waitUntil(page, 'document.querySelectorAll(".note").length === 5');
  await assertPage(page, 'inbox');
  await shoot(page, 'inbox-desktop');

  await choose(page, 'empty');
  await waitUntil(page, 'document.body.textContent.includes("You\'re all caught up.")');
  await assertPage(page, 'empty');
  await shoot(page, 'empty');

  await choose(page, 'failed');
  await waitUntil(page, 'document.querySelector("[data-retry]") != null');
  await assertPage(page, 'failed');
  await shoot(page, 'failed');

  await page.send('Runtime.evaluate', {
    expression: 'document.querySelector("[data-retry]").click()',
  });
  await waitUntil(page, 'document.querySelectorAll(".skel").length === 4');
  await waitUntil(page, 'document.querySelector("[data-retry]") != null');
  await assertPage(page, 'failed');

  await choose(page, 'loading');
  await waitUntil(page, 'document.querySelectorAll(".skel").length === 4');
  await delay(250);
  await assertPage(page, 'loading');
  await shoot(page, 'loading');

  await choose(page, 'inbox');
  await waitUntil(page, 'document.querySelectorAll(".note").length === 5');
  await assertPage(page, 'inbox');

  await page.send('Runtime.evaluate', {
    expression: 'document.querySelector(".note-unread").click()',
  });
  await waitUntil(page, 'document.querySelector(".unread")?.textContent.startsWith("2")');
  const afterRead = await facts(page);
  expect(afterRead.notes === 5, 'marking read keeps the notice in the list');
  expect(afterRead.badge === '2', 'marking read drops the header count to 2');
  expect(afterRead.unreadRows === 2, 'one unread row remains marked');

  await setViewport(page, 390, 844);
  await shoot(page, 'inbox-mobile');
  const mobile = await facts(page);
  expect(mobile.notes === 5, 'mobile inbox still lists every notice');
  expect(mobile.badge === '2', 'mobile header keeps the unread count');

  if (pageErrors.length) failures.push(pageErrors.join('\n'));
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('page check passed');
    console.log(shots);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}

function expect(ok, message) {
  if (!ok) failures.push(message);
}

async function assertPage(page, state) {
  const seen = await facts(page);
  if (state === 'inbox') {
    expect(seen.notes > 1, 'populated inbox shows more than one notice');
    expect(seen.badge === '3', 'header unread count is 3, saw ' + seen.badge);
    expect(seen.times.includes('3h'), 'a recent notice uses a short age');
    expect(seen.times.includes('5h') && seen.times.includes('1d') && seen.times.includes('4d'), 'ages cover hours and days');
    expect(seen.times.some((time) => /^[A-Z][a-z]{2} \d/.test(time)), 'an older notice uses a date');
    expect(seen.primary, 'unread badge uses the primary token');
    expect(!seen.emptyCopy && !seen.failedCopy, 'populated inbox hides empty and failed copy');
  }
  if (state === 'empty') {
    expect(seen.emptyCopy, 'empty source shows the caught-up sentence');
    expect(seen.badge == null, 'empty source hides the badge');
    expect(seen.notes === 0 && seen.skeletons === 0 && !seen.failedCopy, 'empty source replaces the list');
    expect(seen.actions <= 1, 'empty state has at most one action');
  }
  if (state === 'failed') {
    expect(seen.failedCopy, 'failed source shows the failure sentence');
    expect(seen.retry, 'failed source shows Retry');
    expect(seen.badge == null, 'failed source hides the badge');
    expect(seen.notes === 0 && !seen.emptyCopy, 'failed source replaces the list');
  }
  if (state === 'loading') {
    expect(seen.skeletons === 4, 'loading source shows placeholder rows, saw ' + seen.skeletons);
    expect(seen.badge == null, 'loading source hides the badge');
    expect(seen.notes === 0 && !seen.emptyCopy && !seen.failedCopy, 'loading source hides results and errors');
  }
}

async function facts(page) {
  const { result } = await page.send('Runtime.evaluate', {
    expression: `(() => {
      const badge = document.querySelector('.unread');
      const style = badge ? getComputedStyle(badge).backgroundColor : '';
      const empty = document.querySelector('.empty');
      return {
        notes: document.querySelectorAll('.note').length,
        unreadRows: document.querySelectorAll('.note-unread').length,
        skeletons: document.querySelectorAll('.skel').length,
        badge: badge ? badge.childNodes[0].textContent : null,
        times: [...document.querySelectorAll('time')].map((node) => node.textContent),
        emptyCopy: document.body.textContent.includes("You're all caught up."),
        failedCopy: document.body.textContent.includes("Notifications didn't load."),
        retry: document.querySelector('[data-retry]') != null,
        actions: empty ? empty.querySelectorAll('button').length : 0,
        primary: style === 'rgb(26, 115, 232)',
        heading: document.querySelector('h1')?.textContent || '',
      };
    })()`,
    returnByValue: true,
  });
  return result.value;
}

async function choose(page, id) {
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[value="${id}"]');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  });
}

async function setViewport(page, width, height) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
}

async function shoot(page, name) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, name + '.png'), Buffer.from(shot.data, 'base64'));
}

async function waitUntil(page, expression) {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    const { result } = await page.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    if (result.value) return;
    await delay(40);
  }
  const dump = await page.send('Runtime.evaluate', {
    expression: 'document.body.innerText',
    returnByValue: true,
  });
  throw new Error('timed out waiting for ' + expression + '\n' + dump.result.value);
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // The debugger socket is not open yet.
    }
    await delay(100);
  }
  throw new Error('debugger did not answer at ' + url);
}

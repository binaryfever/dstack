import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ setTimeout, clearTimeout, AbortController });
const files = [
  'src/components/AsyncList.js',
  'src/components/EmptyState.js',
  'src/components/RowSkeleton.js',
  'src/components/Badge.js',
  'src/components/Avatar.js',
  'src/notifications/inbox.js',
];
for (const file of files) {
  vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
}
const { createInboxLoader, initials, parseNotifications, present, relativeTime, settle } = context;

function list(value) {
  return JSON.parse(JSON.stringify(value));
}

const NOW = Date.UTC(2026, 9, 21, 15, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('recent notes use a short age and older notes use a date', () => {
  assert.equal(relativeTime(NOW - 30 * 1000, NOW), 'now');
  assert.equal(relativeTime(NOW - 90 * 1000, NOW), '1m');
  assert.equal(relativeTime(NOW - 3 * HOUR, NOW), '3h');
  assert.equal(relativeTime(NOW - 23 * HOUR, NOW), '23h');
  assert.equal(relativeTime(NOW - DAY, NOW), '1d');
  assert.equal(relativeTime(NOW - 4 * DAY, NOW), '4d');
  assert.equal(relativeTime(NOW - 6 * DAY, NOW), '6d');
  assert.equal(relativeTime(NOW - 7 * DAY, NOW), 'Oct 14');
  assert.equal(relativeTime(NOW - 12 * DAY, NOW), 'Oct 9');
  assert.equal(relativeTime(Date.UTC(2025, 9, 9, 15, 0, 0), NOW), 'Oct 9, 2025');
  assert.equal(relativeTime(NOW + DAY, NOW), 'Oct 22');
});

test('new updates show more than one note and the unread count', () => {
  const view = present(settle('populated', NOW), NOW);
  assert.equal(view.badge.kind, 'shown');
  assert.equal(view.badge.text, '2');
  assert.equal(view.body.kind, 'populated');
  assert.ok(view.body.rows.length > 1);
  assert.deepEqual(list(view.body.rows.map((row) => row.body)), [
    'Your maple board shipped.',
    'The wool throw you saved is back in stock.',
    'How was the ceramic pour-over?',
    'You earned $8 in store credit.',
  ]);
  assert.deepEqual(list(view.body.rows.map((row) => row.time)), ['3h', '1d', '4d', 'Oct 9']);
  assert.deepEqual(list(view.body.rows.map((row) => row.initials)), ['SD', 'CC', 'R', 'CC']);
  assert.deepEqual(list(view.body.rows.map((row) => row.unread)), [true, true, false, false]);
  assert.equal(view.body.rows[0].avatar.name, 'Shipping desk');
  assert.equal(view.body.rows[0].avatar.src, null);
});

test('the newest note stays first when the shop reverses the list', () => {
  const remote = settle('populated', NOW);
  const reversed = { status: 'ready', items: remote.items.slice().reverse() };
  const view = present(reversed, NOW);
  assert.equal(view.body.rows[0].body, 'Your maple board shipped.');
  assert.equal(view.body.rows.at(-1).body, 'You earned $8 in store credit.');
});

test('an empty inbox names what will arrive and hides the count', () => {
  const view = present(settle('empty', NOW), NOW);
  assert.equal(view.body.kind, 'empty');
  assert.equal(view.body.illustration, 'bell');
  assert.equal(view.body.sentence, 'Orders, shipping updates, and shop messages show up here.');
  assert.equal(view.body.sentence.includes('No data'), false);
  assert.equal(view.body.action, null);
  assert.equal(view.badge.kind, 'hidden');
});

test('read notes stay listed when every note is already read', () => {
  const remote = settle('populated', NOW);
  const read = {
    status: 'ready',
    items: remote.items.map((item) => ({ ...item, unread: false })),
  };
  const view = present(read, NOW);
  assert.equal(view.badge.kind, 'hidden');
  assert.equal(view.body.kind, 'populated');
  assert.equal(view.body.rows.length, 4);
});

test('a count above 99 shows 99+', () => {
  const items = Array.from({ length: 120 }, (_, index) => ({
    id: `n-${index}`,
    actorName: 'Cedar & Co.',
    actorSrc: null,
    body: `Update ${index}`,
    createdAt: NOW - index * 60 * 1000,
    unread: true,
  }));
  const view = present({ status: 'ready', items }, NOW);
  assert.equal(view.badge.text, '99+');
  assert.equal(view.body.rows.length, 120);
  assert.equal(view.body.rows[0].body, 'Update 0');
});

test('loading and failure leave the count blank', () => {
  const loading = present({ status: 'loading' }, NOW);
  assert.equal(loading.body.kind, 'loading');
  assert.equal(loading.body.rows.length, 3);
  assert.deepEqual(list(loading.body.rows), ['skeleton', 'skeleton', 'skeleton']);
  assert.equal(loading.badge.kind, 'quiet');

  const failed = present(settle('failed', NOW), NOW);
  assert.equal(failed.body.kind, 'failed');
  assert.equal(failed.body.sentence, 'The shop did not send your notifications.');
  assert.equal(failed.body.retryLabel, 'Retry');
  assert.equal(failed.badge.kind, 'quiet');
});

test('a shop payload that is not a list of notes is refused', () => {
  assert.equal(parseNotifications({ items: [] }).ok, false);
  assert.equal(parseNotifications([{ id: 'x' }]).ok, false);
  assert.equal(parseNotifications(null).ok, false);
  const note = {
    id: 'a',
    actorName: 'Shipping desk',
    actorSrc: null,
    body: 'Packed.',
    createdAt: NOW,
    unread: true,
  };
  assert.equal(parseNotifications([note, { ...note }]).ok, false);
  assert.equal(parseNotifications([{ ...note, unread: 'yes' }]).ok, false);
});

test('initials skip symbols and keep two letters', () => {
  assert.equal(initials('Cedar & Co.'), 'CC');
  assert.equal(initials('Reviews'), 'R');
});

test('retrying the same shop response lands on the same inbox', async () => {
  const loader = createInboxLoader({ delayMs: 0, now: () => NOW });
  const first = await loader.load('empty');
  const second = await loader.load('empty');
  assert.equal(first.ignored, false);
  assert.equal(second.ignored, false);
  assert.deepEqual(list(first.remote), list(second.remote));
  assert.deepEqual(list(first.remote), { status: 'ready', items: [] });
});

test('a newer shop response replaces one still in flight', async () => {
  const loader = createInboxLoader({ delayMs: 40, now: () => NOW });
  const first = loader.load('failed');
  const second = loader.load('populated');
  const [older, newer] = await Promise.all([first, second]);
  assert.equal(older.ignored, true);
  assert.equal(newer.ignored, false);
  assert.equal(newer.remote.status, 'ready');
  assert.ok(newer.remote.items.length > 1);
});

test('an unknown shop response is a failure', async () => {
  const loader = createInboxLoader({ delayMs: 0, now: () => NOW });
  const result = await loader.load('elsewhere');
  assert.equal(result.ignored, false);
  assert.deepEqual(list(result.remote), { status: 'failed' });
});

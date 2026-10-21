import assert from 'node:assert/strict';
import { test } from 'node:test';

await import('../components/AsyncList.js');
await import('../components/Avatar.js');
await import('../components/Badge.js');
await import('../components/EmptyState.js');
await import('../components/RowSkeleton.js');
await import('./model.js');
await import('./remote.js');

const {
  AsyncList,
  Avatar,
  Badge,
  EmptyState,
  RowSkeleton,
  SOURCES,
  fetchNotifications,
  formatWhen,
  listStatus,
  markRead,
  parseNotifications,
  settle,
  unreadCount,
} = globalThis.ShopWillow;

const NOW = Date.UTC(2026, 9, 21, 15, 0, 0);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

test('badge hides at zero and caps above 99', () => {
  assert.equal(Badge({ count: 0 }), null);
  assert.equal(Badge({ count: null }), null);
  assert.equal(Badge({ count: 3 }), '3');
  assert.equal(Badge({ count: 99 }), '99');
  assert.equal(Badge({ count: 100 }), '99+');
});

test('the list slot follows the status', () => {
  const slots = {
    loading: { slot: 'loading' },
    empty: { slot: 'empty' },
    failed: { slot: 'failed' },
    populated: { slot: 'populated' },
  };
  for (const status of ['loading', 'empty', 'failed', 'populated']) {
    assert.equal(AsyncList({ status, ...slots }), slots[status]);
  }
});

test('empty state keeps one illustration, one sentence, and one action', () => {
  assert.deepEqual(
    EmptyState({ illustration: 'willow', sentence: "You're all caught up.", action: null }),
    { illustration: 'willow', sentence: "You're all caught up.", action: null },
  );
});

test('avatar returns the sender face it was given', () => {
  assert.deepEqual(Avatar({ name: 'Willow Studio', src: null }), {
    name: 'Willow Studio',
    src: null,
  });
});

test('a skeleton row is present while loading', () => {
  assert.equal(RowSkeleton(), 'skeleton');
});

test('unread count stays unknown until a ready list arrives', () => {
  assert.equal(unreadCount({ kind: 'loading' }), null);
  assert.equal(unreadCount({ kind: 'failed' }), null);
  assert.equal(unreadCount({ kind: 'ready', notifications: [] }), 0);
  assert.equal(Badge({ count: unreadCount({ kind: 'loading' }) }), null);
  assert.equal(Badge({ count: unreadCount({ kind: 'failed' }) }), null);
  assert.equal(Badge({ count: unreadCount({ kind: 'ready', notifications: [] }) }), null);
});

test('list status is derived from the load', () => {
  assert.equal(listStatus({ kind: 'loading' }), 'loading');
  assert.equal(listStatus({ kind: 'failed' }), 'failed');
  assert.equal(listStatus({ kind: 'ready', notifications: [] }), 'empty');
  assert.equal(listStatus({ kind: 'ready', notifications: [{ id: 'a' }] }), 'populated');
});

test('relative time uses a short age under 7 days and a date after', () => {
  assert.equal(formatWhen(NOW, NOW), 'now');
  assert.equal(formatWhen(NOW - MINUTE + 1, NOW), 'now');
  assert.equal(formatWhen(NOW - MINUTE, NOW), '1m');
  assert.equal(formatWhen(NOW - 3 * HOUR, NOW), '3h');
  assert.equal(formatWhen(NOW - 26 * HOUR, NOW), '1d');
  assert.equal(formatWhen(NOW - 6 * DAY, NOW), '6d');
  assert.equal(formatWhen(NOW - WEEK + 1, NOW), '6d');
  assert.equal(formatWhen(NOW - WEEK, NOW), 'Oct 14');
  assert.equal(formatWhen(Date.UTC(2025, 9, 13), NOW), 'Oct 13, 2025');
});

test('a bad payload settles as failed and a list settles as ready', () => {
  assert.deepEqual(settle({ nope: true }, NOW), { kind: 'failed' });
  assert.throws(() => parseNotifications([{ id: 'x' }]));
  const ready = settle([], NOW);
  assert.equal(ready.kind, 'ready');
  assert.deepEqual(ready.notifications, []);
  assert.equal(listStatus(ready), 'empty');
});

test('actor images have to be https or an image data uri', () => {
  const base = {
    id: 'a',
    actor: { name: 'Willow Studio', src: 'javascript:alert(1)' },
    summary: 'Hello',
    detail: 'There',
    createdAt: new Date(NOW).toISOString(),
    read: false,
  };
  assert.throws(() => parseNotifications([base]));
  assert.equal(parseNotifications([{ ...base, actor: { name: 'Willow Studio', src: null } }])[0].actorSrc, null);
});

test('opening a notice marks that notice read once', () => {
  const load = {
    kind: 'ready',
    asOf: NOW,
    notifications: [
      notice('a', false),
      notice('b', false),
    ],
  };
  const once = markRead(load, 'a');
  assert.equal(once.notifications[0].read, true);
  assert.equal(once.notifications[1].read, false);
  assert.equal(unreadCount(once), 1);
  assert.equal(markRead(once, 'a'), once);
  assert.equal(markRead({ kind: 'loading' }, 'a').kind, 'loading');
});

test('the sample inbox has several notices and the four sources behave', async () => {
  assert.deepEqual(SOURCES.map((source) => source.id), ['inbox', 'empty', 'failed', 'loading']);

  const raw = await fetchNotifications('inbox', { now: NOW, delayMs: 0 });
  const notifications = parseNotifications(raw);
  assert.deepEqual(notifications.map((item) => item.id), [
    'ship-1842',
    'yarn-fog',
    'pourer-drop',
    'apron-review',
    'october-hours',
  ]);
  assert.deepEqual(notifications.map((item) => item.read), [false, false, false, true, true]);
  assert.ok(notifications.length > 1);
  assert.equal(unreadCount({ kind: 'ready', notifications }), 3);
  assert.equal(formatWhen(notifications[0].createdAt, NOW), '3h');
  assert.equal(formatWhen(notifications[2].createdAt, NOW), '1d');
  assert.equal(formatWhen(notifications[3].createdAt, NOW), '4d');
  assert.equal(formatWhen(notifications[4].createdAt, NOW), 'Oct 1');

  const empty = await fetchNotifications('empty', { delayMs: 0 });
  assert.deepEqual(empty, []);

  await assert.rejects(fetchNotifications('failed', { delayMs: 0 }), /offline/);
  await assert.rejects(fetchNotifications('elsewhere', { delayMs: 0 }), /unknown/);

  const controller = new AbortController();
  const pending = fetchNotifications('loading', { signal: controller.signal, delayMs: 20 });
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(settled, false);
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

function notice(id, read) {
  return {
    id,
    actorName: 'Shop',
    actorSrc: null,
    summary: 'Summary',
    detail: 'Detail',
    createdAt: NOW,
    read,
  };
}

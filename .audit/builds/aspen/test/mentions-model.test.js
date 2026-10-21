import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMentions, projectMentions, relativeTime } from '../src/mentions-model.js';

const NOW = Date.parse('2026-10-21T18:18:00.000Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function mention(overrides) {
  return {
    id: 'm1',
    actorName: 'Mara Chen',
    body: 'Your monstera cutting has roots.',
    createdAt: '2026-10-21T15:18:00.000Z',
    seen: false,
    ...overrides,
  };
}

test('a remote list parses into mentions newest first', () => {
  const mentions = parseMentions({
    unseenCount: 999,
    mentions: [
      mention({ id: 'older', createdAt: '2026-10-19T18:00:00.000Z', seen: true }),
      mention({ id: 'newer', createdAt: '2026-10-21T17:55:00.000Z' }),
    ],
  });
  assert.deepEqual(mentions.map((item) => item.id), ['newer', 'older']);
  assert.equal(mentions[0].actorName, 'Mara Chen');
  assert.equal(mentions[0].createdAt, Date.parse('2026-10-21T17:55:00.000Z'));
  assert.equal(mentions[0].seen, false);
});

test('the unseen count is the number of mentions that are not seen', () => {
  const mentions = parseMentions({
    unseenCount: 999,
    mentions: [
      mention({ id: 'a', seen: false }),
      mention({ id: 'b', seen: true, createdAt: '2026-10-21T12:00:00.000Z' }),
      mention({ id: 'c', seen: false, createdAt: '2026-10-20T12:00:00.000Z' }),
    ],
  });
  const view = projectMentions('ready', mentions);
  assert.equal(view.status, 'populated');
  assert.equal(view.unseen, 2);
  assert.equal(view.mentions.length, 3);
});

test('loading and failure keep the badge quiet', () => {
  assert.deepEqual(projectMentions('loading', []), {
    status: 'loading',
    mentions: [],
    unseen: null,
  });
  assert.deepEqual(projectMentions('failed', []), {
    status: 'failed',
    mentions: [],
    unseen: null,
  });
});

test('an empty ready list is empty and the count is zero', () => {
  assert.deepEqual(projectMentions('ready', []), {
    status: 'empty',
    mentions: [],
    unseen: 0,
  });
});

test('a payload that is not a mention list fails', () => {
  assert.throws(() => parseMentions(null));
  assert.throws(() => parseMentions({ mentions: {} }));
  assert.throws(() => parseMentions([]));
  assert.throws(() => parseMentions({ mentions: [mention({ seen: 'false' })] }));
  assert.throws(() => parseMentions({ mentions: [mention({ id: '  ' })] }));
  assert.throws(() => parseMentions({ mentions: [mention({ createdAt: 'yesterday' })] }));
});

test('relative time stays compact under seven days and becomes a date after that', () => {
  assert.equal(relativeTime(NOW - 30 * 1000, NOW), 'now');
  assert.equal(relativeTime(NOW + 5 * MINUTE, NOW), 'now');
  assert.equal(relativeTime(NOW - MINUTE, NOW), '1m');
  assert.equal(relativeTime(NOW - 23 * MINUTE, NOW), '23m');
  assert.equal(relativeTime(NOW - 3 * HOUR, NOW), '3h');
  assert.equal(relativeTime(NOW - 2 * DAY, NOW), '2d');
  assert.equal(relativeTime(NOW - 6 * DAY, NOW), '6d');
  assert.equal(relativeTime(NOW - 7 * DAY, NOW), 'Oct 14, 2026');
});

test('the shipped mention feed populates the list and the header count', () => {
  const payload = JSON.parse(readFileSync(new URL('../data/mentions.json', import.meta.url), 'utf8'));
  const mentions = parseMentions(payload);
  const view = projectMentions('ready', mentions);
  const week = 7 * DAY;
  assert.equal(view.status, 'populated');
  assert.ok(view.mentions.length > 1);
  assert.ok(view.unseen > 0);
  assert.ok(view.mentions.every((item) => item.actorName && item.body));
  assert.ok(view.mentions.some((item) => NOW - item.createdAt < week));
  assert.ok(view.mentions.some((item) => NOW - item.createdAt >= week));
  assert.equal(view.unseen, payload.mentions.filter((item) => item.seen === false).length);
});

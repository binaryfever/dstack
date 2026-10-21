const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const SKELETON_ROWS = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LOAD_DELAY_MS = 800;

const EMPTY_SENTENCE = 'Orders, shipping updates, and shop messages show up here.';
const FAILED_SENTENCE = 'The shop did not send your notifications.';
const RETRY_LABEL = 'Retry';

function relativeTime(createdAt, now) {
  const delta = now - createdAt;
  if (delta < 0 || delta >= WEEK) return formatDate(createdAt, now);
  if (delta < MINUTE) return 'now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  return `${Math.floor(delta / DAY)}d`;
}

function parseNotifications(payload) {
  if (!Array.isArray(payload)) return { ok: false };
  const items = [];
  const seen = new Set();
  for (const raw of payload) {
    const item = parseNotification(raw);
    if (item == null || seen.has(item.id)) return { ok: false };
    seen.add(item.id);
    items.push(item);
  }
  return { ok: true, items };
}

function settle(scenario, now) {
  if (scenario === 'failed') return { status: 'failed' };
  if (scenario !== 'empty' && scenario !== 'populated') return { status: 'failed' };
  const raw = scenario === 'empty' ? [] : samplePayload(now);
  const parsed = parseNotifications(raw);
  if (!parsed.ok) return { status: 'failed' };
  return { status: 'ready', items: parsed.items };
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function loadInbox(scenario, { now = Date.now(), delayMs = LOAD_DELAY_MS, signal } = {}) {
  await delay(delayMs, signal);
  return settle(scenario, now);
}

function createInboxLoader({ delayMs = LOAD_DELAY_MS, now = () => Date.now() } = {}) {
  let request = 0;
  let controller = null;
  return {
    async load(scenario) {
      controller?.abort();
      controller = new AbortController();
      const current = ++request;
      const started = now();
      try {
        const remote = await loadInbox(scenario, {
          now: started,
          delayMs,
          signal: controller.signal,
        });
        if (current !== request) return { ignored: true };
        return { ignored: false, remote, now: started };
      } catch {
        if (current !== request) return { ignored: true };
        return { ignored: false, remote: { status: 'failed' }, now: started };
      }
    },
  };
}

function present(remote, now) {
  const status = listStatus(remote);
  const items = remote.status === 'ready' ? remote.items : [];
  const empty = {
    kind: 'empty',
    ...EmptyState({
      illustration: 'bell',
      sentence: EMPTY_SENTENCE,
      action: null,
    }),
  };
  const loading = {
    kind: 'loading',
    rows: Array.from({ length: SKELETON_ROWS }, () => RowSkeleton()),
  };
  const failed = {
    kind: 'failed',
    sentence: FAILED_SENTENCE,
    retryLabel: RETRY_LABEL,
  };
  const populated = {
    kind: 'populated',
    rows: items
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map((item) => NotificationRow(item, now)),
  };
  return {
    badge: badgeView(remote),
    body: AsyncList({ status, empty, loading, failed, populated }),
  };
}

function NotificationRow(item, now) {
  return {
    id: item.id,
    avatar: Avatar({ name: item.actorName, src: item.actorSrc }),
    initials: initials(item.actorName),
    actorName: item.actorName,
    body: item.body,
    time: relativeTime(item.createdAt, now),
    createdAt: item.createdAt,
    unread: item.unread,
  };
}

function initials(name) {
  const parts = name.split(/\s+/).filter((part) => /[A-Za-z0-9]/.test(part));
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function formatDate(createdAt, now) {
  const date = new Date(createdAt);
  const month = MONTHS[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  if (year === new Date(now).getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${year}`;
}

function parseNotification(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const { id, actorName, actorSrc, body, createdAt, unread } = raw;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof actorName !== 'string' || actorName.trim() === '') return null;
  if (!(actorSrc == null || typeof actorSrc === 'string')) return null;
  if (typeof body !== 'string' || body.trim() === '') return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  if (typeof unread !== 'boolean') return null;
  return {
    id,
    actorName,
    actorSrc: actorSrc == null || actorSrc === '' ? null : actorSrc,
    body,
    createdAt,
    unread,
  };
}

function samplePayload(now) {
  return [
    {
      id: 'ship-1842',
      actorName: 'Shipping desk',
      actorSrc: null,
      body: 'Your maple board shipped.',
      createdAt: now - 3 * HOUR,
      unread: true,
    },
    {
      id: 'restock-wool',
      actorName: 'Cedar & Co.',
      actorSrc: null,
      body: 'The wool throw you saved is back in stock.',
      createdAt: now - DAY,
      unread: true,
    },
    {
      id: 'review-pour',
      actorName: 'Reviews',
      actorSrc: null,
      body: 'How was the ceramic pour-over?',
      createdAt: now - 4 * DAY,
      unread: false,
    },
    {
      id: 'credit-8',
      actorName: 'Cedar & Co.',
      actorSrc: null,
      body: 'You earned $8 in store credit.',
      createdAt: now - 12 * DAY,
      unread: false,
    },
  ];
}

function listStatus(remote) {
  if (remote.status === 'loading') return 'loading';
  if (remote.status === 'failed') return 'failed';
  if (remote.items.length === 0) return 'empty';
  return 'populated';
}

function badgeView(remote) {
  if (remote.status !== 'ready') return { kind: 'quiet' };
  const count = remote.items.reduce((total, item) => total + (item.unread ? 1 : 0), 0);
  const text = Badge({ count });
  if (text == null) return { kind: 'hidden' };
  return { kind: 'shown', text };
}

function abortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

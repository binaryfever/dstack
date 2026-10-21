(function () {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  function parseNotifications(raw) {
    if (!Array.isArray(raw)) {
      throw new Error('notifications payload is not a list');
    }
    const seen = new Set();
    return raw.map((item, index) => parseOne(item, index, seen));
  }

  function parseOne(item, index, seen) {
    if (item == null || typeof item !== 'object') {
      throw new Error('notification ' + index + ' is missing');
    }
    const id = requiredString(item.id, 'id');
    if (seen.has(id)) {
      throw new Error('duplicate notification id ' + id);
    }
    seen.add(id);
    const actor = item.actor;
    if (actor == null || typeof actor !== 'object') {
      throw new Error('notification ' + id + ' has no actor');
    }
    const actorName = requiredString(actor.name, 'actor name');
    const actorSrc = parseSrc(actor.src, id);
    const summary = requiredString(item.summary, 'summary');
    const detail = requiredString(item.detail, 'detail');
    const createdAt = parseTime(item.createdAt, id);
    if (typeof item.read !== 'boolean') {
      throw new Error('notification ' + id + ' read flag is missing');
    }
    return { id, actorName, actorSrc, summary, detail, createdAt, read: item.read };
  }

  function requiredString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(label + ' is missing');
    }
    return value;
  }

  function parseSrc(src, id) {
    if (src == null || src === '') return null;
    if (typeof src !== 'string') {
      throw new Error('notification ' + id + ' actor src is not a string');
    }
    if (/^https:\/\/[^\s]+$/.test(src)) return src;
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) return src;
    if (/^data:image\/svg\+xml(?:,|%2C|;)/i.test(src)) return src;
    throw new Error('notification ' + id + ' actor src is not an image');
  }

  function parseTime(value, id) {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) {
      throw new Error('notification ' + id + ' createdAt is not a time');
    }
    return ms;
  }

  function settle(raw, asOf) {
    try {
      return { kind: 'ready', notifications: parseNotifications(raw), asOf };
    } catch {
      return { kind: 'failed' };
    }
  }

  function listStatus(load) {
    if (load.kind === 'loading') return 'loading';
    if (load.kind === 'failed') return 'failed';
    if (load.notifications.length === 0) return 'empty';
    return 'populated';
  }

  function unreadCount(load) {
    if (load.kind !== 'ready') return null;
    return load.notifications.reduce((total, item) => total + (item.read ? 0 : 1), 0);
  }

  function formatWhen(createdAt, now) {
    const age = now - createdAt;
    if (age < MINUTE) return 'now';
    if (age < HOUR) return Math.floor(age / MINUTE) + 'm';
    if (age < DAY) return Math.floor(age / HOUR) + 'h';
    if (age < WEEK) return Math.floor(age / DAY) + 'd';
    return formatDate(createdAt, now);
  }

  function formatDate(createdAt, now) {
    const when = new Date(createdAt);
    const sameYear = when.getUTCFullYear() === new Date(now).getUTCFullYear();
    const options = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (!sameYear) options.year = 'numeric';
    return new Intl.DateTimeFormat('en-US', options).format(when);
  }

  function markRead(load, id) {
    if (load.kind !== 'ready') return load;
    let changed = false;
    const notifications = load.notifications.map((item) => {
      if (item.id !== id || item.read) return item;
      changed = true;
      return { ...item, read: true };
    });
    if (!changed) return load;
    return { ...load, notifications };
  }

  globalThis.ShopWillow ??= {};
  Object.assign(globalThis.ShopWillow, {
    parseNotifications,
    settle,
    listStatus,
    unreadCount,
    formatWhen,
    markRead,
  });
})();

/**
 * @typedef {Object} Mention
 * @property {string} id
 * @property {string} actorName
 * @property {string} [actorSrc]
 * @property {string} body
 * @property {string} [place]
 * @property {number} createdAt
 * @property {boolean} seen
 */

/**
 * @typedef {Object} MentionsView
 * @property {'loading' | 'empty' | 'failed' | 'populated'} status
 * @property {Mention[]} mentions
 * @property {number | null} unseen
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const absoluteDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseMention(raw, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`mention ${index} must be an object`);
  }
  const id = requiredString(raw.id, `mention ${index} id`);
  const actorName = requiredString(raw.actorName, `mention ${index} actorName`);
  const body = requiredString(raw.body, `mention ${index} body`);
  if (typeof raw.seen !== 'boolean') {
    throw new Error(`mention ${index} seen must be a boolean`);
  }
  if (typeof raw.createdAt !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) {
    throw new Error(`mention ${index} createdAt must be an ISO date`);
  }
  const mention = {
    id,
    actorName,
    body,
    createdAt: Date.parse(raw.createdAt),
    seen: raw.seen,
  };
  if (raw.actorSrc != null) {
    mention.actorSrc = requiredString(raw.actorSrc, `mention ${index} actorSrc`);
  }
  if (raw.place != null) {
    mention.place = requiredString(raw.place, `mention ${index} place`);
  }
  return mention;
}

export function parseMentions(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.mentions)) {
    throw new Error('mentions payload must include a mentions array');
  }
  const mentions = payload.mentions.map(parseMention);
  mentions.sort((a, b) => b.createdAt - a.createdAt);
  return mentions;
}

export function projectMentions(phase, mentions) {
  if (phase === 'loading') {
    return { status: 'loading', mentions: [], unseen: null };
  }
  if (phase === 'failed') {
    return { status: 'failed', mentions: [], unseen: null };
  }
  if (phase !== 'ready') {
    throw new Error(`unknown mentions phase ${phase}`);
  }
  if (mentions.length === 0) {
    return { status: 'empty', mentions: [], unseen: 0 };
  }
  const unseen = mentions.reduce((count, mention) => count + (mention.seen ? 0 : 1), 0);
  return { status: 'populated', mentions, unseen };
}

export function relativeTime(createdAt, now) {
  const delta = now - createdAt;
  if (delta < MINUTE) return 'now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`;
  return absoluteDate.format(createdAt);
}

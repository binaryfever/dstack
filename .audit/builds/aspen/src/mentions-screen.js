import { parseMentions, projectMentions, relativeTime } from './mentions-model.js';

const SVG = 'http://www.w3.org/2000/svg';

function illustration() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('empty-illustration');
  const bubble = document.createElementNS(SVG, 'path');
  bubble.setAttribute(
    'd',
    'M16 14h32a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H30l-10 8 2-8H16a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z',
  );
  bubble.setAttribute('fill', '#e8f0fe');
  svg.appendChild(bubble);
  for (const cx of [24, 32, 40]) {
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', '30');
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', 'currentColor');
    svg.appendChild(dot);
  }
  return svg;
}

function mentionRow(mention, now) {
  const { Avatar } = globalThis.ShopAspen;
  const row = document.createElement('li');
  row.className = mention.seen ? 'mention-row' : 'mention-row is-unseen';
  row.appendChild(Avatar({ name: mention.actorName, src: mention.actorSrc }));

  const text = document.createElement('div');
  text.className = 'mention-text';

  const title = document.createElement('div');
  title.className = 'mention-title';
  const name = document.createElement('span');
  name.className = 'mention-name';
  name.textContent = mention.actorName;
  const time = document.createElement('time');
  time.className = 'mention-time';
  time.dateTime = new Date(mention.createdAt).toISOString();
  time.textContent = relativeTime(mention.createdAt, now);
  title.append(name, time);
  text.appendChild(title);

  if (mention.place) {
    const place = document.createElement('p');
    place.className = 'mention-place';
    place.textContent = mention.place;
    text.appendChild(place);
  }

  const body = document.createElement('p');
  body.className = 'mention-body';
  body.textContent = mention.body;
  text.appendChild(body);
  row.appendChild(text);
  return row;
}

function failedSlot(onRetry) {
  const failed = document.createElement('div');
  failed.className = 'mentions-failed';
  failed.setAttribute('role', 'alert');
  const sentence = document.createElement('p');
  sentence.textContent = "Mentions didn't load.";
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.addEventListener('click', onRetry);
  failed.append(sentence, retry);
  return failed;
}

function loadingSlot() {
  const loading = document.createElement('div');
  for (let i = 0; i < 3; i += 1) loading.appendChild(globalThis.ShopAspen.RowSkeleton());
  return loading;
}

export function renderMentions(root, view, { onRetry, now }) {
  const { AsyncList, EmptyState, Badge } = globalThis.ShopAspen;
  root.replaceChildren();

  const header = document.createElement('header');
  header.className = 'mentions-header';
  const title = document.createElement('h1');
  title.textContent = 'Mentions';
  header.appendChild(title);
  if (view.unseen != null) {
    const badge = Badge({ count: view.unseen });
    if (badge) {
      badge.setAttribute('aria-label', `${view.unseen} unseen`);
      header.appendChild(badge);
    }
  }
  root.appendChild(header);

  const listHost = document.createElement('div');
  if (view.status === 'loading') listHost.setAttribute('aria-busy', 'true');

  const populated = document.createElement('ul');
  populated.className = 'mention-rows';
  for (const mention of view.mentions) populated.appendChild(mentionRow(mention, now));

  AsyncList({
    status: view.status,
    mount: listHost,
    loading: loadingSlot(),
    empty: EmptyState({
      illustration: illustration(),
      sentence: 'No mentions yet.',
    }),
    failed: failedSlot(onRetry),
    populated,
  });
  root.appendChild(listHost);
}

export function startMentions(root, url) {
  let requestId = 0;

  async function load() {
    const current = ++requestId;
    renderMentions(root, projectMentions('loading', []), { onRetry: load, now: Date.now() });
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`mentions request failed: ${response.status}`);
      const mentions = parseMentions(await response.json());
      if (current !== requestId) return;
      renderMentions(root, projectMentions('ready', mentions), { onRetry: load, now: Date.now() });
    } catch {
      if (current !== requestId) return;
      renderMentions(root, projectMentions('failed', []), { onRetry: load, now: Date.now() });
    }
  }

  load();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#mentions');
  if (root) startMentions(root, new URL('../data/mentions.json', import.meta.url));
}

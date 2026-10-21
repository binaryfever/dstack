const app = document.querySelector('#app');
const loader = createInboxLoader();
const scenarios = [
  { id: 'populated', label: 'New updates' },
  { id: 'empty', label: 'Nothing waiting' },
  { id: 'failed', label: 'Cannot reach the shop' },
];

if (app != null) mount(app);

function mount(root) {
  const shell = document.createElement('main');
  shell.className = 'shell';

  const header = document.createElement('header');
  header.className = 'bar';
  const title = document.createElement('h1');
  title.id = 'notifications-title';
  title.textContent = 'Notifications';
  const badgeSlot = document.createElement('div');
  badgeSlot.className = 'badge-slot';
  header.append(title, badgeSlot);

  const field = document.createElement('div');
  field.className = 'preview';
  const label = document.createElement('label');
  const labelText = document.createElement('span');
  labelText.textContent = 'Shop response';
  const select = document.createElement('select');
  for (const scenario of scenarios) {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.label;
    if (scenario.id === 'populated') option.selected = true;
    select.append(option);
  }
  label.append(labelText, select);
  field.append(label);

  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.tabIndex = -1;
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-labelledby', 'notifications-title');

  shell.append(header, field, panel);
  root.replaceChildren(shell);

  async function run(scenario, focusResult) {
    draw({ status: 'loading' }, Date.now());
    const result = await loader.load(scenario);
    if (result.ignored) return;
    draw(result.remote, result.now);
    if (!focusResult) return;
    const retry = panel.querySelector('.retry');
    if (retry) retry.focus();
    else panel.focus();
  }

  function draw(remote, now) {
    const view = present(remote, now);
    paintBadge(badgeSlot, view.badge);
    paintPanel(panel, view.body, () => {
      panel.focus();
      void run(select.value, true);
    });
  }

  select.addEventListener('change', () => {
    void run(select.value);
  });
  void run(select.value);
}

function paintBadge(slot, badge) {
  slot.replaceChildren();
  if (badge.kind !== 'shown') return;
  const el = document.createElement('span');
  el.className = 'badge';
  el.textContent = badge.text;
  el.setAttribute('aria-label', `${badge.text} unread`);
  slot.append(el);
}

function paintPanel(panel, body, onRetry) {
  panel.replaceChildren();
  panel.dataset.state = body.kind;
  panel.setAttribute('aria-busy', body.kind === 'loading' ? 'true' : 'false');
  if (body.kind === 'loading') panel.append(paintLoading(body));
  else if (body.kind === 'empty') panel.append(paintEmpty(body));
  else if (body.kind === 'failed') panel.append(paintFailed(body, onRetry));
  else if (body.kind === 'populated') panel.append(paintRows(body));
  else throw new Error(`Unknown list body ${body.kind}`);
}

function paintLoading(body) {
  const wrap = document.createElement('div');
  wrap.className = 'loading';
  const status = document.createElement('p');
  status.className = 'sr-only';
  status.textContent = 'Loading notifications';
  wrap.append(status);
  for (const marker of body.rows) {
    const row = document.createElement('div');
    row.className = 'row skeleton';
    row.setAttribute('aria-hidden', 'true');
    row.dataset.marker = String(marker);
    const avatar = document.createElement('span');
    avatar.className = 'avatar skel-block';
    const copy = document.createElement('div');
    copy.className = 'copy';
    const short = document.createElement('span');
    short.className = 'skel-block line short';
    const line = document.createElement('span');
    line.className = 'skel-block line';
    copy.append(short, line);
    row.append(avatar, copy);
    wrap.append(row);
  }
  return wrap;
}

function paintEmpty(body) {
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  wrap.append(bellIcon());
  const sentence = document.createElement('p');
  sentence.textContent = body.sentence;
  wrap.append(sentence);
  return wrap;
}

function paintFailed(body, onRetry) {
  const wrap = document.createElement('div');
  wrap.className = 'failed';
  const sentence = document.createElement('p');
  sentence.textContent = body.sentence;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'retry';
  button.textContent = body.retryLabel;
  button.addEventListener('click', onRetry);
  wrap.append(sentence, button);
  return wrap;
}

function paintRows(body) {
  const list = document.createElement('ul');
  list.className = 'list';
  for (const row of body.rows) list.append(paintRow(row));
  return list;
}

function paintRow(row) {
  const item = document.createElement('li');
  item.className = row.unread ? 'row unread' : 'row';
  item.append(paintAvatar(row));
  const copy = document.createElement('div');
  copy.className = 'copy';
  const actor = document.createElement('p');
  actor.className = 'actor';
  if (row.unread) {
    const flag = document.createElement('span');
    flag.className = 'sr-only';
    flag.textContent = 'Unread.';
    actor.append(flag, document.createTextNode(' '));
  }
  actor.append(document.createTextNode(row.actorName));
  const message = document.createElement('p');
  message.className = 'message';
  message.textContent = row.body;
  copy.append(actor, message);
  const time = document.createElement('time');
  time.dateTime = new Date(row.createdAt).toISOString();
  time.textContent = row.time;
  item.append(copy, time);
  return item;
}

function paintAvatar(row) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.setAttribute('aria-hidden', 'true');
  if (row.avatar.src) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = row.avatar.src;
    el.append(img);
    return el;
  }
  el.textContent = row.initials;
  return el;
}

function bellIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('illustration');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M24 8v2.5M16.5 22a7.5 7.5 0 0 1 15 0v7.2l2.4 3.3H14.1l2.4-3.3V22zM20.5 35.2a3.5 3.5 0 0 0 7 0',
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

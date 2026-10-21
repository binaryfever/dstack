(function () {
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
    settle,
    unreadCount,
  } = globalThis.ShopWillow;

  const SVG = 'http://www.w3.org/2000/svg';
  const root = document.querySelector('#app');
  let load = { kind: 'loading' };
  let scenario = 'inbox';
  let requestId = 0;
  let controller = new AbortController();

  root.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.name === 'source') loadScenario(input.value);
  });

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry]')) {
      loadScenario(scenario);
      return;
    }
    const note = event.target.closest('[data-note-id]');
    if (!note) return;
    const next = markRead(load, note.dataset.noteId);
    if (next === load) return;
    load = next;
    paint();
  });

  loadScenario('inbox');

  function loadScenario(next) {
    scenario = next;
    requestId += 1;
    const token = requestId;
    controller.abort();
    controller = new AbortController();
    load = { kind: 'loading' };
    paint();
    const now = Date.now();
    fetchNotifications(next, {
      signal: controller.signal,
      now,
      delayMs: delayFromLocation(),
    })
      .then((raw) => {
        if (token !== requestId) return;
        load = settle(raw, now);
        paint();
      })
      .catch((error) => {
        if (token !== requestId || error.name === 'AbortError') return;
        load = { kind: 'failed' };
        paint();
      });
  }

  function delayFromLocation() {
    const raw = new URLSearchParams(location.search).get('delay');
    if (raw == null || raw === '') return 700;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return 700;
    return value;
  }

  function paint() {
    const focusKey = document.activeElement?.dataset?.focusKey ?? null;
    root.replaceChildren(renderSheet());
    if (!focusKey) return;
    root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  function renderSheet() {
    const sheet = document.createElement('main');
    sheet.className = 'sheet';
    sheet.append(renderHeader(), renderStatus(), renderPanel());
    return sheet;
  }

  function renderHeader() {
    const header = document.createElement('header');
    header.className = 'top';

    const shop = document.createElement('p');
    shop.className = 'shop';
    shop.textContent = 'Shop Willow';

    const row = document.createElement('div');
    row.className = 'title-row';
    const heading = document.createElement('h1');
    heading.textContent = 'Notifications';
    row.append(heading);

    const countLabel = Badge({ count: unreadCount(load) });
    if (countLabel != null) {
      const badge = document.createElement('span');
      badge.className = 'unread';
      badge.textContent = countLabel;
      const quiet = document.createElement('span');
      quiet.className = 'sr-only';
      quiet.textContent = ' unread';
      badge.append(quiet);
      row.append(badge);
    }

    header.append(shop, row, renderSource());
    return header;
  }

  function renderSource() {
    const field = document.createElement('fieldset');
    field.className = 'source';
    const legend = document.createElement('legend');
    legend.textContent = 'Source';
    field.append(legend);
    for (const source of SOURCES) {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'source';
      input.value = source.id;
      input.checked = source.id === scenario;
      input.dataset.focusKey = 'source-' + source.id;
      const text = document.createElement('span');
      text.textContent = source.label;
      label.append(input, text);
      field.append(label);
    }
    return field;
  }

  function renderStatus() {
    const status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    status.textContent = statusText();
    return status;
  }

  function statusText() {
    const status = listStatus(load);
    if (status === 'loading') return 'Loading notifications.';
    if (status === 'failed') return "Notifications didn't load.";
    if (status === 'empty') return "You're all caught up.";
    const count = unreadCount(load);
    if (!count) return 'No unread notifications.';
    if (count === 1) return '1 unread notification.';
    return count + ' unread notifications.';
  }

  function renderPanel() {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const items = load.kind === 'ready' ? load.notifications : [];
    const asOf = load.asOf ?? Date.now();
    const slot = AsyncList({
      status: listStatus(load),
      loading: loadingSlot(),
      empty: emptySlot(),
      failed: failedSlot(),
      populated: populatedSlot(items, asOf),
    });
    panel.append(slot);
    return panel;
  }

  function loadingSlot() {
    const list = document.createElement('ul');
    list.className = 'notes';
    list.setAttribute('aria-busy', 'true');
    list.setAttribute('aria-label', 'Loading notifications');
    for (let index = 0; index < 4; index += 1) {
      if (RowSkeleton() == null) continue;
      list.append(skeletonItem());
    }
    return list;
  }

  function skeletonItem() {
    const item = document.createElement('li');
    item.className = 'skel';
    item.setAttribute('aria-hidden', 'true');
    const face = document.createElement('span');
    face.className = 'skel-face';
    const copy = document.createElement('span');
    copy.className = 'skel-copy';
    const title = document.createElement('span');
    title.className = 'skel-line skel-line-title';
    const detail = document.createElement('span');
    detail.className = 'skel-line';
    copy.append(title, detail);
    item.append(face, copy);
    return item;
  }

  function emptySlot() {
    const model = EmptyState({
      illustration: willowIllustration(),
      sentence: "You're all caught up.",
      action: null,
    });
    const wrap = document.createElement('div');
    wrap.className = 'empty';
    wrap.append(model.illustration);
    const sentence = document.createElement('p');
    sentence.textContent = model.sentence;
    wrap.append(sentence);
    if (model.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'retry';
      action.textContent = String(model.action);
      wrap.append(action);
    }
    return wrap;
  }

  function failedSlot() {
    const wrap = document.createElement('div');
    wrap.className = 'failed';
    const sentence = document.createElement('p');
    sentence.textContent = "Notifications didn't load.";
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry';
    retry.dataset.retry = 'true';
    retry.dataset.focusKey = 'retry';
    retry.textContent = 'Retry';
    wrap.append(sentence, retry);
    return wrap;
  }

  function populatedSlot(items, asOf) {
    const list = document.createElement('ul');
    list.className = 'notes';
    list.setAttribute('aria-label', 'Notifications');
    for (const item of items) list.append(noteItem(item, asOf));
    return list;
  }

  function noteItem(item, asOf) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = item.read ? 'note' : 'note note-unread';
    button.dataset.noteId = item.id;
    button.dataset.focusKey = 'note-' + item.id;

    if (!item.read) {
      const flag = document.createElement('span');
      flag.className = 'sr-only';
      flag.textContent = 'Unread. ';
      button.append(flag);
    }

    button.append(faceElement(item), copyElement(item), timeElement(item, asOf));
    row.append(button);
    return row;
  }

  function faceElement(item) {
    const actor = Avatar({ name: item.actorName, src: item.actorSrc });
    const face = document.createElement('span');
    face.className = 'face';
    if (actor.src) {
      const image = document.createElement('img');
      image.src = actor.src;
      image.alt = '';
      face.append(image);
    } else {
      face.textContent = actor.name.slice(0, 1);
    }
    if (!item.read) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      face.append(dot);
    }
    return face;
  }

  function copyElement(item) {
    const copy = document.createElement('span');
    copy.className = 'copy';
    const summary = document.createElement('span');
    summary.className = 'summary';
    summary.textContent = item.summary;
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = item.detail;
    copy.append(summary, detail);
    return copy;
  }

  function timeElement(item, asOf) {
    const time = document.createElement('time');
    time.dateTime = new Date(item.createdAt).toISOString();
    time.textContent = formatWhen(item.createdAt, asOf);
    return time;
  }

  function willowIllustration() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('illustration');
    const ground = document.createElementNS(SVG, 'circle');
    ground.setAttribute('cx', '40');
    ground.setAttribute('cy', '40');
    ground.setAttribute('r', '36');
    ground.setAttribute('fill', 'currentColor');
    ground.setAttribute('opacity', '0.12');
    svg.append(ground);
    const fronds = [
      'M40 12c1 8 0 14-1 20',
      'M39 26c-12 8-18 18-14 32',
      'M39 28c10 10 12 20 6 32',
      'M39 32c-2 12 1 20-1 30',
      'M39 22c-16 6-22 14-18 24',
      'M39 22c16 5 22 12 16 22',
    ];
    for (const d of fronds) svg.append(frond(d));
    svg.append(
      teardrop(22, 60, -24),
      teardrop(48, 62, 18),
      teardrop(38, 66, 4),
      teardrop(18, 48, -48),
      teardrop(58, 46, 36),
    );
    return svg;
  }

  function frond(d) {
    const line = document.createElementNS(SVG, 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '2.2');
    line.setAttribute('stroke-linecap', 'round');
    return line;
  }

  function teardrop(x, y, angle) {
    const group = document.createElementNS(SVG, 'g');
    group.setAttribute('transform', 'translate(' + x + ' ' + y + ') rotate(' + angle + ')');
    const leaf = document.createElementNS(SVG, 'path');
    leaf.setAttribute('d', 'M0 -5C3.2 -1.5 3.2 3.2 0 7C-3.2 3.2 -3.2 -1.5 0 -5Z');
    leaf.setAttribute('fill', 'currentColor');
    group.append(leaf);
    return group;
  }
})();

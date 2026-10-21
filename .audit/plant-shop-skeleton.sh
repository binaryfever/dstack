#!/usr/bin/env bash
# Plant a clean shop skeleton for a Mentions-list build arm.
# Usage: plant-shop-skeleton.sh <dest-dir> <arm-name> [--with-dstack]
set -euo pipefail

DEST="${1:?dest dir}"
NAME="${2:?arm name}"
WITH_DSTACK=0
if [[ "${3:-}" == "--with-dstack" ]]; then
  WITH_DSTACK=1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RULES_SRC="$REPO_ROOT/skills/dstack/scripts/fixtures/shop/product-rules.md"
SKILL_SRC="$REPO_ROOT/skills/dstack"
NS="Shop$(printf '%s' "$NAME" | sed 's/^\(.\)/\U\1/')"

rm -rf "$DEST"
mkdir -p "$DEST/src/components"

cp "$RULES_SRC" "$DEST/product-rules.md"

cat > "$DEST/package.json" << EOF
{
  "name": "shop-${NAME}",
  "private": true,
  "type": "module"
}
EOF

cat > "$DEST/README.md" << EOF
# Shop

Small product UI playground. Follow \`product-rules.md\` when you add screens.
EOF

cat > "$DEST/src/tokens.css" << 'EOF'
:root {
  --color-primary: #1A73E8;
}

.color-primary {
  color: var(--color-primary);
}
EOF

# Named kit from product-rules.md. No Mentions or Notifications screen.
cat > "$DEST/src/components/AsyncList.js" << EOF
(function () {
  function AsyncList({ empty, loading, failed, populated, status, mount }) {
    const host = mount || document.createElement('div');
    host.replaceChildren();
    let child = populated;
    if (status === 'loading') child = loading;
    else if (status === 'empty') child = empty;
    else if (status === 'failed') child = failed;
    if (child) host.appendChild(child);
    return host;
  }
  globalThis.${NS} ??= {};
  globalThis.${NS}.AsyncList = AsyncList;
})();
EOF

cat > "$DEST/src/components/EmptyState.js" << EOF
(function () {
  function EmptyState({ illustration, sentence, action }) {
    const root = document.createElement('div');
    root.className = 'empty-state';
    if (illustration) root.appendChild(illustration);
    const p = document.createElement('p');
    p.textContent = sentence || '';
    root.appendChild(p);
    if (action) root.appendChild(action);
    return root;
  }
  globalThis.${NS} ??= {};
  globalThis.${NS}.EmptyState = EmptyState;
})();
EOF

cat > "$DEST/src/components/RowSkeleton.js" << EOF
(function () {
  function RowSkeleton() {
    const row = document.createElement('div');
    row.className = 'row-skeleton';
    row.setAttribute('aria-hidden', 'true');
    return row;
  }
  globalThis.${NS} ??= {};
  globalThis.${NS}.RowSkeleton = RowSkeleton;
})();
EOF

cat > "$DEST/src/components/Badge.js" << EOF
(function () {
  function Badge({ count }) {
    if (!count) return null;
    const el = document.createElement('span');
    el.className = 'badge color-primary';
    el.textContent = count > 99 ? '99+' : String(count);
    return el;
  }
  globalThis.${NS} ??= {};
  globalThis.${NS}.Badge = Badge;
})();
EOF

cat > "$DEST/src/components/Avatar.js" << EOF
(function () {
  function Avatar({ name, src }) {
    const el = document.createElement(src ? 'img' : 'span');
    el.className = 'avatar';
    el.setAttribute('alt', name || '');
    if (src) el.src = src;
    else el.textContent = (name || '?').slice(0, 1).toUpperCase();
    return el;
  }
  globalThis.${NS} ??= {};
  globalThis.${NS}.Avatar = Avatar;
})();
EOF

if [[ "$WITH_DSTACK" -eq 1 ]]; then
  mkdir -p "$DEST/.cursor/skills/dstack"
  cp -a "$SKILL_SRC"/. "$DEST/.cursor/skills/dstack/"
  rm -rf "$DEST/.cursor/skills/dstack/scripts/fixtures"
fi

git -C "$DEST" init -q
git -C "$DEST" add -A
git -C "$DEST" -c user.email=plant@local -c user.name=plant commit -q -m "plant shop skeleton"
echo "planted $DEST (dstack=$WITH_DSTACK)"

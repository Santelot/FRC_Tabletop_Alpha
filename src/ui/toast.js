// ============================================================
//  UI · TOAST — app-wide pop-up notices (NEW in v1.4)
// ============================================================
//  Small chamfered cards that slide in from the bottom-right,
//  stack up to three, and dismiss themselves. Used by the Pit
//  (auton script briefings) and available everywhere:
//
//    toast({ title: 'R1 · Quick Score',
//            body:  'Shoot the preload — steadied hands.',
//            tone:  'red',          // 'red' | 'blue' | 'gold'
//            ms:    5200 });
// ============================================================

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  document.body.appendChild(host);
  return host;
}

export function toast({ title = '', body = '', tone = 'gold', ms = 5200 } = {}) {
  const h = ensureHost();

  // Stack cap — oldest slides away first.
  while (h.children.length >= 3) dismiss(h.firstElementChild, true);

  const t = document.createElement('div');
  t.className = `toast toast--${tone}`;
  t.innerHTML = `
    ${title ? `<div class="toast__title">${title}</div>` : ''}
    ${body ? `<div class="toast__body">${body}</div>` : ''}
    <button class="toast__x" type="button" aria-label="Dismiss">✕</button>
  `;
  t.querySelector('.toast__x').addEventListener('click', () => dismiss(t));
  h.appendChild(t);

  requestAnimationFrame(() => t.classList.add('is-in'));
  t._timer = setTimeout(() => dismiss(t), ms);
  return t;
}

function dismiss(t, instant = false) {
  if (!t || t._dead) return;
  t._dead = true;
  clearTimeout(t._timer);
  if (instant) { t.remove(); return; }
  t.classList.remove('is-in');
  t.classList.add('is-out');
  setTimeout(() => t.remove(), 320);
}

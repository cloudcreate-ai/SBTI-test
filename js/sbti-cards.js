/**
 * 人格图鉴页：从语言包读取 typeLibrary + typePosters，渲染卡片与详情弹层。
 */
import zh from './sbti-data.zh.js';

const { typeLibrary, typePosters } = zh;

const gridEl = document.getElementById('typeGrid');
const searchEl = document.getElementById('typeSearch');
const countEl = document.getElementById('typeCount');
const dialogEl = document.getElementById('typeDialog');
const dialogCloseEl = document.getElementById('typeDialogClose');
const dialogPosterEl = document.getElementById('typeDialogPoster');
const dialogLeadEl = document.getElementById('typeDialogLead');
const dialogNameEl = document.getElementById('typeDialogName');
const dialogCodeEl = document.getElementById('typeDialogCode');
const dialogCnNoteEl = document.getElementById('typeDialogCnNote');
const dialogIntroEl = document.getElementById('typeDialogIntro');
const dialogDescEl = document.getElementById('typeDialogDesc');
const dialogPokerLinkEl = document.getElementById('typeDialogPokerLink');

/** @type {HTMLElement[]} */
let cardEls = [];

/** @param {string} code */
function safeHashCode(code) {
  return encodeURIComponent(code);
}

/**
 * 将地址栏 # 片段解析为人格 code（支持 `#CTRL` 与 `#card-CTRL` / `#card-%E2%80%A6`）
 * @param {string} raw
 */
function hashFragmentToCode(raw) {
  if (!raw) return '';
  let primary = raw;
  try {
    primary = decodeURIComponent(raw);
  } catch {
    primary = raw;
  }
  if (primary.startsWith('card-')) {
    const rest = primary.slice(5);
    try {
      return decodeURIComponent(rest);
    } catch {
      return rest;
    }
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * @param {string} raw
 * @returns {string}
 */
function resolveCodeFromHash(raw) {
  const guess = hashFragmentToCode(raw);
  if (getEntry(guess)) return guess;

  const tryIds = [raw, primaryDecoded(raw)];
  for (const id of tryIds) {
    if (!id) continue;
    const el = document.getElementById(id);
    const code = el?.dataset?.code;
    if (code && getEntry(code)) return code;
  }

  const lower = guess.toLowerCase();
  const fromKeys = Object.keys(typePosters).find(
    (k) => k.toLowerCase() === lower
  );
  return fromKeys || '';
}

/** @param {string} frag */
function primaryDecoded(frag) {
  try {
    return decodeURIComponent(frag);
  } catch {
    return frag;
  }
}

/** @param {string} code */
function revealAndScrollCard(code) {
  let el = document.getElementById(`card-${safeHashCode(code)}`);
  if (el?.hidden) {
    searchEl.value = '';
    filterCards('');
    el = document.getElementById(`card-${safeHashCode(code)}`);
  }
  if (!el) return;
  el.classList.add('type-card--focus');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => el.classList.remove('type-card--focus'), 2600);
}

/** @param {string} code */
function getEntry(code) {
  const lib = typeLibrary[code];
  const poster = typePosters[code];
  if (!lib || !poster) return null;
  return { lib, poster };
}

/**
 * @param {string} code
 * @param {{ push?: boolean }} [opts] push=true 时写入历史，便于后退关闭或返回上一类型
 */
function openDetail(code, opts = {}) {
  const entry = getEntry(code);
  if (!entry) return;
  const { lib, poster } = entry;
  const b = poster.banner;
  dialogPosterEl.src = poster.image;
  dialogPosterEl.alt = `${b.displayName}（${b.codeLabel}）`;
  dialogLeadEl.textContent = b.leadIn;
  dialogNameEl.textContent = b.displayName;
  dialogCodeEl.textContent = b.codeLabel;
  if (lib.cn !== b.displayName) {
    dialogCnNoteEl.hidden = false;
    dialogCnNoteEl.textContent = `又名：${lib.cn}`;
  } else {
    dialogCnNoteEl.hidden = true;
    dialogCnNoteEl.textContent = '';
  }
  dialogIntroEl.textContent = lib.intro;
  dialogDescEl.textContent = lib.desc;
  if (dialogPokerLinkEl) {
    dialogPokerLinkEl.href = `./poker.html#${encodeURIComponent(code)}`;
  }
  dialogEl.dataset.code = code;
  if (typeof dialogEl.showModal === 'function') {
    dialogEl.showModal();
  }
  const h = safeHashCode(code);
  const next = `#${h}`;
  if (opts.push) {
    if (location.hash !== next) history.pushState(null, '', next);
  } else if (location.hash !== next) {
    history.replaceState(null, '', next);
  }
}

function closeDetail() {
  if (dialogEl.open) dialogEl.close();
}

/** @param {string} q */
function filterCards(q) {
  const needle = q.trim().toLowerCase();
  let visible = 0;
  cardEls.forEach((el) => {
    const hay = el.dataset.filter || '';
    const ok = !needle || hay.includes(needle);
    el.hidden = !ok;
    if (ok) visible += 1;
  });
  if (countEl) countEl.textContent = String(visible);
}

function buildGrid() {
  const codes = Object.keys(typePosters).sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  );
  const frag = document.createDocumentFragment();
  cardEls = [];

  for (const code of codes) {
    const entry = getEntry(code);
    if (!entry) continue;
    const { lib, poster } = entry;
    const b = poster.banner;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'type-card';
    card.id = `card-${safeHashCode(code)}`;
    card.dataset.code = code;
    card.dataset.filter = [
      code,
      b.codeLabel,
      b.displayName,
      lib.cn,
      lib.intro,
    ]
      .join(' ')
      .toLowerCase();

    const thumb = document.createElement('div');
    thumb.className = 'type-card-thumb';
    const img = document.createElement('img');
    img.src = poster.image;
    img.alt = '';
    img.loading = 'lazy';
    thumb.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'type-card-meta';
    const name = document.createElement('div');
    name.className = 'type-card-name';
    name.textContent = b.displayName;
    const lbl = document.createElement('div');
    lbl.className = 'type-card-code';
    lbl.textContent = b.codeLabel;
    meta.append(name, lbl);

    card.append(thumb, meta);
    card.addEventListener('click', () => openDetail(code, { push: true }));
    frag.appendChild(card);
    cardEls.push(card);
  }

  gridEl.appendChild(frag);
  if (countEl) countEl.textContent = String(cardEls.length);
}

function applyRouteHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) {
    if (dialogEl.open) dialogEl.close();
    return;
  }
  const code = resolveCodeFromHash(raw);
  if (!getEntry(code)) return;

  revealAndScrollCard(code);
  openDetail(code);
}

buildGrid();
filterCards(searchEl.value || '');

searchEl.addEventListener('input', () => filterCards(searchEl.value));

dialogCloseEl.addEventListener('click', closeDetail);
dialogEl.addEventListener('close', () => {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});
dialogEl.addEventListener('click', (e) => {
  if (e.target === dialogEl) closeDetail();
});

window.addEventListener('hashchange', applyRouteHash);
applyRouteHash();

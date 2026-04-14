/**
 * 向导式测验 UI（移动端优先），文案与题库来自语言包。
 * 多语言：复制 sbti-data.zh.js 为 sbti-data.<locale>.js 保持同名导出结构，
 * 并将下一行 import 改为对应文件即可。
 */
import zh from './sbti-data.zh.js';
import {
  buildShuffledQuestions,
  getVisibleQuestions,
  computeResult,
} from './sbti-engine.js';
import { loadHistory, saveHistoryEntry } from './sbti-storage.js';

/** @type {typeof zh} */
const bundle = zh;
const { config, ui } = bundle;

const screens = {
  intro: document.getElementById('intro'),
  wizard: document.getElementById('wizard'),
  result: document.getElementById('result'),
};

const els = {
  startBtn: document.getElementById('startBtn'),
  viewLastResultBtn: document.getElementById('viewLastResultBtn'),
  introHistory: document.getElementById('introHistory'),
  introHistorySummary: document.getElementById('introHistorySummary'),
  introHistoryList: document.getElementById('introHistoryList'),
  wizardBackHome: document.getElementById('wizardBackHome'),
  wizardProgressBar: document.getElementById('wizardProgressBar'),
  wizardProgressText: document.getElementById('wizardProgressText'),
  wizardHost: document.getElementById('wizardQuestionHost'),
  wizardPrev: document.getElementById('wizardPrev'),
  wizardHint: document.getElementById('wizardHint'),
  restartBtn: document.getElementById('restartBtn'),
  toTopBtn: document.getElementById('toTopBtn'),
  mirrorBody: document.getElementById('mirrorBody'),
  mirrorFooter: document.getElementById('mirrorFooter'),
  authorContent: document.getElementById('authorContent'),
};

const app = {
  shuffledQuestions: [],
  answers: {},
  stepIndex: 0,
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getVisible() {
  return getVisibleQuestions(
    app.shuffledQuestions,
    app.answers,
    bundle.specialQuestions,
    config.drinkGateQuestionId,
    config.drinkGateInsertValue,
  );
}

/** 本题答案已确定后：前进到下一题或出结果（饮酒 gate 的答案需先写入 app.answers） */
function goForwardAfterAnswer(q) {
  const v2 = getVisible();
  if (app.stepIndex >= v2.length) app.stepIndex = v2.length - 1;
  const i = v2.findIndex((x) => x.id === q.id);
  if (i < 0) {
    renderStep();
    return;
  }
  if (i === v2.length - 1) {
    renderResult({ persist: true });
    return;
  }
  app.stepIndex = i + 1;
  renderStep();
}

/** @param {{ savedAt: string, typeCn: string }} e */
function formatHistoryEntryLine(e) {
  const d = new Date(e.savedAt);
  const dateShort = d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return ui.intro.historyItemLine(dateShort, e.typeCn || e.typeCode || '—');
}

function refreshIntroActions() {
  const hist = loadHistory();
  if (hist.length === 0) {
    els.viewLastResultBtn.hidden = true;
    els.introHistory.hidden = true;
    els.startBtn.textContent = ui.intro.start;
    return;
  }
  els.viewLastResultBtn.hidden = false;
  els.introHistory.hidden = false;
  els.viewLastResultBtn.textContent = ui.intro.viewLastResult;
  els.introHistorySummary.textContent = ui.intro.historySummary;
  els.startBtn.textContent = ui.intro.retest;

  els.introHistoryList.innerHTML = hist
    .map(
      (e, i) =>
        `<li><button type="button" class="history-item-btn" data-history-index="${i}">${formatHistoryEntryLine(e)}</button></li>`,
    )
    .join('');

  els.introHistoryList.querySelectorAll('[data-history-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-history-index'));
      const h = loadHistory();
      if (!h[i]) return;
      app.answers = { ...h[i].answers };
      renderResult({ persist: false });
    });
  });
}

function renderIntroMirror() {
  if (els.mirrorBody) {
    els.mirrorBody.innerHTML = ui.mirrorBlocks
      .map((html) => `<div class="mirror-p">${html}</div>`)
      .join('');
  }
  if (els.mirrorFooter) els.mirrorFooter.textContent = ui.mirrorFooter;
  if (els.authorContent) {
    els.authorContent.innerHTML = ui.authorNotes.map((t) => `<p>${t}</p>`).join('');
  }
}

function renderStep() {
  const visible = getVisible();
  const total = visible.length;
  const idx = Math.min(Math.max(app.stepIndex, 0), Math.max(total - 1, 0));
  app.stepIndex = idx;
  const q = visible[idx];
  const done = idx + 1;
  const pct = total ? (done / total) * 100 : 0;

  els.wizardProgressBar.style.width = `${pct}%`;
  els.wizardProgressText.textContent = `${done} / ${total}`;

  const answered = app.answers[q.id] !== undefined;
  els.wizardHint.textContent = answered ? '' : ui.wizard.hintNeedChoice;

  els.wizardHost.innerHTML = `
    <article class="question-card">
      <div class="question-meta">
        <span class="badge">${ui.wizard.stepBadge(done, total)}</span>
      </div>
      <h2 class="question-title">${q.text}</h2>
      <div class="options" role="radiogroup" aria-label="${ui.wizard.optionsAria}">
        ${q.options
          .map((opt, i) => {
            const code = ['A', 'B', 'C', 'D'][i] || String(i + 1);
            const checked = app.answers[q.id] === opt.value ? 'checked' : '';
            return `
            <label class="option">
              <input type="radio" name="current" value="${opt.value}" ${checked} />
              <span class="option-code">${code}</span>
              <span class="option-text">${opt.label}</span>
            </label>`;
          })
          .join('')}
      </div>
    </article>
  `;

  els.wizardHost.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const v = Number(e.target.value);
      app.answers[q.id] = v;
      if (q.id === config.drinkGateQuestionId && v !== config.drinkGateInsertValue) {
        delete app.answers[config.drunkTriggerQuestionId];
      }
      goForwardAfterAnswer(q);
    });
    // 后退后重点同一选项时 change 不触发，用 click + 快照区分「改选」与「确认原选项」
    input.addEventListener('click', () => {
      const v = Number(input.value);
      const hadBefore = app.answers[q.id];
      queueMicrotask(() => {
        if (!input.checked) return;
        if (hadBefore === undefined) return;
        if (hadBefore !== v) return;
        goForwardAfterAnswer(q);
      });
    });
  });

  els.wizardPrev.disabled = idx === 0;
  els.wizardPrev.onclick = () => {
    if (idx > 0) {
      app.stepIndex -= 1;
      renderStep();
    }
  };
}

function startTest() {
  app.answers = {};
  app.shuffledQuestions = buildShuffledQuestions(bundle.questions, bundle.specialQuestions);
  app.stepIndex = 0;
  renderStep();
  showScreen('wizard');
}

function renderDimList(result) {
  const dimList = document.getElementById('dimList');
  dimList.innerHTML = bundle.dimensionOrder
    .map((dim) => {
      const level = result.levels[dim];
      const explanation = bundle.dimExplanations[dim][level];
      return `
        <div class="dim-item">
          <div class="dim-item-top">
            <div class="dim-item-name">${bundle.dimensionMeta[dim].name}</div>
            <div class="dim-item-score">${level} / ${result.rawScores[dim]}分</div>
          </div>
          <p>${explanation}</p>
        </div>`;
    })
    .join('');
}

/**
 * @param {{ persist?: boolean }} [options] persist 为 true 时表示刚做完测验，写入本地历史
 */
function renderResult(options = {}) {
  const { persist = false } = options;
  const result = computeResult(app.answers, bundle);
  const type = result.finalType;

  if (persist) {
    saveHistoryEntry(app.answers, { typeCode: type.code, typeCn: type.cn });
  }

  document.getElementById('resultModeKicker').textContent = result.modeKicker;
  document.getElementById('resultTypeName').textContent = `${type.code}（${type.cn}）`;
  document.getElementById('matchBadge').textContent = result.badge;
  document.getElementById('resultTypeSub').textContent = result.sub;
  document.getElementById('resultDesc').textContent = type.desc;
  document.getElementById('posterCaption').textContent = type.intro;
  document.getElementById('funNote').textContent = result.special
    ? ui.compute.funNoteSpecial
    : ui.compute.funNoteDefault;

  const posterBox = document.getElementById('posterBox');
  const posterImage = document.getElementById('posterImage');
  const imageSrc = bundle.typeImages[type.code];
  if (imageSrc) {
    posterImage.src = imageSrc;
    posterImage.alt = `${type.code}（${type.cn}）`;
    posterBox.classList.remove('no-image');
  } else {
    posterImage.removeAttribute('src');
    posterImage.alt = '';
    posterBox.classList.add('no-image');
  }

  renderDimList(result);
  showScreen('result');
}

function applyStaticLabels() {
  document.getElementById('introTitle').textContent = ui.intro.title;
  const al = document.getElementById('authorLine');
  al.textContent = ui.intro.authorLine;
  al.title = ui.intro.authorTitle;
  document.getElementById('mirrorSummary').textContent = ui.intro.mirrorSummary;
  els.wizardBackHome.textContent = `← ${ui.wizard.backHome}`;
  els.wizardPrev.textContent = ui.wizard.prev;
  document.getElementById('analysisTitle').textContent = ui.result.analysisTitle;
  document.getElementById('dimTitle').textContent = ui.result.dimTitle;
  document.getElementById('noteTitle').textContent = ui.result.noteTitle;
  document.getElementById('authorSummary').textContent = ui.result.authorSummary;
  els.restartBtn.textContent = ui.result.restart;
  els.toTopBtn.textContent = ui.result.toIntro;
}

function goIntro() {
  showScreen('intro');
  refreshIntroActions();
}

els.startBtn.addEventListener('click', startTest);
els.viewLastResultBtn.addEventListener('click', () => {
  const hist = loadHistory();
  if (!hist.length) return;
  app.answers = { ...hist[0].answers };
  renderResult({ persist: false });
});
els.wizardBackHome.addEventListener('click', goIntro);
els.restartBtn.addEventListener('click', startTest);
els.toTopBtn.addEventListener('click', goIntro);

applyStaticLabels();
renderIntroMirror();
refreshIntroActions();

/**供 index内联脚本检测模块是否已加载 */
window.__sbtiAppLoaded = true;

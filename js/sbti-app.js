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
import {
  loadHistory,
  saveHistoryEntry,
  saveProgress,
  loadProgress,
  clearProgress,
  clearAllLocalData,
} from './sbti-storage.js';

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
  continueResumeBtn: document.getElementById('continueResumeBtn'),
  introHistory: document.getElementById('introHistory'),
  introHistorySummary: document.getElementById('introHistorySummary'),
  introLatestWrap: document.getElementById('introLatestWrap'),
  introLatestPosterBox: document.getElementById('introLatestPosterBox'),
  introLatestPosterImg: document.getElementById('introLatestPosterImg'),
  introLatestPosterCaption: document.getElementById('introLatestPosterCaption'),
  introLatestKicker: document.getElementById('introLatestKicker'),
  introLatestTypeName: document.getElementById('introLatestTypeName'),
  introLatestBadge: document.getElementById('introLatestBadge'),
  introLatestSub: document.getElementById('introLatestSub'),
  viewLatestHistoryBtn: document.getElementById('viewLatestHistoryBtn'),
  introHistoryList: document.getElementById('introHistoryList'),
  clearAllLocalBtn: document.getElementById('clearAllLocalBtn'),
  wizardBackHome: document.getElementById('wizardBackHome'),
  wizardProgressBar: document.getElementById('wizardProgressBar'),
  wizardProgressText: document.getElementById('wizardProgressText'),
  wizardHost: document.getElementById('wizardQuestionHost'),
  wizardPrev: document.getElementById('wizardPrev'),
  wizardHint: document.getElementById('wizardHint'),
  restartBtn: document.getElementById('restartBtn'),
  toTopBtn: document.getElementById('toTopBtn'),
  authorContent: document.getElementById('authorContent'),
};

/** 选题后延迟再前进，便于看清选中项（毫秒） */
const ADVANCE_DELAY_MS = 560;

const app = {
  shuffledQuestions: [],
  answers: {},
  stepIndex: 0,
  /** @type {ReturnType<typeof setTimeout> | null} */
  advanceTimer: null,
};

function clearAdvanceTimer() {
  if (app.advanceTimer !== null) {
    clearTimeout(app.advanceTimer);
    app.advanceTimer = null;
  }
}

/** 选中项上播放从左到右填满动画，时长与 ADVANCE_DELAY_MS 一致 */
function playOptionFillProgress() {
  const root = els.wizardHost.querySelector('.options');
  if (!root) return;
  root.querySelectorAll('.option').forEach((label) => {
    label.classList.remove('option--progress');
    const fill = label.querySelector('.option-fill');
    if (fill) {
      /* 勿留内联 animation:none，否则会盖过样式表里的 keyframes */
      fill.style.removeProperty('animation');
      fill.style.removeProperty('transform');
    }
  });
  void root.offsetWidth;
  const checked = root.querySelector('input[name="current"]:checked');
  if (!checked) return;
  const label = checked.closest('.option');
  if (!label) return;
  label.classList.add('option--progress');
}

/** 写入答案后延迟再调用 goForwardAfterAnswer（与进度条动画同步） */
function scheduleGoForward(q) {
  clearAdvanceTimer();
  els.wizardHint.textContent = ui.wizard.hintAdvancing;
  playOptionFillProgress();
  app.advanceTimer = setTimeout(() => {
    app.advanceTimer = null;
    goForwardAfterAnswer(q);
  }, ADVANCE_DELAY_MS);
}

function showScreen(name) {
  if (name !== 'wizard') clearAdvanceTimer();
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

/** 根据 id 列表还原 shuffledQuestions（与 buildShuffledQuestions 结构一致） */
function rebuildQuestionsFromOrder(ids) {
  const byId = new Map();
  for (const q of bundle.questions) byId.set(q.id, q);
  for (const q of bundle.specialQuestions) byId.set(q.id, q);
  const out = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (q) out.push(q);
  }
  return out;
}

/** @param {NonNullable<ReturnType<typeof loadProgress>>} data */
function applyLoadedProgress(data) {
  app.shuffledQuestions = rebuildQuestionsFromOrder(data.questionOrder);
  if (app.shuffledQuestions.length < 5) return false;
  app.answers = { ...data.answers };
  const visible = getVisible();
  if (!visible.length) return false;
  let idx = visible.findIndex((q) => q.id === data.currentQuestionId);
  if (idx < 0) idx = 0;
  app.stepIndex = Math.min(idx, visible.length - 1);
  return true;
}

/**
 * 根据已存进度计算与向导相同的「当前题 / 总题数」（可见题列表，含饮酒 follow-up 逻辑）
 * @param {NonNullable<ReturnType<typeof loadProgress>>} data
 * @returns {{ done: number, total: number } | null}
 */
function getSavedProgressStep(data) {
  const shuffled = rebuildQuestionsFromOrder(data.questionOrder);
  if (shuffled.length < 5) return null;
  const visible = getVisibleQuestions(
    shuffled,
    data.answers,
    bundle.specialQuestions,
    config.drinkGateQuestionId,
    config.drinkGateInsertValue,
  );
  if (!visible.length) return null;
  let idx = visible.findIndex((q) => q.id === data.currentQuestionId);
  if (idx < 0) idx = 0;
  idx = Math.min(idx, visible.length - 1);
  return { done: idx + 1, total: visible.length };
}

/** 将当前向导状态写入 localStorage（有题序时） */
function persistProgressFromApp() {
  if (!app.shuffledQuestions.length) return;
  const visible = getVisible();
  if (!visible.length) return;
  const idx = Math.min(Math.max(app.stepIndex, 0), visible.length - 1);
  const q = visible[idx];
  if (!q) return;
  saveProgress({
    questionOrder: app.shuffledQuestions.map((x) => x.id),
    answers: { ...app.answers },
    currentQuestionId: q.id,
  });
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
  const prog = loadProgress();
  const hasLocalData = hist.length > 0 || !!prog;
  els.clearAllLocalBtn.hidden = !hasLocalData;
  els.clearAllLocalBtn.textContent = ui.intro.clearAllLocal;

  /* 主操作：有未完成进度时「继续测试」为主按钮（靠前且 primary） */
  if (prog) {
    els.continueResumeBtn.hidden = false;
    const step = getSavedProgressStep(prog);
    els.continueResumeBtn.textContent = step
      ? ui.intro.resumeTestWithProgress(step.done, step.total)
      : ui.intro.resumeTest;
    els.continueResumeBtn.className = 'btn-primary';
    els.startBtn.className = 'btn-secondary';
  } else {
    els.continueResumeBtn.hidden = true;
    els.startBtn.className = 'btn-primary';
  }
  els.startBtn.textContent = hist.length > 0 ? ui.intro.retest : ui.intro.start;

  if (hist.length === 0) {
    els.introHistory.hidden = true;
    els.introLatestWrap.hidden = true;
  } else {
    els.introHistory.hidden = false;
    els.introHistory.open = true;
    els.introHistorySummary.textContent = ui.intro.historySummary;
    els.introLatestWrap.hidden = false;
    const latestResult = computeResult(hist[0].answers, bundle);
    applyResultHero(latestResult, {
      kicker: els.introLatestKicker,
      typeName: els.introLatestTypeName,
      badge: els.introLatestBadge,
      sub: els.introLatestSub,
      caption: els.introLatestPosterCaption,
      posterBox: els.introLatestPosterBox,
      posterImg: els.introLatestPosterImg,
    });
    els.viewLatestHistoryBtn.textContent = ui.intro.viewFullResult;
    els.viewLatestHistoryBtn.title = ui.intro.viewLatestResultTitle;
    els.introHistoryList.innerHTML = hist
      .map(
        (e, i) =>
          `<li class="history-item-row"><span class="history-item-meta">${formatHistoryEntryLine(
            e,
          )}</span><button type="button" class="history-item-view-btn" data-history-index="${i}">${ui.intro.historyRowView}</button></li>`,
      )
      .join('');
    els.introHistoryList.querySelectorAll('.history-item-view-btn[data-history-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-history-index'));
        const h = loadHistory();
        if (!h[i]) return;
        app.answers = { ...h[i].answers };
        renderResult({ persist: false });
      });
    });
  }
}

/** 结果页「作者的话」折叠内容 */
function renderResultAuthorNotes() {
  if (els.authorContent) {
    els.authorContent.innerHTML = ui.authorNotes.map((t) => `<p>${t}</p>`).join('');
  }
}

function renderStep() {
  clearAdvanceTimer();
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
      <div class="options" style="--option-fill-ms: ${ADVANCE_DELAY_MS}ms" role="radiogroup" aria-label="${ui.wizard.optionsAria}">
        ${q.options
          .map((opt, i) => {
            const code = ['A', 'B', 'C', 'D'][i] || String(i + 1);
            const checked = app.answers[q.id] === opt.value ? 'checked' : '';
            return `
            <label class="option">
              <span class="option-fill" aria-hidden="true"></span>
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
      scheduleGoForward(q);
    });
    // 后退后重点同一选项时 change 不触发，用 click + 快照区分「改选」与「确认原选项」
    input.addEventListener('click', () => {
      const v = Number(input.value);
      const hadBefore = app.answers[q.id];
      queueMicrotask(() => {
        if (!input.checked) return;
        if (hadBefore === undefined) return;
        if (hadBefore !== v) return;
        scheduleGoForward(q);
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

  persistProgressFromApp();
}

/**
 * @param {boolean} [resume] 为 true 时从 localStorage 恢复未完成进度
 */
function startTest(resume = false) {
  clearAdvanceTimer();
  if (resume) {
    const data = loadProgress();
    if (!data || !applyLoadedProgress(data)) {
      clearProgress();
      startTest(false);
      return;
    }
    renderStep();
    showScreen('wizard');
    return;
  }
  clearProgress();
  app.answers = {};
  app.shuffledQuestions = buildShuffledQuestions(bundle.questions, bundle.specialQuestions);
  app.stepIndex = 0;
  renderStep();
  showScreen('wizard');
}

/**
 * 人格海报 + 类型摘要（结果页与首页最近一条共用）
 * @param {ReturnType<typeof computeResult>} result
 * @param {{ kicker: HTMLElement, typeName: HTMLElement, badge: HTMLElement, sub: HTMLElement, caption: HTMLElement, posterBox: HTMLElement, posterImg: HTMLImageElement }} dom
 */
function applyResultHero(result, dom) {
  const type = result.finalType;
  dom.kicker.textContent = result.modeKicker;
  dom.typeName.textContent = `${type.code}（${type.cn}）`;
  dom.badge.textContent = result.badge;
  dom.sub.textContent = result.sub;
  dom.caption.textContent = type.intro;
  const imageSrc = bundle.typeImages[type.code];
  if (imageSrc) {
    dom.posterImg.src = imageSrc;
    dom.posterImg.alt = `${type.code}（${type.cn}）`;
    dom.posterBox.classList.remove('no-image');
  } else {
    dom.posterImg.removeAttribute('src');
    dom.posterImg.alt = '';
    dom.posterBox.classList.add('no-image');
  }
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
    clearProgress();
  }

  applyResultHero(result, {
    kicker: document.getElementById('resultModeKicker'),
    typeName: document.getElementById('resultTypeName'),
    badge: document.getElementById('matchBadge'),
    sub: document.getElementById('resultTypeSub'),
    caption: document.getElementById('posterCaption'),
    posterBox: document.getElementById('posterBox'),
    posterImg: document.getElementById('posterImage'),
  });
  document.getElementById('resultDesc').textContent = type.desc;
  document.getElementById('funNote').textContent = result.special
    ? ui.compute.funNoteSpecial
    : ui.compute.funNoteDefault;

  renderDimList(result);
  showScreen('result');
}

function applyStaticLabels() {
  document.getElementById('introTitle').textContent = ui.intro.title;
  const al = document.getElementById('authorLine');
  al.textContent = ui.intro.authorLine;
  al.title = ui.intro.authorTitle;
  const privacy = document.getElementById('introPrivacyNote');
  if (privacy) privacy.textContent = ui.intro.localDataPrivacy;
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
  /* 结果页返回：测验已结束，勿把向导状态再写入「未完成进度」，否则会误显示「继续测试」 */
  if (screens.result.classList.contains('active')) {
    clearProgress();
    app.shuffledQuestions = [];
    app.answers = {};
    app.stepIndex = 0;
    clearAdvanceTimer();
  } else {
    persistProgressFromApp();
  }
  showScreen('intro');
  refreshIntroActions();
}

els.startBtn.addEventListener('click', () => startTest(false));
els.continueResumeBtn.addEventListener('click', () => startTest(true));
els.clearAllLocalBtn.addEventListener('click', () => {
  if (!window.confirm(ui.intro.clearAllLocalConfirm)) return;
  clearAllLocalData();
  app.shuffledQuestions = [];
  app.answers = {};
  app.stepIndex = 0;
  clearAdvanceTimer();
  refreshIntroActions();
});
els.viewLatestHistoryBtn.addEventListener('click', () => {
  const hist = loadHistory();
  if (!hist.length) return;
  app.answers = { ...hist[0].answers };
  renderResult({ persist: false });
});
els.wizardBackHome.addEventListener('click', goIntro);
els.restartBtn.addEventListener('click', () => startTest(false));
els.toTopBtn.addEventListener('click', goIntro);

applyStaticLabels();
renderResultAuthorNotes();
refreshIntroActions();

window.addEventListener('pagehide', () => {
  try {
    if (!screens.result.classList.contains('active')) persistProgressFromApp();
  } catch {
    /* ignore */
  }
});

/**供 index内联脚本检测模块是否已加载 */
window.__sbtiAppLoaded = true;

/**
 * 本地缓存：测验结果（历史）、未完成进度（续测）
 */

const STORAGE_KEY = 'sbti_history_v1';
const PROGRESS_KEY = 'sbti_progress_v1';
const PROGRESS_VERSION = 1;
const MAX_ENTRIES = 3;

/**
 * @returns {{ savedAt: string, answers: Record<string, number>, typeCode: string, typeCn: string }[]}
 */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e && e.answers && typeof e.answers === 'object' && e.savedAt)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * 新完成的测验插到队首，超出条数则丢弃最旧记录。
 * @param {Record<string, number>} answers
 * @param {{ typeCode: string, typeCn: string }} meta
 */
export function saveHistoryEntry(answers, meta) {
  const prev = loadHistory();
  const entry = {
    savedAt: new Date().toISOString(),
    answers: JSON.parse(JSON.stringify(answers)),
    typeCode: meta.typeCode,
    typeCn: meta.typeCn,
  };
  const next = [entry, ...prev].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * 保存未完成的题序与答案，便于「继续测试」。
 * @param {{ questionOrder: string[], answers: Record<string, number>, currentQuestionId: string }} payload
 */
export function saveProgress(payload) {
  try {
    const data = {
      v: PROGRESS_VERSION,
      savedAt: new Date().toISOString(),
      questionOrder: payload.questionOrder,
      answers: JSON.parse(JSON.stringify(payload.answers)),
      currentQuestionId: payload.currentQuestionId,
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch {
    /* 存储满或禁用 */
  }
}

/**
 * @returns {{ v: number, savedAt: string, questionOrder: string[], answers: Record<string, number>, currentQuestionId: string } | null}
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== PROGRESS_VERSION) return null;
    if (!Array.isArray(data.questionOrder) || data.questionOrder.length < 1) return null;
    if (!data.answers || typeof data.answers !== 'object') return null;
    if (typeof data.currentQuestionId !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}

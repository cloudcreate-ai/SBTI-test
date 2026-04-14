/**
 * 本地缓存测验结果（localStorage），最多保留最近3 条。
 */

const STORAGE_KEY = 'sbti_history_v1';
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

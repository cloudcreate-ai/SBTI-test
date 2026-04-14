/**
 * SBTI 纯逻辑：计分、题型可见性、结果匹配（无 DOM、无文案，文案由 locale 包提供）
 */

/** @param {unknown[]} array */
export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 将常规题洗牌并随机插入饮酒 gate 题（specialQuestions[0]）
 * @param {object[]} regularQuestions
 * @param {object[]} specialQuestions
 */
export function buildShuffledQuestions(regularQuestions, specialQuestions) {
  const shuffledRegular = shuffle(regularQuestions);
  const insertIndex = Math.floor(Math.random() * shuffledRegular.length) + 1;
  return [
    ...shuffledRegular.slice(0, insertIndex),
    specialQuestions[0],
    ...shuffledRegular.slice(insertIndex),
  ];
}

/**
 * @param {object[]} shuffledQuestions
 * @param {Record<string, number>} answers
 * @param {object[]} specialQuestions
 * @param {string} drinkGateQuestionId
 * @param {number} drinkGateInsertValue 选中该分值时在 gate 后插入 follow-up
 */
export function getVisibleQuestions(
  shuffledQuestions,
  answers,
  specialQuestions,
  drinkGateQuestionId,
  drinkGateInsertValue,
) {
  const visible = [...shuffledQuestions];
  const gateIndex = visible.findIndex((q) => q.id === drinkGateQuestionId);
  if (gateIndex !== -1 && answers[drinkGateQuestionId] === drinkGateInsertValue) {
    visible.splice(gateIndex + 1, 0, specialQuestions[1]);
  }
  return visible;
}

/** @param {number} score */
export function sumToLevel(score) {
  if (score <= 3) return 'L';
  if (score === 4) return 'M';
  return 'H';
}

/** @param {'L'|'M'|'H'} level */
export function levelNum(level) {
  return { L: 1, M: 2, H: 3 }[level];
}

/** @param {string} pattern 如 "HHH-HMH-..." */
export function parsePattern(pattern) {
  return pattern.replace(/-/g, '').split('');
}

/**
 * @param {Record<string, number>} answers
 * @param {string} drunkTriggerQuestionId
 */
export function getDrunkTriggered(answers, drunkTriggerQuestionId) {
  return answers[drunkTriggerQuestionId] === 2;
}

/**
 * @param {Record<string, number>} answers
 * @param {object} bundle sbti-data 语言包 default导出
 */
export function computeResult(answers, bundle) {
  const {
    questions,
    typeLibrary,
    normalTypes,
    dimensionOrder,
    config,
    ui: { compute: copy },
  } = bundle;

  const rawScores = {};
  const levels = {};
  Object.keys(bundle.dimensionMeta).forEach((dim) => {
    rawScores[dim] = 0;
  });

  questions.forEach((q) => {
    rawScores[q.dim] += Number(answers[q.id] || 0);
  });

  Object.entries(rawScores).forEach(([dim, score]) => {
    levels[dim] = sumToLevel(score);
  });

  const userVector = dimensionOrder.map((dim) => levelNum(levels[dim]));
  const ranked = normalTypes
    .map((type) => {
      const vector = parsePattern(type.pattern).map(levelNum);
      let distance = 0;
      let exact = 0;
      for (let i = 0; i < vector.length; i++) {
        const diff = Math.abs(userVector[i] - vector[i]);
        distance += diff;
        if (diff === 0) exact += 1;
      }
      const similarity = Math.max(0, Math.round((1 - distance / 30) * 100));
      return { ...type, ...typeLibrary[type.code], distance, exact, similarity };
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (b.exact !== a.exact) return b.exact - a.exact;
      return b.similarity - a.similarity;
    });

  const bestNormal = ranked[0];
  const drunkTriggered = getDrunkTriggered(answers, config.drunkTriggerQuestionId);

  let finalType;
  let modeKicker = copy.modeKickerNormal;
  let badge = copy.badgeNormal(bestNormal.similarity, bestNormal.exact);
  let sub = copy.subNormal;
  let special = false;
  let secondaryType = null;

  if (drunkTriggered) {
    finalType = typeLibrary.DRUNK;
    secondaryType = bestNormal;
    modeKicker = copy.modeKickerDrunk;
    badge = copy.badgeDrunk;
    sub = copy.subDrunk;
    special = true;
  } else if (bestNormal.similarity < 60) {
    finalType = typeLibrary.HHHH;
    modeKicker = copy.modeKickerHHHH;
    badge = copy.badgeHHHH(bestNormal.similarity);
    sub = copy.subHHHH;
    special = true;
  } else {
    finalType = bestNormal;
  }

  return {
    rawScores,
    levels,
    ranked,
    bestNormal,
    finalType,
    modeKicker,
    badge,
    sub,
    special,
    secondaryType,
  };
}

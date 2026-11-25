export const GAME_LABELS = {
  snake: 'スネークゲーム',
  tictactoe: '戦略的〇×ゲーム',
  'block-puzzle': '8x8ブロックパズル',
  'terrain-quest': 'まちの地図記号クイズ',
  'retro-fight': 'レトロ格闘ファイト',
  'zombie-wars': 'ゾンビ・ウォーズ',
  'sushi-catch': 'まわるおすしキャッチ',
  'course-race': 'コースづくりレース'
};

export function isNewHighScore(score, previousBest) {
  return Number.isInteger(score) && score >= 0 && score > previousBest;
}

export function nextTicTacToeStreak(result, currentStreak) {
  return result === 'O' ? currentStreak + 1 : 0;
}

export function nextRetroFightStreak(won, currentStreak) {
  return won ? currentStreak + 1 : 0;
}

export function rankScores(scores) {
  return scores.map((score, index) => ({ ...score, rank: index + 1 }));
}

export function formatScore(score) {
  return Number.isSafeInteger(score) && score >= 0 ? score.toLocaleString() : '—';
}

// ランキング記録の確認ダイアログを表示済みかを示す sessionStorage のキー（ADR-0016）
export const RANKING_PROMPT_SESSION_KEY = 'game-arcade-ranking-prompt-shown';

// このセッションで確認ダイアログを表示してよい場合に true を返し、表示済みとして記録する。
// 2回目以降は false。storage が無い・使えない環境では安全側として true を返す（従来動作）。
export function claimRankingPrompt(storage) {
  if (!storage) return true;
  try {
    if (storage.getItem(RANKING_PROMPT_SESSION_KEY) === '1') return false;
    storage.setItem(RANKING_PROMPT_SESSION_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

export function updateMapSymbolProgress(previous, symbolId, isCorrect) {
  if (!/^\d{4}$/.test(symbolId) || typeof isCorrect !== 'boolean') {
    throw new RangeError('Invalid map symbol answer.');
  }
  if (previous !== null && (!previous || typeof previous !== 'object'
      || !Number.isInteger(previous.attempts) || previous.attempts < 1
      || !Number.isInteger(previous.correctAnswers) || previous.correctAnswers < 0
      || previous.correctAnswers > previous.attempts
      || previous.mastered !== (previous.correctAnswers > 0))) {
    throw new RangeError('Invalid previous map symbol progress.');
  }

  const knownBefore = previous?.mastered ?? false;
  return {
    attempts: (previous?.attempts ?? 0) + 1,
    correctAnswers: (previous?.correctAnswers ?? 0) + Number(isCorrect),
    mastered: knownBefore || isCorrect,
    knownBefore,
    pointsAwarded: isCorrect ? (knownBefore ? 10 : 100) : 0
  };
}

// コースづくりレースの保存コース（users/{uid}/courseRace/courses）の検証。
// 保存形式は course-race/logic.js の serializeGrid と同じ、
// 12マス×8行の数字（0〜4）を '/' でつないだ文字列グリッド。
export const COURSE_RACE_MAX_COURSES = 6;
export const COURSE_RACE_NAME_MAX_LENGTH = 20;
export const COURSE_RACE_GRID_PATTERN = /^[0-4]{12}(\/[0-4]{12}){7}$/;

export function isValidCourseRaceCourses(courses) {
  return Array.isArray(courses)
    && courses.length <= COURSE_RACE_MAX_COURSES
    && courses.every((course) => course
      && typeof course === 'object'
      && !Array.isArray(course)
      && typeof course.name === 'string'
      && course.name.length >= 1
      && course.name.length <= COURSE_RACE_NAME_MAX_LENGTH
      && typeof course.grid === 'string'
      && COURSE_RACE_GRID_PATTERN.test(course.grid));
}

export const GAME_LABELS = {
  snake: 'スネークゲーム',
  tictactoe: '戦略的〇×ゲーム',
  'block-puzzle': '8x8ブロックパズル'
};

export function isNewHighScore(score, previousBest) {
  return Number.isInteger(score) && score >= 0 && score > previousBest;
}

export function nextTicTacToeStreak(result, currentStreak) {
  return result === 'O' ? currentStreak + 1 : 0;
}

export function rankScores(scores) {
  return scores.map((score, index) => ({ ...score, rank: index + 1 }));
}

export function formatScore(score) {
  return Number.isSafeInteger(score) && score >= 0 ? score.toLocaleString() : '—';
}

export const GAME_LABELS = {
  snake: 'スネークゲーム',
  tictactoe: '戦略的〇×ゲーム',
  'block-puzzle': '8x8ブロックパズル',
  'terrain-quest': 'まちの地図記号クイズ'
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

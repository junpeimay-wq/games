import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatScore,
  GAME_LABELS,
  isNewHighScore,
  nextTicTacToeStreak,
  rankScores,
  updateMapSymbolProgress
} from '../score-utils.js';

test('registers the map quiz as a score-capable game', () => {
  assert.equal(GAME_LABELS['terrain-quest'], 'まちの地図記号クイズ');
});

test('awards map symbol points once for first mastery and ten for later correct answers', () => {
  const wrong = updateMapSymbolProgress(null, '3218', false);
  assert.deepEqual(wrong, {
    attempts: 1,
    correctAnswers: 0,
    mastered: false,
    knownBefore: false,
    pointsAwarded: 0
  });

  const firstCorrect = updateMapSymbolProgress(wrong, '3218', true);
  assert.equal(firstCorrect.pointsAwarded, 100);
  assert.equal(firstCorrect.mastered, true);
  const repeatCorrect = updateMapSymbolProgress(firstCorrect, '3218', true);
  assert.equal(repeatCorrect.pointsAwarded, 10);
  assert.equal(repeatCorrect.correctAnswers, 2);
  assert.equal(repeatCorrect.attempts, 3);
});

test('rejects invalid map symbol progress updates', () => {
  assert.throws(() => updateMapSymbolProgress(null, 'bad', true), RangeError);
  assert.throws(() => updateMapSymbolProgress(null, '3218', 1), RangeError);
  assert.throws(() => updateMapSymbolProgress({
    attempts: 1,
    correctAnswers: 0,
    mastered: true
  }, '3218', true), RangeError);
});

test('only a strictly higher non-negative integer is a new high score', () => {
  assert.equal(isNewHighScore(101, 100), true);
  assert.equal(isNewHighScore(100, 100), false);
  assert.equal(isNewHighScore(99, 100), false);
  assert.equal(isNewHighScore(0, -1), true);
  assert.equal(isNewHighScore(-1, -1), false);
  assert.equal(isNewHighScore(1.5, 1), false);
});

test('tic-tac-toe streaks increase on wins and reset on losses or draws', () => {
  assert.equal(nextTicTacToeStreak('O', 4), 5);
  assert.equal(nextTicTacToeStreak('X', 4), 0);
  assert.equal(nextTicTacToeStreak('DRAW', 4), 0);
});

test('ranking assigns sequential positions and formats only valid scores', () => {
  assert.deepEqual(rankScores([{ name: 'A' }, { name: 'B' }]), [
    { name: 'A', rank: 1 },
    { name: 'B', rank: 2 }
  ]);
  assert.equal(formatScore(1234), '1,234');
  assert.equal(formatScore(Number.NaN), '—');
  assert.equal(formatScore(-1), '—');
});

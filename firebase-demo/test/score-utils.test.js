import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimRankingPrompt,
  formatScore,
  GAME_LABELS,
  isNewHighScore,
  nextRetroFightStreak,
  nextTicTacToeStreak,
  rankScores,
  RANKING_PROMPT_SESSION_KEY,
  updateMapSymbolProgress
} from '../score-utils.js';

test('registers the map quiz as a score-capable game', () => {
  assert.equal(GAME_LABELS['terrain-quest'], 'まちの地図記号クイズ');
});

test('registers retro fight as a score-capable game', () => {
  assert.equal(GAME_LABELS['retro-fight'], 'レトロ格闘ファイト');
});

test('retro fight streaks increase on wins and reset on losses', () => {
  assert.equal(nextRetroFightStreak(true, 4), 5);
  assert.equal(nextRetroFightStreak(true, 0), 1);
  assert.equal(nextRetroFightStreak(false, 4), 0);
  assert.equal(nextRetroFightStreak(false, 0), 0);
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

test('ranking prompt is claimed only once per session (ADR-0016)', () => {
  const data = {};
  const storage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
  assert.equal(claimRankingPrompt(storage), true);
  assert.equal(data[RANKING_PROMPT_SESSION_KEY], '1');
  assert.equal(claimRankingPrompt(storage), false);
  assert.equal(claimRankingPrompt(storage), false);
});

test('ranking prompt falls back to showing when storage is unavailable', () => {
  assert.equal(claimRankingPrompt(null), true);
  assert.equal(claimRankingPrompt(undefined), true);
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); }
  };
  assert.equal(claimRankingPrompt(broken), true);
});

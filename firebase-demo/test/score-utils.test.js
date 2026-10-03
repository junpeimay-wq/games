import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatScore,
  isNewHighScore,
  nextTicTacToeStreak,
  rankScores
} from '../score-utils.js';

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

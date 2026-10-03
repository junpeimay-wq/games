import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canFitAnywhere,
  canFitInAnyRotation,
  getPerfectClearBonus,
  hasAnyValidMove,
  rotateMatrixClockwise
} from '../../block-puzzle/game-logic.js';

test('detects a legal placement after rotating a piece', () => {
  const board = Array.from({ length: 3 }, () => Array(3).fill(null));
  board[0][0] = 'filled';
  board[1][0] = 'filled';
  board[2][0] = 'filled';
  const horizontal = [[1, 1, 1]];

  assert.equal(canFitAnywhere(board, horizontal), false);
  assert.equal(canFitInAnyRotation(board, horizontal), true);
  assert.equal(hasAnyValidMove(board, [{ shape: horizontal }]), true);
});

test('reports game over only when no active piece fits in any orientation', () => {
  const board = Array.from({ length: 2 }, () => Array(2).fill('filled'));
  assert.equal(hasAnyValidMove(board, [{ shape: [[1]] }]), false);
  assert.equal(hasAnyValidMove(board, []), false);
});

test('rotates diagonal pieces without losing their block pattern', () => {
  assert.deepEqual(rotateMatrixClockwise([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]), [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0]
  ]);
});

test('awards the perfect-clear bonus only when the whole board is empty', () => {
  const emptyBoard = Array.from({ length: 2 }, () => Array(2).fill(null));
  const occupiedBoard = [[null, null], [null, 'filled']];

  assert.equal(getPerfectClearBonus(emptyBoard), 1000);
  assert.equal(getPerfectClearBonus(occupiedBoard), 0);
});

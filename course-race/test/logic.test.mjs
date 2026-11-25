import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLS,
  FREE_STAGE,
  ROWS,
  STAGES,
  TILE,
  applyTool,
  countTiles,
  createGrid,
  deserializeGrid,
  findPath,
  serializeGrid,
  stageScore,
  starsOnPath
} from '../logic.js';

test('createGrid places obstacles, start and goal', () => {
  const stage = STAGES[0];
  const grid = createGrid(stage);
  assert.equal(grid.length, ROWS);
  assert.equal(grid[0].length, COLS);
  for (const [x, y] of stage.obstacles) assert.equal(grid[y][x], TILE.OBSTACLE);
  assert.equal(grid[stage.start[1]][stage.start[0]], TILE.ROAD);
  assert.equal(grid[stage.goal[1]][stage.goal[0]], TILE.ROAD);
});

test('applyTool draws road only on empty cells and never on obstacles or start/goal', () => {
  const stage = STAGES[0];
  const grid = createGrid(stage);
  const next = applyTool(grid, stage, 'road', 1, 4);
  assert.equal(next[4][1], TILE.ROAD);
  assert.equal(grid[4][1], TILE.EMPTY); // 元は不変
  const [ox, oy] = stage.obstacles[0];
  assert.equal(applyTool(grid, stage, 'road', ox, oy)[oy][ox], TILE.OBSTACLE);
  assert.equal(applyTool(grid, stage, 'erase', stage.start[0], stage.start[1])[stage.start[1]][stage.start[0]], TILE.ROAD);
});

test('applyTool toggles star and boost on road, erase clears to empty', () => {
  const stage = FREE_STAGE;
  let grid = createGrid(stage);
  grid = applyTool(grid, stage, 'road', 3, 3);
  grid = applyTool(grid, stage, 'star', 3, 3);
  assert.equal(grid[3][3], TILE.STAR);
  grid = applyTool(grid, stage, 'star', 3, 3);
  assert.equal(grid[3][3], TILE.ROAD);
  grid = applyTool(grid, stage, 'boost', 3, 3);
  assert.equal(grid[3][3], TILE.BOOST);
  grid = applyTool(grid, stage, 'erase', 3, 3);
  assert.equal(grid[3][3], TILE.EMPTY);
  // 草地にはスターを置けない
  assert.equal(applyTool(grid, stage, 'star', 5, 5)[5][5], TILE.EMPTY);
});

test('findPath returns null when the goal is not connected', () => {
  const grid = createGrid(FREE_STAGE);
  assert.equal(findPath(grid, FREE_STAGE.start, FREE_STAGE.goal), null);
});

test('findPath finds a straight road and respects obstacles', () => {
  let grid = createGrid(FREE_STAGE);
  for (let x = 0; x < COLS; x += 1) grid = applyTool(grid, FREE_STAGE, 'road', x, 4);
  for (let y = 4; y >= 3; y -= 1) grid = applyTool(grid, FREE_STAGE, 'road', 11, y);
  const path = findPath(grid, FREE_STAGE.start, FREE_STAGE.goal);
  assert.ok(path);
  assert.deepEqual(path[0], FREE_STAGE.start);
  assert.deepEqual(path[path.length - 1], FREE_STAGE.goal);
  // 隣り合うセル同士でつながっている
  for (let i = 1; i < path.length; i += 1) {
    const d = Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
    assert.equal(d, 1);
  }
});

test('stageScore: goal bonus plus stars minus time penalty, floored at 100', () => {
  assert.equal(stageScore({ stars: 0, timeSec: 0, cleared: true }), 500);
  assert.equal(stageScore({ stars: 3, timeSec: 10, cleared: true }), 500 + 300 - 50);
  assert.equal(stageScore({ stars: 0, timeSec: 1000, cleared: true }), 100); // ペナルティ上限400
  assert.equal(stageScore({ stars: 5, timeSec: 3, cleared: false }), 0);
});

test('serialize and deserialize round-trip a grid', () => {
  let grid = createGrid(STAGES[1]);
  grid = applyTool(grid, STAGES[1], 'road', 1, 4);
  grid = applyTool(grid, STAGES[1], 'road', 2, 4);
  grid = applyTool(grid, STAGES[1], 'star', 2, 4);
  const restored = deserializeGrid(serializeGrid(grid), STAGES[1]);
  assert.deepEqual(restored, grid);
});

test('deserializeGrid rejects malformed input and keeps the stage layout', () => {
  const grid = deserializeGrid('garbage', STAGES[2]);
  assert.deepEqual(grid, createGrid(STAGES[2]));
});

test('challenge stages define a star requirement and a time limit; free mode has neither', () => {
  for (const stage of STAGES) {
    assert.ok(stage.requiredStars >= 2, stage.name);
    assert.ok(stage.timeLimit > 0, stage.name);
  }
  assert.equal(FREE_STAGE.requiredStars, 0);
  assert.equal(FREE_STAGE.timeLimit, null);
});

test('countTiles and starsOnPath count placed stars', () => {
  let grid = createGrid(FREE_STAGE);
  for (let x = 0; x < COLS; x += 1) grid = applyTool(grid, FREE_STAGE, 'road', x, 4);
  grid = applyTool(grid, FREE_STAGE, 'road', 11, 3);
  grid = applyTool(grid, FREE_STAGE, 'star', 3, 4);
  grid = applyTool(grid, FREE_STAGE, 'star', 7, 4);
  grid = applyTool(grid, FREE_STAGE, 'star', 0, 0); // 草地には置けない
  assert.equal(countTiles(grid, TILE.STAR), 2);
  const path = findPath(grid, FREE_STAGE.start, FREE_STAGE.goal);
  assert.equal(starsOnPath(grid, path), 2);
  assert.equal(starsOnPath(grid, null), 0);
});

test('every challenge stage is solvable in principle (start and goal not enclosed)', () => {
  for (const stage of STAGES) {
    // 障害物以外を全部みちにすれば必ずつながる
    const grid = createGrid(stage);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (grid[y][x] === TILE.EMPTY) grid[y][x] = TILE.ROAD;
      }
    }
    assert.ok(findPath(grid, stage.start, stage.goal), stage.name);
  }
});

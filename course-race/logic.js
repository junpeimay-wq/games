'use strict';

// コースづくりレースの純粋ロジック（DOMに依存しない部分）。
// ルールとスコアの決定は docs/adr/0001 を参照。

export const COLS = 12;
export const ROWS = 8;

export const TILE = {
  EMPTY: 0, // 草地
  ROAD: 1, // みち
  STAR: 2, // みち＋スター
  BOOST: 3, // みち＋ブースト
  OBSTACLE: 4 // 障害物（木・岩）。置けない・消せない
};

// チャレンジコース（全員同じ条件）。start / goal は [col, row]。
export const STAGES = [
  {
    name: 'はじめてのコース',
    start: [0, 4],
    goal: [11, 3],
    obstacles: [[5, 2], [5, 3], [6, 5], [3, 6], [8, 1]]
  },
  {
    name: 'もりをぬけて',
    start: [0, 4],
    goal: [11, 4],
    obstacles: [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [3, 2], [8, 5], [9, 2]]
  },
  {
    name: 'ぐるぐる山道',
    start: [0, 6],
    goal: [11, 1],
    obstacles: [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7],
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [2, 5], [10, 2]]
  }
];

// フリーモードの初期配置（障害物なし）
export const FREE_STAGE = {
  name: 'フリー',
  start: [0, 4],
  goal: [11, 3],
  obstacles: []
};

const key = (x, y) => `${x},${y}`;

// ステージ定義からグリッドを作る。grid は行優先の2次元配列 grid[y][x]。
// スタートとゴールは最初から「みち」として置かれ、消せない。
export function createGrid(stage) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE.EMPTY));
  for (const [x, y] of stage.obstacles) grid[y][x] = TILE.OBSTACLE;
  grid[stage.start[1]][stage.start[0]] = TILE.ROAD;
  grid[stage.goal[1]][stage.goal[0]] = TILE.ROAD;
  return grid;
}

export function isProtected(stage, x, y) {
  return (stage.start[0] === x && stage.start[1] === y)
    || (stage.goal[0] === x && stage.goal[1] === y);
}

export function isRoad(tile) {
  return tile === TILE.ROAD || tile === TILE.STAR || tile === TILE.BOOST;
}

// ツールをセルに適用した新しいグリッドを返す（元のグリッドは変更しない）。
// tool: 'road' | 'star' | 'boost' | 'erase'
export function applyTool(grid, stage, tool, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return grid;
  const tile = grid[y][x];
  if (tile === TILE.OBSTACLE || isProtected(stage, x, y)) return grid;
  const next = grid.map((row) => row.slice());
  if (tool === 'road') {
    if (tile === TILE.EMPTY) next[y][x] = TILE.ROAD;
  } else if (tool === 'star') {
    // スターはみちの上にだけ置ける。再度押すと外れる
    if (tile === TILE.ROAD) next[y][x] = TILE.STAR;
    else if (tile === TILE.STAR) next[y][x] = TILE.ROAD;
  } else if (tool === 'boost') {
    if (tile === TILE.ROAD) next[y][x] = TILE.BOOST;
    else if (tile === TILE.BOOST) next[y][x] = TILE.ROAD;
  } else if (tool === 'erase') {
    next[y][x] = TILE.EMPTY;
  }
  return next;
}

// スタートからゴールまでの最短路（BFS）。たどれるみちがなければ null。
// 戻り値は [[x, y], ...]（スタートとゴールを含む）。
export function findPath(grid, start, goal) {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  const prev = new Map();
  const visited = new Set([key(sx, sy)]);
  const queue = [[sx, sy]];
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x === gx && y === gy) {
      const path = [];
      let cur = [gx, gy];
      while (cur) {
        path.unshift(cur);
        cur = prev.get(key(cur[0], cur[1])) || null;
      }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (visited.has(key(nx, ny))) continue;
      if (!isRoad(grid[ny][nx])) continue;
      visited.add(key(nx, ny));
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  return null;
}

// ステージのスコア: ゴールで500点＋スター100点ずつ、
// かかった時間で少し減点（最大400点まで）。最低でも100点。
export function stageScore({ stars, timeSec, cleared }) {
  if (!cleared) return 0;
  const penalty = Math.min(400, Math.floor(timeSec) * 5);
  return Math.max(100, 500 + stars * 100 - penalty);
}

// グリッドの保存・復元（localStorage用に文字列化する）
export function serializeGrid(grid) {
  return grid.map((row) => row.join('')).join('/');
}

export function deserializeGrid(text, stage) {
  const grid = createGrid(stage);
  if (typeof text !== 'string') return grid;
  const rows = text.split('/');
  if (rows.length !== ROWS) return grid;
  for (let y = 0; y < ROWS; y += 1) {
    if (rows[y].length !== COLS) return grid;
    for (let x = 0; x < COLS; x += 1) {
      const value = Number.parseInt(rows[y][x], 10);
      if (grid[y][x] === TILE.OBSTACLE) continue; // 障害物は定義が優先
      if (Object.values(TILE).includes(value) && value !== TILE.OBSTACLE) {
        grid[y][x] = value;
      }
    }
  }
  // スタートとゴールは必ずみちに戻す
  grid[stage.start[1]][stage.start[0]] = TILE.ROAD;
  grid[stage.goal[1]][stage.goal[0]] = TILE.ROAD;
  return grid;
}

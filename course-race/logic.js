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
// requiredStars: クリアに必要な、ルート上で取るスターの数。
// timeLimit: レースの制限時間（秒）。障害物は壁状に配置し、
// まっすぐ進むだけでは抜けられないようにしている（ADR-0003）。
export const STAGES = [
  {
    name: 'はじめてのコース',
    start: [0, 4],
    goal: [11, 3],
    requiredStars: 2,
    timeLimit: 15,
    obstacles: [[5, 3], [5, 4], [5, 5], [5, 6], [8, 1], [3, 6], [9, 5]]
  },
  {
    name: 'もりをぬけて',
    start: [0, 4],
    goal: [11, 4],
    requiredStars: 3,
    timeLimit: 20,
    obstacles: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
      [8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [2, 2], [10, 5]]
  },
  {
    name: 'ぐるぐる山道',
    start: [0, 6],
    goal: [11, 1],
    requiredStars: 4,
    timeLimit: 25,
    obstacles: [[3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7],
      [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
      [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7], [1, 5], [5, 3]]
  }
];

// フリーモードの初期配置（障害物なし・スター必須なし・制限時間なし）
export const FREE_STAGE = {
  name: 'フリー',
  start: [0, 4],
  goal: [11, 3],
  requiredStars: 0,
  timeLimit: null,
  obstacles: []
};

// チャレンジで置ける数（フリーは無制限）。スコアの伸びすぎを防ぐ（ADR-0003）
export const CHALLENGE_STAR_LIMIT = 5;
export const CHALLENGE_BOOST_LIMIT = 3;

// 金のスター（チャレンジのランダムボーナス、ADR-0004）。
// レース中に一定間隔で車の前方のルート上に出現し、制限時間内に
// 通るとボーナス点が入る。旧ルールの記録を新ルールでも更新できる
// ように、天井を引き上げる目的で入れた。
export const BONUS_POINTS = 500;
export const BONUS_INTERVAL_SEC = 2.2;
export const BONUS_LIFETIME_SEC = 3.5;

// 車の前方（nextIndex から minAhead マス以上先）から出現セルを選ぶ。
// 置ける場所がなければ -1。randomValue は 0 以上 1 未満。
export function pickBonusIndex(pathLength, nextIndex, randomValue, minAhead = 2) {
  const min = nextIndex + minAhead;
  if (min > pathLength - 1) return -1;
  const span = pathLength - min;
  return min + Math.min(span - 1, Math.floor(randomValue * span));
}

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

// グリッド内の特定タイルの数を数える
export function countTiles(grid, tile) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === tile) count += 1;
    }
  }
  return count;
}

// パス（セル列）の上にあるスターの数。車はこのパスを通るため、
// 実際に取れるスターの数と一致する。
export function starsOnPath(grid, path) {
  if (!path) return 0;
  let count = 0;
  for (const [x, y] of path) {
    if (grid[y][x] === TILE.STAR) count += 1;
  }
  return count;
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

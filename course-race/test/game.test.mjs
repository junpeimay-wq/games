import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// game.js はブラウザ向けESモジュール。DOM/Canvasをスタブし、
// スコア基盤へのimportをテスト用スタブに差し替えてVM上で駆動する。
// 純粋ロジック（logic.js）は実物を読み込んで使う。
// ここではゲーム本体の進行（編集・出発可否・レース・ゴール・スコア記録）を検証する。

function loadGame({ cloudCourses = null, seed = {} } = {}) {
  const calls = { record: [], saveCourses: [] };
  const handlers = {};
  const elements = {};
  let rafCallback = null;
  const store = {};

  const makeCtx = () => {
    const noop = () => {};
    return {
      imageSmoothingEnabled: true,
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
      globalAlpha: 1,
      createLinearGradient: () => ({ addColorStop: noop }),
      fillRect: noop, strokeRect: noop, beginPath: noop, ellipse: noop,
      fill: noop, save: noop, restore: noop, translate: noop, scale: noop,
      rotate: noop, fillText: noop, arc: noop, setLineDash: noop,
      moveTo: noop, lineTo: noop, closePath: noop, stroke: noop
    };
  };
  const makeEl = (id) => ({
    id, textContent: '', disabled: false, style: {}, children: [],
    addEventListener: (type, fn) => { handlers[`${id}:${type}`] = fn; },
    appendChild(child) { this.children.push(child); },
    setAttribute: () => {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 320 }),
    classList: { toggle: () => {}, add: () => {}, remove: () => {} }
  });

  Object.assign(store, seed);
  const sandbox = {
    console,
    document: {
      getElementById: (id) => (elements[id] ??= makeEl(id)),
      createElement: (tag) => makeEl(tag),
      addEventListener: (type, fn) => { handlers[type] = fn; },
      body: { classList: { add: () => {} } }
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    requestAnimationFrame: (cb) => { rafCallback = cb; }
  };
  sandbox.window = {
    addEventListener: () => {},
    AudioContext: undefined,
    webkitAudioContext: undefined,
    matchMedia: undefined
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  let logic = readFileSync(new URL('../logic.js', import.meta.url), 'utf8');
  logic = logic.replace(/^export /gm, '');
  let code = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  code = code.replace(/import[\s\S]*?from '[^']+';/g, '');
  code = `
    const loadHighScore = async () => null;
    const recordHighScore = async (game, score) => { globalThis.__calls.record.push([game, score]); return true; };
    const loadCourseRaceCourses = async () => globalThis.__cloudCourses;
    const saveCourseRaceCourses = async (courses) => { globalThis.__calls.saveCourses.push(courses); return true; };
  ` + logic + code + `
    ;globalThis.__t = {
      startRace, advanceAfterClear,
      get phase(){ return phase; },
      get stageIndex(){ return stageIndex; },
      get lastStageScore(){ return lastStageScore; },
      get best(){ return best; },
      get stars(){ return currentStars(); },
      // 障害物以外の全マスをみちにする（最短路が必ずできる）
      solveAll() {
        let g = grid;
        for (let y = 0; y < ROWS; y += 1) {
          for (let x = 0; x < COLS; x += 1) g = applyTool(g, stage, 'road', x, y);
        }
        grid = g;
      },
      // 最短路の上に n 個のスターを置く
      starOnRoute(n) {
        const path = findPath(grid, stage.start, stage.goal);
        let placed = 0;
        for (const [x, y] of path.slice(1, -1)) {
          if (placed >= n) break;
          grid = applyTool(grid, stage, 'star', x, y);
          placed += 1;
        }
      },
      paintAtCell(toolName, x, y) { selectTool(toolName); paintCell(x, y); },
      countTile(tile) { return countTiles(grid, tile); },
      starTile: TILE.STAR,
      setTimeLimit(sec) { stage.timeLimit = sec; }
    };
  `;
  sandbox.__calls = calls;
  sandbox.__cloudCourses = cloudCourses;
  vm.runInContext(code, sandbox);
  vm.runInContext('Math.random = () => 0.5;', sandbox);

  const T = sandbox.__t;
  let ts = 0;
  const frames = (n) => {
    for (let i = 0; i < n; i++) {
      ts += 16.7;
      const cb = rafCallback;
      rafCallback = null;
      assert.ok(cb, 'requestAnimationFrame callback must be registered');
      cb(ts);
    }
  };
  return { T, frames, calls, store, handlers };
}

test('ignores pre-revision (v1) local bests after the score reset', () => {
  const { T } = loadGame({
    seed: {
      'course-race-best-score': '7795',
      'course-race-stage-bests': '[2600, 2600, 2595]'
    }
  });
  assert.equal(T.best, 0);
});

test('starts in edit mode on stage 1', () => {
  const { T } = loadGame();
  assert.equal(T.phase, 'edit');
  assert.equal(T.stageIndex, 0);
});

test('GO without a connected road does not start the race', () => {
  const { T } = loadGame();
  T.startRace();
  assert.equal(T.phase, 'edit');
});

test('GO is blocked when the route has fewer stars than required', () => {
  const { T } = loadGame();
  T.solveAll();
  T.startRace();
  assert.equal(T.phase, 'edit'); // コース1は⭐2こ必須
});

test('a connected course races to the goal, collects stars and records the total', () => {
  const { T, frames, calls } = loadGame();
  T.solveAll();
  T.starOnRoute(2);
  T.startRace();
  assert.equal(T.phase, 'race');
  frames(400); // 約6.7秒ぶん（ゴールまで約4.5秒）
  assert.equal(T.phase, 'clear');
  assert.equal(T.stars, 2);
  // 500（ゴール）+ 200（スター2つ）- 時間ペナルティ（約4.5秒で20点）
  assert.ok(T.lastStageScore >= 640 && T.lastStageScore <= 700, `score was ${T.lastStageScore}`);
  assert.equal(T.best, T.lastStageScore);
  assert.equal(calls.record.length, 1);
  assert.equal(calls.record[0][0], 'course-race');
  assert.equal(calls.record[0][1], T.lastStageScore);
});

test('challenge mode caps placeable stars at the limit', () => {
  const { T } = loadGame();
  T.solveAll();
  for (let x = 0; x < 12; x += 1) T.paintAtCell('star', x, 0);
  for (let x = 0; x < 12; x += 1) T.paintAtCell('star', x, 1);
  assert.equal(T.countTile(T.starTile), 5);
});

test('the race returns to edit mode when the time limit runs out', () => {
  const { T, frames } = loadGame();
  T.solveAll();
  T.starOnRoute(2);
  T.setTimeLimit(0.5);
  T.startRace();
  assert.equal(T.phase, 'race');
  frames(90); // 約1.5秒ぶん
  assert.equal(T.phase, 'edit');
});

const cloudGrid = [
  '000000000000', '000000000000', '000000000000', '000000000001',
  '100000000000', '000000000000', '000000000000', '000000000000'
].join('/');

test('loads cloud courses at startup when signed in', async () => {
  const { store } = loadGame({ cloudCourses: [{ name: 'クラウドコース', grid: cloudGrid }] });
  await new Promise((resolve) => setImmediate(resolve));
  const saved = JSON.parse(store['course-race-saved-courses'] || '[]');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'クラウドコース');
});

test('saving a course in free mode persists locally and to the cloud', async () => {
  const { calls, store, handlers } = loadGame();
  handlers['btn-mode:click']();
  handlers['btn-save-course:click']();
  await new Promise((resolve) => setImmediate(resolve));
  const saved = JSON.parse(store['course-race-saved-courses'] || '[]');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'コース1');
  assert.equal(calls.saveCourses.length, 1);
  // VM内で作られたオブジェクトはプロトタイプが異なるため要素ごとに比べる
  assert.equal(calls.saveCourses[0].length, saved.length);
  assert.equal(calls.saveCourses[0][0].name, saved[0].name);
  assert.equal(calls.saveCourses[0][0].grid, saved[0].grid);
});

test('advancing after a clear moves to the next stage in edit mode', () => {
  const { T, frames } = loadGame();
  T.solveAll();
  T.starOnRoute(2);
  T.startRace();
  frames(400);
  assert.equal(T.phase, 'clear');
  T.advanceAfterClear();
  assert.equal(T.stageIndex, 1);
  assert.equal(T.phase, 'edit');
});

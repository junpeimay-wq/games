import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// game.js はブラウザ向けESモジュール。DOM/Canvasをスタブし、
// スコア基盤へのimportをテスト用スタブに差し替えてVM上で駆動する。
// 純粋ロジック（logic.js）は実物を読み込んで使う。
// ここではゲーム本体の進行（開始・キャッチ・わさび・フィーバー・終了・スコア記録）を検証する。

function loadGame() {
  const calls = { record: [] };
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
    id, textContent: '', disabled: false,
    addEventListener: (type, fn) => { handlers[`${id}:${type}`] = fn; },
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ top: 0, height: 270 }),
    classList: { toggle: () => {}, add: () => {}, remove: () => {} }
  });

  const sandbox = {
    console,
    document: {
      getElementById: (id) => (elements[id] ??= makeEl(id)),
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
  ` + logic + code + `
    ;globalThis.__t = {
      startGame, attemptCatch,
      get phase(){ return phase; },
      get score(){ return score; },
      get combo(){ return combo; },
      get items(){ return items; },
      set items(v){ items = v; },
      get best(){ return best; }
    };
  `;
  sandbox.__calls = calls;
  vm.runInContext(code, sandbox);
  // 乱数を固定する（出現はまぐろ・まんなかレーン寄りになる）
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
  const key = (codeName) => handlers.keydown({ code: codeName, repeat: false, preventDefault: () => {} });
  return { T, frames, key, calls, store };
}

const ZONE_X = 404;

test('starts on the title screen and Enter begins play', () => {
  const { T, key } = loadGame();
  assert.equal(T.phase, 'title');
  key('Enter');
  assert.equal(T.phase, 'play');
});

test('catching sushi in the zone scores points and builds combo', () => {
  const { T, key } = loadGame();
  key('Enter');
  T.items = [{ lane: 1, x: ZONE_X, type: 'maguro' }];
  T.attemptCatch(1);
  // まぐろ20点 + ピッタリ20点（コンボ倍率1）
  assert.equal(T.score, 40);
  assert.equal(T.combo, 1);
  assert.equal(T.items.length, 0);
});

test('a whiff resets the combo without a score penalty', () => {
  const { T, key } = loadGame();
  key('Enter');
  T.items = [{ lane: 0, x: ZONE_X, type: 'tamago' }];
  T.attemptCatch(0);
  assert.equal(T.combo, 1);
  const before = T.score;
  T.attemptCatch(2); // 何もないレーンで空振り
  assert.equal(T.combo, 0);
  assert.equal(T.score, before);
});

test('wasabi resets the combo, scores nothing and stuns briefly', () => {
  const { T, key, frames } = loadGame();
  key('Enter');
  T.items = [{ lane: 1, x: ZONE_X, type: 'tamago' }];
  T.attemptCatch(1);
  assert.equal(T.combo, 1);
  const before = T.score;
  T.items = [{ lane: 1, x: ZONE_X, type: 'wasabi' }];
  T.attemptCatch(1);
  assert.equal(T.combo, 0);
  assert.equal(T.score, before);
  // 硬直中は取れない
  T.items = [{ lane: 1, x: ZONE_X, type: 'tamago' }];
  T.attemptCatch(1);
  assert.equal(T.score, before);
  // 少し時間が経てば取れる
  frames(60); // 約1秒
  T.items = [{ lane: 1, x: ZONE_X, type: 'tamago' }];
  T.attemptCatch(1);
  assert.ok(T.score > before);
});

test('the gold plate starts fever and doubles points', () => {
  const { T, key } = loadGame();
  key('Enter');
  T.items = [{ lane: 2, x: ZONE_X, type: 'gold' }];
  T.attemptCatch(2);
  const afterGold = T.score;
  assert.ok(afterGold > 0);
  T.items = [{ lane: 2, x: ZONE_X + 20, type: 'tamago' }];
  T.attemptCatch(2);
  // たまご10点（good判定）× フィーバー2倍 = 20点
  assert.equal(T.score, afterGold + 20);
});

test('the game ends after 60 seconds and records a new best once', () => {
  const { T, key, frames, calls } = loadGame();
  key('Enter');
  T.items = [{ lane: 1, x: ZONE_X, type: 'otoro' }];
  T.attemptCatch(1);
  const finalScore = T.score;
  assert.ok(finalScore > 0);
  frames(3700); // 約61.8秒ぶん進める
  assert.equal(T.phase, 'end');
  assert.equal(T.best, finalScore);
  // VM内で作られた配列はプロトタイプが異なるため、要素ごとに比較する
  assert.equal(calls.record.length, 1);
  assert.equal(calls.record[0][0], 'sushi-catch');
  assert.equal(calls.record[0][1], finalScore);
});

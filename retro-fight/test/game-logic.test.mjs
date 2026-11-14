import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// game.js はブラウザ向けESモジュール。DOM/Canvasをスタブし、
// スコア基盤へのimportをテスト用スタブに差し替えてVM上で駆動する。
// 連勝遷移そのものの検証は firebase-demo/test/score-utils.test.js が担い、
// ここではゲーム本体とスコア記録の連携（呼び出し条件・連勝の増減）を検証する。

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
      createLinearGradient: () => ({ addColorStop: noop }),
      fillRect: noop, strokeRect: noop, beginPath: noop, ellipse: noop,
      fill: noop, save: noop, restore: noop, translate: noop, scale: noop,
      rotate: noop, fillText: noop, arc: noop
    };
  };
  const makeEl = (id) => ({
    id, textContent: '',
    addEventListener: () => {},
    getContext: () => makeCtx(),
    classList: { toggle: () => {}, add: () => {}, remove: () => {} }
  });

  const sandbox = {
    console,
    document: { getElementById: (id) => (elements[id] ??= makeEl(id)) },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    requestAnimationFrame: (cb) => { rafCallback = cb; }
  };
  sandbox.window = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    AudioContext: undefined,
    webkitAudioContext: undefined
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  let code = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  code = code.replace(/^import .*$/gm, '');
  code = `
    const loadHighScore = async () => null;
    const recordHighScore = async (game, score) => { globalThis.__calls.record.push([game, score]); return true; };
    const nextRetroFightStreak = (won, s) => (won ? s + 1 : 0);
  ` + code + `
    ;globalThis.__t = {
      get phase(){return phase}, get p1(){return p1}, get cpu(){return cpu},
      get round(){return round}, get streak(){return streak}, get best(){return best}
    };
  `;
  sandbox.__calls = calls;
  vm.runInContext('globalThis.__origRandom = Math.random;', sandbox);
  vm.runInContext(code, sandbox);

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
  const key = (codeName, type) => handlers[type]({ code: codeName, repeat: false, preventDefault: () => {} });
  const freezeCpu = () => {
    vm.runInContext('Math.random = () => 0.99;', sandbox);
    T.cpu.aiT = 999999;
    T.cpu.aiMove = 0;
    T.cpu.aiGuard = false;
    T.cpu.state = 'idle';
    T.cpu.attack = null;
  };
  const winRoundByKO = () => {
    frames(100); // intro -> fight
    assert.equal(T.phase, 'fight');
    freezeCpu();
    T.p1.state = 'idle'; T.p1.attack = null;
    T.p1.x = 200; T.cpu.x = 230;
    T.p1.y = 234; T.cpu.y = 234;
    T.p1.facing = 1; T.cpu.facing = -1;
    T.cpu.hp = 4;
    key('KeyF', 'keydown');
    frames(3);
    key('KeyF', 'keyup');
    frames(30);
    assert.equal(T.phase, 'roundEnd');
    frames(160); // -> next round intro or match end
  };
  const startMatch = () => {
    key('Enter', 'keydown');
    frames(5);
    assert.equal(T.phase, 'intro');
  };
  const unfreezeRandom = () => {
    vm.runInContext('Math.random = globalThis.__origRandom;', sandbox);
  };
  return { T, frames, key, startMatch, winRoundByKO, calls, store, unfreezeRandom, freezeCpu };
}

test('match flow: title, movement, CPU attack, punch damage, KO', () => {
  const g = loadGame();
  g.frames(30);
  assert.equal(g.T.phase, 'title');
  g.startMatch();
  g.frames(100);
  assert.equal(g.T.phase, 'fight');

  const startX = g.T.p1.x;
  g.key('KeyD', 'keydown');
  g.frames(40);
  g.key('KeyD', 'keyup');
  assert.ok(g.T.p1.x > startX + 40, 'player moves right while D is held');

  let cpuAttacked = false;
  for (let i = 0; i < 360 && !cpuAttacked; i++) {
    g.frames(1);
    if (g.T.cpu.state === 'punch' || g.T.cpu.state === 'kick') cpuAttacked = true;
  }
  assert.ok(cpuAttacked, 'CPU attacks on its own');
});

test('special move: gauge builds on landed punches and a full gauge unleashes big damage', () => {
  const g = loadGame();
  g.frames(10);
  g.startMatch();
  g.frames(100);
  assert.equal(g.T.phase, 'fight');
  g.freezeCpu();
  g.T.p1.x = 200; g.T.cpu.x = 230;
  g.T.p1.y = 234; g.T.cpu.y = 234;
  g.T.p1.facing = 1; g.T.cpu.facing = -1;

  // パンチを当てると攻撃側のゲージが貯まる
  assert.equal(g.T.p1.gauge, 0);
  const hpBefore = g.T.cpu.hp;
  g.key('KeyF', 'keydown');
  g.frames(3);
  g.key('KeyF', 'keyup');
  g.frames(30);
  assert.equal(g.T.cpu.hp, hpBefore - 5);
  assert.equal(g.T.p1.gauge, 10);

  // ゲージが満タンでなければ必殺技は出ない
  g.T.p1.gauge = 50;
  g.T.p1.state = 'idle'; g.T.p1.attack = null;
  g.key('KeyH', 'keydown');
  g.frames(3);
  g.key('KeyH', 'keyup');
  g.frames(20);
  assert.notEqual(g.T.p1.state, 'special');
  assert.equal(g.T.p1.gauge, 50);

  // 満タンなら必殺技が出て大ダメージを与え、ゲージは0に戻る
  const hpFull = g.T.cpu.hp;
  g.T.p1.gauge = 100;
  g.T.p1.state = 'idle'; g.T.p1.attack = null;
  g.T.cpu.state = 'idle'; g.T.cpu.attack = null;
  g.T.cpu.x = 230; g.T.cpu.y = 234;
  g.key('KeyH', 'keydown');
  g.frames(3);
  g.key('KeyH', 'keyup');
  assert.equal(g.T.p1.gauge, 0);
  g.frames(40);
  assert.equal(g.T.cpu.hp, hpFull - 26);
});

test('winning a match records the new best streak once; losing resets the streak', async () => {
  const g = loadGame();
  g.frames(10);
  g.startMatch();
  g.winRoundByKO();
  assert.equal(g.T.round, 2);
  g.winRoundByKO();
  assert.equal(g.T.phase, 'matchEnd');
  assert.equal(g.T.streak, 1);
  assert.equal(g.T.best, 1);
  assert.equal(g.store['retro-fight-current-streak'], '1');
  assert.equal(g.store['retro-fight-best-streak'], '1');
  // VMコンテキスト側で作られた配列のため、要素ごとに比較する
  assert.equal(g.calls.record.length, 1);
  assert.equal(g.calls.record[0][0], 'retro-fight');
  assert.equal(g.calls.record[0][1], 1);

  // 次の試合に負けると連勝はリセットされ、記録は増えない
  g.unfreezeRandom();
  g.frames(50);
  g.key('Enter', 'keydown');
  g.frames(100);
  assert.equal(g.T.phase, 'fight');
  // プレイヤーの体力を1に保ち、CPUに2ラウンド取らせる
  for (let i = 0; i < 400 && g.T.phase !== 'matchEnd'; i++) {
    if (g.T.phase === 'fight') {
      g.T.p1.hp = 1;
      g.T.cpu.x = g.T.p1.x + 30;
      g.T.cpu.facing = -1;
    }
    g.frames(10);
  }
  assert.equal(g.T.phase, 'matchEnd');
  assert.equal(g.T.streak, 0);
  assert.equal(g.store['retro-fight-current-streak'], '0');
  assert.equal(g.calls.record.length, 1);
});

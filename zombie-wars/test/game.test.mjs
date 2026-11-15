import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// game.js はブラウザ向けESモジュール。DOM/Canvasをスタブし、
// スコア基盤へのimportをテスト用スタブに差し替えてVM上で駆動する。
// 純粋ロジック（logic.js）は実物を読み込んで使う。
// ここではゲーム本体の進行（召喚・戦闘・必殺・勝敗・スコア記録）を検証する。

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
      rotate: noop, fillText: noop, arc: noop,
      moveTo: noop, lineTo: noop, closePath: noop, stroke: noop
    };
  };
  const makeEl = (id) => ({
    id, textContent: '', disabled: false,
    addEventListener: () => {},
    getContext: () => makeCtx(),
    classList: { toggle: () => {}, add: () => {}, remove: () => {} }
  });

  const sandbox = {
    console,
    document: {
      getElementById: (id) => (elements[id] ??= makeEl(id)),
      body: { classList: { add: () => {} } }
    },
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

  let logic = readFileSync(new URL('../logic.js', import.meta.url), 'utf8');
  logic = logic.replace(/^export /gm, '');
  let code = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  code = code.replace(/import[\s\S]*?from '[^']+';/g, '');
  code = `
    const loadHighScore = async () => null;
    const recordHighScore = async (game, score) => { globalThis.__calls.record.push([game, score]); return true; };
  ` + logic + code + `
    ;globalThis.__t = {
      S, summon, startMatch, fireSpecial,
      get best(){ return best; }
    };
  `;
  sandbox.__calls = calls;
  vm.runInContext(code, sandbox);
  // 乱数を固定し、出現ゾンビを通常種だけにする
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
  const playerUnits = () => T.S.units.filter((u) => u.side === 'player');
  const addZombie = (props) => {
    const z = {
      side: 'zombie', type: 'normal', x: 300, hp: 55, maxHp: 55,
      dmg: 5, range: 20, interval: 0.8, speed: 0,
      cooldown: 0, walkPhase: 0, flashT: 0, dead: false,
      ...props
    };
    T.S.units.push(z);
    return z;
  };
  return { T, frames, key, playerUnits, addZombie, calls, store };
}

test('summoning spends coins and respects affordability', () => {
  const g = loadGame();
  g.frames(5);
  assert.equal(g.T.S.phase, 'title');
  g.T.startMatch();
  assert.equal(g.T.S.phase, 'fight');
  assert.equal(g.T.S.coins, 50);

  g.key('Digit1'); // ナイフ戦士 20コイン
  assert.equal(g.playerUnits().length, 1);
  assert.equal(g.T.S.coins, 30);

  g.key('Digit3'); // 銃の戦士 60コインは買えない
  assert.equal(g.playerUnits().length, 1);
  assert.equal(g.T.S.coins, 30);

  g.frames(90); // 約1.5秒で+6コイン
  assert.ok(g.T.S.coins >= 35);
  g.T.summon('shield'); // 45コインにはまだ足りない
  assert.equal(g.playerUnits().length, 1);
  g.frames(180); // 合計約4.5秒経過で45コイン以上
  g.T.summon('shield');
  assert.equal(g.playerUnits().length, 2);
});

test('warriors fight zombies in range, kills raise the gauge', () => {
  const g = loadGame();
  g.frames(5);
  g.T.startMatch();
  g.T.S.waveTimer = 9999; // ウェーブ出現を止める
  g.T.summon('knife');
  const warrior = g.playerUnits()[0];
  warrior.x = 200;
  const zombie = g.addZombie({ x: 215, hp: 10 });
  g.frames(150); // 約2.5秒: ナイフ2発で倒せる
  assert.equal(zombie.dead, true);
  assert.equal(g.T.S.kills, 1);
  assert.ok(g.T.S.gauge >= 10, '攻撃命中と撃破でゲージが貯まる');
  assert.equal(g.T.S.units.includes(zombie), false, '倒れたゾンビは除去される');
});

test('special move damages every zombie on screen when the gauge is full', () => {
  const g = loadGame();
  g.frames(5);
  g.T.startMatch();
  g.T.S.waveTimer = 9999;
  const z1 = g.addZombie({ x: 250, hp: 20 });
  const z2 = g.addZombie({ x: 350, hp: 20 });
  const z3 = g.addZombie({ x: 150, hp: 100 });
  // ゲージが満タンでなければ発動しない
  g.T.fireSpecial();
  assert.equal(z1.dead, false);
  g.T.S.gauge = 100;
  g.key('KeyH');
  assert.equal(z1.dead, true);
  assert.equal(z2.dead, true);
  assert.equal(z3.dead, false);
  assert.equal(z3.hp, 50); // SPECIAL_DAMAGE = 50
  assert.equal(g.T.S.kills, 2);
});

test('destroying the nest wins the match and records the score once', () => {
  const g = loadGame();
  g.frames(5);
  g.T.startMatch();
  g.T.S.waveTimer = 9999;
  g.T.S.defenseTimer = 9999; // 巣の防衛出現も止める
  g.T.S.nestHp = 6;
  g.T.summon('knife');
  const warrior = g.playerUnits()[0];
  warrior.x = 410; // 巣の射程内
  g.frames(120);
  assert.equal(g.T.S.phase, 'end');
  assert.equal(g.T.S.won, true);
  // スコア = 倒した数0 + バリケード残り320 + 時間ボーナス(300-経過約2秒)
  assert.equal(g.T.S.score, g.T.S.kills + 320 + (300 - Math.floor(g.T.S.elapsed)));
  assert.equal(g.calls.record.length, 1);
  assert.equal(g.calls.record[0][0], 'zombie-wars');
  assert.equal(g.calls.record[0][1], g.T.S.score);
  assert.equal(g.store['zombie-wars-best-score'], String(g.T.S.score));
});

test('losing the barricade ends the match without a record when the score is not a best', () => {
  const g = loadGame();
  g.frames(5);
  g.T.startMatch();
  g.T.S.waveTimer = 9999;
  g.T.S.barricadeHp = 5;
  g.addZombie({ x: 70, hp: 55, dmg: 5 }); // バリケードの射程内
  g.frames(180);
  assert.equal(g.T.S.phase, 'end');
  assert.equal(g.T.S.won, false);
  assert.equal(g.T.S.score, 0);
  assert.equal(g.calls.record.length, 0);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BASE_HP,
  ECONOMY,
  FIELD,
  GAUGE_GAIN,
  GAUGE_MAX,
  SPECIAL_DAMAGE,
  UNIT_TYPES,
  ZOMBIE_TYPES,
  addGauge,
  canAfford,
  computeScore,
  createCoins,
  makeWarrior,
  makeZombie,
  pickZombieType,
  resolveTarget,
  spendCoins,
  tickCoins,
  warriorDamageMul,
  waveBreak,
  waveSize,
  zombieHpMultiplier
} from '../logic.js';

// ---------- 経済（コイン） ----------
test('coins start at the configured amount and regenerate up to the cap', () => {
  assert.equal(createCoins(), ECONOMY.start);
  assert.equal(tickCoins(50, 1), 50 + ECONOMY.regenPerSec);
  assert.equal(tickCoins(ECONOMY.max - 1, 10), ECONOMY.max);
  assert.equal(tickCoins(0, 0), 0);
});

test('summoning requires and spends the unit cost', () => {
  assert.equal(canAfford(20, 'knife'), true);
  assert.equal(canAfford(19, 'knife'), false);
  assert.equal(canAfford(70, 'gun'), true);
  assert.equal(canAfford(69, 'gun'), false);
  assert.equal(spendCoins(50, 'knife'), 30);
  assert.equal(spendCoins(50, 'shield'), 5);
  // 足りない場合は消費しない
  assert.equal(spendCoins(10, 'gun'), 10);
});

test('unit balance: shield is the tank, gun is ranged and fragile, knife is cheap and fast', () => {
  assert.ok(UNIT_TYPES.shield.hp > UNIT_TYPES.knife.hp);
  assert.ok(UNIT_TYPES.shield.hp > UNIT_TYPES.gun.hp * 4);
  assert.ok(UNIT_TYPES.gun.range > UNIT_TYPES.knife.range * 4);
  assert.ok(UNIT_TYPES.knife.cost < UNIT_TYPES.shield.cost);
  assert.ok(UNIT_TYPES.knife.cost < UNIT_TYPES.gun.cost);
  assert.ok(UNIT_TYPES.knife.speed > UNIT_TYPES.shield.speed);
  const w = makeWarrior('gun');
  assert.equal(w.hp, UNIT_TYPES.gun.hp);
  assert.equal(w.maxHp, UNIT_TYPES.gun.hp);
});

// ---------- ウェーブ生成 ----------
test('waves grow in size and their breaks shrink, both within limits', () => {
  assert.equal(waveSize(1), 3);
  assert.equal(waveSize(3), 4);
  assert.equal(waveSize(6), 5);
  assert.equal(waveSize(9), 6);
  assert.equal(waveSize(100), 9);
  assert.ok(waveBreak(1) > waveBreak(5));
  assert.equal(waveBreak(100), 5);
});

test('zombie types unlock over time: normal first, then fast, then big', () => {
  assert.equal(pickZombieType(0, 0.01), 'normal');
  assert.equal(pickZombieType(29, 0.01), 'normal');
  assert.equal(pickZombieType(60, 0.1), 'fast');
  assert.equal(pickZombieType(60, 0.9), 'normal');
  assert.equal(pickZombieType(89, 0.05), 'fast'); // big はまだ出ない
  assert.equal(pickZombieType(90, 0.05), 'big');
  assert.equal(pickZombieType(200, 0.3), 'fast');
  assert.equal(pickZombieType(200, 0.9), 'normal');
});

test('zombie hp scales up after 60 seconds', () => {
  assert.equal(zombieHpMultiplier(0), 1);
  assert.equal(zombieHpMultiplier(59), 1);
  assert.ok(zombieHpMultiplier(90) > 1);
  assert.ok(zombieHpMultiplier(240) > zombieHpMultiplier(120));
  const early = makeZombie(10, 0.9);
  assert.equal(early.type, 'normal');
  assert.equal(early.hp, ZOMBIE_TYPES.normal.hp);
  const late = makeZombie(200, 0.05);
  assert.equal(late.type, 'big');
  assert.ok(late.hp > ZOMBIE_TYPES.big.hp);
});

test('warrior damage grows with each wave survived', () => {
  assert.equal(warriorDamageMul(0), 1);
  assert.equal(warriorDamageMul(1), 1);
  assert.ok(warriorDamageMul(11) > 1.5);
  assert.ok(warriorDamageMul(21) > warriorDamageMul(11));
});

// ---------- ターゲット解決 ----------
test('resolveTarget picks the nearest foe in range', () => {
  const unit = { side: 'player', x: 100, range: 22 };
  const near = { x: 115, hp: 10 };
  const far = { x: 121, hp: 10 };
  const result = resolveTarget(unit, [far, near], FIELD.zombieBaseX);
  assert.equal(result.kind, 'unit');
  assert.equal(result.target, near);
});

test('resolveTarget ignores foes behind or out of range, then falls back to the base', () => {
  const unit = { side: 'player', x: 410, range: 22 };
  const behind = { x: 390, hp: 10 };
  const outOfRange = { x: 300, hp: 10 };
  const result = resolveTarget(unit, [behind, outOfRange], FIELD.zombieBaseX);
  assert.equal(result.kind, 'base');
  assert.equal(result.distance, FIELD.zombieBaseX - 410);
});

test('resolveTarget returns null when nothing is in range and skips dead foes', () => {
  const unit = { side: 'player', x: 100, range: 22 };
  assert.equal(resolveTarget(unit, [{ x: 110, hp: 0 }], FIELD.zombieBaseX), null);
  assert.equal(resolveTarget(unit, [], FIELD.zombieBaseX), null);
});

test('zombies target warriors to their left and the barricade', () => {
  const zombie = { side: 'zombie', x: 200, range: 20 };
  const warrior = { x: 185, hp: 10 };
  const result = resolveTarget(zombie, [warrior], FIELD.playerBaseX);
  assert.equal(result.kind, 'unit');
  assert.equal(result.target, warrior);
  const atBase = resolveTarget({ side: 'zombie', x: 70, range: 20 }, [], FIELD.playerBaseX);
  assert.equal(atBase.kind, 'base');
});

// ---------- 必殺技ゲージ ----------
test('gauge grows on dealt hits, kills and taken hits, capped at max', () => {
  assert.equal(addGauge(0, 'dealt'), GAUGE_GAIN.dealt);
  assert.equal(addGauge(10, 'kill'), 10 + GAUGE_GAIN.kill);
  assert.equal(addGauge(10, 'taken'), 10 + GAUGE_GAIN.taken);
  assert.equal(addGauge(GAUGE_MAX - 1, 'kill'), GAUGE_MAX);
  assert.equal(addGauge(50, 'unknown'), 50);
  assert.ok(SPECIAL_DAMAGE > 0);
  assert.ok(SPECIAL_DAMAGE < ZOMBIE_TYPES.big.hp, '必殺技でおおゾンビは一撃では倒れない');
});

// ---------- スコア ----------
test('score is kills only on a loss', () => {
  assert.equal(computeScore({ kills: 12, won: false, barricadeHp: 0, elapsedSec: 200 }), 12);
});

test('score adds remaining barricade hp and a speed bonus on a win', () => {
  // 倒した数30 + 残りHP200 + 時間ボーナス(300-150)=380
  assert.equal(computeScore({ kills: 30, won: true, barricadeHp: 200, elapsedSec: 150 }), 380);
});

test('score time bonus never goes negative on a slow win', () => {
  assert.equal(computeScore({ kills: 5, won: true, barricadeHp: 10, elapsedSec: 999 }), 15);
  assert.equal(computeScore({ kills: 0, won: true, barricadeHp: BASE_HP.barricade, elapsedSec: 0 }), BASE_HP.barricade + 300);
});

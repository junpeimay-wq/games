import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FEVER_DURATION,
  FIELD,
  GAME_DURATION,
  PERFECT_WINDOW,
  SUSHI_TYPES,
  beltSpeedAt,
  canSpawn,
  comboMultiplier,
  judgeCatch,
  pickSushiType,
  pointsFor
} from '../logic.js';

test('judgeCatch: perfect inside the perfect window', () => {
  assert.equal(judgeCatch(0), 'perfect');
  assert.equal(judgeCatch(PERFECT_WINDOW), 'perfect');
  assert.equal(judgeCatch(-PERFECT_WINDOW), 'perfect');
});

test('judgeCatch: good inside the zone, null outside', () => {
  assert.equal(judgeCatch(PERFECT_WINDOW + 1), 'good');
  assert.equal(judgeCatch(FIELD.zoneWidth / 2), 'good');
  assert.equal(judgeCatch(-FIELD.zoneWidth / 2), 'good');
  assert.equal(judgeCatch(FIELD.zoneWidth / 2 + 1), null);
  assert.equal(judgeCatch(-100), null);
});

test('comboMultiplier grows every 10 combo and caps at 5', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(9), 1);
  assert.equal(comboMultiplier(10), 2);
  assert.equal(comboMultiplier(25), 3);
  assert.equal(comboMultiplier(40), 5);
  assert.equal(comboMultiplier(999), 5);
});

test('pointsFor: base points, perfect bonus, combo and fever multipliers', () => {
  assert.equal(pointsFor('tamago', 'good', 0, false), 10);
  assert.equal(pointsFor('tamago', 'perfect', 0, false), 30);
  assert.equal(pointsFor('otoro', 'good', 0, false), 100);
  assert.equal(pointsFor('maguro', 'good', 10, false), 40); // 20 * 2倍
  assert.equal(pointsFor('maguro', 'good', 0, true), 40); // フィーバー2倍
  assert.equal(pointsFor('maguro', 'perfect', 10, true), 160); // (20+20) * 2 * 2
  assert.equal(pointsFor('wasabi', 'perfect', 30, true), 0); // わさびは常に0点
  assert.equal(pointsFor('gold', 'good', 0, false), 10);
});

test('beltSpeedAt starts at 70 and caps at 175', () => {
  assert.equal(beltSpeedAt(0), 70);
  assert.ok(beltSpeedAt(30) > beltSpeedAt(10));
  assert.equal(beltSpeedAt(GAME_DURATION), 175);
  assert.equal(beltSpeedAt(10000), 175);
});

test('pickSushiType follows the weights at the boundaries', () => {
  assert.equal(pickSushiType(0), 'tamago');
  assert.equal(pickSushiType(0.219), 'tamago');
  assert.equal(pickSushiType(0.22), 'salmon');
  assert.equal(pickSushiType(0.999), 'gold');
  // どの roll でも定義済みの種類が返る
  for (let r = 0; r < 1; r += 0.01) {
    assert.ok(Object.hasOwn(SUSHI_TYPES, pickSushiType(r)));
  }
});

test('canSpawn requires a gap from the previous sushi', () => {
  assert.equal(canSpawn(null), true);
  assert.equal(canSpawn(FIELD.spawnX), false);
  assert.equal(canSpawn(FIELD.spawnX + 64), true);
});

test('constants: 60 second game, 10 second fever', () => {
  assert.equal(GAME_DURATION, 60);
  assert.equal(FEVER_DURATION, 10);
  assert.equal(FIELD.laneYs.length, 3);
});

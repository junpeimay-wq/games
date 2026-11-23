'use strict';

// まわるおすしキャッチの純粋ロジック（DOMに依存しない部分）。
// ルールとスコアの決定は docs/adr/0001 を参照。

export const FIELD = {
  width: 480,
  height: 270,
  // キャッチゾーン（右端）。中心 x と幅。
  zoneCenterX: 404,
  zoneWidth: 64,
  // 3レーンの中心 y
  laneYs: [86, 152, 218],
  // お寿司の出現位置（画面左端の外）
  spawnX: -34,
  // お寿司が消える位置（画面右端の外）
  despawnX: 514
};

export const GAME_DURATION = 60; // 秒
export const FEVER_DURATION = 10; // 秒
export const STUN_DURATION = 0.8; // わさびを取ったときの硬直（秒）

// ピッタリ判定の幅（ゾーン中心からの距離 px）
export const PERFECT_WINDOW = 12;

// お寿司の種類。base は基本点、weight は出現の重み（合計100）。
// wasabi はハズレ（取るとコンボリセット＋硬直）、gold は金の皿（取るとフィーバー）。
export const SUSHI_TYPES = {
  tamago: { label: 'たまご', base: 10, weight: 22 },
  salmon: { label: 'サーモン', base: 10, weight: 22 },
  maguro: { label: 'まぐろ', base: 20, weight: 18 },
  ebi: { label: 'えび', base: 20, weight: 16 },
  ikura: { label: 'いくら', base: 30, weight: 10 },
  otoro: { label: '大トロ', base: 100, weight: 3 },
  wasabi: { label: 'わさび軍艦', base: 0, weight: 6 },
  gold: { label: '金の皿', base: 10, weight: 3 }
};

// roll は [0, 1) の乱数。重みに従って種類を1つ選ぶ。
export function pickSushiType(roll) {
  const entries = Object.entries(SUSHI_TYPES);
  const total = entries.reduce((sum, [, type]) => sum + type.weight, 0);
  let cursor = roll * total;
  for (const [key, type] of entries) {
    cursor -= type.weight;
    if (cursor < 0) return key;
  }
  return entries[entries.length - 1][0];
}

// ゾーン中心からの距離 offset に対する判定。
// ピッタリ / 取れる / ゾーン外（null）を返す。
export function judgeCatch(offset) {
  const distance = Math.abs(offset);
  if (distance <= PERFECT_WINDOW) return 'perfect';
  if (distance <= FIELD.zoneWidth / 2) return 'good';
  return null;
}

// コンボ倍率: 10コンボごとに +1 倍、上限 5 倍。
export function comboMultiplier(combo) {
  return Math.min(1 + Math.floor(Math.max(0, combo) / 10), 5);
}

// 1回のキャッチの得点。
// ピッタリは +20 ボーナス。フィーバー中は 2 倍。わさびは 0 点。
export function pointsFor(typeKey, judge, combo, fever) {
  const type = SUSHI_TYPES[typeKey];
  if (!type || typeKey === 'wasabi') return 0;
  const base = type.base + (judge === 'perfect' ? 20 : 0);
  return base * comboMultiplier(combo) * (fever ? 2 : 1);
}

// ベルトの速さ（px/秒）: 時間とともに速くなり、上限で止まる。
export function beltSpeedAt(elapsedSec) {
  return Math.min(70 + elapsedSec * 1.8, 175);
}

// 同じレーンに新しく出してよいか（直前のお寿司と近すぎないか）。
export function canSpawn(lastX) {
  return lastX === null || lastX >= FIELD.spawnX + 64;
}

// ゾンビ・ウォーズの純粋ロジック（DOM・Canvasに依存しない）。
// 経済（コイン）、ユニット/ゾンビの定義、ウェーブ生成、ターゲット解決、
// 必殺技ゲージ、スコア計算をここに集約し、単体テストで検証する。
// 仕様の決定は docs/adr/0001 を参照。

// フィールド: 左端が自軍バリケードの前面、右端がゾンビの巣の前面（Canvas座標）
export const FIELD = {
  playerBaseX: 52,
  zombieBaseX: 428
};

export const BASE_HP = {
  barricade: 320,
  nest: 260
};

// コイン経済: 時間で貯まり、ユニット召喚で消費する
export const ECONOMY = {
  start: 50,
  max: 150,
  regenPerSec: 5
};

// 自軍ユニット。盾とナイフが前線を支え、銃が後方から撃つ編成が勝ち筋。
// 銃だけを量産するとゾンビの群れに近づかれて崩れるバランスにする。
export const UNIT_TYPES = {
  knife: { label: 'ナイフ戦士', emoji: '🔪', cost: 20, hp: 45, dmg: 8, range: 22, interval: 0.55, speed: 42 },
  shield: { label: '盾の戦士', emoji: '🛡️', cost: 45, hp: 200, dmg: 6, range: 22, interval: 0.8, speed: 24 },
  gun: { label: '銃の戦士', emoji: '🔫', cost: 70, hp: 35, dmg: 8, range: 135, interval: 0.9, speed: 28, projectileSpeed: 340 }
};

// 敵ゾンビ。時間経過で出現間隔が短くなり、体力も増えていく。
export const ZOMBIE_TYPES = {
  normal: { label: 'ふつうゾンビ', hp: 48, dmg: 5, range: 20, interval: 0.8, speed: 17 },
  fast: { label: 'はやいゾンビ', hp: 30, dmg: 4, range: 20, interval: 0.6, speed: 36 },
  big: { label: 'おおゾンビ', hp: 300, dmg: 14, range: 24, interval: 1.2, speed: 10 }
};

export function createCoins() {
  return ECONOMY.start;
}

export function tickCoins(coins, dtSec) {
  return Math.min(ECONOMY.max, coins + ECONOMY.regenPerSec * dtSec);
}

export function canAfford(coins, type) {
  return coins >= UNIT_TYPES[type].cost;
}

export function spendCoins(coins, type) {
  return canAfford(coins, type) ? coins - UNIT_TYPES[type].cost : coins;
}

export function makeWarrior(type) {
  const base = UNIT_TYPES[type];
  return {
    type,
    hp: base.hp,
    maxHp: base.hp,
    dmg: base.dmg,
    range: base.range,
    interval: base.interval,
    speed: base.speed
  };
}

// ウェーブ生成: ゾンビはウェーブごとにまとまって出現し、
// ウェーブの間には休止時間がある。休止時間に前線を押し上げて
// ゾンビの巣を攻撃するのが攻略の軸になる（連続出現だと巣の前で
// ゾンビが途切れず、巣にダメージが入らなくなってしまう）。
export const WAVE_SPAWN_GAP = 0.5;

// ウェーブごとのゾンビ数。少しずつ増えて上限9体。
// 自軍の前線が倒しきれる量に抑え、倒しきった後の休止時間に押し込めるようにする。
export function waveSize(wave) {
  return Math.min(9, 3 + Math.floor(wave / 3));
}

// ウェーブ間の休止時間（秒）。少しずつ短くなるが、下限を残して押し込む余地を作る。
export function waveBreak(wave) {
  return Math.max(5, 7.5 - wave * 0.25);
}

// 戦士の攻撃力倍率: ウェーブを重ねるごとに少しずつ上がる。
// ゾンビ側の強化（数と体力）だけだと前線が膠着して押し込めないため、
// 長引くほど自軍が有利になる調整を入れる。
export function warriorDamageMul(wave) {
  return 1 + 0.06 * Math.max(0, wave - 1);
}

// 出現するゾンビの種類。序盤は通常のみ、30秒から高速、90秒から大型が混ざる。
// roll は 0..1 の乱数（テストで決定的に与えるため引数にする）。
export function pickZombieType(elapsedSec, roll) {
  if (elapsedSec < 30) return 'normal';
  if (elapsedSec < 90) return roll < 0.3 ? 'fast' : 'normal';
  if (elapsedSec < 150) return roll < 0.08 ? 'big' : roll < 0.38 ? 'fast' : 'normal';
  if (roll < 0.12) return 'big';
  return roll < 0.42 ? 'fast' : 'normal';
}

// ゾンビ体力の時間スケーリング（60秒以降、30秒ごとに+8%）
export function zombieHpMultiplier(elapsedSec) {
  const steps = Math.floor(Math.max(0, elapsedSec - 60) / 30);
  return 1 + steps * 0.08;
}

export function makeZombie(elapsedSec, roll) {
  const type = pickZombieType(elapsedSec, roll);
  const base = ZOMBIE_TYPES[type];
  const hp = Math.round(base.hp * zombieHpMultiplier(elapsedSec));
  return {
    type,
    hp,
    maxHp: hp,
    dmg: base.dmg,
    range: base.range,
    interval: base.interval,
    speed: base.speed
  };
}

// ユニットの進行方向（自軍は右、ゾンビは左）
export function directionOf(side) {
  return side === 'player' ? 1 : -1;
}

// 攻撃対象の解決: 射程内で最も近い敵ユニットを優先し、
// いなければ射程内にある敵陣地を対象にする。どちらも無ければ null。
// unit は { side, x, range }、foes は { x, hp } の配列、foeBaseX は敵陣地の前面座標。
export function resolveTarget(unit, foes, foeBaseX) {
  const dir = directionOf(unit.side);
  let bestFoe = null;
  let bestDist = Infinity;
  for (const foe of foes) {
    if (foe.hp <= 0) continue;
    const dist = (foe.x - unit.x) * dir;
    if (dist >= 0 && dist <= unit.range && dist < bestDist) {
      bestDist = dist;
      bestFoe = foe;
    }
  }
  if (bestFoe) return { kind: 'unit', target: bestFoe, distance: bestDist };
  const baseDist = (foeBaseX - unit.x) * dir;
  if (baseDist >= 0 && baseDist <= unit.range) return { kind: 'base', distance: baseDist };
  return null;
}

// 必殺技ゲージ（レトロ格闘ファイトと同じ方式）:
// 攻撃を当てる・ゾンビを倒す・ダメージを受けることで貯まる。
export const GAUGE_MAX = 100;
export const GAUGE_GAIN = { dealt: 2, kill: 6, taken: 1 };

// 必殺技「一斉射撃」: 画面内の全ゾンビへのダメージ。
// 密集したゾンビの群れを一気に崩し、前線を押し上げる起点になる。
export const SPECIAL_DAMAGE = 50;

// 近距離攻撃の巻き込み範囲: 対象の前後この距離（px）以内にいる敵にも当たる。
// ゾンビが密集するこのゲームでは、巻き込みが無いと前線が1体ずつの
// 処理になって押し込めなくなるため、近距離攻撃だけに持たせる。
export const MELEE_SPLASH = 10;

export function addGauge(gauge, event) {
  return Math.min(GAUGE_MAX, gauge + (GAUGE_GAIN[event] || 0));
}

// スコア = 倒したゾンビ数 + 勝利ボーナス。
// 勝利ボーナスは自軍バリケードの残りHPと、早く勝つほど大きい時間ボーナス。
export function computeScore({ kills, won, barricadeHp, elapsedSec }) {
  let score = kills;
  if (won) {
    score += Math.max(0, Math.floor(barricadeHp));
    score += Math.max(0, 300 - Math.floor(elapsedSec));
  }
  return score;
}

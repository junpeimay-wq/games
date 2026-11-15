'use strict';

// ゾンビ・ウォーズ: 横視点の拠点攻防ストラテジー（対CPU）
// 左の自軍バリケードから戦士を召喚し、右のゾンビの巣を壊せば勝ち。
// バリケードが壊されると負け。スコアは倒したゾンビ数＋勝利ボーナス。
// 自己ベストは端末に保存し、ハイスコア更新時は共通のスコア基盤
// （firebase-demo）経由でランキングに自動記録する。
// ゲームバランスとルールの決定は docs/adr/0001、純粋ロジックは logic.js。

import { loadHighScore, recordHighScore } from '../firebase-demo/score-service.js';
import {
  BASE_HP,
  FIELD,
  GAUGE_MAX,
  MELEE_SPLASH,
  SPECIAL_DAMAGE,
  UNIT_TYPES,
  WAVE_SPAWN_GAP,
  addGauge,
  canAfford,
  computeScore,
  createCoins,
  directionOf,
  makeWarrior,
  makeZombie,
  resolveTarget,
  spendCoins,
  tickCoins,
  warriorDamageMul,
  waveBreak,
  waveSize
} from './logic.js';

const W = 480;
const H = 270;
const GROUND = 234;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const coinsEl = document.getElementById('coins');
const killsEl = document.getElementById('kills');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const msgEl = document.getElementById('msg');

const BEST_KEY = 'zombie-wars-best-score';
let best = Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
bestEl.textContent = best;

// ログイン済みならクラウドの自己ベストを優先して反映する（ADR-0013）
loadHighScore('zombie-wars').then((score) => {
  if (score !== null) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
  }
}).catch((error) => console.error('Zombie wars cloud score error:', error));

// ---------- ゲーム状態 ----------
const S = {
  phase: 'title', // title | fight | end
  elapsed: 0,
  coins: createCoins(),
  gauge: 0,
  kills: 0,
  barricadeHp: BASE_HP.barricade,
  nestHp: BASE_HP.nest,
  units: [],
  bullets: [],
  particles: [],
  wave: 0,
  waveLeft: 0,
  wavePhase: 'break', // break（休止） | wave（出現中）
  waveTimer: 2,
  defenseTimer: 0,
  score: 0,
  won: false
};

function startMatch() {
  ensureAudio();
  S.phase = 'fight';
  S.elapsed = 0;
  S.coins = createCoins();
  S.gauge = 0;
  S.kills = 0;
  S.barricadeHp = BASE_HP.barricade;
  S.nestHp = BASE_HP.nest;
  S.units = [];
  S.bullets = [];
  S.particles = [];
  S.wave = 0;
  S.waveLeft = 0;
  S.wavePhase = 'break';
  S.waveTimer = 2;
  S.defenseTimer = 0;
  S.score = 0;
  S.won = false;
  msgEl.textContent = '';
  setStatus('ゾンビの巣を壊そう！');
}

function endMatch(won) {
  S.phase = 'end';
  S.won = won;
  S.score = computeScore({
    kills: S.kills,
    won,
    barricadeHp: S.barricadeHp,
    elapsedSec: S.elapsed
  });
  if (S.score > best) {
    best = S.score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
    // ハイスコア更新時だけランキングへ自動記録する（ADR-0001）
    recordHighScore('zombie-wars', best).catch((error) => {
      console.error('Zombie wars ranking error:', error);
    });
  }
  setStatus(won
    ? '勝利！ スコア: ' + S.score + '（倒した数 ' + S.kills + '）'
    : 'バリケードが壊れた… スコア: ' + S.score + '（倒した数 ' + S.kills + '）');
  msgEl.textContent = 'タップ or Enter でもう一度';
  if (won) sfx.win(); else sfx.lose();
}

function setStatus(text) { statusEl.textContent = text; }

// ---------- サウンド（WebAudio） ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur, type, vol, when) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + (when || 0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol || 0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}
const sfx = {
  summon() { beep(520, 0.07, 'square', 0.04); beep(780, 0.06, 'square', 0.03, 0.05); },
  shoot() { beep(920, 0.05, 'square', 0.035); },
  hit() { beep(150, 0.07, 'square', 0.05); },
  down() {
    beep(420, 0.1, 'sawtooth', 0.05);
    beep(210, 0.16, 'sawtooth', 0.05, 0.08);
  },
  special() {
    for (let i = 0; i < 6; i++) beep(880 + i * 60, 0.06, 'square', 0.05, i * 0.07);
    beep(180, 0.35, 'sawtooth', 0.06, 0.1);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.12, 'square', 0.06, i * 0.11));
  },
  lose() {
    beep(392, 0.14, 'square', 0.06);
    beep(311, 0.14, 'square', 0.06, 0.14);
    beep(233, 0.32, 'square', 0.06, 0.28);
  }
};

// ---------- 召喚・ゾンビ出現 ----------
function summon(type) {
  if (S.phase !== 'fight') return;
  if (!canAfford(S.coins, type)) return;
  S.coins = spendCoins(S.coins, type);
  const stats = makeWarrior(type);
  S.units.push({
    side: 'player',
    x: 62,
    cooldown: 0.25,
    walkPhase: Math.random() * 6,
    flashT: 0,
    dead: false,
    ...stats
  });
  sfx.summon();
}

function spawnZombie() {
  const stats = makeZombie(S.elapsed, Math.random());
  S.units.push({
    side: 'zombie',
    x: FIELD.zombieBaseX - 14,
    cooldown: 0.4,
    walkPhase: Math.random() * 6,
    flashT: 0,
    dead: false,
    ...stats
  });
}

// ---------- ダメージ ----------
function spawnStars(x, y, count) {
  for (let i = 0; i < count; i++) {
    S.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 90,
      vy: -Math.random() * 90 - 20,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      size: 3 + Math.random() * 4,
      color: Math.random() < 0.5 ? '#ffd23f' : '#ffffff'
    });
  }
}

function damageZombie(z, dmg, source) {
  if (z.dead) return;
  z.hp -= dmg;
  z.flashT = 0.09;
  if (source === 'attack') S.gauge = addGauge(S.gauge, 'dealt');
  if (z.hp <= 0) {
    z.dead = true;
    S.kills += 1;
    S.gauge = addGauge(S.gauge, 'kill');
    // 倒れたゾンビは星になって消える（子ども向け表現、ADR-0001）
    spawnStars(z.x, GROUND - 26, 10);
    sfx.down();
  }
}

function damageWarrior(w, dmg) {
  if (w.dead) return;
  w.hp -= dmg;
  w.flashT = 0.09;
  S.gauge = addGauge(S.gauge, 'taken');
  if (w.hp <= 0) {
    w.dead = true;
    spawnStars(w.x, GROUND - 26, 5);
  }
}

function damageBase(base, dmg) {
  if (base === 'nest') {
    S.nestHp = Math.max(0, S.nestHp - dmg);
    if (S.nestHp <= 0 && S.phase === 'fight') endMatch(true);
  } else {
    S.barricadeHp = Math.max(0, S.barricadeHp - dmg);
    if (S.barricadeHp <= 0 && S.phase === 'fight') endMatch(false);
  }
}

function damageTarget(attacker, target, dmg) {
  if (target.kind === 'base') {
    damageBase(attacker.side === 'player' ? 'nest' : 'barricade', dmg);
    return;
  }
  const primary = target.target;
  if (primary.side === 'zombie') damageZombie(primary, dmg, 'attack');
  else damageWarrior(primary, dmg);
  // 近距離攻撃は、対象のすぐそばに密集している敵にも当たる（巻き込み）
  for (const other of S.units) {
    if (other === primary || other.side === primary.side || other.dead) continue;
    if (Math.abs(other.x - primary.x) <= MELEE_SPLASH) {
      if (other.side === 'zombie') damageZombie(other, dmg, 'splash');
      else damageWarrior(other, dmg);
    }
  }
}

// ---------- 必殺技「一斉射撃」 ----------
function fireSpecial() {
  if (S.phase !== 'fight' || S.gauge < GAUGE_MAX) return;
  S.gauge = 0;
  sfx.special();
  for (const z of S.units) {
    if (z.side === 'zombie' && !z.dead) {
      spawnStars(z.x, GROUND - 30, 3);
      damageZombie(z, SPECIAL_DAMAGE, 'special');
    }
  }
}

// ---------- 更新 ----------
function unitAttack(u, target) {
  u.cooldown = u.interval;
  // 戦士の攻撃力はウェーブを重ねるごとに上がる（logic.js warriorDamageMul）
  const dmg = u.side === 'player' ? u.dmg * warriorDamageMul(S.wave) : u.dmg;
  if (u.side === 'player' && u.type === 'gun') {
    // 銃の戦士は弾を撃つ（命中は弾側で判定する）
    S.bullets.push({
      x: u.x + 13,
      y: GROUND - 33,
      vx: UNIT_TYPES.gun.projectileSpeed,
      dmg,
      dead: false
    });
    sfx.shoot();
    return;
  }
  damageTarget(u, target, dmg);
  sfx.hit();
}

function moveUnit(u, dt) {
  const dir = directionOf(u.side);
  let nx = u.x + dir * u.speed * dt;
  // 味方のすぐ後ろで止まって列を作る（後ろへ押し戻されはしない）。
  // ただし戦闘中の味方は追い越せる（遅い盾が足の速いナイフの進軍を塞がないように）。
  for (const o of S.units) {
    if (o === u || o.side !== u.side || o.dead || o.engaged) continue;
    const gap = (o.x - nx) * dir;
    if (gap > -2 && gap < 16) {
      nx = dir > 0
        ? Math.max(u.x, Math.min(nx, o.x - 16))
        : Math.min(u.x, Math.max(nx, o.x + 16));
    }
  }
  // 敵の体にぶつかったらそれ以上は進めない（敵をすり抜けて陣地に走り込めない）
  for (const o of S.units) {
    if (o === u || o.side === u.side || o.dead) continue;
    const gap = (o.x - nx) * dir;
    if (gap > -2 && gap < 12) {
      nx = dir > 0
        ? Math.max(u.x, Math.min(nx, o.x - 12))
        : Math.min(u.x, Math.max(nx, o.x + 12));
    }
  }
  // 陣地の内側には入り込まない
  nx = Math.max(FIELD.playerBaseX + 8, Math.min(FIELD.zombieBaseX - 12, nx));
  if (nx !== u.x) u.walkPhase += dt * 9;
  u.x = nx;
}

function updateUnit(u, dt) {
  if (u.dead) return;
  u.cooldown -= dt;
  if (u.flashT > 0) u.flashT -= dt;
  const foes = S.units.filter((o) => o.side !== u.side && !o.dead);
  const foeBaseX = u.side === 'player' ? FIELD.zombieBaseX : FIELD.playerBaseX;
  const target = resolveTarget(u, foes, foeBaseX);
  u.engaged = target !== null;
  if (target) {
    if (u.cooldown <= 0) unitAttack(u, target);
  } else {
    moveUnit(u, dt);
  }
}

function updateBullets(dt) {
  for (const b of S.bullets) {
    b.x += b.vx * dt;
    // 進行方向で最も手前（左端）のゾンビに命中する
    let hit = null;
    for (const z of S.units) {
      if (z.side !== 'zombie' || z.dead) continue;
      if (Math.abs(z.x - b.x) <= 10 && (!hit || z.x < hit.x)) hit = z;
    }
    if (hit) {
      damageZombie(hit, b.dmg, 'attack');
      b.dead = true;
      sfx.hit();
    } else if (b.x >= FIELD.zombieBaseX) {
      // ゾンビの巣は硬くて弾が効かない。巣を壊せるのは近距離攻撃だけ（ADR-0001）
      b.dead = true;
    }
    if (b.x > W - 4) b.dead = true;
  }
  S.bullets = S.bullets.filter((b) => !b.dead);
}

function separateUnits() {
  // 重なり合ったユニット同士を少しずつ離す（完全な重なりの防止）。
  // 戦闘中のユニットは対象外にして、追い越しや密集戦闘を妨げない。
  const alive = S.units.filter((u) => !u.dead && !u.engaged);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const dx = b.x - a.x;
      if (Math.abs(dx) < 13) {
        const push = (13 - Math.abs(dx)) / 4 * (dx >= 0 ? 1 : -1);
        a.x -= push;
        b.x += push;
        a.x = Math.max(FIELD.playerBaseX + 8, Math.min(FIELD.zombieBaseX - 12, a.x));
        b.x = Math.max(FIELD.playerBaseX + 8, Math.min(FIELD.zombieBaseX - 12, b.x));
      }
    }
  }
}

function update(dt) {
  if (S.phase !== 'fight') return;
  S.elapsed += dt;
  S.coins = tickCoins(S.coins, dt);

  // ゾンビの出現（ウェーブ制: まとまって現れ、間に休止時間がある）
  S.waveTimer -= dt;
  if (S.wavePhase === 'break') {
    if (S.waveTimer <= 0) {
      S.wave += 1;
      S.waveLeft = waveSize(S.wave);
      S.wavePhase = 'wave';
      S.waveTimer = 0;
      setStatus('ウェーブ' + S.wave + ' が来た！');
    }
  } else if (S.waveTimer <= 0 && S.waveLeft > 0) {
    spawnZombie();
    S.waveLeft -= 1;
    S.waveTimer = WAVE_SPAWN_GAP;
    if (S.waveLeft <= 0) {
      S.wavePhase = 'break';
      S.waveTimer = waveBreak(S.wave);
    }
  }

  // 巣の防衛: 巣の近くに戦士が迫っていて周りのゾンビが少ないと、
  // 巣からゾンビが湧き出てくる（巣の前への居座りを防ぐ）
  S.defenseTimer -= dt;
  if (S.defenseTimer <= 0) {
    const nearNest = (u) => !u.dead && Math.abs(u.x - FIELD.zombieBaseX) <= 70;
    const warriorsNear = S.units.some((u) => u.side === 'player' && nearNest(u));
    const zombiesNear = S.units.filter((u) => u.side === 'zombie' && nearNest(u)).length;
    if (warriorsNear && zombiesNear < 3) {
      spawnZombie();
      S.defenseTimer = 2.2;
    }
  }

  for (const u of [...S.units]) updateUnit(u, dt);
  updateBullets(dt);
  separateUnits();
  S.units = S.units.filter((u) => !u.dead);

  // パーティクル
  for (const p of S.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 260 * dt;
    p.life -= dt;
  }
  S.particles = S.particles.filter((p) => p.life > 0);
}

// ---------- 入力 ----------
const touchCapable =
  'ontouchstart' in window ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
if (touchCapable && document.body) {
  document.body.classList.add('touch-capable');
}

function onStartButton() {
  if (S.phase === 'title' || S.phase === 'end') startMatch();
}

const GAME_KEYS = ['Space', 'Enter', 'Digit1', 'Digit2', 'Digit3', 'KeyH'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  ensureAudio();
  if (e.code === 'Enter') onStartButton();
  else if (e.code === 'Space') {
    if (S.phase === 'fight') fireSpecial();
    else onStartButton();
  } else if (e.code === 'Digit1') summon('knife');
  else if (e.code === 'Digit2') summon('shield');
  else if (e.code === 'Digit3') summon('gun');
  else if (e.code === 'KeyH') fireSpecial();
});
canvas.addEventListener('pointerdown', () => { ensureAudio(); onStartButton(); });
msgEl.addEventListener('pointerdown', () => { ensureAudio(); onStartButton(); });

const unitButtons = {
  knife: document.getElementById('btn-knife'),
  shield: document.getElementById('btn-shield'),
  gun: document.getElementById('btn-gun')
};
const specialBtn = document.getElementById('btn-special');
for (const [type, el] of Object.entries(unitButtons)) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    onStartButton();
    summon(type);
  });
}
specialBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ensureAudio();
  fireSpecial();
});

function refreshHud() {
  coinsEl.textContent = Math.floor(S.coins);
  killsEl.textContent = S.kills;
  for (const [type, el] of Object.entries(unitButtons)) {
    el.disabled = S.phase !== 'fight' || !canAfford(S.coins, type);
  }
  specialBtn.disabled = S.phase !== 'fight' || S.gauge < GAUGE_MAX;
  specialBtn.classList.toggle('ready', S.phase === 'fight' && S.gauge >= GAUGE_MAX);
}

// ---------- メインループ ----------
let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastTs || 16) / 1000);
  lastTs = ts;
  update(dt);
  draw();
  refreshHud();
}
requestAnimationFrame(loop);

// ---------- 描画 ----------
function drawBackground() {
  // 夜空
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
  grad.addColorStop(0, '#0b1026');
  grad.addColorStop(0.7, '#1d2b53');
  grad.addColorStop(1, '#2c3e6b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, GROUND);
  // 星（決定的な配置）
  ctx.fillStyle = '#cfd8ff';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 67) % W;
    const sy = (i * 41) % 110;
    if (i % 3) ctx.fillRect(sx, sy, 2, 2);
  }
  // 月
  ctx.fillStyle = '#f5f3ce';
  ctx.fillRect(52, 26, 30, 30);
  ctx.fillStyle = '#0b1026';
  ctx.fillRect(64, 20, 26, 26);
  // 左の家並み
  ctx.fillStyle = '#131a33';
  ctx.fillRect(0, 150, 40, GROUND - 150);
  ctx.fillRect(46, 168, 30, GROUND - 168);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(10, 168, 6, 7);
  ctx.fillRect(54, 184, 6, 7);
  // 右の枯れ木とお墓（ゾンビの巣の雰囲気）
  ctx.fillStyle = '#0e1428';
  ctx.fillRect(392, 128, 8, 60);
  ctx.fillRect(372, 138, 24, 6);
  ctx.fillRect(398, 122, 22, 6);
  ctx.fillStyle = '#232c4d';
  ctx.fillRect(352, 196, 16, 24);
  ctx.fillRect(330, 204, 13, 16);
  // 地面
  ctx.fillStyle = '#24351f';
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#31482a';
  ctx.fillRect(0, GROUND, W, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let x = 14; x < W; x += 46) ctx.fillRect(x, GROUND + 15, 20, 3);
}

function drawBarricade() {
  const x = 6;
  const w = FIELD.playerBaseX - x; // 46
  const ratio = S.barricadeHp / BASE_HP.barricade;
  // 土のう・木箱のバリケード
  ctx.fillStyle = '#8a6b42';
  ctx.fillRect(x, GROUND - 44, w, 44);
  ctx.fillStyle = '#a3804f';
  ctx.fillRect(x, GROUND - 44, w, 8);
  ctx.fillStyle = '#6f5636';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 3, GROUND - 32 + i * 11, w - 6, 3);
  ctx.fillStyle = '#5d4a2f';
  ctx.fillRect(x + 8, GROUND - 40, 4, 36);
  ctx.fillRect(x + w - 12, GROUND - 40, 4, 36);
  if (ratio < 0.5) {
    // ダメージが大きいとひびが入る
    ctx.strokeStyle = '#3d2c17';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 12, GROUND - 42);
    ctx.lineTo(x + 20, GROUND - 24);
    ctx.lineTo(x + 14, GROUND - 8);
    ctx.stroke();
  }
  // 旗
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(x + w / 2 - 1, GROUND - 62, 2, 18);
  ctx.fillStyle = '#3f7fbf';
  ctx.fillRect(x + w / 2 + 1, GROUND - 62, 12, 8);
}

function drawNest() {
  const x = FIELD.zombieBaseX; // 428
  const w = W - x - 4;
  // 紫色の巣（土の山＋骨＋光る目玉でコミカルに）
  ctx.fillStyle = '#4a3566';
  ctx.fillRect(x, GROUND - 40, w, 40);
  ctx.fillRect(x + 8, GROUND - 52, w - 16, 12);
  ctx.fillStyle = '#5d4480';
  ctx.fillRect(x + 4, GROUND - 40, w - 8, 7);
  // 入り口の穴
  ctx.fillStyle = '#140b24';
  ctx.fillRect(x + 12, GROUND - 30, 22, 30);
  // 光る目玉
  const blink = Math.floor(S.elapsed * 2) % 7 === 0;
  if (!blink && S.phase === 'fight') {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x + 17, GROUND - 22, 4, 4);
    ctx.fillRect(x + 26, GROUND - 22, 4, 4);
  }
  // 骨
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(x + 36, GROUND - 10, 10, 3);
  ctx.fillRect(x + 2, GROUND - 6, 8, 3);
}

const WARRIOR_COLORS = {
  knife: { body: '#2456d8', sub: '#f5f5f5' },
  shield: { body: '#5b6b8c', sub: '#9adcff' },
  gun: { body: '#2e8b57', sub: '#ffd23f' }
};

function drawWarrior(u) {
  const x = Math.round(u.x);
  const bob = Math.sin(u.walkPhase) * 1.2;
  const feet = GROUND + bob * 0.3;
  const colors = WARRIOR_COLORS[u.type];
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 5, 13, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, feet);
  // 脚
  ctx.fillStyle = '#26324d';
  const legSwing = Math.sin(u.walkPhase) * 4;
  ctx.fillRect(-7 + legSwing * 0.5, -13, 5, 13);
  ctx.fillRect(3 - legSwing * 0.5, -13, 5, 13);
  // 体
  ctx.fillStyle = colors.body;
  ctx.fillRect(-8, -32, 17, 20);
  // 頭
  ctx.fillStyle = '#f2c288';
  ctx.fillRect(-6, -45, 13, 12);
  ctx.fillStyle = colors.body;
  ctx.fillRect(-6, -45, 13, 4); // ヘルメット/帽子
  ctx.fillStyle = '#14141f';
  ctx.fillRect(3, -39, 3, 4); // 目
  // 武器
  if (u.type === 'knife') {
    ctx.fillStyle = '#5d4a2f';
    ctx.fillRect(8, -28, 4, 4);
    ctx.fillStyle = '#d8dee9';
    ctx.fillRect(11, -29, 9, 3); // ナイフ
  } else if (u.type === 'shield') {
    ctx.fillStyle = colors.sub;
    ctx.fillRect(9, -36, 6, 26); // 大きな盾
    ctx.fillStyle = '#5b7fa6';
    ctx.fillRect(11, -30, 2, 8);
  } else {
    ctx.fillStyle = '#22222e';
    ctx.fillRect(8, -29, 15, 4); // 銃
    ctx.fillRect(19, -26, 3, 4);
  }
  ctx.restore();
  if (u.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x - 9, feet - 46, 30, 46);
  }
  drawUnitHp(u, x, feet - 52);
}

function drawZombie(u) {
  const scale = u.type === 'big' ? 1.45 : u.type === 'fast' ? 0.85 : 1;
  const x = Math.round(u.x);
  const bob = Math.sin(u.walkPhase) * 1.4;
  const feet = GROUND + bob * 0.3;
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 5, 13 * scale, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, feet);
  ctx.scale(scale, scale);
  if (u.type === 'fast') ctx.rotate(0.08); // 前のめり
  // 脚（ぼろぼろのズボン）
  ctx.fillStyle = '#4a3b5c';
  const legSwing = Math.sin(u.walkPhase) * 3.4;
  ctx.fillRect(-7 + legSwing * 0.5, -13, 5, 13);
  ctx.fillRect(3 - legSwing * 0.5, -13, 5, 13);
  // 体（ぼろシャツ）
  ctx.fillStyle = u.type === 'big' ? '#5c3b3b' : '#6a4a8c';
  ctx.fillRect(-8, -32, 17, 20);
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(-8, -16, 5, 4); // 破れから見える腕色
  // 前に伸ばした腕（ゾンビの定番ポーズ）
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(-20, -30 + bob * 0.4, 12, 4);
  ctx.fillRect(-19, -24 - bob * 0.4, 11, 4);
  // 頭
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(-7, -45, 14, 13);
  // 目（白目＋黒目でコミカルに）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-5, -39, 4, 4);
  ctx.fillRect(1, -39, 4, 4);
  ctx.fillStyle = '#14141f';
  ctx.fillRect(-4, -38, 2, 2);
  ctx.fillRect(2, -38, 2, 2);
  // 口
  ctx.fillRect(-3, -34, 5, 2);
  ctx.restore();
  if (u.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const h = 46 * scale;
    ctx.fillRect(x - 10 * scale, feet - h, 32 * scale, h);
  }
  drawUnitHp(u, x, feet - 52 * scale);
}

function drawUnitHp(u, x, y) {
  if (u.hp >= u.maxHp) return;
  const w = 26;
  const pct = Math.max(0, u.hp) / u.maxHp;
  ctx.fillStyle = '#14141f';
  ctx.fillRect(x - w / 2, y, w, 4);
  ctx.fillStyle = u.side === 'player' ? '#3ddc5a' : '#c77dff';
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * pct, 2);
}

function drawStar(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.maxLife - p.life) * 4);
  ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
  ctx.fillStyle = p.color;
  const s = p.size;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.3, -s * 0.3);
  ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.3, s * 0.3);
  ctx.lineTo(0, s);
  ctx.lineTo(-s * 0.3, s * 0.3);
  ctx.lineTo(-s, 0);
  ctx.lineTo(-s * 0.3, -s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBaseBar(label, hp, max, x, color, alignRight) {
  const w = 150;
  const pct = Math.max(0, hp) / max;
  ctx.fillStyle = '#14141f';
  ctx.fillRect(x, 10, w, 11);
  ctx.fillStyle = color;
  if (alignRight) ctx.fillRect(x + w * (1 - pct), 12, w * pct, 7);
  else ctx.fillRect(x, 12, w * pct, 7);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, 10, w, 11);
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.fillText(label, alignRight ? x + w : x, 33);
}

function drawGauge() {
  const w = 150;
  const x = 14;
  const pct = S.gauge / GAUGE_MAX;
  const full = S.gauge >= GAUGE_MAX;
  ctx.fillStyle = '#14141f';
  ctx.fillRect(x, 40, w, 7);
  ctx.fillStyle = full
    ? (Math.floor(Date.now() / 250) % 2 ? '#ffd23f' : '#ff7847')
    : '#ff9f1c';
  ctx.fillRect(x, 41, w * pct, 5);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, 40, w, 7);
  ctx.fillStyle = full ? '#ffd23f' : '#aaa';
  ctx.font = full ? 'bold 10px monospace' : '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(full ? '一斉射撃 OK!' : 'ひっさつゲージ', x, 59);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function draw() {
  drawBackground();
  drawBarricade();
  drawNest();
  // 奥（小さいx順ではなく出現順）ではなく、x順に描いて重なりを自然に
  const sorted = [...S.units].sort((a, b) => a.x - b.x);
  for (const u of sorted) {
    if (u.side === 'player') drawWarrior(u);
    else drawZombie(u);
  }
  // 弾
  ctx.fillStyle = '#ffd23f';
  for (const b of S.bullets) ctx.fillRect(b.x - 3, b.y - 1, 7, 3);
  // 星パーティクル
  for (const p of S.particles) drawStar(p);

  drawBaseBar('バリケード', S.barricadeHp, BASE_HP.barricade, 14, '#3f7fbf', false);
  drawBaseBar('ゾンビの巣', S.nestHp, BASE_HP.nest, W - 14 - 150, '#c77dff', true);
  drawGauge();
  // 経過時間と倒した数
  ctx.fillStyle = '#14141f';
  ctx.fillRect(W / 2 - 44, 8, 88, 24);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.strokeRect(W / 2 - 44, 8, 88, 24);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(formatTime(S.elapsed), W / 2, 24);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('倒した数 ' + S.kills, W / 2, 46);

  if (S.phase === 'title') {
    ctx.fillStyle = 'rgba(8,8,20,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c77dff';
    ctx.font = 'bold 27px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ZOMBIE WARS', W / 2, 96);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('ゾンビ・ウォーズ', W / 2, 122);
    ctx.fillStyle = '#eee';
    ctx.font = '12px monospace';
    ctx.fillText('コインで戦士を召喚して、ゾンビの巣を壊そう！', W / 2, 156);
    ctx.fillText('召喚: 1=ナイフ / 2=盾 / 3=銃　必殺: H', W / 2, 176);
  } else if (S.phase === 'end') {
    ctx.fillStyle = 'rgba(8,8,20,0.55)';
    ctx.fillRect(0, 60, W, 120);
    ctx.fillStyle = S.won ? '#ffd23f' : '#ff7070';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(S.won ? 'YOU WIN!' : 'GAME OVER', W / 2, 112);
    ctx.fillStyle = '#eee';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('スコア ' + S.score + '（倒した数 ' + S.kills + '）', W / 2, 140);
  }
}

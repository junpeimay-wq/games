'use strict';

// レトロ格闘ファイト: ドット絵風1対1対戦格闘（対CPU、2ラウンド先取）
// スコアは試合の連勝数。自己ベストは端末に保存し、ハイスコア更新時は
// 共通のスコア基盤（firebase-demo）経由でランキングに自動記録する。

import { loadHighScore, recordHighScore } from '../firebase-demo/score-service.js';
import { nextRetroFightStreak } from '../firebase-demo/score-utils.js';

const W = 480;
const H = 270;
const GROUND = 234;
const GRAVITY = 0.55;
const ROUND_TIME = 60;
const WINS_NEEDED = 2;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const streakEl = document.getElementById('streak');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const msgEl = document.getElementById('msg');

const CURRENT_KEY = 'retro-fight-current-streak';
const BEST_KEY = 'retro-fight-best-streak';
let streak = Number.parseInt(localStorage.getItem(CURRENT_KEY) || '0', 10) || 0;
let best = Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;

function updateStreakDisplay() {
  streakEl.textContent = streak;
  bestEl.textContent = best;
}
updateStreakDisplay();

// ログイン済みならクラウドの自己ベストを優先して反映する（ADR-0013）
loadHighScore('retro-fight').then((score) => {
  if (score !== null) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    updateStreakDisplay();
  }
}).catch((error) => console.error('Retro fight cloud score error:', error));

// ---------- サウンド（WebAudio の矩形波でレトロに） ----------
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
  swing() { beep(300, 0.06, 'square', 0.03); },
  hit() { beep(140, 0.1, 'square', 0.07); beep(90, 0.12, 'sawtooth', 0.05); },
  guard() { beep(500, 0.06, 'square', 0.04); },
  jump() { beep(240, 0.12, 'square', 0.03); },
  ko() {
    beep(392, 0.12, 'square', 0.06);
    beep(311, 0.12, 'square', 0.06, 0.12);
    beep(233, 0.3, 'square', 0.07, 0.24);
  },
  fight() { beep(660, 0.09, 'square', 0.06); beep(880, 0.16, 'square', 0.06, 0.1); },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.12, 'square', 0.06, i * 0.11));
  },
  special() {
    beep(180, 0.3, 'sawtooth', 0.08);
    beep(1200, 0.1, 'square', 0.05);
    beep(1500, 0.16, 'square', 0.05, 0.08);
  },
};

// ---------- ファイター ----------
const ATTACKS = {
  punch: { startup: 70, active: 60, recovery: 110, range: 40, dmg: 5, stun: 170, push: 1.6 },
  kick: { startup: 130, active: 70, recovery: 220, range: 54, dmg: 9, stun: 260, push: 3.0 },
  special: { startup: 180, active: 90, recovery: 380, range: 78, dmg: 26, stun: 420, push: 6.5 },
};

// 必殺技ゲージ（ADR-0003）: 攻撃を当てる・ダメージを受けると貯まり、
// 満タン時のみ必殺技を出せる。必殺技を出すとゲージは0に戻る。
const GAUGE_MAX = 100;
const GAUGE_GAIN = { punch: 10, kick: 14 };

function makeFighter(x, palette, name, isCPU) {
  return {
    x, y: GROUND, vx: 0, vy: 0,
    hp: 100, gauge: 0, facing: 1, isCPU, name,
    palette,
    state: 'idle', stateT: 0, attack: null, hasHit: false,
    wins: 0, walkPhase: 0, aiT: 0, aiMove: 0, aiGuard: false,
  };
}

const PAL1 = { skin: '#f2c288', gi: '#2456d8', belt: '#f5f5f5', band: '#e63946', pants: '#1b2a6b' };
const PAL2 = { skin: '#c98a54', gi: '#8e2bb8', belt: '#ffd23f', band: '#ffd23f', pants: '#3d1454' };

let p1, cpu;
let phase = 'title'; // title | intro | fight | roundEnd | matchEnd
let phaseT = 0;
let round = 1;
let timer = ROUND_TIME;
let timerAcc = 0;
let banner = '';
let particles = [];
let shake = 0;
let flash = 0;

function resetPositions() {
  p1.x = 120; p1.y = GROUND; p1.vx = 0; p1.vy = 0; p1.state = 'idle'; p1.attack = null;
  cpu.x = 360; cpu.y = GROUND; cpu.vx = 0; cpu.vy = 0; cpu.state = 'idle'; cpu.attack = null;
  p1.facing = 1; cpu.facing = -1;
  particles = [];
}

function startMatch() {
  ensureAudio();
  p1 = makeFighter(120, PAL1, 'YOU', false);
  cpu = makeFighter(360, PAL2, 'CPU', true);
  round = 1;
  startRound();
}

function startRound() {
  p1.hp = 100; cpu.hp = 100;
  resetPositions();
  timer = ROUND_TIME;
  timerAcc = 0;
  phase = 'intro';
  phaseT = 0;
  banner = 'ROUND ' + round;
  setStatus('ラウンド' + round + ' 開始');
}

function endRound(winner, byKO) {
  phase = 'roundEnd';
  phaseT = 0;
  const loser = winner === p1 ? cpu : p1;
  if (byKO) {
    loser.state = 'ko';
    flash = 10;
    shake = 8;
    sfx.ko();
    banner = 'K.O.!';
  } else {
    banner = 'TIME UP';
  }
  winner.wins += 1;
  setStatus(winner === p1 ? 'ラウンドを取った！' : 'ラウンドを取られた…');
}

function endMatch() {
  phase = 'matchEnd';
  phaseT = 0;
  if (p1.wins > cpu.wins) {
    p1.state = 'win';
    streak = nextRetroFightStreak(true, streak);
    localStorage.setItem(CURRENT_KEY, String(streak));
    if (streak > best) {
      best = streak;
      localStorage.setItem(BEST_KEY, String(best));
      // ハイスコア更新時だけランキングへ自動記録する（ADR-0001）
      recordHighScore('retro-fight', best).catch((error) => {
        console.error('Retro fight ranking error:', error);
      });
    }
    banner = 'YOU WIN!';
    setStatus('勝利！ 連勝記録: ' + streak);
    sfx.win();
  } else {
    cpu.state = 'win';
    streak = nextRetroFightStreak(false, streak);
    localStorage.setItem(CURRENT_KEY, String(streak));
    banner = 'YOU LOSE';
    setStatus('敗北… Enterでもう一度');
  }
  updateStreakDisplay();
  msgEl.textContent = 'タップ or Enter でもう一度';
}

function setStatus(text) { statusEl.textContent = text; }

// ---------- 入力 ----------
const keys = {};
const touch = { left: false, right: false, jump: false, guard: false, punch: false, kick: false, special: false };
let touchPunchQueued = false;
let touchKickQueued = false;
let touchJumpQueued = false;
let touchSpecialQueued = false;

// タッチ対応端末ではタッチパッドを必ず表示する（ADR-0017）。
// CSS の pointer メディアクエリで拾えない端末向けのフォールバック。
const touchCapable =
  'ontouchstart' in window ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
if (touchCapable && document.body) {
  document.body.classList.add('touch-capable');
}

const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'KeyJ', 'KeyK', 'KeyH', 'Enter'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  ensureAudio();
  if (e.code === 'Enter' || e.code === 'Space') onStartButton();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', () => { ensureAudio(); onStartButton(); });
msgEl.addEventListener('pointerdown', () => { ensureAudio(); onStartButton(); });

function onStartButton() {
  if (phase === 'title' || phase === 'matchEnd') {
    if (phase === 'matchEnd' && phaseT < 600) return;
    msgEl.textContent = '';
    startMatch();
  }
}

function bindButton(id, prop, queuedProp) {
  const el = document.getElementById(id);
  const on = (e) => {
    e.preventDefault();
    ensureAudio();
    onStartButton();
    touch[prop] = true;
    if (queuedProp) {
      if (queuedProp === 'punch') touchPunchQueued = true;
      if (queuedProp === 'kick') touchKickQueued = true;
      if (queuedProp === 'jump') touchJumpQueued = true;
      if (queuedProp === 'special') touchSpecialQueued = true;
    }
  };
  const off = (e) => { e.preventDefault(); touch[prop] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}
bindButton('btn-left', 'left');
bindButton('btn-right', 'right');
bindButton('btn-jump', 'jump', 'jump');
bindButton('btn-guard', 'guard');
bindButton('btn-punch', 'punch', 'punch');
bindButton('btn-kick', 'kick', 'kick');
bindButton('btn-special', 'special', 'special');
const specialBtn = document.getElementById('btn-special');

function playerInput() {
  const input = { move: 0, jump: false, guard: false, punch: false, kick: false, special: false };
  if (keys['KeyA'] || keys['ArrowLeft'] || touch.left) input.move = -1;
  if (keys['KeyD'] || keys['ArrowRight'] || touch.right) input.move = 1;
  input.guard = !!(keys['KeyS'] || keys['ArrowDown'] || touch.guard);
  input.jump = !!(keys['KeyW'] || keys['ArrowUp']) || touchJumpQueued;
  input.punch = !!(keys['KeyF'] || keys['KeyJ']) || touchPunchQueued;
  input.kick = !!(keys['KeyG'] || keys['KeyK']) || touchKickQueued;
  input.special = !!keys['KeyH'] || touchSpecialQueued;
  touchJumpQueued = false;
  touchPunchQueued = false;
  touchKickQueued = false;
  touchSpecialQueued = false;
  return input;
}

// キーの「押した瞬間」を攻撃トリガーに使う
const prevKeys = {};
function pressed(code) {
  const now = !!keys[code];
  const was = !!prevKeys[code];
  return now && !was;
}
function savePrevKeys() {
  for (const k of Object.keys(keys)) prevKeys[k] = keys[k];
}

// ---------- 戦闘ロジック ----------
function canAct(f) {
  return f.state === 'idle' || f.state === 'walk';
}

function startAttack(f, kind) {
  f.state = kind;
  f.attack = ATTACKS[kind];
  f.stateT = 0;
  f.hasHit = false;
  if (kind === 'special') {
    f.gauge = 0;
    sfx.special();
  } else {
    sfx.swing();
  }
}

function applyInput(f, input, opponent) {
  if (!canAct(f) && f.state !== 'guard') return;
  if (f.state === 'guard' && !input.guard) f.state = 'idle';
  if (!canAct(f)) return;

  if (input.guard && f.y >= GROUND) { f.state = 'guard'; f.vx = 0; return; }

  const wantSpecial = f.isCPU ? input.special : (input.special && (pressed('KeyH') || touch.special));
  if (wantSpecial && f.gauge >= GAUGE_MAX) { startAttack(f, 'special'); return; }
  const wantPunch = f.isCPU ? input.punch : (input.punch && (pressed('KeyF') || pressed('KeyJ') || touch.punch));
  const wantKick = f.isCPU ? input.kick : (input.kick && (pressed('KeyG') || pressed('KeyK') || touch.kick));
  if (wantPunch) { startAttack(f, 'punch'); return; }
  if (wantKick) { startAttack(f, 'kick'); return; }

  if (input.jump && f.y >= GROUND) {
    f.vy = -10.5;
    f.y = GROUND - 1;
    sfx.jump();
  }
  f.vx = input.move * 2.1;
  f.state = f.vx !== 0 && f.y >= GROUND ? 'walk' : 'idle';
  if (f.vx !== 0) f.walkPhase += 1;
  void opponent;
}

function attackHits(attacker, defender) {
  const a = attacker.attack;
  const elapsed = attacker.stateT;
  if (elapsed < a.startup || elapsed > a.startup + a.active) return false;
  const reach = a.range + 16;
  const dx = (defender.x - attacker.x) * attacker.facing;
  if (dx < 6 || dx > reach) return false;
  const dy = Math.abs(defender.y - attacker.y);
  return dy < 52;
}

function landHit(attacker, defender) {
  attacker.hasHit = true;
  const a = attacker.attack;
  const kind = attacker.state;
  const guarding = defender.state === 'guard';
  const dmg = guarding ? Math.max(1, Math.round(a.dmg * 0.2)) : a.dmg;
  defender.hp = Math.max(0, defender.hp - dmg);
  defender.vx = attacker.facing * a.push;
  // 必殺技ゲージの増減（必殺技自体では貯まらない）
  if (kind !== 'special') {
    const gain = GAUGE_GAIN[kind] || 0;
    attacker.gauge = Math.min(GAUGE_MAX, attacker.gauge + (guarding ? Math.floor(gain / 2) : gain));
  }
  defender.gauge = Math.min(GAUGE_MAX, defender.gauge + (guarding ? 4 : 8));
  spawnSpark(defender.x - attacker.facing * 10, defender.y - 58, guarding ? '#9adcff' : '#ffd23f');
  if (kind === 'special') {
    spawnSpark(defender.x - attacker.facing * 10, defender.y - 58, '#ff9f1c');
    spawnSpark(defender.x - attacker.facing * 10, defender.y - 40, '#ffffff');
    flash = Math.max(flash, 6);
  }
  shake = Math.max(shake, kind === 'special' ? 9 : attacker.attack === ATTACKS.kick ? 4 : 2);
  if (guarding) {
    sfx.guard();
  } else {
    sfx.hit();
    if (defender.y >= GROUND) {
      defender.state = 'hit';
      defender.stateT = 0;
      defender.stunT = a.stun;
      defender.attack = null;
    }
  }
  if (defender.hp <= 0 && phase === 'fight') {
    endRound(attacker, true);
  }
}

function updateFighter(f, dt) {
  f.stateT += dt;
  // 重力と移動
  if (f.y < GROUND || f.vy < 0) {
    f.vy += GRAVITY;
    f.y += f.vy;
    if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; }
  }
  if (f.state === 'hit') {
    f.x += f.vx;
    f.vx *= 0.8;
  } else if (f.state !== 'ko') {
    f.x += f.vx;
    if (f.state !== 'walk' && f.y >= GROUND && f.state !== 'hit') f.vx *= 0.6;
  }
  f.x = Math.max(24, Math.min(W - 24, f.x));

  // 状態遷移
  if ((f.state === 'punch' || f.state === 'kick' || f.state === 'special') && f.attack) {
    const total = f.attack.startup + f.attack.active + f.attack.recovery;
    if (f.stateT >= total) { f.state = 'idle'; f.attack = null; }
  }
  if (f.state === 'hit' && f.stateT > (f.stunT || 220)) f.state = 'idle';
  if (f.state === 'guard') f.vx = 0;
}

// ---------- CPU AI ----------
function cpuInput(dt) {
  const input = { move: 0, jump: false, guard: false, punch: false, kick: false, special: false };
  cpu.aiT -= dt;
  const dist = Math.abs(p1.x - cpu.x);
  const dir = p1.x > cpu.x ? 1 : -1;
  // プレイヤーが攻撃中なら一定確率でガード
  const playerAttacking = p1.state === 'punch' || p1.state === 'kick' || p1.state === 'special';
  if (playerAttacking && dist < 70 && Math.random() < 0.45) {
    cpu.aiGuard = true;
    cpu.aiT = 140;
  }
  if (cpu.aiT <= 0) {
    cpu.aiT = 130 + Math.random() * 120;
    cpu.aiGuard = false;
    const aggression = 0.45 + round * 0.08 + cpu.wins * 0.05;
    if (cpu.gauge >= GAUGE_MAX && dist <= 95 && Math.random() < 0.6) {
      // ゲージ満タンなら必殺技を狙う
      input.special = true;
      cpu.aiMove = 0;
    } else if (dist > 120) {
      cpu.aiMove = dir;
      if (Math.random() < 0.12) input.jump = true;
    } else if (dist > 58) {
      cpu.aiMove = Math.random() < 0.8 ? dir : 0;
      if (Math.random() < 0.18) input.kick = true;
    } else {
      const r = Math.random();
      cpu.aiMove = 0;
      if (r < aggression * 0.55) input.punch = true;
      else if (r < aggression) input.kick = true;
      else if (r < aggression + 0.18) cpu.aiMove = -dir;
      else cpu.aiGuard = true;
    }
    if (p1.hp < cpu.hp && timer < 10) cpu.aiMove = -dir; // 逃げ切り
  }
  input.move = cpu.aiMove;
  input.guard = cpu.aiGuard;
  return input;
}

// ---------- パーティクル ----------
function spawnSpark(x, y, color) {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 3.4,
      vy: (Math.random() - 0.5) * 3.4 - 0.6,
      life: 14 + Math.random() * 8,
      color,
    });
  }
}
function updateParticles() {
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 1;
  }
}

// ---------- メインループ ----------
let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(50, ts - lastTs || 16);
  lastTs = ts;
  phaseT += dt;

  if (phase === 'intro') {
    if (phaseT > 900) banner = 'FIGHT!';
    if (phaseT > 1400) {
      phase = 'fight';
      phaseT = 0;
      banner = '';
      sfx.fight();
      setStatus('対戦中…');
    }
  } else if (phase === 'fight') {
    timerAcc += dt;
    if (timerAcc >= 1000) {
      timerAcc -= 1000;
      timer -= 1;
      if (timer <= 0) {
        timer = 0;
        endRound(p1.hp >= cpu.hp ? p1 : cpu, false);
      }
    }
    if (phase === 'fight') {
      const pi = playerInput();
      applyInput(p1, pi, cpu);
      const ci = cpuInput(dt);
      applyInput(cpu, ci, p1);
      // 向き合い
      if (canAct(p1) || p1.state === 'guard') p1.facing = cpu.x >= p1.x ? 1 : -1;
      if (canAct(cpu) || cpu.state === 'guard') cpu.facing = p1.x >= cpu.x ? 1 : -1;
      updateFighter(p1, dt);
      updateFighter(cpu, dt);
      // 押し合い（すり抜け防止）
      if (Math.abs(p1.x - cpu.x) < 26 && Math.abs(p1.y - cpu.y) < 40) {
        const pushDir = p1.x < cpu.x ? -1 : 1;
        p1.x += pushDir * 1.2;
        cpu.x -= pushDir * 1.2;
      }
      // ヒット判定
      if (p1.attack && !p1.hasHit && attackHits(p1, cpu)) landHit(p1, cpu);
      if (cpu.attack && !cpu.hasHit && phase === 'fight' && attackHits(cpu, p1)) landHit(cpu, p1);
    }
  } else if (phase === 'roundEnd') {
    updateFighter(p1, dt);
    updateFighter(cpu, dt);
    if (phaseT > 2100) {
      if (p1.wins >= WINS_NEEDED || cpu.wins >= WINS_NEEDED) endMatch();
      else { round += 1; startRound(); }
    }
  }
  updateParticles();
  if (shake > 0) shake = Math.max(0, shake - 0.5);
  if (flash > 0) flash -= 1;
  draw();
  if (specialBtn) specialBtn.classList.toggle('ready', !!(p1 && p1.gauge >= GAUGE_MAX));
  savePrevKeys();
}
requestAnimationFrame(loop);

// ---------- 描画 ----------
function drawBackground() {
  // 空（夕焼けグラデーション）
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
  grad.addColorStop(0, '#2b1055');
  grad.addColorStop(0.6, '#7597de');
  grad.addColorStop(1, '#ff9a5a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, GROUND);
  // 太陽
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(392, 42, 34, 34);
  ctx.fillStyle = '#ff9a5a';
  ctx.fillRect(392, 60, 34, 4);
  ctx.fillRect(392, 70, 34, 4);
  // 遠景ビル
  ctx.fillStyle = '#241b3a';
  const buildings = [[0, 120, 46], [52, 96, 38], [96, 132, 52], [150, 104, 34], [300, 118, 44], [348, 92, 36], [440, 126, 40]];
  for (const [bx, by, bw] of buildings) ctx.fillRect(bx, by, bw, GROUND - by);
  ctx.fillStyle = '#ffd23f';
  for (const [bx, by, bw] of buildings) {
    for (let wy = by + 8; wy < GROUND - 10; wy += 12) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 10) {
        if ((wx * 7 + wy * 13) % 5 === 0) ctx.fillRect(wx, wy, 4, 5);
      }
    }
  }
  // ネオン看板
  ctx.fillStyle = '#12082b';
  ctx.fillRect(196, 108, 88, 26);
  ctx.strokeStyle = '#ff2e88';
  ctx.lineWidth = 2;
  ctx.strokeRect(196, 108, 88, 26);
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FIGHT', 240, 127);
  // 地面
  ctx.fillStyle = '#3a2d4d';
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#57456e';
  ctx.fillRect(0, GROUND, W, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 8; x < W; x += 42) ctx.fillRect(x, GROUND + 16, 22, 3);
}

function drawFighter(f) {
  const pal = f.palette;
  const dir = f.facing;
  const x = Math.round(f.x);
  const feet = Math.round(f.y);
  const airborne = f.y < GROUND - 2;
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  const shScale = airborne ? 0.6 : 1;
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 6, 16 * shScale, 4 * shScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, feet);
  ctx.scale(dir, 1);

  const ko = f.state === 'ko';
  if (ko) {
    // 倒れて横たわる
    ctx.translate(4, -2);
    ctx.rotate(-Math.PI / 2 * 0.92);
  }

  const bob = f.state === 'walk' ? Math.sin(f.walkPhase * 0.9) * 1.5 : 0;
  const legSwing = f.state === 'walk' ? Math.sin(f.walkPhase * 0.9) * 5 : 0;

  // 脚
  ctx.fillStyle = pal.pants;
  if (f.state === 'kick') {
    ctx.fillRect(-7, -26, 6, 26); // 支持脚
    ctx.fillRect(0, -34, 26, 7); // 蹴り脚（前方水平）
    ctx.fillStyle = pal.skin;
    ctx.fillRect(24, -34, 7, 7); // 足先
  } else if (airborne) {
    ctx.fillRect(-8, -24, 6, 18);
    ctx.fillRect(2, -26, 6, 14);
  } else if (ko) {
    ctx.fillRect(-8, -10, 6, 10);
    ctx.fillRect(2, -10, 6, 10);
  } else {
    ctx.fillRect(-8 + legSwing * 0.4, -26, 6, 26 + bob * 0.2);
    ctx.fillRect(3 - legSwing * 0.4, -26, 6, 26 + bob * 0.2);
  }
  // 胴体（道着）
  ctx.fillStyle = pal.gi;
  ctx.fillRect(-10, -56, 21, 32);
  // 帯
  ctx.fillStyle = pal.belt;
  ctx.fillRect(-10, -32, 21, 4);
  // 腕
  ctx.fillStyle = pal.gi;
  if (f.state === 'special') {
    ctx.fillRect(8, -54, 34, 8); // 大きく突き出した腕
    ctx.fillStyle = pal.skin;
    ctx.fillRect(40, -54, 8, 8); // 拳
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(49, -59, 11, 18); // 気弾
    ctx.fillStyle = pal.gi;
    ctx.fillRect(-13, -50, 6, 14);
  } else if (f.state === 'punch') {
    ctx.fillRect(8, -52, 26, 6); // 突き出した腕
    ctx.fillStyle = pal.skin;
    ctx.fillRect(32, -52, 7, 6); // 拳
    ctx.fillStyle = pal.gi;
    ctx.fillRect(-13, -50, 6, 14);
  } else if (f.state === 'guard') {
    ctx.fillRect(4, -54, 6, 18);
    ctx.fillRect(9, -48, 5, 14);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(4, -56, 6, 6);
    ctx.fillRect(9, -50, 5, 5);
  } else if (f.state === 'hit') {
    ctx.fillRect(-16, -54, 6, 14);
    ctx.fillRect(8, -58, 6, 12);
  } else if (f.state === 'win') {
    ctx.fillRect(6, -72, 6, 20); // ガッツポーズ
    ctx.fillStyle = pal.skin;
    ctx.fillRect(6, -76, 6, 6);
    ctx.fillStyle = pal.gi;
    ctx.fillRect(-13, -50, 6, 14);
  } else {
    const armBob = f.state === 'walk' ? Math.sin(f.walkPhase * 0.9) * 2 : 0;
    ctx.fillRect(6, -52 + armBob, 6, 15);
    ctx.fillRect(-13, -52 - armBob, 6, 15);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(6, -38 + armBob, 6, 5);
    ctx.fillRect(-13, -38 - armBob, 6, 5);
  }
  // 頭
  ctx.fillStyle = pal.skin;
  ctx.fillRect(-7, -72, 15, 15);
  // ハチマキ
  ctx.fillStyle = pal.band;
  ctx.fillRect(-7, -72, 15, 4);
  ctx.fillRect(-13, -70, 5, 3); // 結び目
  // 目
  ctx.fillStyle = '#14141f';
  if (f.state === 'hit' || ko) {
    ctx.fillRect(3, -64, 4, 2);
  } else {
    ctx.fillRect(4, -65, 3, 4);
  }
  ctx.restore();
}

function drawHpBar(f, x, alignRight) {
  const w = 190;
  const pct = Math.max(0, f.hp) / 100;
  ctx.fillStyle = '#14141f';
  ctx.fillRect(x, 12, w, 12);
  ctx.fillStyle = pct > 0.5 ? '#3ddc5a' : pct > 0.25 ? '#ffd23f' : '#ff4040';
  if (alignRight) ctx.fillRect(x + w * (1 - pct), 14, w * pct, 8);
  else ctx.fillRect(x, 14, w * pct, 8);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, 12, w, 12);
  // ラウンド獲得ピップ
  ctx.fillStyle = '#ffd23f';
  for (let i = 0; i < f.wins; i++) {
    const px = alignRight ? x + w - 10 - i * 14 : x + 4 + i * 14;
    ctx.beginPath();
    ctx.arc(px + 3, 31, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.fillText(f.name, alignRight ? x + w : x, 42);
}

function drawGaugeBar(f, x, alignRight) {
  const w = 190;
  const pct = Math.max(0, Math.min(GAUGE_MAX, f.gauge)) / GAUGE_MAX;
  const full = f.gauge >= GAUGE_MAX;
  ctx.fillStyle = '#14141f';
  ctx.fillRect(x, 48, w, 7);
  ctx.fillStyle = full ? (Math.floor(Date.now() / 250) % 2 ? '#ffd23f' : '#ff7847') : '#ff9f1c';
  if (alignRight) ctx.fillRect(x + w * (1 - pct), 49, w * pct, 5);
  else ctx.fillRect(x, 49, w * pct, 5);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, 48, w, 7);
  ctx.fillStyle = full ? '#ffd23f' : '#aaa';
  ctx.font = full ? 'bold 10px monospace' : '9px monospace';
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.fillText(full ? '必殺技 OK!' : 'SPECIAL', alignRight ? x + w : x, 66);
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  if (p1 && cpu) {
    // 遠い方を先に描く
    drawFighter(cpu);
    drawFighter(p1);
    drawHpBar(p1, 14, false);
    drawHpBar(cpu, W - 14 - 190, true);
    drawGaugeBar(p1, 14, false);
    drawGaugeBar(cpu, W - 14 - 190, true);
    // タイマー
    ctx.fillStyle = '#14141f';
    ctx.fillRect(W / 2 - 20, 8, 40, 26);
    ctx.strokeStyle = '#eee';
    ctx.strokeRect(W / 2 - 20, 8, 40, 26);
    ctx.fillStyle = timer <= 10 && phase === 'fight' ? '#ff4040' : '#fff';
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(timer), W / 2, 28);
  }
  // パーティクル
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.7, flash / 12) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // バナー
  ctx.textAlign = 'center';
  if (phase === 'title') {
    ctx.fillStyle = 'rgba(10,10,25,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('RETRO FIGHT', W / 2, 108);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('レトロ格闘ファイト', W / 2, 134);
    ctx.fillStyle = '#eee';
    ctx.font = '12px monospace';
    ctx.fillText('パンチ: F / キック: G / 必殺: H（ゲージ満タン時）', W / 2, 168);
    ctx.fillText('ガード: S / 移動: A,D / 2ラウンド先取で勝利', W / 2, 188);
  } else if (banner) {
    ctx.fillStyle = banner === 'K.O.!' ? '#ff4040' : '#ffd23f';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(banner, W / 2, 130);
  } else if (phase === 'matchEnd') {
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 30px monospace';
    ctx.fillText(p1.wins > cpu.wins ? 'YOU WIN!' : 'YOU LOSE', W / 2, 130);
  }
}

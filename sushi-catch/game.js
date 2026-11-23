'use strict';

// まわるおすしキャッチ: 回転寿司のレーンを流れるお寿司を、
// 右端のキャッチゾーンでタイミングよく取る60秒のタイミングゲーム。
// スコアはキャッチしたお寿司の得点の合計（コンボ倍率・フィーバー倍率つき）。
// 自己ベストは端末に保存し、ハイスコア更新時は共通のスコア基盤
// （firebase-demo）経由でランキングに自動記録する。
// ルールとスコアの決定は docs/adr/0001、純粋ロジックは logic.js。

import { loadHighScore, recordHighScore } from '../firebase-demo/score-service.js';
import {
  FEVER_DURATION,
  FIELD,
  GAME_DURATION,
  STUN_DURATION,
  SUSHI_TYPES,
  beltSpeedAt,
  canSpawn,
  judgeCatch,
  pickSushiType,
  pointsFor
} from './logic.js';

const W = FIELD.width;
const H = FIELD.height;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const msgEl = document.getElementById('msg');

const BEST_KEY = 'sushi-catch-best-score';
let best = Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
bestEl.textContent = best;

// ログイン済みならクラウドの自己ベストを優先して反映する（ADR-0013）
loadHighScore('sushi-catch').then((score) => {
  if (score !== null) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
  }
}).catch((error) => console.error('Sushi catch cloud score error:', error));

// ---- 効果音（WebAudioの小さなシンセ。失敗しても無音で続行） ----
let audioCtx = null;
function beep(freq, dur, type = 'square', vol = 0.05, when = 0) {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    const t = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    // 音が出ない環境ではそのまま進める
  }
}
const sounds = {
  catch: () => beep(740, 0.08),
  perfect: () => { beep(880, 0.08); beep(1174, 0.1, 'square', 0.05, 0.07); },
  wasabi: () => beep(160, 0.25, 'sawtooth', 0.06),
  fever: () => { beep(659, 0.09); beep(784, 0.09, 'square', 0.05, 0.09); beep(1046, 0.14, 'square', 0.05, 0.18); },
  whiff: () => beep(300, 0.06, 'triangle', 0.03),
  end: () => { beep(523, 0.12); beep(659, 0.12, 'square', 0.05, 0.12); beep(784, 0.2, 'square', 0.05, 0.24); }
};

// ---- ゲーム状態 ----
let phase = 'title'; // title | play | end
let elapsed = 0; // プレイ経過秒
let score = 0;
let combo = 0;
let maxCombo = 0;
let items = []; // { lane, x, type }
let spawnTimer = 0;
let feverUntil = -1; // elapsed 基準。フィーバー中は elapsed < feverUntil
let stunUntil = -1; // わさび硬直。elapsed < stunUntil の間は取れない
let selectedLane = 1;
let effects = []; // { kind: 'star'|'text', x, y, vy, life, text, color }
let beltDistance = 0; // ベルトの縞模様用に積算した移動量
let recorded = false;

const isFever = () => elapsed < feverUntil;
const isStunned = () => elapsed < stunUntil;

function setStatus(text) {
  statusEl.textContent = text;
}

function resetGame() {
  elapsed = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  items = [];
  spawnTimer = 0.4;
  feverUntil = -1;
  stunUntil = -1;
  effects = [];
  beltDistance = 0;
  recorded = false;
  scoreEl.textContent = '0';
  comboEl.textContent = '0';
}

function startGame() {
  resetGame();
  phase = 'play';
  msgEl.textContent = 'お寿司がゾーンに入ったらタップ！';
  setStatus('プレイ中… わさびに注意！');
}

function endGame() {
  phase = 'end';
  sounds.end();
  msgEl.textContent = `スコア ${score}点！ タップ or Enter でもう一回`;
  setStatus(`おしまい！ さいだいコンボ ${maxCombo}`);
  if (score > best && !recorded) {
    recorded = true;
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
    recordHighScore('sushi-catch', best).catch((error) => {
      console.error('Sushi catch score record error:', error);
    });
  }
}

// ---- お寿司の出現 ----
function spawnSushi() {
  // 出せるレーン（直前のお寿司と近すぎないレーン）からランダムに選ぶ
  const lanes = [0, 1, 2].filter((lane) => {
    const lastX = items
      .filter((item) => item.lane === lane)
      .reduce((min, item) => Math.min(min, item.x), null);
    return canSpawn(lastX);
  });
  if (lanes.length === 0) return;
  const lane = lanes[Math.floor(Math.random() * lanes.length)];
  items.push({ lane, x: FIELD.spawnX, type: pickSushiType(Math.random()) });
}

// ---- キャッチ判定 ----
function addEffect(effect) {
  effects.push({ life: 0.7, ...effect });
}

function burstStars(x, y, color) {
  for (let i = 0; i < 6; i += 1) {
    addEffect({
      kind: 'star',
      x: x + (Math.random() - 0.5) * 30,
      y: y + (Math.random() - 0.5) * 16,
      vy: -30 - Math.random() * 30,
      color
    });
  }
}

function attemptCatch(lane) {
  if (phase !== 'play' || isStunned()) return;
  selectedLane = lane;
  const zoneX = FIELD.zoneCenterX;
  let target = null;
  let targetJudge = null;
  for (const item of items) {
    if (item.lane !== lane) continue;
    const judge = judgeCatch(item.x - zoneX);
    if (judge && (!target || Math.abs(item.x - zoneX) < Math.abs(target.x - zoneX))) {
      target = item;
      targetJudge = judge;
    }
  }
  const y = FIELD.laneYs[lane];
  if (!target) {
    // スカッ: コンボだけリセット（減点なし）
    if (combo > 0) {
      combo = 0;
      comboEl.textContent = '0';
    }
    addEffect({ kind: 'text', x: zoneX, y: y - 24, vy: -24, text: 'スカッ', color: '#9ad' });
    sounds.whiff();
    return;
  }
  items = items.filter((item) => item !== target);
  if (target.type === 'wasabi') {
    combo = 0;
    comboEl.textContent = '0';
    stunUntil = elapsed + STUN_DURATION;
    addEffect({ kind: 'text', x: zoneX, y: y - 24, vy: -24, text: 'から〜い！', color: '#7dff6a' });
    setStatus('わさびで から〜い！ ちょっと休憩');
    sounds.wasabi();
    return;
  }
  const gained = pointsFor(target.type, targetJudge, combo, isFever());
  score += gained;
  combo += 1;
  maxCombo = Math.max(maxCombo, combo);
  scoreEl.textContent = String(score);
  comboEl.textContent = String(combo);
  burstStars(target.x, y, target.type === 'gold' || target.type === 'otoro' ? '#ffd23f' : '#fff');
  addEffect({
    kind: 'text',
    x: target.x,
    y: y - 24,
    vy: -28,
    text: targetJudge === 'perfect' ? `ピッタリ！ +${gained}` : `+${gained}`,
    color: targetJudge === 'perfect' ? '#ffd23f' : '#fff'
  });
  if (target.type === 'gold') {
    feverUntil = elapsed + FEVER_DURATION;
    setStatus('フィーバータイム！ 得点2倍');
    sounds.fever();
  } else if (targetJudge === 'perfect') {
    sounds.perfect();
  } else {
    sounds.catch();
  }
}

// ---- 更新 ----
function update(dt) {
  if (phase !== 'play') return;
  elapsed += dt;
  if (elapsed >= GAME_DURATION) {
    elapsed = GAME_DURATION;
    endGame();
    return;
  }
  const speed = beltSpeedAt(elapsed);
  beltDistance += speed * dt;
  for (const item of items) item.x += speed * dt;
  items = items.filter((item) => item.x <= FIELD.despawnX);
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnSushi();
    spawnTimer = 0.75 + Math.random() * 0.5;
  }
  for (const effect of effects) {
    effect.life -= dt;
    effect.y += (effect.vy || 0) * dt;
  }
  effects = effects.filter((effect) => effect.life > 0);
  if (isFever()) {
    setStatus('フィーバータイム！ 得点2倍');
  } else if (!isStunned()) {
    setStatus('プレイ中… わさびに注意！');
  }
}

// ---- 描画 ----
const NETAS = {
  tamago: { top: '#ffd23f', band: '#26324a' },
  salmon: { top: '#ff9e6a', stripes: '#ffe3d0' },
  maguro: { top: '#e8452c' },
  ebi: { top: '#ff7f45', stripes: '#fff1e6' },
  ikura: { top: '#ff5a2c', wrap: '#1f3d2b', dots: '#ffb59d' },
  otoro: { top: '#ff9db0', stripes: '#ffe9ee' },
  wasabi: { top: '#58d13d', wrap: '#1f3d2b' },
  gold: { top: '#e8452c', plate: '#ffd23f', plateEdge: '#c9930a' }
};

function drawSushi(item) {
  const y = FIELD.laneYs[item.lane];
  const x = item.x;
  const style = NETAS[item.type];
  const plate = style.plate || '#e8e4da';
  const plateEdge = style.plateEdge || '#b9b2a4';
  // 皿
  ctx.fillStyle = plateEdge;
  ctx.fillRect(x - 24, y + 6, 48, 7);
  ctx.fillStyle = plate;
  ctx.fillRect(x - 24, y + 4, 48, 4);
  if (style.wrap) {
    // 軍艦巻き（海苔）
    ctx.fillStyle = style.wrap;
    ctx.fillRect(x - 13, y - 12, 26, 17);
    ctx.fillStyle = style.top;
    ctx.fillRect(x - 11, y - 14, 22, 5);
    if (style.dots) {
      ctx.fillStyle = style.dots;
      ctx.fillRect(x - 8, y - 13, 3, 3);
      ctx.fillRect(x - 1, y - 13, 3, 3);
      ctx.fillRect(x + 6, y - 13, 3, 3);
    }
  } else {
    // シャリ
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 12, y - 6, 24, 11);
    // ネタ
    ctx.fillStyle = style.top;
    ctx.fillRect(x - 14, y - 12, 28, 8);
    if (style.stripes) {
      ctx.fillStyle = style.stripes;
      ctx.fillRect(x - 8, y - 12, 3, 8);
      ctx.fillRect(x + 1, y - 12, 3, 8);
      ctx.fillRect(x + 9, y - 12, 3, 8);
    }
    if (style.band) {
      ctx.fillStyle = style.band;
      ctx.fillRect(x - 3, y - 12, 6, 15);
    }
  }
  if (item.type === 'otoro') {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x - 16, y - 18, 4, 4);
    ctx.fillRect(x + 12, y - 18, 4, 4);
  }
}

function draw() {
  // 背景（寿司屋のカウンター）
  ctx.fillStyle = isFever() ? '#2b1430' : '#191024';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#241736';
  ctx.fillRect(0, 0, W, 44);

  // 残り時間バー
  const remain = phase === 'play' ? Math.max(0, GAME_DURATION - elapsed) : GAME_DURATION;
  ctx.fillStyle = '#3a2a55';
  ctx.fillRect(10, 12, 200, 10);
  ctx.fillStyle = remain <= 10 ? '#ff5a4e' : '#ffd23f';
  ctx.fillRect(10, 12, 200 * (remain / GAME_DURATION), 10);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(phase === 'title' ? 'まわるおすしキャッチ' : `のこり ${Math.ceil(remain)} 秒`, 220, 26);

  // レーン（ベルト）
  FIELD.laneYs.forEach((y, lane) => {
    ctx.fillStyle = lane === selectedLane && phase === 'play' ? '#33254d' : '#2a1e40';
    ctx.fillRect(0, y - 30, W, 60);
    ctx.fillStyle = '#1d1430';
    const stripeOffset = beltDistance % 36;
    for (let x = -36 + stripeOffset; x < W; x += 36) {
      ctx.fillRect(x, y - 30, 3, 60);
    }
    ctx.fillStyle = '#57467a';
    ctx.fillRect(0, y - 30, W, 2);
    ctx.fillRect(0, y + 28, W, 2);
  });

  // キャッチゾーン
  const zoneLeft = FIELD.zoneCenterX - FIELD.zoneWidth / 2;
  const zoneActive = phase === 'play'
    && items.some((item) => judgeCatch(item.x - FIELD.zoneCenterX));
  ctx.fillStyle = zoneActive ? 'rgba(255, 210, 63, 0.25)' : 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(zoneLeft, 50, FIELD.zoneWidth, H - 56);
  ctx.strokeStyle = zoneActive ? '#ffd23f' : '#8d7fb8';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(zoneLeft, 50, FIELD.zoneWidth, H - 56);
  ctx.setLineDash([]);
  ctx.fillStyle = zoneActive ? '#ffd23f' : '#bdb2dd';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ここ！', FIELD.zoneCenterX, H - 12);

  // お寿司
  for (const item of items) drawSushi(item);

  // エフェクト
  for (const effect of effects) {
    ctx.globalAlpha = Math.max(0, Math.min(1, effect.life / 0.4));
    if (effect.kind === 'star') {
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x - 2, effect.y - 2, 4, 4);
    } else {
      ctx.fillStyle = effect.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(effect.text, effect.x, effect.y);
    }
  }
  ctx.globalAlpha = 1;

  if (isStunned() && phase === 'play') {
    ctx.fillStyle = 'rgba(20, 40, 16, 0.35)';
    ctx.fillRect(0, 44, W, H - 44);
    ctx.fillStyle = '#7dff6a';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('から〜い！', W / 2, H / 2);
  }

  if (phase === 'title') {
    ctx.fillStyle = 'rgba(10, 6, 20, 0.72)';
    ctx.fillRect(0, 44, W, H - 44);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 27px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🍣 まわるおすしキャッチ', W / 2, 116);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('お寿司が「ここ！」のゾーンに入ったら', W / 2, 152);
    ctx.fillText('そのレーンをタップしてキャッチ！', W / 2, 172);
    ctx.fillStyle = '#ff9e6a';
    ctx.font = '13px monospace';
    ctx.fillText('わさびは取っちゃダメ。金の皿はフィーバー！', W / 2, 198);
  }

  if (phase === 'end') {
    ctx.fillStyle = 'rgba(10, 6, 20, 0.72)';
    ctx.fillRect(0, 44, W, H - 44);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 25px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`スコア ${score} 点！`, W / 2, 128);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(`さいだいコンボ ${maxCombo} / ベスト ${best} 点`, W / 2, 158);
    ctx.fillText('タップ or Enter でもう一回', W / 2, 186);
  }
}

// ---- メインループ ----
let lastTime = null;
function frame(timestamp) {
  const dt = lastTime === null ? 0 : Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- 入力 ----
function laneFromY(clientY) {
  const rect = canvas.getBoundingClientRect();
  const y = (clientY - rect.top) * (H / rect.height);
  let lane = 0;
  FIELD.laneYs.forEach((laneY, index) => {
    if (y >= laneY - 33) lane = index;
  });
  return lane;
}

canvas.addEventListener('pointerdown', (event) => {
  if (phase !== 'play') {
    startGame();
    return;
  }
  attemptCatch(laneFromY(event.clientY));
});

const laneButtons = [0, 1, 2].map((lane) => document.getElementById(`btn-lane-${lane}`));
laneButtons.forEach((button, lane) => {
  if (!button) return;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (phase !== 'play') {
      startGame();
      return;
    }
    attemptCatch(lane);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (phase !== 'play') {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      startGame();
    }
    return;
  }
  if (event.code === 'Digit1') attemptCatch(0);
  else if (event.code === 'Digit2') attemptCatch(1);
  else if (event.code === 'Digit3') attemptCatch(2);
  else if (event.code === 'ArrowUp') {
    event.preventDefault();
    selectedLane = Math.max(0, selectedLane - 1);
  } else if (event.code === 'ArrowDown') {
    event.preventDefault();
    selectedLane = Math.min(2, selectedLane + 1);
  } else if (event.code === 'Space') {
    event.preventDefault();
    attemptCatch(selectedLane);
  }
});

// タッチ対応端末では画面幅によらずタッチボタンを出す（ADR-0017）
if (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window) {
  document.body.classList.add('touch-capable');
}

setStatus('タイトル画面で待機中');

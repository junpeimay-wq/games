'use strict';

// コースづくりレース: マス目に「みち」を描いてコースを作り、
// 車を自動で走らせるゲーム。チャレンジは障害物の配置が決まった
// 3コースで、ステージごとのベストスコアの合計がランキングのスコア。
// 作ったコースは端末に保存できる（フリーモード）。
// 自己ベストは端末に保存し、ハイスコア更新時は共通のスコア基盤
// （firebase-demo）経由でランキングに自動記録する。
// ルールとスコアの決定は docs/adr/0001、純粋ロジックは logic.js。

import {
  loadCourseRaceCourses,
  loadHighScore,
  recordHighScore,
  saveCourseRaceCourses
} from '../firebase-demo/score-service.js';
import {
  BONUS_INTERVAL_SEC,
  BONUS_LIFETIME_SEC,
  BONUS_POINTS,
  CHALLENGE_BOOST_LIMIT,
  CHALLENGE_STAR_LIMIT,
  COLS,
  FREE_STAGE,
  ROWS,
  STAGES,
  TILE,
  applyTool,
  countTiles,
  createGrid,
  deserializeGrid,
  findPath,
  isRoad,
  pickBonusIndex,
  serializeGrid,
  stageScore,
  starsOnPath
} from './logic.js';

const CELL = 40;
const W = COLS * CELL;
const H = ROWS * CELL;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const stageEl = document.getElementById('stage');
const starsEl = document.getElementById('stars');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const statusEl = document.getElementById('status');
const msgEl = document.getElementById('msg');
const freePanel = document.getElementById('free-panel');
const savedListEl = document.getElementById('saved-list');

// 難易度見直し（ADR-0003）で旧ルールのベストをリセットするため、
// ベスト系の保存キーは v2 に versioned している（ADR-0004）。
// 保存コースのキーはスコアではないので据え置き。
const BEST_KEY = 'course-race-best-score-v2';
const STAGE_BEST_KEY = 'course-race-stage-bests-v2';
const SAVED_KEY = 'course-race-saved-courses';

let stageBests = [0, 0, 0];
try {
  const parsed = JSON.parse(localStorage.getItem(STAGE_BEST_KEY) || '[0,0,0]');
  if (Array.isArray(parsed)) {
    stageBests = [0, 1, 2].map((i) => Number.parseInt(parsed[i], 10) || 0);
  }
} catch {
  stageBests = [0, 0, 0];
}
const localTotal = () => stageBests.reduce((a, b) => a + b, 0);
let best = Math.max(
  Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0,
  localTotal()
);
bestEl.textContent = best;

// ログイン済みならクラウドの自己ベストを優先して反映する（ADR-0013）
loadHighScore('course-race').then((score) => {
  if (score !== null && score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = best;
  }
}).catch((error) => console.error('Course race cloud score error:', error));

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
  place: () => beep(520, 0.05, 'square', 0.03),
  go: () => { beep(523, 0.09); beep(784, 0.12, 'square', 0.05, 0.09); },
  star: () => beep(1318, 0.1, 'square', 0.05),
  boost: () => { beep(392, 0.08); beep(587, 0.08, 'square', 0.05, 0.06); beep(880, 0.1, 'square', 0.05, 0.12); },
  bonus: () => { beep(1568, 0.08, 'square', 0.05); beep(2093, 0.14, 'square', 0.05, 0.07); },
  stuck: () => beep(180, 0.2, 'sawtooth', 0.05),
  clear: () => { beep(659, 0.1); beep(784, 0.1, 'square', 0.05, 0.1); beep(1046, 0.18, 'square', 0.05, 0.2); }
};

// ---- ゲーム状態 ----
let mode = 'challenge'; // challenge | free
let stageIndex = 0;
let stage = STAGES[0];
let grid = createGrid(stage);
let tool = 'road';
let phase = 'edit'; // edit | race | clear
let carPath = null; // [[x, y], ...]
let carDist = 0; // パス上の移動距離（px）
let carPos = { x: 0, y: 0 };
let carAngle = 0;
let raceTime = 0;
let boostUntil = -1;
let bonus = null; // 金のスター { index, expiresAt }（チャレンジのみ出現）
let nextBonusAt = 0;
let bonusCount = 0;
let bonusPoints = 0;
let nextCellIndex = 0; // 次にアイテム判定をするパス上のセル番号
let collected = new Set();
let lastStageScore = 0;
let effects = [];
let recorded = false;

const cellCenter = (x, y) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 });
const cellKey = (x, y) => `${x},${y}`;

function setStatus(text) {
  statusEl.textContent = text;
}

function currentStars() {
  return collected.size;
}

function loadStage(index) {
  stageIndex = ((index % STAGES.length) + STAGES.length) % STAGES.length;
  stage = STAGES[stageIndex];
  grid = createGrid(stage);
  resetRace();
  stageEl.textContent = `コース${stageIndex + 1} ${stage.name}`;
  setStatus('みちを描いてコースを作ろう');
  msgEl.textContent = `⭐${stage.requiredStars}こ以上とってゴール！ 制限時間${stage.timeLimit}秒`;
}

function loadFree() {
  stage = FREE_STAGE;
  grid = createGrid(stage);
  resetRace();
  stageEl.textContent = 'フリー';
  setStatus('自由にコースを作ろう');
  msgEl.textContent = '作ったら「ほぞん」もできるよ';
}

function resetRace() {
  phase = 'edit';
  recorded = false;
  carPath = null;
  carDist = 0;
  raceTime = 0;
  boostUntil = -1;
  bonus = null;
  nextBonusAt = 0;
  bonusCount = 0;
  bonusPoints = 0;
  collected = new Set();
  effects = [];
  const start = cellCenter(stage.start[0], stage.start[1]);
  carPos = { ...start };
  carAngle = 0;
  starsEl.textContent = '0';
  timeEl.textContent = '0.0';
}

function setMode(next) {
  mode = next;
  freePanel.style.display = mode === 'free' ? 'block' : 'none';
  document.getElementById('btn-mode').textContent = mode === 'free' ? '🏆 チャレンジへ' : '🎨 フリーへ';
  document.getElementById('btn-prev-stage').style.display = mode === 'free' ? 'none' : '';
  document.getElementById('btn-next-stage').style.display = mode === 'free' ? 'none' : '';
  if (mode === 'free') loadFree();
  else loadStage(stageIndex);
  renderSavedList();
}

// ---- レース ----
function startRace() {
  if (phase !== 'edit') return;
  const path = findPath(grid, stage.start, stage.goal);
  if (!path) {
    setStatus('ゴールまで つながっていないよ');
    msgEl.textContent = 'みちをつなげてみよう';
    sounds.stuck();
    return;
  }
  if (stage.requiredStars > 0) {
    const onRoute = starsOnPath(grid, path);
    if (onRoute < stage.requiredStars) {
      setStatus(`ルートの⭐が あと${stage.requiredStars - onRoute}こ たりないよ`);
      msgEl.textContent = 'スターの上を通るコースにしよう';
      sounds.stuck();
      return;
    }
  }
  carPath = path;
  carDist = 0;
  raceTime = 0;
  boostUntil = -1;
  bonus = null;
  nextBonusAt = BONUS_INTERVAL_SEC;
  bonusCount = 0;
  bonusPoints = 0;
  nextCellIndex = 0;
  collected = new Set();
  phase = 'race';
  setStatus('スタート！');
  msgEl.textContent = 'がんばれ〜！';
  sounds.go();
}

function pathPoint(dist) {
  // パス（セル列）上の距離 dist の地点の座標と向きを返す
  let remain = dist;
  for (let i = 0; i < carPath.length - 1; i += 1) {
    const a = cellCenter(carPath[i][0], carPath[i][1]);
    const b = cellCenter(carPath[i + 1][0], carPath[i + 1][1]);
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (remain <= segLen) {
      const t = segLen === 0 ? 0 : remain / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        cellIndex: i
      };
    }
    remain -= segLen;
  }
  const last = cellCenter(carPath[carPath.length - 1][0], carPath[carPath.length - 1][1]);
  const prev = cellCenter(carPath[carPath.length - 2][0], carPath[carPath.length - 2][1]);
  return { ...last, angle: Math.atan2(last.y - prev.y, last.x - prev.x), cellIndex: carPath.length - 1 };
}

function totalPathLength() {
  return (carPath.length - 1) * CELL;
}

function finishRace() {
  phase = 'clear';
  lastStageScore = stageScore({ stars: currentStars(), timeSec: raceTime, cleared: true })
    + (mode === 'challenge' ? bonusPoints : 0);
  sounds.clear();
  for (let i = 0; i < 24; i += 1) {
    effects.push({
      kind: 'confetti',
      x: Math.random() * W,
      y: -10 - Math.random() * 60,
      vy: 60 + Math.random() * 80,
      life: 1.6,
      color: ['#ffd23f', '#ff8c5a', '#7dff6a', '#6ab8ff'][i % 4]
    });
  }
  if (mode === 'challenge') {
    if (lastStageScore > stageBests[stageIndex]) {
      stageBests[stageIndex] = lastStageScore;
      localStorage.setItem(STAGE_BEST_KEY, JSON.stringify(stageBests));
    }
    const total = localTotal();
    msgEl.textContent = `ゴール！ ${lastStageScore}点${bonusCount > 0 ? `（金のスター×${bonusCount}！）` : ''}（合計 ${total}点）`;
    setStatus(stageIndex === STAGES.length - 1 ? '全コース クリア！' : 'クリア！ タップで次のコースへ');
    if (total > best && !recorded) {
      recorded = true;
      best = total;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
      recordHighScore('course-race', best).catch((error) => {
        console.error('Course race score record error:', error);
      });
    }
  } else {
    msgEl.textContent = `ゴール！ ${lastStageScore}点`;
    setStatus('クリア！ タップで作り直せるよ');
  }
}

function update(dt) {
  for (const effect of effects) {
    effect.life -= dt;
    effect.y += (effect.vy || 0) * dt;
  }
  effects = effects.filter((effect) => effect.life > 0);
  if (phase !== 'race') return;
  raceTime += dt;
  if (stage.timeLimit) {
    timeEl.textContent = Math.max(0, stage.timeLimit - raceTime).toFixed(1);
    if (raceTime > stage.timeLimit) {
      resetRace();
      setStatus('じかんぎれ！');
      msgEl.textContent = 'もう少し短いコースにしてみよう';
      sounds.stuck();
      return;
    }
  } else {
    timeEl.textContent = raceTime.toFixed(1);
  }
  const speed = raceTime < boostUntil ? 260 : 120;
  carDist += speed * dt;
  const point = pathPoint(Math.min(carDist, totalPathLength()));
  carPos = { x: point.x, y: point.y };
  carAngle = point.angle;
  // 金のスター（チャレンジのみ）: 一定間隔で車の前方のルート上に出現し、
  // 制限時間が過ぎると消える
  if (mode === 'challenge') {
    if (bonus && raceTime > bonus.expiresAt) bonus = null;
    if (!bonus && raceTime >= nextBonusAt) {
      nextBonusAt = raceTime + BONUS_INTERVAL_SEC;
      const idx = pickBonusIndex(carPath.length, nextCellIndex, Math.random());
      if (idx >= 0) bonus = { index: idx, expiresAt: raceTime + BONUS_LIFETIME_SEC };
    }
  }
  // セルの中心に到達したときのアイテム処理（セル i の中心は距離 i*CELL）
  while (nextCellIndex < carPath.length && carDist >= nextCellIndex * CELL) {
    const [cx, cy] = carPath[nextCellIndex];
    nextCellIndex += 1;
    if (bonus && nextCellIndex - 1 === bonus.index) {
      bonus = null;
      bonusCount += 1;
      bonusPoints += BONUS_POINTS;
      effects.push({ kind: 'text', x: carPos.x, y: carPos.y - 24, vy: -26, life: 0.9, text: `金のスター +${BONUS_POINTS}`, color: '#ffe95a' });
      sounds.bonus();
    }
    const tile = grid[cy][cx];
    const k = cellKey(cx, cy);
    if (collected.has(k)) continue;
    if (tile === TILE.STAR) {
      collected.add(k);
      starsEl.textContent = String(currentStars());
      effects.push({ kind: 'text', x: carPos.x, y: carPos.y - 24, vy: -26, life: 0.8, text: '+100', color: '#ffd23f' });
      sounds.star();
    } else if (tile === TILE.BOOST) {
      collected.add(k);
      boostUntil = raceTime + 1.2;
      effects.push({ kind: 'text', x: carPos.x, y: carPos.y - 24, vy: -26, life: 0.8, text: 'ブースト！', color: '#ff8c5a' });
      sounds.boost();
    }
  }
  if (carDist >= totalPathLength()) {
    carPos = cellCenter(stage.goal[0], stage.goal[1]);
    finishRace();
  }
}

// ---- 描画 ----
function drawStar(cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function draw() {
  // 草地（チェック模様）
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#3f7a3a' : '#386e34';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  // みち
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const tile = grid[y][x];
      if (isRoad(tile)) {
        ctx.fillStyle = '#4c4c58';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.fillStyle = '#5d5d6e';
        ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
      }
      if (tile === TILE.STAR && !(phase !== 'edit' && collected.has(cellKey(x, y)))) {
        drawStar(x * CELL + CELL / 2, y * CELL + CELL / 2, 11, '#ffd23f');
      }
      if (tile === TILE.BOOST) {
        ctx.fillStyle = '#ff8c5a';
        ctx.fillRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('»', x * CELL + CELL / 2, y * CELL + CELL / 2 + 5);
      }
      if (tile === TILE.OBSTACLE) {
        if ((x + y) % 2 === 0) {
          // 木
          ctx.fillStyle = '#7a4a21';
          ctx.fillRect(x * CELL + 17, y * CELL + 24, 6, 10);
          ctx.fillStyle = '#2c5e2a';
          ctx.fillRect(x * CELL + 8, y * CELL + 6, 24, 22);
          ctx.fillStyle = '#3a7d37';
          ctx.fillRect(x * CELL + 12, y * CELL + 2, 16, 12);
        } else {
          // 岩
          ctx.fillStyle = '#8d8d99';
          ctx.fillRect(x * CELL + 7, y * CELL + 14, 26, 18);
          ctx.fillStyle = '#a8a8b5';
          ctx.fillRect(x * CELL + 11, y * CELL + 9, 16, 10);
        }
      }
    }
  }
  // 編集モードでは、つながっているルートを点線で見せる
  if (phase === 'edit') {
    const path = findPath(grid, stage.start, stage.goal);
    if (path) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      for (const [x, y] of path) {
        ctx.fillRect(x * CELL + CELL / 2 - 2, y * CELL + CELL / 2 - 2, 4, 4);
      }
    }
  }
  // スタートとゴール
  const s = cellCenter(stage.start[0], stage.start[1]);
  const g = cellCenter(stage.goal[0], stage.goal[1]);
  ctx.fillStyle = '#37b24d';
  ctx.fillRect(s.x - 15, s.y - 15, 30, 30);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('START', s.x, s.y + 3);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#222';
      ctx.fillRect(g.x - 14 + i * 7, g.y - 14 + j * 7, 7, 7);
    }
  }
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.strokeRect(g.x - 15, g.y - 15, 30, 30);

  // 金のスター（出現中のみ、大きめに脈打たせて描く）
  if (bonus && carPath) {
    const [bx, by] = carPath[bonus.index];
    const bc = cellCenter(bx, by);
    const pulse = 14 + Math.sin(raceTime * 10) * 2.5;
    drawStar(bc.x, bc.y, pulse, '#ffe95a');
    drawStar(bc.x, bc.y, pulse * 0.5, '#fff6bf');
  }

  // 車（上から見たドット絵）
  ctx.save();
  ctx.translate(carPos.x, carPos.y);
  ctx.rotate(carAngle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-13, -8, 28, 19);
  ctx.fillStyle = '#222';
  ctx.fillRect(-12, -13, 7, 5);
  ctx.fillRect(-12, 8, 7, 5);
  ctx.fillRect(6, -13, 7, 5);
  ctx.fillRect(6, 8, 7, 5);
  ctx.fillStyle = '#e8452c';
  ctx.fillRect(-14, -10, 28, 20);
  ctx.fillStyle = '#b02a1a';
  ctx.fillRect(-14, -10, 6, 20);
  ctx.fillStyle = '#aee2ff';
  ctx.fillRect(-3, -7, 8, 14);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(11, -8, 3, 4);
  ctx.fillRect(11, 4, 3, 4);
  ctx.restore();

  // エフェクト
  for (const effect of effects) {
    ctx.globalAlpha = Math.max(0, Math.min(1, effect.life / 0.4));
    if (effect.kind === 'confetti') {
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x, effect.y, 6, 4);
    } else {
      ctx.fillStyle = effect.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(effect.text, effect.x, effect.y);
    }
  }
  ctx.globalAlpha = 1;

  if (phase === 'clear') {
    ctx.fillStyle = 'rgba(10, 20, 10, 0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 ゴール！', W / 2, H / 2 - 16);
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText(`${lastStageScore} 点`, W / 2, H / 2 + 14);
    ctx.font = '13px monospace';
    ctx.fillText(mode === 'challenge' && stageIndex < STAGES.length - 1 ? 'タップで次のコースへ' : 'タップで作り直す', W / 2, H / 2 + 40);
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

// ---- 編集入力 ----
let painting = false;
function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) * (W / rect.width)) / CELL);
  const y = Math.floor(((event.clientY - rect.top) * (H / rect.height)) / CELL);
  return { x, y };
}
function paintCell(x, y) {
  // チャレンジでは置けるスターとブーストに上限がある（ADR-0003）
  if (mode === 'challenge') {
    if (tool === 'star' && grid[y]?.[x] === TILE.ROAD
      && countTiles(grid, TILE.STAR) >= CHALLENGE_STAR_LIMIT) {
      setStatus(`⭐は ${CHALLENGE_STAR_LIMIT}こまでだよ`);
      return;
    }
    if (tool === 'boost' && grid[y]?.[x] === TILE.ROAD
      && countTiles(grid, TILE.BOOST) >= CHALLENGE_BOOST_LIMIT) {
      setStatus(`🚀は ${CHALLENGE_BOOST_LIMIT}こまでだよ`);
      return;
    }
  }
  const before = grid[y]?.[x];
  grid = applyTool(grid, stage, tool, x, y);
  if (grid[y]?.[x] !== before) sounds.place();
}
function paintAt(event) {
  const { x, y } = cellFromEvent(event);
  paintCell(x, y);
}
canvas.addEventListener('pointerdown', (event) => {
  if (phase === 'clear') {
    advanceAfterClear();
    return;
  }
  if (phase !== 'edit') return;
  painting = true;
  paintAt(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (!painting || phase !== 'edit') return;
  if (tool === 'road' || tool === 'erase') paintAt(event);
});
window.addEventListener('pointerup', () => { painting = false; });

function advanceAfterClear() {
  recorded = false;
  if (mode === 'challenge' && stageIndex < STAGES.length - 1) {
    loadStage(stageIndex + 1);
  } else if (mode === 'challenge') {
    loadStage(0);
  } else {
    resetRace();
    setStatus('自由にコースを作ろう');
  }
}

// ---- ボタン ----
const toolButtons = {
  road: document.getElementById('btn-tool-road'),
  star: document.getElementById('btn-tool-star'),
  boost: document.getElementById('btn-tool-boost'),
  erase: document.getElementById('btn-tool-erase')
};
function selectTool(next) {
  tool = next;
  for (const [name, button] of Object.entries(toolButtons)) {
    button.classList.toggle('selected', name === next);
  }
}
for (const [name, button] of Object.entries(toolButtons)) {
  button.addEventListener('click', () => selectTool(name));
}
selectTool('road');

document.getElementById('btn-go').addEventListener('click', () => {
  if (phase === 'clear') advanceAfterClear();
  else startRace();
});
document.getElementById('btn-clear-course').addEventListener('click', () => {
  if (phase !== 'edit') return;
  grid = createGrid(stage);
  sounds.place();
});
document.getElementById('btn-prev-stage').addEventListener('click', () => loadStage(stageIndex - 1));
document.getElementById('btn-next-stage').addEventListener('click', () => loadStage(stageIndex + 1));
document.getElementById('btn-mode').addEventListener('click', () => {
  setMode(mode === 'challenge' ? 'free' : 'challenge');
});

// ---- フリーモードの保存 ----
// 端末の localStorage に保存し、Googleログイン中はクラウド
// （users/{uid}/courseRace/courses）にも保存して他の端末と共有する。
function persistCourses(courses) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(courses));
  saveCourseRaceCourses(courses).catch((error) => {
    console.error('Course race cloud save error:', error);
  });
}

function loadSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.name === 'string' && typeof c.grid === 'string') : [];
  } catch {
    return [];
  }
}
function renderSavedList() {
  savedListEl.innerHTML = '';
  const courses = loadSaved();
  if (courses.length === 0) {
    const span = document.createElement('span');
    span.className = 'saved-empty';
    span.textContent = 'ほぞんしたコースはまだないよ';
    savedListEl.appendChild(span);
    return;
  }
  courses.forEach((course, index) => {
    const chip = document.createElement('span');
    chip.className = 'saved-chip';
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.textContent = `🏎️ ${course.name}`;
    loadBtn.addEventListener('click', () => {
      grid = deserializeGrid(course.grid, FREE_STAGE);
      resetRace();
      setStatus(`「${course.name}」をよみこんだよ`);
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', `${course.name}を消す`);
    delBtn.addEventListener('click', () => {
      const next = loadSaved();
      next.splice(index, 1);
      persistCourses(next);
      renderSavedList();
    });
    chip.appendChild(loadBtn);
    chip.appendChild(delBtn);
    savedListEl.appendChild(chip);
  });
}
document.getElementById('btn-save-course').addEventListener('click', () => {
  const courses = loadSaved();
  if (courses.length >= 6) {
    setStatus('ほぞんは6つまでだよ');
    return;
  }
  courses.push({ name: `コース${courses.length + 1}`, grid: serializeGrid(grid) });
  persistCourses(courses);
  renderSavedList();
  setStatus('コースをほぞんしたよ');
  sounds.star();
});

document.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Digit1') selectTool('road');
  else if (event.code === 'Digit2') selectTool('star');
  else if (event.code === 'Digit3') selectTool('boost');
  else if (event.code === 'Digit4') selectTool('erase');
  else if (event.code === 'Enter' || event.code === 'Space') {
    event.preventDefault();
    if (phase === 'clear') advanceAfterClear();
    else startRace();
  }
});

// タッチ対応端末では画面幅によらずタッチボタンを出す（ADR-0017）
if (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window) {
  document.body.classList.add('touch-capable');
}

freePanel.style.display = 'none';
loadStage(0);
renderSavedList();

// ログイン済みならクラウドの保存コースを読み込んで端末側にも反映する
loadCourseRaceCourses().then((courses) => {
  if (courses) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(courses));
    renderSavedList();
  }
}).catch((error) => console.error('Course race cloud load error:', error));

const C = document.getElementById('c');
const ctx = C.getContext('2d');
const SZ = 20, COLS = 20, ROWS = 20;
let snake, dir, nextDir, food, score, best = 0, running = false, loop;

function init() {
  snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
  dir = {x:1,y:0};
  nextDir = {x:1,y:0};
  score = 0;
  placeFood();
  draw();
}

function placeFood() {
  do {
    food = {x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)};
  } while (snake.some(s => s.x===food.x && s.y===food.y));
}

function step() {
  dir = nextDir;
  const head = {x:snake[0].x+dir.x, y:snake[0].y+dir.y};
  if (head.x<0 || head.x>=COLS || head.y<0 || head.y>=ROWS || snake.some(s=>s.x===head.x&&s.y===head.y)) {
    clearInterval(loop);
    running = false;
    best = Math.max(best, score);
    document.getElementById('best').textContent = best;
    document.getElementById('msg').textContent = '💀 ゲームオーバー！タップ or スペースで再スタート';
    return;
  }
  snake.unshift(head);
  if (head.x===food.x && head.y===food.y) {
    score += 10;
    document.getElementById('score').textContent = score;
    placeFood();
  } else {
    snake.pop();
  }
  draw();
}

function draw() {
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(food.x*SZ+SZ/2, food.y*SZ+SZ/2, SZ/2-2, 0, Math.PI*2);
  ctx.fill();
  snake.forEach((s, i) => {
    ctx.fillStyle = i===0 ? '#00ff88' : '#00cc66';
    ctx.fillRect(s.x*SZ+1, s.y*SZ+1, SZ-2, SZ-2);
  });
}

function start() {
  if (running) return;
  running = true;
  document.getElementById('msg').textContent = '';
  document.getElementById('score').textContent = 0;
  init();
  loop = setInterval(step, 120);
}

function turn(nd) {
  if (nd && !(nd.x===-dir.x && nd.y===-dir.y)) nextDir = nd;
}

// キーボード操作
document.addEventListener('keydown', e => {
  const map = {
    ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1},
    ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
    w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0}
  };
  if (e.key === ' ') { e.preventDefault(); start(); return; }
  const nd = map[e.key];
  if (nd) { e.preventDefault(); turn(nd); }
});

// タッチ（スワイプ）操作
let touchStartX = 0, touchStartY = 0;
C.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, {passive: false});
C.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { start(); return; } // タップ→スタート
  if (Math.abs(dx) > Math.abs(dy)) {
    turn(dx > 0 ? {x:1,y:0} : {x:-1,y:0});
  } else {
    turn(dy > 0 ? {x:0,y:1} : {x:0,y:-1});
  }
  e.preventDefault();
}, {passive: false});

// 方向ボタン
document.getElementById('btn-up').addEventListener('click',    () => { start(); turn({x:0,y:-1}); });
document.getElementById('btn-down').addEventListener('click',  () => { start(); turn({x:0,y:1}); });
document.getElementById('btn-left').addEventListener('click',  () => { start(); turn({x:-1,y:0}); });
document.getElementById('btn-right').addEventListener('click', () => { start(); turn({x:1,y:0}); });

init();

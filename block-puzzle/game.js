import { recordHighScore } from '../firebase-demo/score-service.js';

const BOARD_SIZE = 8;
let board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
let score = 0;
let bestScore = 0;
let newHighScoreThisGame = false;
let availablePieces = [null, null, null];
let isGameOver = false;

// Drag / Tap state
let isDragging = false;
let activeSlotIndex = null;
let pointerStartX = 0, pointerStartY = 0;
let currentPointerX = 0, currentPointerY = 0;
let isMoved = false;

// IndexedDB
let db;
const dbReq = indexedDB.open('BlockPuzzleDB', 1);
dbReq.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains('scores')) {
    db.createObjectStore('scores', { keyPath: 'id' });
  }
};
dbReq.onsuccess = (e) => {
  db = e.target.result;
  loadBestScore();
};

function loadBestScore() {
  if (!db) return;
  const tx = db.transaction(['scores'], 'readonly');
  const store = tx.objectStore('scores');
  const req = store.get('highscore');
  req.onsuccess = (e) => {
    if (e.target.result) {
      bestScore = e.target.result.score;
      document.getElementById('best').textContent = bestScore;
    }
  };
}

function saveBestScore(newBest) {
  if (!db) return;
  const tx = db.transaction(['scores'], 'readwrite');
  const store = tx.objectStore('scores');
  store.put({ id: 'highscore', score: newBest });
}

// Block shapes (1x1 block REMOVED)
const SHAPES = [
  // 2s
  { shape: [[1, 1]], color: '#00e5ff' },
  { shape: [[1], [1]], color: '#00e5ff' },
  // 3s
  { shape: [[1, 1, 1]], color: '#ffb703' },
  { shape: [[1], [1], [1]], color: '#ffb703' },
  // 4s
  { shape: [[1, 1, 1, 1]], color: '#ff6b6b' },
  { shape: [[1], [1], [1], [1]], color: '#ff6b6b' },
  // Squares
  { shape: [[1, 1], [1, 1]], color: '#a855f7' },
  { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: '#ec4899' },
  // L-Shapes 2x2
  { shape: [[1, 0], [1, 1]], color: '#3b82f6' },
  { shape: [[0, 1], [1, 1]], color: '#3b82f6' },
  { shape: [[1, 1], [1, 0]], color: '#3b82f6' },
  { shape: [[1, 1], [0, 1]], color: '#3b82f6' },
  // Corner 3x3
  { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], color: '#10b981' },
  { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], color: '#10b981' }
];

const boardEl = document.getElementById('board');
const msgEl = document.getElementById('msg');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const slotsEls = document.querySelectorAll('.piece-slot');
const resetBtn = document.getElementById('reset-btn');
const dragProxyEl = document.getElementById('drag-proxy');

function initGame() {
  board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  score = 0;
  isGameOver = false;
  newHighScoreThisGame = false;

  scoreEl.textContent = 0;
  msgEl.textContent = '💡 候補をタップで回転、ドラッグで盤面へ配置';

  renderBoard();
  spawnNewPieces();
}

function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (board[r][c]) {
        cell.classList.add('filled');
        cell.style.background = board[r][c];
      }
      boardEl.appendChild(cell);
    }
  }
}

function spawnNewPieces() {
  for (let i = 0; i < 3; i++) {
    const randomTemplate = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    availablePieces[i] = JSON.parse(JSON.stringify(randomTemplate));
  }
  renderSlots();
  checkGameOver();
}

function rotateMatrixClockwise(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array(cols).fill(null).map(() => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return rotated;
}

function rotatePiece(piece) {
  if (!piece) return;
  piece.shape = rotateMatrixClockwise(piece.shape);
}

function renderSlots() {
  slotsEls.forEach((slotEl, idx) => {
    slotEl.innerHTML = '';
    const piece = availablePieces[idx];

    if (!piece) {
      slotEl.style.opacity = '0.3';
      slotEl.style.pointerEvents = 'none';
      return;
    }

    slotEl.style.opacity = '1';
    slotEl.style.pointerEvents = 'auto';

    // Rotation hint icon inside candidate slot
    const hintEl = document.createElement('div');
    hintEl.className = 'rotate-hint';
    hintEl.textContent = '🔄';
    slotEl.appendChild(hintEl);

    const gridEl = createPieceGrid(piece, 18);
    slotEl.appendChild(gridEl);
  });
}

function createPieceGrid(piece, cellSize = 18) {
  const gridEl = document.createElement('div');
  gridEl.className = 'piece-grid';
  gridEl.style.gridTemplateRows = `repeat(${piece.shape.length}, ${cellSize}px)`;
  gridEl.style.gridTemplateColumns = `repeat(${piece.shape[0].length}, ${cellSize}px)`;

  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      const cell = document.createElement('div');
      cell.className = 'piece-cell';
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      if (piece.shape[r][c]) {
        cell.style.background = piece.color;
      }
      gridEl.appendChild(cell);
    }
  }
  return gridEl;
}

// Pointer Events on Candidate Slots: Tap to Rotate / Drag to Place
slotsEls.forEach((slotEl, idx) => {
  slotEl.addEventListener('pointerdown', (e) => {
    if (isGameOver || !availablePieces[idx]) return;
    e.preventDefault();
    activeSlotIndex = idx;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    currentPointerX = e.clientX;
    currentPointerY = e.clientY;
    isMoved = false;
    isDragging = false;
  });
});

window.addEventListener('pointermove', (e) => {
  if (activeSlotIndex === null) return;
  currentPointerX = e.clientX;
  currentPointerY = e.clientY;

  const dist = Math.hypot(currentPointerX - pointerStartX, currentPointerY - pointerStartY);

  if (dist > 8 && !isDragging) {
    // Start drag mode
    isDragging = true;
    isMoved = true;

    const piece = availablePieces[activeSlotIndex];
    dragProxyEl.innerHTML = '';
    const gridEl = createPieceGrid(piece, 34);
    dragProxyEl.appendChild(gridEl);
    dragProxyEl.classList.remove('hidden');
  }

  if (isDragging) {
    updateDragProxy(currentPointerX, currentPointerY);
  }
});

window.addEventListener('pointerup', () => {
  if (activeSlotIndex === null) return;

  if (isDragging) {
    // End Drag -> Attempt Placement
    endDragPlacement();
  } else {
    // Quick Tap -> Rotate candidate piece inside slot
    const piece = availablePieces[activeSlotIndex];
    if (piece) {
      rotatePiece(piece);
      renderSlots();
      msgEl.textContent = '🔄 候補ブロックを回転しました！';
      checkGameOver();
    }
  }

  activeSlotIndex = null;
  isDragging = false;
  isMoved = false;
  dragProxyEl.classList.add('hidden');
});

function updateDragProxy(clientX, clientY) {
  dragProxyEl.style.left = `${clientX}px`;
  dragProxyEl.style.top = `${clientY}px`;

  const boardRect = boardEl.getBoundingClientRect();
  if (clientX >= boardRect.left && clientX <= boardRect.right &&
      clientY >= boardRect.top && clientY <= boardRect.bottom) {
    const cellSize = boardRect.width / BOARD_SIZE;
    const hoverC = Math.floor((clientX - boardRect.left) / cellSize);
    const hoverR = Math.floor((clientY - boardRect.top) / cellSize);

    updateBoardPreview(activeSlotIndex, hoverR, hoverC);
  } else {
    clearPreview();
  }
}

function endDragPlacement() {
  dragProxyEl.classList.add('hidden');
  const piece = availablePieces[activeSlotIndex];
  if (!piece) {
    clearPreview();
    return;
  }

  const boardRect = boardEl.getBoundingClientRect();
  if (currentPointerX >= boardRect.left && currentPointerX <= boardRect.right &&
      currentPointerY >= boardRect.top && currentPointerY <= boardRect.bottom) {
    const cellSize = boardRect.width / BOARD_SIZE;
    const hoverC = Math.floor((currentPointerX - boardRect.left) / cellSize);
    const hoverR = Math.floor((currentPointerY - boardRect.top) / cellSize);

    // Centered placement offset
    const startR = hoverR - Math.floor(piece.shape.length / 2);
    const startC = hoverC - Math.floor(piece.shape[0].length / 2);

    attemptPlacement(activeSlotIndex, startR, startC);
  } else {
    clearPreview();
    msgEl.textContent = '💡 候補をタップで回転、ドラッグで盤面へ配置';
  }
}

function getPlacementValidity(shape, startR, startC) {
  let isOverflow = false;
  let isOverlap = false;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const br = startR + r;
        const bc = startC + c;
        if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) {
          isOverflow = true;
        } else if (board[br][bc] !== null) {
          isOverlap = true;
        }
      }
    }
  }

  if (isOverflow) return 'OVERFLOW';
  if (isOverlap) return 'OVERLAP';
  return 'OK';
}

function canPlace(shape, startR, startC) {
  return getPlacementValidity(shape, startR, startC) === 'OK';
}

function clearPreview() {
  document.querySelectorAll('.cell').forEach(c => {
    c.classList.remove('preview-valid', 'preview-invalid');
  });
}

function updateBoardPreview(slotIdx, hoverR, hoverC) {
  clearPreview();
  const piece = availablePieces[slotIdx];
  if (!piece) return;

  const startR = hoverR - Math.floor(piece.shape.length / 2);
  const startC = hoverC - Math.floor(piece.shape[0].length / 2);

  const validity = getPlacementValidity(piece.shape, startR, startC);
  const className = validity === 'OK' ? 'preview-valid' : 'preview-invalid';

  for (let pr = 0; pr < piece.shape.length; pr++) {
    for (let pc = 0; pc < piece.shape[pr].length; pc++) {
      if (piece.shape[pr][pc]) {
        const br = startR + pr;
        const bc = startC + pc;
        if (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE) {
          const targetCell = boardEl.children[br * BOARD_SIZE + bc];
          if (targetCell) targetCell.classList.add(className);
        }
      }
    }
  }
}

function attemptPlacement(slotIdx, startR, startC) {
  const piece = availablePieces[slotIdx];
  if (!piece) return;

  const validity = getPlacementValidity(piece.shape, startR, startC);

  if (validity !== 'OK') {
    if (validity === 'OVERFLOW') {
      msgEl.textContent = '⚠️ ブロックが盤面からはみ出しています！配置をキャンセルしました';
    } else if (validity === 'OVERLAP') {
      msgEl.textContent = '⚠️ 既存のブロックと重なっています！配置をキャンセルしました';
    }
    clearPreview();
    return;
  }

  // Place Piece
  let addedBlockCount = 0;
  for (let pr = 0; pr < piece.shape.length; pr++) {
    for (let pc = 0; pc < piece.shape[pr].length; pc++) {
      if (piece.shape[pr][pc]) {
        board[startR + pr][startC + pc] = piece.color;
        addedBlockCount++;
      }
    }
  }

  score += addedBlockCount * 10;
  scoreEl.textContent = score;

  availablePieces[slotIdx] = null;
  clearPreview();
  renderBoard();
  renderSlots();

  // Clear Lines
  checkAndClearLines();

  // Spawn or check next
  if (availablePieces.every(p => p === null)) {
    spawnNewPieces();
  } else {
    checkGameOver();
  }
}

function checkAndClearLines() {
  const rowsToClear = [];
  const colsToClear = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every(cell => cell !== null)) {
      rowsToClear.push(r);
    }
  }

  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) colsToClear.push(c);
  }

  const totalLines = rowsToClear.length + colsToClear.length;
  if (totalLines > 0) {
    const lineScore = totalLines * 100 * totalLines;
    score += lineScore;
    scoreEl.textContent = score;

    if (totalLines >= 2) {
      msgEl.textContent = `🔥 ${totalLines}ライン同時消去！ボーナス +${lineScore}点！`;
    } else {
      msgEl.textContent = `✨ ライン消去！ +${lineScore}点！`;
    }

    const cellsToClear = new Set();
    rowsToClear.forEach(r => {
      for (let c = 0; c < BOARD_SIZE; c++) cellsToClear.add(`${r},${c}`);
    });
    colsToClear.forEach(c => {
      for (let r = 0; r < BOARD_SIZE; r++) cellsToClear.add(`${r},${c}`);
    });

    cellsToClear.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const cell = boardEl.children[r * BOARD_SIZE + c];
      if (cell) cell.classList.add('clearing');
      board[r][c] = null;
    });

    setTimeout(() => {
      renderBoard();
    }, 300);
  } else {
    msgEl.textContent = '💡 候補をタップで回転、ドラッグで盤面へ配置';
  }

  if (score > bestScore) {
    bestScore = score;
    bestEl.textContent = bestScore;
    saveBestScore(bestScore);
    newHighScoreThisGame = true;
  }
}

function canFitAnywhere(shape) {
  for (let r = 0; r <= BOARD_SIZE - shape.length; r++) {
    for (let c = 0; c <= BOARD_SIZE - shape[0].length; c++) {
      if (canPlace(shape, r, c)) return true;
    }
  }
  return false;
}

function checkGameOver() {
  const activePieces = availablePieces.filter(p => p !== null);
  if (activePieces.length === 0) return;

  const canMoveAny = activePieces.some(p => canFitAnywhere(p.shape));
  if (!canMoveAny) {
    isGameOver = true;
    msgEl.textContent = '💀 ゲームオーバー！置けるマスがありません';
    if (newHighScoreThisGame) {
      newHighScoreThisGame = false;
      recordHighScore('block-puzzle', score).catch((error) => {
        console.error('Block puzzle ranking error:', error);
      });
    }
  }
}

resetBtn.addEventListener('click', initGame);

initGame();

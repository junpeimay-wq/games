let board = Array(9).fill(null);
let playerOverwrites = 2;
let cpuOverwrites = 2;
let isGameOver = false;
let isCpuTurn = false;

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

const cells = document.querySelectorAll('.cell');
const msgEl = document.getElementById('msg');
const playerChargesEl = document.getElementById('player-charges');
const cpuChargesEl = document.getElementById('cpu-charges');
const resetBtn = document.getElementById('reset-btn');

function initGame() {
  board = Array(9).fill(null);
  playerOverwrites = 2;
  cpuOverwrites = 2;
  isGameOver = false;
  isCpuTurn = false;

  playerChargesEl.textContent = playerOverwrites;
  cpuChargesEl.textContent = cpuOverwrites;
  msgEl.textContent = 'あなたの番です (〇)';

  cells.forEach(cell => {
    cell.textContent = '';
    cell.className = 'cell';
    cell.disabled = false;
  });

  updateHoverState();
}

function updateHoverState() {
  if (isGameOver || isCpuTurn) return;
  cells.forEach((cell, idx) => {
    cell.classList.remove('overwritable');
    if (board[idx] === 'X' && playerOverwrites > 0) {
      cell.classList.add('overwritable');
    }
  });
}

function checkWin(b, mark) {
  for (let combo of WINNING_COMBOS) {
    if (b[combo[0]] === mark && b[combo[1]] === mark && b[combo[2]] === mark) {
      return combo;
    }
  }
  return null;
}

function canMove(mark, overwritesLeft) {
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) return true;
    const opponentMark = mark === 'O' ? 'X' : 'O';
    if (board[i] === opponentMark && overwritesLeft > 0) return true;
  }
  return false;
}

function handleCellClick(index) {
  if (isGameOver || isCpuTurn) return;

  const currentVal = board[index];

  if (currentVal === null) {
    makeMove(index, 'O');
  } else if (currentVal === 'X') {
    if (playerOverwrites > 0) {
      playerOverwrites--;
      playerChargesEl.textContent = playerOverwrites;
      makeMove(index, 'O');
    } else {
      msgEl.textContent = '上書き権限がありません！';
      return;
    }
  } else {
    // Clicked on own 'O'
    return;
  }

  const winCombo = checkWin(board, 'O');
  if (winCombo) {
    endGame('O', winCombo);
    return;
  }

  if (!canMove('X', cpuOverwrites) && !canMove('O', playerOverwrites)) {
    endGame('DRAW');
    return;
  }

  // CPU turn
  isCpuTurn = true;
  msgEl.textContent = 'CPUが考えています...';
  updateHoverState();

  setTimeout(cpuTurn, 500);
}

function makeMove(index, mark) {
  board[index] = mark;
  const cell = cells[index];
  cell.textContent = mark === 'O' ? '〇' : '×';
  cell.className = `cell ${mark.toLowerCase()}`;
}

function cpuTurn() {
  if (isGameOver) return;

  const moveIndex = findBestCpuMove();

  if (moveIndex !== null && moveIndex !== undefined) {
    if (board[moveIndex] === 'O') {
      cpuOverwrites--;
      cpuChargesEl.textContent = cpuOverwrites;
    }
    makeMove(moveIndex, 'X');

    const winCombo = checkWin(board, 'X');
    if (winCombo) {
      endGame('X', winCombo);
      return;
    }
  }

  if (!canMove('O', playerOverwrites) && !canMove('X', cpuOverwrites)) {
    endGame('DRAW');
    return;
  }

  isCpuTurn = false;
  msgEl.textContent = 'あなたの番です (〇)';
  updateHoverState();
}

function findBestCpuMove() {
  // 1. Can CPU win immediately?
  for (let i = 0; i < 9; i++) {
    if (board[i] === null || (board[i] === 'O' && cpuOverwrites > 0)) {
      const tempBoard = [...board];
      tempBoard[i] = 'X';
      if (checkWin(tempBoard, 'X')) {
        return i;
      }
    }
  }

  // 2. Can Player win immediately on their next turn? If so, block!
  for (let i = 0; i < 9; i++) {
    if (board[i] === null || (board[i] === 'X' && playerOverwrites > 0)) {
      const tempBoard = [...board];
      tempBoard[i] = 'O';
      if (checkWin(tempBoard, 'O')) {
        // CPU needs to occupy/overwrite this position
        if (board[i] === null) return i;
        if (board[i] === 'O' && cpuOverwrites > 0) return i; // Overwrite player's winning O if possible
      }
    }
  }

  // 3. Prefer Center if empty
  if (board[4] === null) return 4;

  // 4. Prefer Corners if empty
  const corners = [0, 2, 6, 8].sort(() => Math.random() - 0.5);
  for (let c of corners) {
    if (board[c] === null) return c;
  }

  // 5. Prefer Edges if empty
  const edges = [1, 3, 5, 7].sort(() => Math.random() - 0.5);
  for (let e of edges) {
    if (board[e] === null) return e;
  }

  // 6. If no empty cells, consider overwriting Player's 'O' if CPU has charges left
  if (cpuOverwrites > 0) {
    const oIndices = [];
    for (let i = 0; i < 9; i++) {
      if (board[i] === 'O') oIndices.push(i);
    }
    if (oIndices.length > 0) {
      return oIndices[Math.floor(Math.random() * oIndices.length)];
    }
  }

  return null;
}

function endGame(result, winCombo = null) {
  isGameOver = true;
  if (winCombo) {
    winCombo.forEach(idx => cells[idx].classList.add('winning'));
  }

  if (result === 'O') {
    msgEl.textContent = '🎉 あなたの勝利です！(〇)';
  } else if (result === 'X') {
    msgEl.textContent = '💀 CPUの勝利です！(×)';
  } else {
    msgEl.textContent = '🤝 引き分けです！';
  }
}

cells.forEach((cell, idx) => {
  cell.addEventListener('click', () => handleCellClick(idx));
});

resetBtn.addEventListener('click', initGame);

initGame();

let board = Array(9).fill(null);
let playerOverwrites = 1;
let cpuOverwrites = 1;
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
  playerOverwrites = 1;
  cpuOverwrites = 1;
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

function canPlayerWinNextTurn(b, pOverwrites) {
  for (let i = 0; i < 9; i++) {
    const isNull = b[i] === null;
    const isCpuX = b[i] === 'X';
    if (isNull || (isCpuX && pOverwrites > 0)) {
      const testB = [...b];
      testB[i] = 'O';
      if (checkWin(testB, 'O')) {
        return true;
      }
    }
  }
  return false;
}

function countLinesWithMark(b, mark) {
  let count = 0;
  for (let combo of WINNING_COMBOS) {
    const marksInCombo = combo.map(idx => b[idx]);
    if (marksInCombo.filter(m => m === mark).length === 2 && marksInCombo.filter(m => m === null).length === 1) {
      count++;
    }
  }
  return count;
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

  isCpuTurn = true;
  msgEl.textContent = 'CPUが考えています...';
  updateHoverState();

  setTimeout(cpuTurn, 400);
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
  let possibleMoves = [];

  const playerCanWinNow = canPlayerWinNextTurn(board, playerOverwrites);

  for (let i = 0; i < 9; i++) {
    const isNull = board[i] === null;
    const isPlayerO = board[i] === 'O';

    if (isNull || (isPlayerO && cpuOverwrites > 0)) {
      let score = 0;
      const isOverwrite = isPlayerO;

      const simBoard = [...board];
      simBoard[i] = 'X';

      // 1. Immediate CPU Win -> Highest Priority
      if (checkWin(simBoard, 'X')) {
        return i; // Win immediately!
      }

      // 2. Check if Player can win on their next turn after this move
      const playerCanWinAfter = canPlayerWinNextTurn(simBoard, playerOverwrites);

      if (playerCanWinAfter) {
        // This move leaves CPU vulnerable to Player win -> Heavy Penalty
        score -= 50000;
      } else if (playerCanWinNow) {
        // This move successfully blocked a Player win threat -> Major Defense Bonus
        score += 10000;
      }

      // 3. Strategic Overwriting & Position Values
      if (isOverwrite) {
        score += 400; // Overwriting pressure
        if (i === 4) score += 500; // Overwrite center

        // Extra bonus for overwriting an 'O' in a multi-O line
        for (let combo of WINNING_COMBOS) {
          if (combo.includes(i) && combo.filter(idx => board[idx] === 'O').length >= 2) {
            score += 600;
          }
        }

        const cpuTwoLines = countLinesWithMark(simBoard, 'X');
        score += cpuTwoLines * 300;
      } else {
        if (i === 4) score += 250;
        else if ([0, 2, 6, 8].includes(i)) score += 120;
        else score += 50;

        const cpuTwoLines = countLinesWithMark(simBoard, 'X');
        score += cpuTwoLines * 200;
      }

      possibleMoves.push({ index: i, score: score, isOverwrite: isOverwrite });
    }
  }

  if (possibleMoves.length === 0) return null;

  possibleMoves.sort((a, b) => b.score - a.score);

  const topScore = possibleMoves[0].score;
  const topMoves = possibleMoves.filter(m => m.score === topScore);
  return topMoves[Math.floor(Math.random() * topMoves.length)].index;
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

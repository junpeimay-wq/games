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

  // Evaluate all possible moves (empty spaces and valid overwrites)
  for (let i = 0; i < 9; i++) {
    const isNull = board[i] === null;
    const isPlayerO = board[i] === 'O';

    if (isNull || (isPlayerO && cpuOverwrites > 0)) {
      let score = 0;
      const isOverwrite = isPlayerO;

      // Simulate CPU move
      const simBoard = [...board];
      simBoard[i] = 'X';

      // 1. Immediate Win
      if (checkWin(simBoard, 'X')) {
        score += 10000;
      }

      // 2. Block Player Immediate Win
      // Check if Player could win on their next turn if CPU does NOT take this spot
      let blocksPlayerWin = false;
      for (let combo of WINNING_COMBOS) {
        if (combo.includes(i)) {
          const oCount = combo.filter(idx => board[idx] === 'O').length;
          const nullCount = combo.filter(idx => board[idx] === null).length;
          // If player has 2 in a row and this cell is the 3rd
          if (oCount === 2 && (board[i] === null || board[i] === 'O')) {
            blocksPlayerWin = true;
          }
        }
      }
      if (blocksPlayerWin) {
        score += 5000;
      }

      // 3. Aggressive Overwrite Strategy
      if (isOverwrite) {
        score += 300; // Base aggressiveness bonus for overwriting

        // Overwrite Center
        if (i === 4) score += 400;

        // Overwrite an 'O' that is part of a potential player line
        for (let combo of WINNING_COMBOS) {
          if (combo.includes(i) && combo.filter(idx => board[idx] === 'O').length >= 2) {
            score += 450;
          }
        }

        // Creates 2-in-a-row for CPU by overwriting
        const cpuTwoLines = countLinesWithMark(simBoard, 'X');
        score += cpuTwoLines * 250;
      } else {
        // Placement in Empty Space
        if (i === 4) score += 200; // Center
        else if ([0, 2, 6, 8].includes(i)) score += 100; // Corners
        else score += 40; // Edges

        // Creates 2-in-a-row for CPU
        const cpuTwoLines = countLinesWithMark(simBoard, 'X');
        score += cpuTwoLines * 150;
      }

      possibleMoves.push({ index: i, score: score, isOverwrite: isOverwrite });
    }
  }

  if (possibleMoves.length === 0) return null;

  // Sort moves by score descending
  possibleMoves.sort((a, b) => b.score - a.score);

  // Return best move (if multiple have same score, add slight randomness among top tier)
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

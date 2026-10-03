export function rotateMatrixClockwise(matrix) {
  const rows = matrix.length;
  const columns = matrix[0].length;
  const rotated = Array.from({ length: columns }, () => Array(rows).fill(0));

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      rotated[column][rows - 1 - row] = matrix[row][column];
    }
  }

  return rotated;
}

export function canPlace(board, shape, startRow, startColumn) {
  for (let row = 0; row < shape.length; row++) {
    for (let column = 0; column < shape[row].length; column++) {
      if (!shape[row][column]) continue;

      const boardRow = startRow + row;
      const boardColumn = startColumn + column;
      if (
        boardRow < 0 ||
        boardRow >= board.length ||
        boardColumn < 0 ||
        boardColumn >= board[boardRow].length ||
        board[boardRow][boardColumn] !== null
      ) {
        return false;
      }
    }
  }

  return true;
}

export function canFitAnywhere(board, shape) {
  for (let row = 0; row <= board.length - shape.length; row++) {
    for (let column = 0; column <= board[row].length - shape[0].length; column++) {
      if (canPlace(board, shape, row, column)) return true;
    }
  }
  return false;
}

export function canFitInAnyRotation(board, shape) {
  let rotated = shape;
  for (let turn = 0; turn < 4; turn++) {
    if (canFitAnywhere(board, rotated)) return true;
    rotated = rotateMatrixClockwise(rotated);
  }
  return false;
}

export function hasAnyValidMove(board, pieces) {
  return pieces.some((piece) => piece && canFitInAnyRotation(board, piece.shape));
}

export function getPerfectClearBonus(board, bonus = 1000) {
  return board.every((row) => row.every((cell) => cell === null)) ? bonus : 0;
}

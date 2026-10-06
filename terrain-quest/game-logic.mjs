import { updateMapSymbolProgress } from '../firebase-demo/score-utils.js';

export const MAP_ZOOM = 14;
export const QUIZ_SCORE_STORAGE_KEY = 'terrain-quest.symbol-progress.v1';
export const FIRESTORE_GAME_ID = 'terrain-quest';
export const FIRST_CORRECT_POINTS = 100;
export const KNOWN_CORRECT_POINTS = 10;

export const MAP_SYMBOLS = [
  { id: '3201', code: 3201, label: '官公署' },
  { id: '3202', code: 3202, label: '裁判所' },
  { id: '3203', code: 3203, label: '税務署' },
  { id: '3204', code: 3204, label: '外国公館' },
  { id: '3205', code: 3205, label: '市役所・特別区の区役所' },
  { id: '3206', code: 3206, label: '町村役場・政令指定都市の区役所' },
  { id: '3211', code: 3211, label: '交番' },
  { id: '3212', code: 3212, label: '中学校・高等学校' },
  { id: '3213', code: 3213, label: '小学校' },
  { id: '3215', code: 3215, label: '老人ホーム' },
  { id: '3216', code: 3216, label: '博物館' },
  { id: '3217', code: 3217, label: '図書館' },
  { id: '3218', code: 3218, label: '郵便局' },
  { id: '3221', code: 3221, label: '灯台' },
  { id: '3231', code: 3231, label: '神社' },
  { id: '3232', code: 3232, label: '寺院' },
  { id: '3241', code: 3241, label: '警察署' },
  { id: '3242', code: 3242, label: '消防署' },
  { id: '3243', code: 3243, label: '病院' },
  { id: '3244', code: 3244, label: '保健所' },
  { id: '4101', code: 4101, label: '煙突' },
  { id: '4102', code: 4102, label: '風車' },
  { id: '4103', code: 4103, label: '油井・ガス井' },
  { id: '4104', code: 4104, label: '記念碑' },
  { id: '4105', code: 4105, label: '自然災害伝承碑' },
  { id: '6301', code: 6301, label: '墓地' },
  { id: '3261', code: 3261, label: '工場' },
  { id: '6351', code: 6351, label: '採鉱地' },
  { id: '6331', code: 6331, label: '温泉' },
  { id: '6332', code: 6332, label: '噴火口・噴気口' },
  { id: '6342', code: 6342, label: '城跡' },
  { id: '6361', code: 6361, label: '港湾' },
  { id: '6362', code: 6362, label: '漁港' },
  { id: '6373', code: 6373, label: '自衛隊等の飛行場' },
  { id: '6381', code: 6381, label: '自衛隊' },
  { id: '8103', code: 8103, label: '発電所等' },
  { id: '8105', code: 8105, label: '電波塔' }
];

const SYMBOL_CODE_ALIASES = new Map([
  [3214, '3213'],
  [631, '3212'],
  [632, '3212'],
  [633, '3212'],
  [653, '8103'],
  [661, '3231'],
  [662, '3232']
]);
export const MAP_SYMBOL_CODES = [
  ...MAP_SYMBOLS.map(symbol => symbol.code),
  ...SYMBOL_CODE_ALIASES.keys()
];
const SYMBOL_BY_ID = new Map(MAP_SYMBOLS.map(symbol => [symbol.id, symbol]));
const SYMBOL_BY_CODE = new Map(MAP_SYMBOLS.map(symbol => [symbol.code, symbol]));
for (const [code, symbolId] of SYMBOL_CODE_ALIASES) {
  SYMBOL_BY_CODE.set(code, SYMBOL_BY_ID.get(symbolId));
}

export function getWebMercatorTilePosition(latitude, longitude, zoom = MAP_ZOOM) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) {
    throw new RangeError('Invalid latitude, longitude, or zoom level.');
  }

  const tileCount = 2 ** zoom;
  const x = (longitude + 180) / 360 * tileCount;
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = clampedLatitude * Math.PI / 180;
  const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * tileCount;
  const integerX = Math.floor(x);
  const integerY = Math.floor(y);

  return {
    tileX: integerX % tileCount,
    tileY: Math.min(tileCount - 1, integerY),
    pixelX: (x - integerX) * 256,
    pixelY: (y - integerY) * 256
  };
}

export function getMapSymbolByCode(code) {
  const normalizedCode = Number(code);
  if (!Number.isInteger(normalizedCode)) return null;
  return SYMBOL_BY_CODE.get(normalizedCode) ?? null;
}

export function createEmptySymbolProgress() {
  return { version: 1, symbols: {} };
}

export function isSymbolProgressRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
      || record.version !== 1
      || Object.keys(record).some(key => !['version', 'symbols'].includes(key))
      || !record.symbols || typeof record.symbols !== 'object' || Array.isArray(record.symbols)) {
    return false;
  }

  return Object.entries(record.symbols).every(([symbolId, progress]) =>
    SYMBOL_BY_ID.has(symbolId)
    && progress
    && typeof progress === 'object'
    && !Array.isArray(progress)
    && Object.keys(progress).every(key =>
      ['attempts', 'correctAnswers', 'mastered'].includes(key)
    )
    && Number.isInteger(progress.attempts)
    && progress.attempts >= 1
    && Number.isInteger(progress.correctAnswers)
    && progress.correctAnswers >= 0
    && progress.correctAnswers <= progress.attempts
    && typeof progress.mastered === 'boolean'
    && progress.mastered === (progress.correctAnswers > 0)
  );
}

export function getTotalSymbolScore(record) {
  if (!isSymbolProgressRecord(record)) throw new RangeError('Invalid map symbol progress.');
  return Object.values(record.symbols).reduce((total, progress) =>
    total + (progress.correctAnswers > 0
      ? FIRST_CORRECT_POINTS + (progress.correctAnswers - 1) * KNOWN_CORRECT_POINTS
      : 0), 0);
}

export function updateSymbolProgress(previous, symbolId, isCorrect) {
  if (previous !== null && !isSymbolProgressRecord(previous)) {
    throw new RangeError('Invalid previous map symbol progress.');
  }
  if (!SYMBOL_BY_ID.has(symbolId) || typeof isCorrect !== 'boolean') {
    throw new RangeError('Invalid map symbol answer.');
  }

  const current = updateMapSymbolProgress(previous?.symbols[symbolId] ?? null, symbolId, isCorrect);
  const next = {
    version: 1,
    symbols: {
      ...(previous?.symbols ?? {}),
      [symbolId]: {
        attempts: current.attempts,
        correctAnswers: current.correctAnswers,
        mastered: current.mastered
      }
    }
  };

  return {
    record: next,
    knownBefore: current.knownBefore,
    pointsAwarded: current.pointsAwarded,
    totalPoints: getTotalSymbolScore(next)
  };
}

export function buildSymbolChoices(answerId, random = Math.random) {
  if (!SYMBOL_BY_ID.has(answerId)) throw new RangeError('Unknown map symbol.');
  const choices = MAP_SYMBOLS.filter(symbol => symbol.id !== answerId);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  const result = [SYMBOL_BY_ID.get(answerId), ...choices.slice(0, 3)];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSymbolChoices,
  createEmptySymbolProgress,
  getMasteredMapSymbols,
  getMapSymbolByCode,
  getTotalSymbolScore,
  isSymbolProgressRecord,
  MAP_SYMBOLS,
  updateSymbolProgress
} from '../game-logic.mjs';

test('maps GSI vector feature codes to map symbol meanings', () => {
  assert.equal(getMapSymbolByCode(3218).label, '郵便局');
  assert.equal(getMapSymbolByCode('3243').label, '病院');
  assert.equal(getMapSymbolByCode(3261).label, '工場');
  assert.equal(getMapSymbolByCode(3232).label, '寺院');
  assert.equal(getMapSymbolByCode(662).id, '3232');
  assert.equal(getMapSymbolByCode(661).id, '3231');
  assert.equal(getMapSymbolByCode(8103).label, '発電所等');
  assert.equal(getMapSymbolByCode(3214).id, '3213');
  assert.equal(getMapSymbolByCode(631).id, '3212');
  assert.equal(MAP_SYMBOLS.some(symbol => symbol.id === '3214'), false);
  assert.equal(getMapSymbolByCode(9999), null);
});

test('lists only correctly answered map symbol types in game order', () => {
  const mastered = getMasteredMapSymbols({
    '3218': { attempts: 2, correctAnswers: 1, mastered: true },
    '3243': { attempts: 3, correctAnswers: 2, mastered: true },
    '3202': { attempts: 2, correctAnswers: 0, mastered: false }
  });

  assert.deepEqual(mastered.map(symbol => symbol.id), ['3218', '3243']);
  assert.deepEqual(mastered.map(symbol => symbol.label), ['郵便局', '病院']);
  assert.deepEqual(getMasteredMapSymbols({}), []);
  assert.throws(() => getMasteredMapSymbols(null), RangeError);
});

test('builds four distinct meaning choices that include the selected symbol', () => {
  for (const symbol of MAP_SYMBOLS) {
    const choices = buildSymbolChoices(symbol.id, () => 0.5);
    assert.equal(choices.length, 4);
    assert.ok(choices.some(choice => choice.id === symbol.id));
    assert.equal(new Set(choices.map(choice => choice.id)).size, 4);
    assert.equal(new Set(choices.map(choice => choice.label)).size, 4);
  }
});

test('awards 100 points for the first correct answer and 10 for later correct answers', () => {
  const firstWrong = updateSymbolProgress(createEmptySymbolProgress(), '3218', false);
  assert.equal(firstWrong.pointsAwarded, 0);
  assert.equal(firstWrong.record.symbols['3218'].mastered, false);

  const firstCorrect = updateSymbolProgress(firstWrong.record, '3218', true);
  assert.equal(firstCorrect.knownBefore, false);
  assert.equal(firstCorrect.pointsAwarded, 100);
  assert.equal(firstCorrect.totalPoints, 100);
  assert.equal(firstCorrect.record.symbols['3218'].mastered, true);
  assert.equal(firstCorrect.record.symbols['3218'].attempts, 2);

  const knownCorrect = updateSymbolProgress(firstCorrect.record, '3218', true);
  assert.equal(knownCorrect.knownBefore, true);
  assert.equal(knownCorrect.pointsAwarded, 10);
  assert.equal(knownCorrect.totalPoints, 110);
  assert.equal(isSymbolProgressRecord(knownCorrect.record), true);
});

test('keeps scores cumulative across symbols and records wrong attempts without mastery', () => {
  const firstSymbol = updateSymbolProgress(createEmptySymbolProgress(), '3218', true);
  const secondSymbol = updateSymbolProgress(firstSymbol.record, '3243', true);
  const repeatedSymbol = updateSymbolProgress(secondSymbol.record, '3218', true);

  assert.equal(getTotalSymbolScore(repeatedSymbol.record), 210);
  assert.equal(repeatedSymbol.record.symbols['3243'].correctAnswers, 1);
  assert.equal(repeatedSymbol.record.symbols['3243'].mastered, true);

  const wrongAgain = updateSymbolProgress(repeatedSymbol.record, '3202', false);
  assert.equal(wrongAgain.totalPoints, 210);
  assert.equal(wrongAgain.record.symbols['3202'].attempts, 1);
  assert.equal(wrongAgain.record.symbols['3202'].mastered, false);
});

test('aggregates different vector codes for the same map symbol type', () => {
  const first = updateSymbolProgress(
    createEmptySymbolProgress(),
    getMapSymbolByCode(3213).id,
    true
  );
  const second = updateSymbolProgress(
    first.record,
    getMapSymbolByCode(3214).id,
    true
  );

  assert.equal(Object.keys(second.record.symbols).length, 1);
  assert.equal(second.record.symbols['3213'].correctAnswers, 2);
  assert.equal(second.pointsAwarded, 10);
  assert.equal(second.totalPoints, 110);
});

test('rejects malformed or unknown local symbol progress', () => {
  assert.equal(isSymbolProgressRecord({
    version: 1,
    symbols: { invalid: { attempts: 1, correctAnswers: 0, mastered: false } }
  }), false);
  assert.throws(() => updateSymbolProgress(null, 'unknown', true), RangeError);
  assert.throws(() => updateSymbolProgress(null, '3218', 'true'), RangeError);
  assert.throws(() => getTotalSymbolScore({ version: 1, symbols: {} , extra: true }), RangeError);
});

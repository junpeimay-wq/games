import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-firestore-rules',
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

function scoreData(uid, overrides = {}) {
  return {
    uid,
    name: 'Test player',
    photoURL: '',
    game: 'snake',
    score: 123,
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

test('allows public score reads', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'scores', 'public-score'),
      scoreData('score-owner')
    );
  });

  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'scores', 'public-score')));
  await assertSucceeds(getDocs(collection(db, 'scores')));
  await assertSucceeds(getDocs(query(
    collection(db, 'scores'),
    where('game', '==', 'snake'),
    orderBy('score', 'desc'),
    limit(10)
  )));
});

test('allows an authenticated user to create a valid score for their UID', async () => {
  const uid = 'score-owner';
  const db = testEnv.authenticatedContext(uid).firestore();

  for (const game of ['snake', 'tictactoe', 'block-puzzle']) {
    await assertSucceeds(
      setDoc(doc(db, 'scores', `${game}_${uid}`), scoreData(uid, { game }))
    );
  }
});

test('rejects unauthenticated creates and UID spoofing', async () => {
  const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    setDoc(doc(unauthenticatedDb, 'scores', 'snake_anonymous'), scoreData('anonymous'))
  );

  const db = testEnv.authenticatedContext('actual-user').firestore();
  await assertFails(
    setDoc(doc(db, 'scores', 'snake_different-user'), scoreData('different-user'))
  );
  await assertFails(
    setDoc(doc(db, 'scores', 'spoofed-id'), scoreData('actual-user'))
  );
});

test('rejects missing or unexpected fields and invalid score data', async () => {
  const ownerUid = 'score-owner';
  const invalidEntries = [
    ['missing-uid', ({ uid: _uid, ...data }) => data],
    ['missing-field', ({ updatedAt, ...data }) => data],
    ['unexpected-field', (data) => ({ ...data, extra: true })],
    ['invalid-name', (data) => ({ ...data, name: 42 })],
    ['invalid-photo-url', (data) => ({ ...data, photoURL: null })],
    ['invalid-game', (data) => ({ ...data, game: 'unknown-game' })],
    ['negative-score', (data) => ({ ...data, score: -1 })],
    ['fractional-score', (data) => ({ ...data, score: 1.5 })],
    ['string-score', (data) => ({ ...data, score: '123' })],
    ['invalid-timestamp', (data) => ({ ...data, updatedAt: 'not-a-timestamp' })],
    ['forged-timestamp', (data) => ({
      ...data,
      updatedAt: Timestamp.fromMillis(1)
    })]
  ];

  for (const [id, mutate] of invalidEntries) {
    const uid = `${ownerUid}-${id}`;
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertFails(
      setDoc(doc(db, 'scores', `snake_${uid}`), mutate(scoreData(uid)))
    );
  }
});

test('allows only the owner to update their score to a strictly higher value', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'scores', 'snake_score-owner'),
      scoreData('score-owner')
    );
  });

  const db = testEnv.authenticatedContext('score-owner').firestore();
  const scoreRef = doc(db, 'scores', 'snake_score-owner');
  await assertSucceeds(setDoc(scoreRef, scoreData('score-owner', { score: 124 })));
  await assertFails(setDoc(scoreRef, scoreData('score-owner', { score: 124 })));
  await assertFails(setDoc(scoreRef, scoreData('score-owner', { score: 100 })));
  await assertFails(
    setDoc(scoreRef, scoreData('different-user', { score: 999 }))
  );
  await assertFails(updateDoc(scoreRef, { score: 999 }));
});

test('rejects deletes, including by the score owner', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'scores', 'snake_score-owner'),
      scoreData('score-owner')
    );
  });

  const db = testEnv.authenticatedContext('score-owner').firestore();
  await assertFails(deleteDoc(doc(db, 'scores', 'snake_score-owner')));
});

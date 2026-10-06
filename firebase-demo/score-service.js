import { auth, db } from './firebase-config.js';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  GAME_LABELS,
  isNewHighScore,
  updateMapSymbolProgress
} from './score-utils.js';

let currentUser = null;
let resolveAuthReady;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  resolveAuthReady();
});

function setStatus(message, isError = false, statusElementId = 'ranking-status') {
  const status = document.getElementById(statusElementId);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function confirmAndSignIn(game, score) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'score-consent-dialog';
    dialog.innerHTML = `
      <h2>ランキングに記録しますか？</h2>
      <p>${GAME_LABELS[game]}の新しいハイスコアは <strong>${score.toLocaleString()}</strong> 点です。</p>
      <p>記録にはGoogle認証が必要です。認証後、このスコアを自動で送信します。</p>
      <p>スコアとGoogleプロフィールの表示名・画像は公開ランキングに表示されます。</p>
      <div class="score-consent-actions">
        <button type="button" class="score-consent-accept">Google認証して記録</button>
        <button type="button" class="score-consent-cancel">今回は記録しない</button>
      </div>
      <p class="score-consent-error" role="alert"></p>
    `;
    document.body.appendChild(dialog);

    const close = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('.score-consent-cancel').addEventListener('click', () => close(null));
    dialog.querySelector('.score-consent-accept').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        close(credential.user);
      } catch (error) {
        console.error('Google sign-in error:', error);
        dialog.querySelector('.score-consent-error').textContent =
          `認証できませんでした: ${error.message}`;
        button.disabled = false;
      }
    });

    dialog.addEventListener('cancel', () => close(null), { once: true });
    dialog.showModal();
  });
}

export async function recordHighScore(game, score, statusElementId = 'ranking-status') {
  if (!Object.hasOwn(GAME_LABELS, game)) {
    throw new Error(`Unknown game: ${game}`);
  }
  if (!Number.isInteger(score) || score < 0) {
    throw new Error('A score must be a non-negative integer.');
  }

  await authReady;
  let user = currentUser || auth.currentUser;
  if (!user) {
    user = await confirmAndSignIn(game, score);
    if (!user) {
      setStatus('このハイスコアはランキングに記録されませんでした。', false, statusElementId);
      return false;
    }
  }

  try {
    const scoreRef = doc(db, 'scores', `${game}_${user.uid}`);
    const existing = await getDoc(scoreRef);
    const previousBest = existing.exists() ? existing.data().score : -1;
    if (!isNewHighScore(score, previousBest)) {
      setStatus('ランキングには、これより高いスコアが記録済みです。', false, statusElementId);
      return false;
    }

    await setDoc(scoreRef, {
      uid: user.uid,
      name: user.displayName || user.email || 'プレイヤー',
      photoURL: user.photoURL || '',
      game,
      score,
      updatedAt: serverTimestamp()
    });
    setStatus('ハイスコアをランキングに記録しました。', false, statusElementId);
    return true;
  } catch (error) {
    console.error('Score recording error:', error);
    setStatus(`ランキングへの記録に失敗しました: ${error.message}`, true, statusElementId);
    return false;
  }
}

export async function loadMapSymbolCloudProgress() {
  await authReady;
  const user = currentUser || auth.currentUser;
  if (!user) return null;

  const progressRef = doc(db, 'users', user.uid, 'mapSymbolProgress', 'progress');
  const scoreRef = doc(db, 'scores', `terrain-quest_${user.uid}`);
  const [progressSnapshot, scoreSnapshot] = await Promise.all([
    getDoc(progressRef),
    getDoc(scoreRef)
  ]);
  const progress = progressSnapshot.exists() ? progressSnapshot.data() : null;
  if (progress && (progress.uid !== user.uid
      || !progress.symbols || typeof progress.symbols !== 'object'
      || Array.isArray(progress.symbols)
      || !Object.hasOwn(progress.symbols, progress.lastUpdatedSymbol)
      || Object.entries(progress.symbols).some(([symbolId, symbolProgress]) =>
        !/^\d{4}$/.test(symbolId)
        || !symbolProgress || typeof symbolProgress !== 'object'
        || !Number.isInteger(symbolProgress.attempts) || symbolProgress.attempts < 1
        || !Number.isInteger(symbolProgress.correctAnswers)
        || symbolProgress.correctAnswers < 0
        || symbolProgress.correctAnswers > symbolProgress.attempts
        || symbolProgress.mastered !== (symbolProgress.correctAnswers > 0)))) {
    throw new Error('Invalid map symbol progress document.');
  }

  const totalPoints = scoreSnapshot.exists() ? scoreSnapshot.data().score : 0;
  if (!Number.isInteger(totalPoints) || totalPoints < 0) {
    throw new Error('Invalid map quiz score record.');
  }
  return { uid: user.uid, symbols: progress?.symbols ?? {}, totalPoints };
}

export async function recordMapSymbolAnswer(symbolId, isCorrect) {
  if (!/^\d{4}$/.test(symbolId) || typeof isCorrect !== 'boolean') {
    throw new Error('Invalid map symbol answer.');
  }

  await authReady;
  const user = currentUser || auth.currentUser;
  if (!user) return null;

  const progressRef = doc(db, 'users', user.uid, 'mapSymbolProgress', 'progress');
  const scoreRef = doc(db, 'scores', `terrain-quest_${user.uid}`);
  return runTransaction(db, async (transaction) => {
    const [progressSnapshot, scoreSnapshot] = await Promise.all([
      transaction.get(progressRef),
      transaction.get(scoreRef)
    ]);
    const previousDocument = progressSnapshot.exists() ? progressSnapshot.data() : null;
    const previousSymbols = previousDocument?.symbols ?? {};
    if (previousDocument && (previousDocument.uid !== user.uid
        || !previousSymbols || typeof previousSymbols !== 'object'
        || Array.isArray(previousSymbols)
        || !Object.hasOwn(previousSymbols, previousDocument.lastUpdatedSymbol)
        || Object.entries(previousSymbols).some(([id, symbolProgress]) =>
          !/^\d{4}$/.test(id)
          || !symbolProgress || typeof symbolProgress !== 'object'
          || !Number.isInteger(symbolProgress.attempts) || symbolProgress.attempts < 1
          || !Number.isInteger(symbolProgress.correctAnswers)
          || symbolProgress.correctAnswers < 0
          || symbolProgress.correctAnswers > symbolProgress.attempts
          || symbolProgress.mastered !== (symbolProgress.correctAnswers > 0)))) {
      throw new Error('Invalid map symbol progress document.');
    }

    const nextProgress = updateMapSymbolProgress(previousSymbols[symbolId] ?? null, symbolId, isCorrect);
    const nextSymbols = {
      ...previousSymbols,
      [symbolId]: {
        attempts: nextProgress.attempts,
        correctAnswers: nextProgress.correctAnswers,
        mastered: nextProgress.mastered
      }
    };
    transaction.set(progressRef, {
      uid: user.uid,
      symbols: nextSymbols,
      lastUpdatedSymbol: symbolId,
      updatedAt: serverTimestamp()
    });

    const previousScore = scoreSnapshot.exists() ? scoreSnapshot.data().score : 0;
    if (!Number.isInteger(previousScore) || previousScore < 0) {
      throw new Error('Invalid map quiz score record.');
    }
    const totalPoints = previousScore + nextProgress.pointsAwarded;
    if (nextProgress.pointsAwarded > 0) {
      transaction.set(scoreRef, {
        uid: user.uid,
        name: user.displayName || user.email || 'プレイヤー',
        photoURL: user.photoURL || '',
        game: 'terrain-quest',
        score: totalPoints,
        updatedAt: serverTimestamp()
      });
    }
    return { ...nextProgress, totalPoints };
  });
}

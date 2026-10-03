import { auth, db } from './firebase-config.js';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { GAME_LABELS, isNewHighScore } from './score-utils.js';

let currentUser = null;
let resolveAuthReady;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  resolveAuthReady();
});

function setStatus(message, isError = false) {
  const status = document.getElementById('ranking-status');
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

export async function recordHighScore(game, score) {
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
      setStatus('このハイスコアはランキングに記録されませんでした。');
      return false;
    }
  }

  try {
    const scoreRef = doc(db, 'scores', `${game}_${user.uid}`);
    const existing = await getDoc(scoreRef);
    const previousBest = existing.exists() ? existing.data().score : -1;
    if (!isNewHighScore(score, previousBest)) {
      setStatus('ランキングには、これより高いスコアが記録済みです。');
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
    setStatus('ハイスコアをランキングに記録しました。');
    return true;
  } catch (error) {
    console.error('Score recording error:', error);
    setStatus(`ランキングへの記録に失敗しました: ${error.message}`, true);
    return false;
  }
}

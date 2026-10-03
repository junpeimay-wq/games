// ============================================================
// game.js
// UI操作・認証処理・Firestore 読み書き・ランキング表示
// ============================================================

import { auth, db } from './firebase-config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ─── DOM ─────────────────────────────────────────────────────
const loginBtn      = document.getElementById('login-btn');
const logoutBtn     = document.getElementById('logout-btn');
const userInfo      = document.getElementById('user-info');
const userAvatar    = document.getElementById('user-avatar');
const userName      = document.getElementById('user-name');
const submitSection = document.getElementById('submit-section');
const scoreInput    = document.getElementById('score-input');
const gameSelect    = document.getElementById('game-select');
const submitBtn     = document.getElementById('submit-btn');
const submitMsg     = document.getElementById('submit-msg');
const rankingList   = document.getElementById('ranking-list');
const filterGame    = document.getElementById('filter-game');

// ─── 認証状態管理 ─────────────────────────────────────────────
let currentUser = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    userAvatar.src         = user.photoURL  || '';
    userAvatar.style.display = user.photoURL ? 'inline-block' : 'none';
    userName.textContent   = user.displayName || user.email;
    userInfo.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    submitSection.classList.remove('hidden');
  } else {
    userInfo.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    submitSection.classList.add('hidden');
  }
});

// ─── Google ログイン ──────────────────────────────────────────
loginBtn.addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error('Login error:', err);
    submitMsg.textContent = `ログインエラー: ${err.message}`;
  }
});

// ─── ログアウト ───────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

// ─── スコア送信 ───────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
  if (!currentUser) return;

  const score = parseInt(scoreInput.value, 10);
  const game  = gameSelect.value;

  if (isNaN(score) || score < 0) {
    submitMsg.textContent = '⚠️ 有効なスコアを入力してください';
    return;
  }

  submitBtn.disabled = true;
  submitMsg.textContent = '送信中...';

  try {
    await addDoc(collection(db, 'scores'), {
      uid:       currentUser.uid,
      name:      currentUser.displayName || currentUser.email,
      photoURL:  currentUser.photoURL || '',
      game:      game,
      score:     score,
      createdAt: serverTimestamp()
    });
    submitMsg.textContent = '✅ スコアを登録しました！';
    scoreInput.value = '';
  } catch (err) {
    console.error('Submit error:', err);
    submitMsg.textContent = `❌ 送信エラー: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

// ─── リアルタイムランキング取得（onSnapshot） ─────────────────
let unsubscribeRanking = null;

function subscribeRanking(gameFilter) {
  if (unsubscribeRanking) unsubscribeRanking(); // 前のリスナー解除

  let q;
  if (gameFilter === 'all') {
    q = query(
      collection(db, 'scores'),
      orderBy('score', 'desc'),
      limit(10)
    );
  } else {
    q = query(
      collection(db, 'scores'),
      where('game', '==', gameFilter),
      orderBy('score', 'desc'),
      limit(10)
    );
  }

  unsubscribeRanking = onSnapshot(q, (snapshot) => {
    rankingList.innerHTML = '';

    if (snapshot.empty) {
      rankingList.innerHTML = '<li class="empty">まだスコアがありません</li>';
      return;
    }

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      const li   = document.createElement('li');
      const rank = rankingList.children.length + 1;

      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      const gameLabel = {
        snake:        '🐍',
        tictactoe:    '❌⭕',
        'block-puzzle': '🧩'
      }[data.game] || '🎮';

      li.className = rank <= 3 ? `rank-item top-${rank}` : 'rank-item';
      li.innerHTML = `
        <span class="rank-medal">${medal}</span>
        <img class="rank-avatar" src="${data.photoURL || ''}" alt=""
             onerror="this.style.display='none'"
             ${data.photoURL ? '' : 'style="display:none"'}>
        <span class="rank-name">${escapeHtml(data.name)}</span>
        <span class="rank-game">${gameLabel}</span>
        <span class="rank-score">${data.score.toLocaleString()}</span>
      `;
      rankingList.appendChild(li);
    });
  }, (err) => {
    console.error('Ranking error:', err);
    rankingList.innerHTML = `<li class="empty">ランキング取得エラー: ${err.message}</li>`;
  });
}

// ─── フィルター変更 ───────────────────────────────────────────
filterGame.addEventListener('change', () => {
  subscribeRanking(filterGame.value);
});

// ─── XSS対策 ─────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── 初期ランキング読み込み ───────────────────────────────────
subscribeRanking('all');

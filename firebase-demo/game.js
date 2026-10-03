import { auth, db } from './firebase-config.js';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { formatScore, rankScores } from './score-utils.js';

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const filterGame = document.getElementById('filter-game');
const rankingList = document.getElementById('ranking-list');
const rankingStatus = document.getElementById('ranking-status');

onAuthStateChanged(auth, (user) => {
  if (user) {
    userAvatar.src = user.photoURL || '';
    userAvatar.style.display = user.photoURL ? 'inline-block' : 'none';
    userName.textContent = user.displayName || user.email || 'プレイヤー';
    userInfo.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    userInfo.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
  }
});

loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    console.error('Login error:', error);
    rankingStatus.textContent = `ログインエラー: ${error.message}`;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    rankingStatus.textContent = `ログアウトエラー: ${error.message}`;
  }
});

let unsubscribeRanking = null;

function subscribeRanking(game) {
  if (unsubscribeRanking) unsubscribeRanking();
  rankingList.replaceChildren();
  rankingList.innerHTML = '<li class="empty">読み込み中...</li>';

  const scoresQuery = query(
    collection(db, 'scores'),
    where('game', '==', game),
    orderBy('score', 'desc'),
    limit(10)
  );
  unsubscribeRanking = onSnapshot(scoresQuery, (snapshot) => {
    rankingList.replaceChildren();
    if (snapshot.empty) {
      rankingList.innerHTML = '<li class="empty">まだスコアがありません</li>';
      return;
    }

    const scores = rankScores(snapshot.docs.map((scoreDoc) => scoreDoc.data()));
    scores.forEach((score) => {
      const item = document.createElement('li');
      const rank = score.rank;
      item.className = rank <= 3 ? `rank-item top-${rank}` : 'rank-item';

      const medal = document.createElement('span');
      medal.className = 'rank-medal';
      medal.textContent = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      const name = document.createElement('span');
      name.className = 'rank-name';
      name.textContent = score.name || 'プレイヤー';
      const points = document.createElement('span');
      points.className = 'rank-score';
      points.textContent = formatScore(score.score);

      item.append(medal, name, points);
      rankingList.appendChild(item);
    });
  }, (error) => {
    console.error('Ranking error:', error);
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = `ランキング取得エラー: ${error.message}`;
    rankingList.replaceChildren(item);
  });
}

filterGame.addEventListener('change', () => subscribeRanking(filterGame.value));
subscribeRanking(filterGame.value);

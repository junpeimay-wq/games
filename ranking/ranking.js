import { db } from '../firebase-demo/firebase-config.js';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { formatScore, rankScores } from '../firebase-demo/score-utils.js';

const game = document.body.dataset.game;
const list = document.getElementById('ranking-list');
const error = document.getElementById('ranking-error');

const scoresQuery = query(
  collection(db, 'scores'),
  where('game', '==', game),
  orderBy('score', 'desc'),
  limit(100)
);

onSnapshot(scoresQuery, (snapshot) => {
  error.textContent = '';
  list.replaceChildren();
  if (snapshot.empty) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'まだスコアがありません';
    list.appendChild(empty);
    return;
  }

  const scores = rankScores(snapshot.docs.map((scoreDoc) => scoreDoc.data()));
  scores.forEach((score) => {
    const item = document.createElement('li');
    item.className = score.rank <= 3 ? `rank-item top-${score.rank}` : 'rank-item';

    const rank = document.createElement('span');
    rank.className = 'rank-number';
    rank.textContent = score.rank === 1 ? '🥇' : score.rank === 2 ? '🥈' : score.rank === 3 ? '🥉' : `${score.rank}.`;
    const player = document.createElement('span');
    player.className = 'player-name';
    player.textContent = score.name || 'プレイヤー';
    const points = document.createElement('span');
    points.className = 'points';
    points.textContent = formatScore(score.score);

    item.append(rank, player, points);
    list.appendChild(item);
  });
}, (reason) => {
  console.error('Ranking load error:', reason);
  error.textContent = `ランキングの読み込みに失敗しました: ${reason.message}`;
});

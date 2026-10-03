import { db } from '../firebase-demo/firebase-config.js';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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

  snapshot.forEach((scoreDoc, index) => {
    const score = scoreDoc.data();
    const item = document.createElement('li');
    item.className = index < 3 ? `rank-item top-${index + 1}` : 'rank-item';

    const rank = document.createElement('span');
    rank.className = 'rank-number';
    rank.textContent = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    const player = document.createElement('span');
    player.className = 'player-name';
    player.textContent = score.name || 'プレイヤー';
    const points = document.createElement('span');
    points.className = 'points';
    points.textContent = Number(score.score).toLocaleString();

    item.append(rank, player, points);
    list.appendChild(item);
  });
}, (reason) => {
  console.error('Ranking load error:', reason);
  error.textContent = `ランキングの読み込みに失敗しました: ${reason.message}`;
});

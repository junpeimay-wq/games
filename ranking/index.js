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

document.querySelectorAll('.game-ranking').forEach((section) => {
  const game = section.dataset.game;
  const list = section.querySelector('.ranking-list');
  const scoresQuery = query(
    collection(db, 'scores'),
    where('game', '==', game),
    orderBy('score', 'desc'),
    limit(3)
  );

  onSnapshot(scoresQuery, (snapshot) => {
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
      item.className = `rank-item top-${score.rank}`;

      const rank = document.createElement('span');
      rank.className = 'rank-number';
      rank.textContent = ['🥇', '🥈', '🥉'][score.rank - 1];
      const player = document.createElement('span');
      player.className = 'player-name';
      player.textContent = score.name || 'プレイヤー';
      const points = document.createElement('span');
      points.className = 'points';
      points.textContent = formatScore(score.score);

      item.append(rank, player, points);
      list.appendChild(item);
    });
  }, (error) => {
    console.error(`${game} ranking preview error:`, error);
    const errorMessage = document.getElementById('ranking-error');
    errorMessage.textContent = `ランキングの読み込みに失敗しました: ${error.message}`;
  });
});

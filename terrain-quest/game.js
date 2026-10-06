import {
  buildSymbolChoices,
  createEmptySymbolProgress,
  getMapSymbolByCode,
  getMasteredMapSymbols,
  getTotalSymbolScore,
  isSymbolProgressRecord,
  MAP_SYMBOL_CODES,
  MAP_ZOOM,
  QUIZ_SCORE_STORAGE_KEY,
  updateSymbolProgress
} from './game-logic.mjs';
import {
  loadMapSymbolCloudProgress,
  recordMapSymbolAnswer
} from '../firebase-demo/score-service.js';

const GSI_VECTOR_STYLE_URL = 'https://gsi-cyberjapan.github.io/optimal_bvmap/style/std.json';
const SYMBOL_HIT_LAYER_ID = 'terrain-quest-symbol-hit-area';
const mapElement = document.getElementById('symbol-map');
const locationMapPreview = document.getElementById('location-map-preview');
const gameMessage = document.getElementById('game-message');
const locateButton = document.getElementById('locate-button');
const returnToLocationButton = document.getElementById('return-to-location');
const locationStatus = document.getElementById('location-status');
const locationMapLink = document.getElementById('location-map-link');
const quizPanel = document.getElementById('quiz-panel');
const quizCount = document.getElementById('quiz-count');
const quizScore = document.getElementById('quiz-score');
const masteredSymbolsButton = document.getElementById('mastered-symbols-button');
const masteredSymbolsDialog = document.getElementById('mastered-symbols-dialog');
const masteredSymbolsCount = document.getElementById('mastered-symbols-count');
const masteredSymbolsList = document.getElementById('mastered-symbols-list');
const closeMasteredSymbolsButton = document.getElementById('close-mastered-symbols');
const quizRecord = document.getElementById('quiz-record');
const quizRecordStatus = document.getElementById('quiz-record-status');
const quizQuestion = document.getElementById('quiz-question');
const quizChoices = document.getElementById('quiz-choices');
const quizFeedback = document.getElementById('quiz-feedback');
const nextQuestionButton = document.getElementById('next-question');

let map = null;
let mapInitialization = null;
let localProgress = createEmptySymbolProgress();
let cloudProgress = null;
let cloudMode = false;
let currentScore = 0;
let selectedSymbol = null;
let currentLocationMarker = null;
let currentLocation = null;
let answered = false;
let answerSaving = false;
let answerCount = 0;
let scoreProgressReady;

function getKnownSymbolCount(symbols) {
  return Object.values(symbols).filter(progress => progress.mastered).length;
}

function renderScore() {
  quizScore.textContent = `累計 ${currentScore}点`;
  const symbols = cloudMode ? cloudProgress.symbols : localProgress.symbols;
  const knownSymbolCount = getKnownSymbolCount(symbols);
  quizRecord.textContent = `知っている記号 ${knownSymbolCount}種類`;
  masteredSymbolsButton.textContent = `正解した記号 ${knownSymbolCount}種`;
}

function renderMasteredSymbols() {
  const symbols = cloudMode ? cloudProgress.symbols : localProgress.symbols;
  const masteredSymbols = getMasteredMapSymbols(symbols);
  masteredSymbolsCount.textContent = `${masteredSymbols.length}種類`;
  masteredSymbolsList.replaceChildren();

  if (masteredSymbols.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'mastered-symbols-empty';
    emptyMessage.textContent = '正解した記号はまだありません。';
    masteredSymbolsList.append(emptyMessage);
    return;
  }

  for (const symbol of masteredSymbols) {
    const item = document.createElement('li');
    item.textContent = symbol.label;
    masteredSymbolsList.append(item);
  }
}

function loadLocalProgress() {
  let storedValue;
  try {
    storedValue = localStorage.getItem(QUIZ_SCORE_STORAGE_KEY);
  } catch (error) {
    console.error('Local map symbol progress could not be read:', error);
    quizRecordStatus.textContent = '端末内の学習記録を読み込めません。';
    return;
  }
  if (storedValue === null) {
    localProgress = createEmptySymbolProgress();
    renderScore();
    return;
  }
  try {
    const parsed = JSON.parse(storedValue);
    if (!isSymbolProgressRecord(parsed)) {
      quizRecordStatus.textContent = '端末内の学習記録を読み取れませんでした。';
      return;
    }
    localProgress = parsed;
    currentScore = getTotalSymbolScore(localProgress);
    renderScore();
  } catch (error) {
    console.error('Local map symbol progress is invalid:', error);
    quizRecordStatus.textContent = '端末内の学習記録を読み取れませんでした。';
  }
}

async function loadScoreProgress() {
  try {
    const progress = await loadMapSymbolCloudProgress();
    if (progress) {
      cloudProgress = progress;
      cloudMode = true;
      currentScore = progress.totalPoints;
      quizRecordStatus.textContent = 'Google認証済み：回答のたびに学習記録をFirestoreへ保存します。';
    } else {
      quizRecordStatus.textContent = 'Google認証なし：回答のたびにこの端末へ保存します。';
    }
  } catch (error) {
    console.error('Firestore map symbol progress could not be loaded:', error);
    quizRecordStatus.textContent = 'Firestoreを読み込めないため、この端末に記録します。';
  }
  renderScore();
}

function persistLocalAnswer(symbolId, isCorrect) {
  const result = updateSymbolProgress(localProgress, symbolId, isCorrect);
  localProgress = result.record;
  currentScore = result.totalPoints;
  try {
    localStorage.setItem(QUIZ_SCORE_STORAGE_KEY, JSON.stringify(localProgress));
    quizRecordStatus.textContent = 'スコアと学習記録をこの端末に保存しました。';
  } catch (error) {
    console.error('Local map symbol progress could not be saved:', error);
    quizRecordStatus.textContent = '端末内に保存できませんでした。今回の得点は画面に表示します。';
  }
  renderScore();
  return result;
}

function persistCloudAnswer(symbolId, result) {
  cloudProgress.symbols[symbolId] = {
    attempts: result.attempts,
    correctAnswers: result.correctAnswers,
    mastered: result.mastered
  };
  cloudProgress.totalPoints = result.totalPoints;
  currentScore = result.totalPoints;
  quizRecordStatus.textContent = '回答履歴をFirestoreに保存しました。得点がある場合は累計スコアも更新します。';
  renderScore();
  return {
    knownBefore: result.knownBefore,
    pointsAwarded: result.pointsAwarded
  };
}

function setLocationMapLink(latitude, longitude) {
  locationMapLink.href =
    `https://maps.gsi.go.jp/#${MAP_ZOOM}/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
  locationMapLink.hidden = false;
}

function returnToCurrentLocation() {
  if (!map || !currentLocation) return;
  map.flyTo({ center: [currentLocation.longitude, currentLocation.latitude] });
  gameMessage.textContent = '現在地に戻りました。地図上の記号を選んでください。';
}

function addSymbolHitLayer() {
  map.addLayer({
    id: SYMBOL_HIT_LAYER_ID,
    type: 'circle',
    source: 'v',
    'source-layer': 'Anno',
    filter: [
      'all',
      ['==', ['geometry-type'], 'Point'],
      ['in', ['get', 'vt_code'], ['literal', MAP_SYMBOL_CODES]]
    ],
    paint: {
      'circle-radius': 14,
      'circle-color': 'rgba(255, 223, 110, 0.01)',
      'circle-stroke-color': 'rgba(255, 223, 110, 0.01)',
      'circle-stroke-width': 2
    }
  });

  map.on('mousemove', event => {
    const features = map.queryRenderedFeatures(event.point, { layers: [SYMBOL_HIT_LAYER_ID] });
    map.getCanvas().style.cursor = features.length ? 'pointer' : '';
  });
  map.on('click', event => {
    const bounds = [
      [event.point.x - 14, event.point.y - 14],
      [event.point.x + 14, event.point.y + 14]
    ];
    const feature = map.queryRenderedFeatures(bounds, { layers: [SYMBOL_HIT_LAYER_ID] })
      .find(candidate => getMapSymbolByCode(candidate.properties?.vt_code));
    if (!feature) {
      gameMessage.textContent = '地図上の施設記号をタップしてください。';
      return;
    }

    const symbol = getMapSymbolByCode(feature.properties.vt_code);
    openSymbolQuestion(symbol, event.lngLat);
  });
}

async function initializeMap(latitude, longitude) {
  if (mapInitialization) {
    map.flyTo({ center: [longitude, latitude] });
    currentLocationMarker?.setLngLat([longitude, latitude]);
    return mapInitialization;
  }
  mapInitialization = (async () => {
    if (!window.maplibregl || !window.pmtiles) {
      throw new Error('地図ライブラリを読み込めませんでした。通信状態を確認してください。');
    }
    const styleResponse = await fetch(GSI_VECTOR_STYLE_URL, { mode: 'cors' });
    if (!styleResponse.ok) {
      throw new Error(`国土地理院の地図スタイル取得に失敗しました（HTTP ${styleResponse.status}）。`);
    }
    const style = await styleResponse.json();
    const protocol = new window.pmtiles.Protocol();
    window.maplibregl.addProtocol('pmtiles', protocol.tile);
    locationMapPreview.hidden = false;

    map = new window.maplibregl.Map({
      container: mapElement,
      style,
      center: [longitude, latitude],
      zoom: MAP_ZOOM - 1,
      attributionControl: true,
      minZoom: MAP_ZOOM - 1,
      maxZoom: MAP_ZOOM - 1,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false
    });
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();

    await new Promise((resolve, reject) => {
      map.once('load', () => {
        addSymbolHitLayer();
        const markerElement = document.createElement('span');
        markerElement.className = 'current-location-marker';
        markerElement.setAttribute('aria-label', '現在地');
        currentLocationMarker = new window.maplibregl.Marker({ element: markerElement })
          .setLngLat([longitude, latitude])
          .addTo(map);
        document.body.classList.add('map-ready');
        map.resize();
        resolve();
      });
      map.on('error', event => {
        console.error('GSI vector map resource error:', event.error);
      });
    });
  })();
  return mapInitialization;
}

function renderChoices(symbol) {
  quizChoices.replaceChildren();
  for (const choiceSymbol of buildSymbolChoices(symbol.id)) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'symbol-choice';
    choice.dataset.answer = choiceSymbol.id;
    choice.textContent = choiceSymbol.label;
    quizChoices.append(choice);
  }
}

function openSymbolQuestion(symbol, coordinate) {
  if (answerSaving) return;
  selectedSymbol = symbol;
  answered = false;
  quizPanel.hidden = false;
  quizQuestion.textContent = 'この記号は？';
  quizFeedback.textContent = '';
  nextQuestionButton.hidden = true;
  renderChoices(symbol);
  setLocationMapLink(coordinate.lat, coordinate.lng);
  gameMessage.textContent = '4つの答えから選んでください。';
}

async function answerQuiz(answerId) {
  if (answered || answerSaving || !selectedSymbol) return;
  answerSaving = true;
  answered = true;
  const symbol = selectedSymbol;
  await scoreProgressReady;
  quizRecordStatus.textContent = cloudMode
    ? 'Firestoreに保存中...'
    : '端末に保存中...';
  const isCorrect = answerId === symbol.id;
  quizChoices.querySelectorAll('button').forEach(button => {
    button.disabled = true;
    if (button.dataset.answer === symbol.id) button.classList.add('correct-choice');
    else if (button.dataset.answer === answerId) button.classList.add('wrong-choice');
  });

  let result;
  if (cloudMode) {
    try {
      const cloudResult = await recordMapSymbolAnswer(symbol.id, isCorrect);
      result = cloudResult
        ? persistCloudAnswer(symbol.id, cloudResult)
        : persistLocalAnswer(symbol.id, isCorrect);
    } catch (error) {
      console.error('Firestore map symbol answer could not be saved:', error);
      localProgress = {
        version: 1,
        symbols: { ...cloudProgress.symbols }
      };
      cloudMode = false;
      result = persistLocalAnswer(symbol.id, isCorrect);
      quizRecordStatus.textContent = 'Firestoreへの保存に失敗したため、この回答は端末内に保存しました。';
    }
  } else {
    result = persistLocalAnswer(symbol.id, isCorrect);
  }

  answerCount += 1;
  quizScore.textContent = `累計 ${currentScore}点`;
  const resultText = isCorrect
    ? `+${result.pointsAwarded}点`
    : `答え：${symbol.label}`;
  quizFeedback.textContent = isCorrect
    ? `正解！${resultText}`
    : `不正解。${resultText}`;
  quizCount.textContent = `${answerCount}問回答`;
  gameMessage.textContent = isCorrect ? '正解です。' : `正解は${symbol.label}です。`;
  nextQuestionButton.textContent = '地図から次の記号を選ぶ';
  nextQuestionButton.hidden = false;
  answerSaving = false;
}

function startLocationLookup() {
  if (!navigator.geolocation) {
    locationStatus.textContent = 'このブラウザーは位置情報に対応していません。';
    locationStatus.classList.add('is-error');
    return;
  }

  locateButton.disabled = true;
  locationStatus.classList.remove('is-error');
  locationMapLink.hidden = true;
  quizPanel.hidden = true;
  gameMessage.textContent = '現在地を取得しています。';
  locationStatus.textContent = '位置情報を取得中...';

  navigator.geolocation.getCurrentPosition(
    async position => {
      const { latitude, longitude, accuracy } = position.coords;
      currentLocation = { latitude, longitude };
      locationStatus.textContent = `精度 約${Math.round(accuracy)}m`;
      setLocationMapLink(latitude, longitude);
      try {
        await initializeMap(latitude, longitude);
        locateButton.textContent = '現在地を更新';
        returnToLocationButton.hidden = false;
        gameMessage.textContent = '地図上の記号を選んでください。';
      } catch (error) {
        console.error('GSI vector map loading failed:', error);
        locationStatus.textContent = `地図を表示できませんでした: ${error.message}`;
        locationStatus.classList.add('is-error');
        gameMessage.textContent = '地図を読み込めませんでした。時間をおいて再度お試しください。';
        locationMapPreview.hidden = true;
        mapInitialization = null;
      } finally {
        locateButton.disabled = false;
      }
    },
    error => {
      const messages = {
        1: '位置情報が許可されませんでした。ブラウザーのサイト設定を確認してください。',
        2: '現在地を取得できませんでした。電波状況や端末の位置情報設定を確認してください。',
        3: '位置情報の取得がタイムアウトしました。時間をおいてもう一度お試しください。'
      };
      locationStatus.textContent = messages[error.code]
        ?? '位置情報を取得できませんでした。時間をおいてもう一度お試しください。';
      locationStatus.classList.add('is-error');
      gameMessage.textContent = '位置情報を取得できませんでした。';
      locateButton.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

locateButton.addEventListener('click', startLocationLookup);
returnToLocationButton.addEventListener('click', returnToCurrentLocation);
masteredSymbolsButton.addEventListener('click', () => {
  renderMasteredSymbols();
  masteredSymbolsDialog.showModal();
});
closeMasteredSymbolsButton.addEventListener('click', () => masteredSymbolsDialog.close());
quizChoices.addEventListener('click', event => {
  const choice = event.target.closest('button[data-answer]');
  if (choice) void answerQuiz(choice.dataset.answer);
});
nextQuestionButton.addEventListener('click', () => {
  quizPanel.hidden = true;
  selectedSymbol = null;
  gameMessage.textContent = '地図上の別の地図記号をタップしてください。';
});

loadLocalProgress();
scoreProgressReady = loadScoreProgress();

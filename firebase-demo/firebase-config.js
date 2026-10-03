// ============================================================
// firebase-config.js
// Firebase の初期化設定ファイル
// ここに Firebase Console から取得した設定値を貼り付けてください
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ⚠️ Firebase Console > プロジェクト設定 > マイアプリ > SDK の設定と構成 から取得
const firebaseConfig = {
  apiKey:            "AIzaSyCUqG-6e544ZPrwzgdHtq0g0GbI3nGa6Ow",
  authDomain:        "junpeimay-games.firebaseapp.com",
  projectId:         "junpeimay-games",
  storageBucket:     "junpeimay-games.firebasestorage.app",
  messagingSenderId: "562804706409",
  appId:             "1:562804706409:web:8147bca9901e2e51a1e6f8"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

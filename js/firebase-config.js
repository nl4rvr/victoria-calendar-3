// ============================================
//  FIREBASE — Victoria Calendar
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyD7vrh0Pi8xY08CCq2ZmKPDM3NdYfB27_o",
  authDomain: "victoria-calendar-947d4.firebaseapp.com",
  projectId: "victoria-calendar-947d4",
  storageBucket: "victoria-calendar-947d4.firebasestorage.app",
  messagingSenderId: "277650954776",
  appId: "1:277650954776:web:9eee2fa1750d948ac5816d",
  measurementId: "G-YBVLZEE93C"
};

// Локальный fallback выключен — работаем только через Firebase
const USE_LOCAL_FALLBACK = false;

// Фиксированные пользователи
const KNOWN_USERS = {
  "vika1@vika.com": { role: "girl", name: "Вика" },
  "kostya@kostya.com": { role: "admin", name: "Кисунчик" }
};

if (typeof window !== "undefined") {
  window.firebaseConfig = firebaseConfig;
  window.USE_LOCAL_FALLBACK = USE_LOCAL_FALLBACK;
  window.KNOWN_USERS = KNOWN_USERS;
}

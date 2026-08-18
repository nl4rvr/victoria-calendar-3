// ============================================
//  КИСУНЧИК — Трекер цикла
// ============================================

let currentUser = null;
let isAdmin = false;
let targetUserId = null; // для админа — id девушки
let cycleData = null;
let currentView = 'home';
let calendarYear, calendarMonth;
let selectedLogDate = null;
let adviceCache = null;

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', async () => {
  registerSW();
  setupTheme();
  setupReminder();
  initCalendarDate();

  if (window.USE_LOCAL_FALLBACK) {
    console.log('Используется локальный режим (localStorage)');
    initLocalMode();
  } else {
    await initFirebase();
  }
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    const swPath = (location.pathname.includes('/victoria-calendar-3') ? '/victoria-calendar-3' : '') + '/sw.js';
    navigator.serviceWorker.register(swPath).catch(console.warn);
  }
}

function setupTheme() {
  const saved = localStorage.getItem('kisunchik-theme') || 'black';
  document.documentElement.setAttribute('data-theme', saved === 'purple' ? 'purple' : '');
  updateThemeBtn(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'purple' ? 'black' : 'purple';
  document.documentElement.setAttribute('data-theme', next === 'purple' ? 'purple' : '');
  localStorage.setItem('kisunchik-theme', next);
  updateThemeBtn(next);
}

function updateThemeBtn(theme) {
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = theme === 'purple' ? '⬛' : '💜';
}

function setupReminder() {
  // Запрос разрешения на уведомления
  if ('Notification' in window && Notification.permission === 'default') {
    // Попросим позже, после входа
  }

  // Проверка каждый час, показывать в 20:00
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 20 && now.getMinutes() === 0) {
      showLocalReminder();
    }
  }, 60000);

  // Также при открытии, если после 20:00 и не отмечали сегодня
  checkMissedReminder();
}

function showLocalReminder() {
  if (Notification.permission === 'granted') {
    new Notification('Кисунчик 💜', {
      body: 'Время заглянуть в дневник цикла 🌸 Не забудь отметить самочувствие!',
      icon: '/icons/icon-192.png',
      tag: 'daily-cycle'
    });
  }
  showToast('Напоминание: отметь сегодняшний день 🌸');
}

function checkMissedReminder() {
  const last = localStorage.getItem('lastReminderCheck');
  const today = toISODate(new Date());
  if (last !== today && new Date().getHours() >= 20) {
    // можно показать мягкое напоминание
  }
  localStorage.setItem('lastReminderCheck', today);
}

function initCalendarDate() {
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();
}

// --- Локальный режим (без Firebase) ---
function initLocalMode() {
  const savedUser = localStorage.getItem('kisunchik-user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    isAdmin = currentUser.role === 'admin';
    targetUserId = isAdmin ? (localStorage.getItem('kisunchik-girl-id') || currentUser.uid) : currentUser.uid;
    showApp();
  } else {
    showAuth();
  }
}

function localLogin(email, password, role) {
  // Простая локальная "авторизация" для 2 пользователей
  const users = JSON.parse(localStorage.getItem('kisunchik-users') || '{}');
  let user = Object.values(users).find(u => u.email === email);

  if (!user) {
    // Регистрация
    const uid = 'local_' + Date.now();
    user = { uid, email, role, name: role === 'admin' ? 'Кисунчик' : 'Девушка' };
    users[uid] = user;
    localStorage.setItem('kisunchik-users', JSON.stringify(users));

    if (role === 'admin') {
      // Создаём заготовку для девушки
      localStorage.setItem('kisunchik-girl-id', uid); // временно, потом поменяем
    }
  }

  currentUser = user;
  isAdmin = user.role === 'admin';
  targetUserId = isAdmin ? (localStorage.getItem('kisunchik-girl-id') || user.uid) : user.uid;
  localStorage.setItem('kisunchik-user', JSON.stringify(user));
  showApp();
}

// --- Firebase (если настроен) ---
async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, setDoc, getDoc, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const app = initializeApp(window.firebaseConfig);
    window.auth = getAuth(app);
    window.db = getFirestore(app);
    window.firebaseModules = { doc, setDoc, getDoc, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };

    onAuthStateChanged(window.auth, async (user) => {
      if (user) {
        const email = (user.email || '').toLowerCase();
        const known = (window.KNOWN_USERS || {})[email];

        // Берём/создаём документ пользователя
        const userRef = doc(window.db, 'users', user.uid);
        let userDoc = await getDoc(userRef);
        let data;

        if (userDoc.exists()) {
          data = userDoc.data();
          // На всякий случай синхронизируем роль из KNOWN_USERS
          if (known && data.role !== known.role) {
            data.role = known.role;
            data.name = known.name;
            await setDoc(userRef, { role: known.role, name: known.name }, { merge: true });
          }
        } else {
          data = {
            email,
            role: known ? known.role : 'girl',
            name: known ? known.name : 'Пользователь',
            createdAt: new Date().toISOString()
          };
          await setDoc(userRef, data);
        }

        currentUser = { uid: user.uid, email, ...data };
        isAdmin = currentUser.role === 'admin';

        if (isAdmin) {
          targetUserId = await getGirlId();
        } else {
          targetUserId = user.uid;
          // Сохраняем uid девушки, чтобы админ мог его найти
          localStorage.setItem('kisunchik-girl-uid', user.uid);
        }

        showApp();
      } else {
        showAuth();
      }
    });
  } catch (e) {
    console.error('Firebase init error', e);
    showToast('Ошибка Firebase: ' + e.message);
    showAuth();
  }
}

async function getGirlId() {
  // 1) Пробуем найти по email vika1@vika.com в коллекции users
  try {
    const { collection, query, where, getDocs } = window.firebaseModules;
    const q = query(collection(window.db, 'users'), where('email', '==', 'vika1@vika.com'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const uid = snap.docs[0].id;
      localStorage.setItem('kisunchik-girl-uid', uid);
      return uid;
    }
  } catch (e) {
    console.warn('Не удалось найти девушку по email', e);
  }

  // 2) Fallback — то, что сохранила сама девушка при входе
  const saved = localStorage.getItem('kisunchik-girl-uid');
  if (saved) return saved;

  // 3) Если девушка ещё ни разу не входила — смотрим на свои данные (пусто)
  return currentUser?.uid || null;
}

// --- Auth UI ---
function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  if (isAdmin) {
    document.getElementById('adminBadge').style.display = 'inline';
    document.getElementById('userLabel').textContent = 'Кисунчик';
  } else {
    document.getElementById('adminBadge').style.display = 'none';
    document.getElementById('userLabel').textContent = currentUser.name || 'Вика';
  }

  if (Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 2000);
  }

  loadCycleSettings();
  loadHome();
  switchView('home');
}

function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;

  if (!email || !password) {
    showToast('Заполни email и пароль');
    return;
  }

  // Только два разрешённых email
  const known = (window.KNOWN_USERS || {})[email];
  if (!known) {
    showToast('Доступ только для vika1@vika.com и kostya@kostya.com');
    return;
  }

  if (window.USE_LOCAL_FALLBACK || !window.auth) {
    localLogin(email, password, known.role);
    return;
  }

  const { signInWithEmailAndPassword, createUserWithEmailAndPassword, setDoc, doc } = window.firebaseModules;

  signInWithEmailAndPassword(window.auth, email, password)
    .then(async (cred) => {
      // Обновляем профиль на всякий случай
      await setDoc(doc(window.db, 'users', cred.user.uid), {
        email,
        role: known.role,
        name: known.name,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    })
    .catch(async (err) => {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        // Пробуем зарегистрировать (первый вход)
        try {
          const cred = await createUserWithEmailAndPassword(window.auth, email, password);
          await setDoc(doc(window.db, 'users', cred.user.uid), {
            email,
            role: known.role,
            name: known.name,
            createdAt: new Date().toISOString()
          });
          showToast('Аккаунт создан 💜');
        } catch (e2) {
          if (e2.code === 'auth/email-already-in-use') {
            showToast('Неверный пароль');
          } else {
            showToast('Ошибка: ' + e2.message);
          }
        }
      } else {
        showToast('Ошибка входа: ' + err.message);
      }
    });
}

function selectRole(btn) {
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function logout() {
  if (window.auth && window.firebaseModules) {
    window.firebaseModules.signOut(window.auth);
  }
  localStorage.removeItem('kisunchik-user');
  currentUser = null;
  showAuth();
}

// --- Данные цикла ---
async function loadCycleSettings() {
  let settings = null;

  if (!targetUserId) {
    cycleData = calculateCycle(null);
    cycleData.settings = { cycleLength: 28, periodLength: 5 };
    renderPhaseCard();
    renderAdvice();
    return;
  }

  if (window.USE_LOCAL_FALLBACK || !window.db) {
    settings = JSON.parse(localStorage.getItem(`cycle_${targetUserId}`) || 'null');
  } else {
    const snap = await window.firebaseModules.getDoc(window.firebaseModules.doc(window.db, 'cycles', targetUserId));
    settings = snap.exists() ? snap.data() : null;
  }

  if (settings) {
    cycleData = calculateCycle(settings.lastPeriodStart, settings.cycleLength || 28, settings.periodLength || 5);
    cycleData.settings = settings;
  } else {
    cycleData = calculateCycle(null);
    cycleData.settings = { cycleLength: 28, periodLength: 5 };
  }

  renderPhaseCard();
  renderAdvice();
}

async function saveCycleSettings(lastPeriodStart, cycleLength, periodLength) {
  const data = {
    lastPeriodStart,
    cycleLength: cycleLength || 28,
    periodLength: periodLength || 5,
    updatedAt: new Date().toISOString()
  };

  if (window.USE_LOCAL_FALLBACK || !window.db) {
    localStorage.setItem(`cycle_${targetUserId}`, JSON.stringify(data));
  } else {
    await window.firebaseModules.setDoc(window.firebaseModules.doc(window.db, 'cycles', targetUserId), data, { merge: true });
  }

  cycleData = calculateCycle(lastPeriodStart, data.cycleLength, data.periodLength);
  cycleData.settings = data;
  renderPhaseCard();
  renderAdvice();
  renderCalendar();
  showToast('Настройки цикла сохранены 💜');
}

function renderPhaseCard() {
  const card = document.getElementById('phaseCard');
  if (!cycleData || !cycleData.day) {
    card.innerHTML = `
      <span class="phase-emoji">❓</span>
      <div class="phase-name">Настрой цикл</div>
      <div class="phase-day">Укажи дату начала последних месячных</div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="openSettingsModal()">Настроить</button>
    `;
    return;
  }

  card.innerHTML = `
    <span class="phase-emoji">${cycleData.emoji}</span>
    <div class="phase-name">${cycleData.phaseName}</div>
    <div class="phase-day">День ${cycleData.day} из ${cycleData.cycleLength}</div>
    <div class="phase-progress"><div class="phase-progress-bar" style="width:${cycleData.progress}%"></div></div>
    <div class="cycle-info">
      <span>📅 до месячных: ${cycleData.daysUntilPeriod} дн.</span>
      ${cycleData.isFertile ? '<span>🌸 фертильное окно</span>' : ''}
    </div>
  `;
}

function renderAdvice() {
  if (!cycleData || !cycleData.phase || cycleData.phase === 'unknown') {
    document.getElementById('adviceContent').innerHTML = '<p style="color:var(--text-secondary)">Настрой цикл, чтобы получать советы</p>';
    return;
  }

  adviceCache = getAdviceForPhase(cycleData.phase);
  showAdviceTab('plans');
}

function showAdviceTab(tab) {
  document.querySelectorAll('.advice-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.advice-tab[data-tab="${tab}"]`)?.classList.add('active');

  const titles = { plans: '📋 Планы на день', advice: '💡 Совет', cheer: '💜 Подбадривание' };
  const content = adviceCache ? adviceCache[tab] : '';

  document.getElementById('adviceContent').innerHTML = `
    <h3>${titles[tab]}</h3>
    <p>${content}</p>
  `;
}

// --- Логи (симптомы, выделения, секс и т.д.) ---
const SYMPTOMS = ['🤕 Головная боль', '😣 Спазмы', '😫 Усталость', '😤 Раздражительность', '😢 Грусть', '😰 Тревога', '🤢 Тошнота', '🔥 Приливы', '💤 Сонливость', '💪 Энергия', '😊 Хорошее настроение'];
const DISCHARGES = ['💧 Скудные', '💦 Умеренные', '🌊 Обильные', '🥚 Белок яйца', '🥛 Молочные', '🟤 Коричневые', '🔴 Кровянистые', '✨ Прозрачные'];
const SEX = ['❤️ Был', '🤍 Не было', '🛡️ С защитой', '💕 Без защиты'];
const MOOD = ['😊 Отлично', '🙂 Норм', '😐 Так себе', '😔 Плохо', '😭 Ужасно'];
const OTHER = ['💊 Таблетки', '🏃 Спорт', '🍷 Алкоголь', '😴 Плохой сон', '🍎 Хорошее питание'];

function openLogModal(dateStr) {
  selectedLogDate = dateStr || toISODate(new Date());
  document.getElementById('logModalDate').textContent = formatDate(selectedLogDate);
  document.getElementById('logModal').classList.add('open');

  // Сброс
  document.querySelectorAll('#logModal .chip').forEach(c => c.classList.remove('active'));
  document.getElementById('logNote').value = '';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function toggleChip(el) {
  el.classList.toggle('active');
}

async function saveLog() {
  const symptoms = [...document.querySelectorAll('#symptomsChips .chip.active')].map(c => c.dataset.val);
  const discharges = [...document.querySelectorAll('#dischargesChips .chip.active')].map(c => c.dataset.val);
  const sex = [...document.querySelectorAll('#sexChips .chip.active')].map(c => c.dataset.val);
  const mood = [...document.querySelectorAll('#moodChips .chip.active')].map(c => c.dataset.val);
  const other = [...document.querySelectorAll('#otherChips .chip.active')].map(c => c.dataset.val);
  const note = document.getElementById('logNote').value.trim();

  if (!symptoms.length && !discharges.length && !sex.length && !mood.length && !other.length && !note) {
    showToast('Выбери хотя бы что-то');
    return;
  }

  const log = {
    userId: targetUserId,
    date: selectedLogDate,
    symptoms,
    discharges,
    sex,
    mood,
    other,
    note,
    createdAt: new Date().toISOString(),
    createdBy: currentUser.uid
  };

  if (window.USE_LOCAL_FALLBACK || !window.db) {
    const logs = JSON.parse(localStorage.getItem(`logs_${targetUserId}`) || '[]');
    log.id = 'local_' + Date.now();
    logs.push(log);
    localStorage.setItem(`logs_${targetUserId}`, JSON.stringify(logs));
  } else {
    await window.firebaseModules.addDoc(window.firebaseModules.collection(window.db, 'logs'), log);
  }

  closeModal('logModal');
  showToast('Запись сохранена 💜');
  if (currentView === 'logs') loadLogs();
  if (currentView === 'home') renderCalendar();
}

async function loadLogs() {
  const list = document.getElementById('logsList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  let logs = [];
  if (window.USE_LOCAL_FALLBACK || !window.db) {
    logs = JSON.parse(localStorage.getItem(`logs_${targetUserId}`) || '[]');
  } else {
    const q = window.firebaseModules.query(
      window.firebaseModules.collection(window.db, 'logs'),
      window.firebaseModules.where('userId', '==', targetUserId)
    );
    const snap = await window.firebaseModules.getDocs(q);
    logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  logs.sort((a, b) => b.date.localeCompare(a.date));

  if (!logs.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="emoji">📝</span>
        <p>Пока нет записей</p>
        <p style="font-size:0.85rem;margin-top:8px">Нажми «+ Запись» чтобы добавить</p>
      </div>`;
    return;
  }

  list.innerHTML = logs.map(log => `
    <div class="log-item glass-sm">
      <div class="log-item-content">
        <div class="log-item-date">${formatDate(log.date)}</div>
        <div class="log-item-tags">
          ${(log.symptoms || []).map(s => `<span class="tag">${s}</span>`).join('')}
          ${(log.discharges || []).map(s => `<span class="tag">${s}</span>`).join('')}
          ${(log.sex || []).map(s => `<span class="tag">${s}</span>`).join('')}
          ${(log.mood || []).map(s => `<span class="tag">${s}</span>`).join('')}
          ${(log.other || []).map(s => `<span class="tag">${s}</span>`).join('')}
        </div>
        ${log.note ? `<p style="font-size:0.85rem;margin-top:8px;color:var(--text-secondary)">${escapeHtml(log.note)}</p>` : ''}
      </div>
      <button class="delete-btn" onclick="deleteLog('${log.id}')" title="Удалить">🗑️</button>
    </div>
  `).join('');
}

async function deleteLog(id) {
  if (!confirm('Удалить эту запись?')) return;

  if (window.USE_LOCAL_FALLBACK || !window.db) {
    let logs = JSON.parse(localStorage.getItem(`logs_${targetUserId}`) || '[]');
    logs = logs.filter(l => l.id !== id);
    localStorage.setItem(`logs_${targetUserId}`, JSON.stringify(logs));
  } else {
    await window.firebaseModules.deleteDoc(window.firebaseModules.doc(window.db, 'logs', id));
  }

  showToast('Запись удалена');
  loadLogs();
}

// --- Мигрени ---
function openMigraineModal(dateStr) {
  selectedLogDate = dateStr || toISODate(new Date());
  document.getElementById('migModalDate').textContent = formatDate(selectedLogDate);
  document.getElementById('migraineModal').classList.add('open');

  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active-yes', 'active-no'));
  document.querySelectorAll('#medsChips .chip').forEach(c => c.classList.remove('active'));
  document.getElementById('migOtherMed').value = '';
  document.getElementById('migNote').value = '';
  document.getElementById('otherMedGroup').style.display = 'none';
}

function setMigStatus(btn, status) {
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active-yes', 'active-no'));
  btn.classList.add(status === 'yes' ? 'active-yes' : 'active-no');
  btn.dataset.status = status;
}

function toggleMed(el) {
  el.classList.toggle('active');
  const hasOther = [...document.querySelectorAll('#medsChips .chip.active')].some(c => c.dataset.val === 'other');
  document.getElementById('otherMedGroup').style.display = hasOther ? 'block' : 'none';
}

async function saveMigraine() {
  const statusBtn = document.querySelector('.status-btn.active-yes, .status-btn.active-no');
  if (!statusBtn) {
    showToast('Укажи, болела ли голова');
    return;
  }

  const hadPain = statusBtn.dataset.status === 'yes';
  const meds = [...document.querySelectorAll('#medsChips .chip.active')].map(c => c.dataset.val);
  const otherMed = document.getElementById('migOtherMed').value.trim();
  const note = document.getElementById('migNote').value.trim();

  const entry = {
    userId: targetUserId,
    date: selectedLogDate,
    hadPain,
    meds,
    otherMed: otherMed || null,
    note,
    createdAt: new Date().toISOString(),
    createdBy: currentUser.uid
  };

  if (window.USE_LOCAL_FALLBACK || !window.db) {
    const list = JSON.parse(localStorage.getItem(`migraines_${targetUserId}`) || '[]');
    entry.id = 'local_' + Date.now();
    list.push(entry);
    localStorage.setItem(`migraines_${targetUserId}`, JSON.stringify(list));
  } else {
    await window.firebaseModules.addDoc(window.firebaseModules.collection(window.db, 'migraines'), entry);
  }

  closeModal('migraineModal');
  showToast('Запись о мигрени сохранена');
  if (currentView === 'migraine') loadMigraines();
}

async function loadMigraines() {
  const list = document.getElementById('migraineList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  let items = [];
  if (window.USE_LOCAL_FALLBACK || !window.db) {
    items = JSON.parse(localStorage.getItem(`migraines_${targetUserId}`) || '[]');
  } else {
    const q = window.firebaseModules.query(
      window.firebaseModules.collection(window.db, 'migraines'),
      window.firebaseModules.where('userId', '==', targetUserId)
    );
    const snap = await window.firebaseModules.getDocs(q);
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🤕</span>
        <p>Пока нет записей о мигренях</p>
      </div>`;
    return;
  }

  const medLabels = {
    nurofen: 'Нурофен',
    eskenza1: 'Эскенза 1 пшик',
    eskenza2: 'Эскенза 2 пшика',
    other: 'Другое'
  };

  list.innerHTML = items.map(m => `
    <div class="log-item glass-sm">
      <div class="log-item-content">
        <div class="log-item-date">${formatDate(m.date)}</div>
        <div style="margin:6px 0">
          ${m.hadPain ? '<span class="tag" style="background:rgba(239,68,68,0.2);color:#fca5a5">🤕 Болела</span>' : '<span class="tag" style="background:rgba(34,197,94,0.2);color:#86efac">✅ Не болела</span>'}
        </div>
        <div class="log-item-tags">
          ${(m.meds || []).map(med => `<span class="tag">${medLabels[med] || med}${med === 'other' && m.otherMed ? ': ' + escapeHtml(m.otherMed) : ''}</span>`).join('')}
        </div>
        ${m.note ? `<p style="font-size:0.85rem;margin-top:8px;color:var(--text-secondary)">${escapeHtml(m.note)}</p>` : ''}
      </div>
      <button class="delete-btn" onclick="deleteMigraine('${m.id}')">🗑️</button>
    </div>
  `).join('');
}

async function deleteMigraine(id) {
  if (!confirm('Удалить запись?')) return;

  if (window.USE_LOCAL_FALLBACK || !window.db) {
    let list = JSON.parse(localStorage.getItem(`migraines_${targetUserId}`) || '[]');
    list = list.filter(l => l.id !== id);
    localStorage.setItem(`migraines_${targetUserId}`, JSON.stringify(list));
  } else {
    await window.firebaseModules.deleteDoc(window.firebaseModules.doc(window.db, 'migraines', id));
  }

  showToast('Удалено');
  loadMigraines();
}

// --- Календарь ---
function renderCalendar() {
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const title = `${monthNames[calendarMonth]} ${calendarYear}`;
  const titleEl = document.getElementById('calTitle');
  const titleEl2 = document.getElementById('calTitle2');
  if (titleEl) titleEl.textContent = title;
  if (titleEl2) titleEl2.textContent = title;

  const settings = cycleData?.settings || {};
  const days = getCalendarDays(calendarYear, calendarMonth, settings.lastPeriodStart, settings.cycleLength || 28, settings.periodLength || 5);
  const todayStr = toISODate(new Date());

  let logDates = new Set();
  try {
    const logs = JSON.parse(localStorage.getItem(`logs_${targetUserId}`) || '[]');
    logs.forEach(l => logDates.add(l.date));
  } catch {}

  const html = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="cal-day-name">${d}</div>`).join('') +
    days.map(d => {
      const dateStr = toISODate(d.date);
      let cls = 'cal-day';
      if (d.otherMonth) cls += ' other-month';
      if (dateStr === todayStr) cls += ' today';
      if (d.isPeriod) cls += ' period';
      else if (d.isOvulation) cls += ' ovulation';
      else if (d.isFertile) cls += ' fertile';
      if (logDates.has(dateStr)) cls += ' has-log';
      return `<button class="${cls}" onclick="onDayClick('${dateStr}')">${d.day}</button>`;
    }).join('');

  const grid = document.getElementById('calGrid');
  const grid2 = document.getElementById('calGrid2');
  if (grid) grid.innerHTML = html;
  if (grid2) grid2.innerHTML = html;
}

function onDayClick(dateStr) {
  openLogModal(dateStr);
}

function changeMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
}

// --- Настройки ---
function openSettingsModal() {
  const s = cycleData?.settings || {};
  document.getElementById('setLastPeriod').value = s.lastPeriodStart || '';
  document.getElementById('setCycleLen').value = s.cycleLength || 28;
  document.getElementById('setPeriodLen').value = s.periodLength || 5;
  document.getElementById('settingsModal').classList.add('open');
}

function saveSettings(e) {
  e.preventDefault();
  const last = document.getElementById('setLastPeriod').value;
  const cycleLen = parseInt(document.getElementById('setCycleLen').value) || 28;
  const periodLen = parseInt(document.getElementById('setPeriodLen').value) || 5;

  if (!last) {
    showToast('Укажи дату начала месячных');
    return;
  }

  saveCycleSettings(last, cycleLen, periodLen);
  closeModal('settingsModal');
}

// --- Навигация ---
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view)?.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');

  if (view === 'home') {
    loadHome();
  } else if (view === 'logs') {
    loadLogs();
  } else if (view === 'migraine') {
    loadMigraines();
  } else if (view === 'calendar') {
    renderCalendar();
  }
}

function loadHome() {
  renderPhaseCard();
  renderAdvice();
  renderCalendar();
}

// --- Утилиты ---
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Глобальные для onclick
window.handleAuth = handleAuth;
window.selectRole = selectRole;
window.logout = logout;
window.toggleTheme = toggleTheme;
window.switchView = switchView;
window.openLogModal = openLogModal;
window.openMigraineModal = openMigraineModal;
window.openSettingsModal = openSettingsModal;
window.closeModal = closeModal;
window.toggleChip = toggleChip;
window.saveLog = saveLog;
window.deleteLog = deleteLog;
window.setMigStatus = setMigStatus;
window.toggleMed = toggleMed;
window.saveMigraine = saveMigraine;
window.deleteMigraine = deleteMigraine;
window.saveSettings = saveSettings;
window.changeMonth = changeMonth;
window.onDayClick = onDayClick;
window.showAdviceTab = showAdviceTab;

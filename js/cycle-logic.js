// Логика расчёта фазы цикла (с прогнозом вперёд и ручными правками месячных)

const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_PERIOD_LENGTH = 5;

/** Локальная дата YYYY-MM-DD без сдвига UTC */
function toISODate(date) {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(str) {
  if (!str) return null;
  if (str instanceof Date) {
    const d = new Date(str);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const parts = String(str).slice(0, 10).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  const ms = parseLocalDate(b) - parseLocalDate(a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * settings:
 *  - lastPeriodStart: YYYY-MM-DD
 *  - cycleLength: number
 *  - periodLength: number (дефолтная длина)
 *  - periodOverrides: { 'YYYY-MM-DD': true|false }
 *      true  = день месячных (даже если не по прогнозу)
 *      false = НЕ месячные (убрали раньше)
 */
function calculateCycle(settingsOrStart, cycleLength, periodLength) {
  let settings;
  if (settingsOrStart && typeof settingsOrStart === 'object' && !(settingsOrStart instanceof Date)) {
    settings = settingsOrStart;
  } else {
    settings = {
      lastPeriodStart: settingsOrStart,
      cycleLength: cycleLength || DEFAULT_CYCLE_LENGTH,
      periodLength: periodLength || DEFAULT_PERIOD_LENGTH,
      periodOverrides: {}
    };
  }

  const lastStart = settings.lastPeriodStart;
  const cl = settings.cycleLength || DEFAULT_CYCLE_LENGTH;
  const pl = settings.periodLength || DEFAULT_PERIOD_LENGTH;
  const overrides = settings.periodOverrides || {};

  if (!lastStart) {
    return {
      day: null,
      phase: 'unknown',
      phaseName: 'Нет данных',
      emoji: '❓',
      progress: 0,
      daysUntilPeriod: null,
      isPeriod: false,
      isFertile: false,
      isOvulation: false,
      cycleLength: cl,
      periodLength: pl
    };
  }

  const today = parseLocalDate(new Date());
  const start = parseLocalDate(lastStart);
  const diffDays = daysBetween(start, today);
  // Прогноз вперёд: день цикла 1..cl, повторяется
  const dayInCycle = ((diffDays % cl) + cl) % cl + 1;

  const ovulationDay = Math.max(1, cl - 14);
  const fertileStart = Math.max(1, ovulationDay - 5);
  const fertileEnd = Math.min(cl, ovulationDay + 1);

  const todayStr = toISODate(today);
  const override = overrides[todayStr];
  let isPeriod;
  if (override === true) isPeriod = true;
  else if (override === false) isPeriod = false;
  else isPeriod = dayInCycle <= pl;

  let phase, phaseName, emoji;
  if (isPeriod) {
    phase = 'menstrual';
    phaseName = 'Менструация';
    emoji = '🩸';
  } else if (dayInCycle < fertileStart) {
    phase = 'follicular';
    phaseName = 'Фолликулярная фаза';
    emoji = '🌱';
  } else if (dayInCycle >= fertileStart && dayInCycle <= fertileEnd) {
    if (dayInCycle === ovulationDay) {
      phase = 'ovulation';
      phaseName = 'Овуляция';
      emoji = '✨';
    } else {
      phase = 'ovulation';
      phaseName = 'Фертильное окно';
      emoji = '🌸';
    }
  } else {
    phase = 'luteal';
    phaseName = 'Лютеиновая фаза';
    emoji = '🌙';
  }

  const progress = Math.min(100, Math.round((dayInCycle / cl) * 100));
  let daysUntilPeriod = cl - dayInCycle + 1;
  if (isPeriod) daysUntilPeriod = 0;

  return {
    day: dayInCycle,
    phase,
    phaseName,
    emoji,
    progress,
    daysUntilPeriod,
    isPeriod,
    isFertile: !isPeriod && dayInCycle >= fertileStart && dayInCycle <= fertileEnd,
    isOvulation: !isPeriod && dayInCycle === ovulationDay,
    cycleLength: cl,
    periodLength: pl,
    ovulationDay
  };
}

function getDayInfo(date, settings) {
  const lastStart = settings?.lastPeriodStart;
  if (!lastStart) return {};

  const cl = settings.cycleLength || DEFAULT_CYCLE_LENGTH;
  const pl = settings.periodLength || DEFAULT_PERIOD_LENGTH;
  const overrides = settings.periodOverrides || {};

  const d = parseLocalDate(date);
  const start = parseLocalDate(lastStart);
  const diff = daysBetween(start, d);

  // Прогноз и назад, и вперёд от lastPeriodStart
  const dayInCycle = ((diff % cl) + cl) % cl + 1;

  const ovulationDay = Math.max(1, cl - 14);
  const fertileStart = Math.max(1, ovulationDay - 5);
  const fertileEnd = Math.min(cl, ovulationDay + 1);

  const dateStr = toISODate(d);
  const override = overrides[dateStr];

  let isPeriod;
  if (override === true) isPeriod = true;
  else if (override === false) isPeriod = false;
  else isPeriod = dayInCycle <= pl;

  return {
    isPeriod,
    isPredictedPeriod: dayInCycle <= pl && override !== false,
    isFertile: !isPeriod && dayInCycle >= fertileStart && dayInCycle <= fertileEnd,
    isOvulation: !isPeriod && dayInCycle === ovulationDay,
    isFollicular: !isPeriod && dayInCycle > pl && dayInCycle < fertileStart,
    isLuteal: !isPeriod && dayInCycle > fertileEnd,
    dayInCycle,
    override
  };
}

function getCalendarDays(year, month, settings) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // пн = 0

  const days = [];
  const prevMonthLast = new Date(year, month, 0).getDate();

  for (let i = startWeekday - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthLast - i);
    const info = settings?.lastPeriodStart ? getDayInfo(date, settings) : {};
    days.push({ date, day: prevMonthLast - i, otherMonth: true, ...info });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const info = settings?.lastPeriodStart ? getDayInfo(date, settings) : {};
    days.push({ date, day: d, otherMonth: false, ...info });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(year, month + 1, i);
    const info = settings?.lastPeriodStart ? getDayInfo(date, settings) : {};
    days.push({ date, day: i, otherMonth: true, ...info });
  }

  return days;
}

function formatDate(date) {
  if (!date) return '';
  const d = parseLocalDate(date) || new Date(date);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Установить/снять день месячных (override).
 * Возвращает обновлённый settings.
 * Если ставим true на день раньше lastPeriodStart — сдвигаем lastPeriodStart.
 */
function togglePeriodDay(settings, dateStr, forceValue) {
  settings = settings || { cycleLength: 28, periodLength: 5, periodOverrides: {} };
  const overrides = { ...(settings.periodOverrides || {}) };
  const info = getDayInfo(dateStr, { ...settings, periodOverrides: overrides });

  let newVal;
  if (forceValue === true || forceValue === false) {
    newVal = forceValue;
  } else {
    // toggle: если сейчас месячные → убрать, иначе добавить
    newVal = !info.isPeriod;
  }

  // Если значение совпадает с прогнозом — убираем override
  const predicted = info.dayInCycle && info.dayInCycle <= (settings.periodLength || 5);
  if (newVal === predicted) {
    delete overrides[dateStr];
  } else {
    overrides[dateStr] = newVal;
  }

  let lastPeriodStart = settings.lastPeriodStart;

  // Если отметили начало новых/ранних месячных — обновить lastPeriodStart
  if (newVal === true && lastPeriodStart) {
    const clicked = parseLocalDate(dateStr);
    const currentStart = parseLocalDate(lastPeriodStart);
    // Если клик на день в будущем относительно текущего старта и это «новое» начало
    // или клик раньше текущего старта — пересчитать старт
    if (clicked < currentStart) {
      lastPeriodStart = dateStr;
    } else {
      // Проверяем, не начало ли это нового цикла (день далеко от текущего period)
      const dayIn = info.dayInCycle;
      if (dayIn && dayIn > (settings.periodLength || 5) + 3) {
        // Похоже на начало новых месячных
        lastPeriodStart = dateStr;
        // Очищаем старые overrides далеко в прошлом? оставляем
      }
    }
  }

  // Если сняли день, который был lastPeriodStart — сдвинуть старт вперёд
  if (newVal === false && lastPeriodStart === dateStr) {
    // Ищем следующий день месячных в overrides или +1
    const next = parseLocalDate(dateStr);
    next.setDate(next.getDate() + 1);
    lastPeriodStart = toISODate(next);
  }

  return {
    ...settings,
    lastPeriodStart,
    periodOverrides: overrides,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Задать начало и конец месячных для конкретного эпизода.
 * startStr, endStr — YYYY-MM-DD
 */
function setPeriodRange(settings, startStr, endStr) {
  settings = settings || { cycleLength: 28, periodLength: 5, periodOverrides: {} };
  const overrides = { ...(settings.periodOverrides || {}) };
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (!start || !end || end < start) return settings;

  // Помечаем все дни в диапазоне как месячные
  const cur = new Date(start);
  while (cur <= end) {
    const s = toISODate(cur);
    overrides[s] = true;
    cur.setDate(cur.getDate() + 1);
  }

  // День после конца — явно не месячные (если был прогноз)
  const after = new Date(end);
  after.setDate(after.getDate() + 1);
  const afterStr = toISODate(after);
  // не ставим false принудительно на всё будущее — только ближайшие predicted дни
  const pl = settings.periodLength || 5;
  for (let i = 0; i < pl + 3; i++) {
    const d = new Date(after);
    d.setDate(d.getDate() + i);
    const s = toISODate(d);
    if (overrides[s] !== true) {
      // если по старому прогнозу был period — снимаем
      const tmp = getDayInfo(s, { ...settings, lastPeriodStart: startStr, periodOverrides: {} });
      if (tmp.isPeriod) overrides[s] = false;
    }
  }

  const newPeriodLen = daysBetween(start, end) + 1;

  return {
    ...settings,
    lastPeriodStart: startStr,
    periodLength: Math.max(settings.periodLength || 5, newPeriodLen),
    periodOverrides: overrides,
    updatedAt: new Date().toISOString()
  };
}

if (typeof window !== 'undefined') {
  window.calculateCycle = calculateCycle;
  window.getCalendarDays = getCalendarDays;
  window.getDayInfo = getDayInfo;
  window.formatDate = formatDate;
  window.toISODate = toISODate;
  window.parseLocalDate = parseLocalDate;
  window.togglePeriodDay = togglePeriodDay;
  window.setPeriodRange = setPeriodRange;
}

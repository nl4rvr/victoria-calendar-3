// Логика расчёта фазы цикла

const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_PERIOD_LENGTH = 5;

/**
 * Вычисляет текущий день цикла и фазу
 * @param {string|Date} lastPeriodStart - дата начала последних месячных
 * @param {number} cycleLength - длина цикла
 * @param {number} periodLength - длина месячных
 * @returns {object}
 */
function calculateCycle(lastPeriodStart, cycleLength = DEFAULT_CYCLE_LENGTH, periodLength = DEFAULT_PERIOD_LENGTH) {
  if (!lastPeriodStart) {
    return {
      day: null,
      phase: 'unknown',
      phaseName: 'Нет данных',
      emoji: '❓',
      progress: 0,
      daysUntilPeriod: null,
      isPeriod: false,
      isFertile: false,
      isOvulation: false
    };
  }

  const start = new Date(lastPeriodStart);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = today - start;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const dayInCycle = ((diffDays % cycleLength) + cycleLength) % cycleLength + 1;

  const ovulationDay = cycleLength - 14; // примерно
  const fertileStart = ovulationDay - 5;
  const fertileEnd = ovulationDay + 1;

  let phase, phaseName, emoji;

  if (dayInCycle <= periodLength) {
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

  const progress = Math.min(100, Math.round((dayInCycle / cycleLength) * 100));
  const daysUntilPeriod = cycleLength - dayInCycle + 1;

  return {
    day: dayInCycle,
    phase,
    phaseName,
    emoji,
    progress,
    daysUntilPeriod: daysUntilPeriod > 0 ? daysUntilPeriod : 0,
    isPeriod: dayInCycle <= periodLength,
    isFertile: dayInCycle >= fertileStart && dayInCycle <= fertileEnd,
    isOvulation: dayInCycle === ovulationDay,
    cycleLength,
    periodLength,
    ovulationDay
  };
}

/**
 * Возвращает массив дней для календаря с пометками
 */
function getCalendarDays(year, month, lastPeriodStart, cycleLength = 28, periodLength = 5) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // пн = 0

  const days = [];

  // Предыдущий месяц
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLast - i),
      day: prevMonthLast - i,
      otherMonth: true
    });
  }

  // Текущий месяц
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const info = lastPeriodStart ? getDayInfo(date, lastPeriodStart, cycleLength, periodLength) : {};
    days.push({
      date,
      day: d,
      otherMonth: false,
      ...info
    });
  }

  // Следующий месяц
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      day: i,
      otherMonth: true
    });
  }

  return days;
}

function getDayInfo(date, lastPeriodStart, cycleLength, periodLength) {
  const start = new Date(lastPeriodStart);
  start.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const diff = Math.floor((d - start) / (1000 * 60 * 60 * 24));
  if (diff < 0) return {};

  const dayInCycle = (diff % cycleLength) + 1;
  const ovulationDay = cycleLength - 14;
  const fertileStart = ovulationDay - 5;
  const fertileEnd = ovulationDay + 1;

  return {
    isPeriod: dayInCycle <= periodLength,
    isFertile: dayInCycle >= fertileStart && dayInCycle <= fertileEnd,
    isOvulation: dayInCycle === ovulationDay,
    dayInCycle
  };
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function toISODate(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

if (typeof window !== 'undefined') {
  window.calculateCycle = calculateCycle;
  window.getCalendarDays = getCalendarDays;
  window.formatDate = formatDate;
  window.toISODate = toISODate;
}

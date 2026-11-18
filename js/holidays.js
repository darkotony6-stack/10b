(function (root) {
  'use strict';

  /**
   * Official Russian public holidays and transferred non-working weekdays
   * (ТК РФ ст. 112 + Постановления Правительства РФ о переносе выходных).
   */
  var EXPLICIT_HOLIDAYS = {
    // 2025
    '2025-01-01': 'Новогодние каникулы',
    '2025-01-02': 'Новогодние каникулы',
    '2025-01-03': 'Новогодние каникулы',
    '2025-01-04': 'Новогодние каникулы',
    '2025-01-05': 'Новогодние каникулы',
    '2025-01-06': 'Новогодние каникулы',
    '2025-01-07': 'Рождество Христово',
    '2025-01-08': 'Новогодние каникулы',
    '2025-02-23': 'День защитника Отечества',
    '2025-03-08': 'Международный женский день',
    '2025-05-01': 'Праздник Весны и Труда',
    '2025-05-02': 'Праздник Весны и Труда (перенос)',
    '2025-05-08': 'День Победы (перенос)',
    '2025-05-09': 'День Победы',
    '2025-06-12': 'День России',
    '2025-06-13': 'День России (перенос)',
    '2025-11-03': 'День народного единства (перенос)',
    '2025-11-04': 'День народного единства',
    '2025-12-31': 'Новогодние каникулы (перенос)',

    // 2026 (Постановление Правительства РФ от 24.09.2025 № 1466)
    '2026-01-01': 'Новогодние каникулы',
    '2026-01-02': 'Новогодние каникулы',
    '2026-01-03': 'Новогодние каникулы',
    '2026-01-04': 'Новогодние каникулы',
    '2026-01-05': 'Новогодние каникулы',
    '2026-01-06': 'Новогодние каникулы',
    '2026-01-07': 'Рождество Христово',
    '2026-01-08': 'Новогодние каникулы',
    '2026-01-09': 'Новогодние каникулы (перенос)',
    '2026-02-23': 'День защитника Отечества',
    '2026-03-08': 'Международный женский день',
    '2026-03-09': 'Международный женский день (перенос)',
    '2026-05-01': 'Праздник Весны и Труда',
    '2026-05-09': 'День Победы',
    '2026-05-11': 'День Победы (перенос)',
    '2026-06-12': 'День России',
    '2026-11-04': 'День народного единства',
    '2026-12-31': 'Новогодние каникулы (перенос)',

    // 2027 (Постановление Правительства РФ от 17.09.2026 № 1187)
    '2027-01-01': 'Новогодние каникулы',
    '2027-01-02': 'Новогодние каникулы',
    '2027-01-03': 'Новогодние каникулы',
    '2027-01-04': 'Новогодние каникулы',
    '2027-01-05': 'Новогодние каникулы',
    '2027-01-06': 'Новогодние каникулы',
    '2027-01-07': 'Рождество Христово',
    '2027-01-08': 'Новогодние каникулы',
    '2027-02-22': 'День защитника Отечества (перенос)',
    '2027-02-23': 'День защитника Отечества',
    '2027-03-08': 'Международный женский день',
    '2027-05-01': 'Праздник Весны и Труда',
    '2027-05-03': 'Праздник Весны и Труда (перенос)',
    '2027-05-09': 'День Победы',
    '2027-05-10': 'День Победы (перенос)',
    '2027-06-12': 'День России',
    '2027-06-14': 'День России (перенос)',
    '2027-11-04': 'День народного единства',
    '2027-11-05': 'День народного единства (перенос)',
    '2027-12-31': 'Новогодние каникулы (перенос)'
  };

  // Fixed statutory holidays (ТК РФ ст. 112) used as fallback for years outside explicit table
  var STATUTORY_FIXED = [
    { month: 1, day: 1, name: 'Новогодние каникулы' },
    { month: 1, day: 2, name: 'Новогодние каникулы' },
    { month: 1, day: 3, name: 'Новогодние каникулы' },
    { month: 1, day: 4, name: 'Новогодние каникулы' },
    { month: 1, day: 5, name: 'Новогодние каникулы' },
    { month: 1, day: 6, name: 'Новогодние каникулы' },
    { month: 1, day: 7, name: 'Рождество Христово' },
    { month: 1, day: 8, name: 'Новогодние каникулы' },
    { month: 2, day: 23, name: 'День защитника Отечества', transferOnWeekend: true },
    { month: 3, day: 8, name: 'Международный женский день', transferOnWeekend: true },
    { month: 5, day: 1, name: 'Праздник Весны и Труда', transferOnWeekend: true },
    { month: 5, day: 9, name: 'День Победы', transferOnWeekend: true },
    { month: 6, day: 12, name: 'День России', transferOnWeekend: true },
    { month: 11, day: 4, name: 'День народного единства', transferOnWeekend: true }
  ];

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatDateKey(year, month, day) {
    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  function getIsoWeekday(year, month, day) {
    // UTC date avoids local timezone interference; getUTCDay(): 0=Sun..6=Sat -> 1=Mon..7=Sun
    var d = new Date(Date.UTC(year, month - 1, day));
    var dow = d.getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  function buildFallbackHolidayMap(year) {
    var map = {};
    for (var i = 0; i < STATUTORY_FIXED.length; i++) {
      var h = STATUTORY_FIXED[i];
      var key = formatDateKey(year, h.month, h.day);
      map[key] = h.name;

      if (h.transferOnWeekend) {
        var wd = getIsoWeekday(year, h.month, h.day);
        if (wd === 6 || wd === 7) {
          var offsetDays = wd === 6 ? 2 : 1;
          var shifted = new Date(Date.UTC(year, h.month - 1, h.day + offsetDays));
          var shiftedKey = formatDateKey(
            shifted.getUTCFullYear(),
            shifted.getUTCMonth() + 1,
            shifted.getUTCDate()
          );
          if (!map[shiftedKey]) {
            map[shiftedKey] = h.name + ' (перенос)';
          }
        }
      }
    }
    return map;
  }

  /**
   * Returns holiday name if the given MSK calendar date is an official Russian public holiday
   * or transferred non-working day when schools are closed, otherwise null.
   */
  function getRussianHolidayName(year, month, day) {
    var key = formatDateKey(year, month, day);
    if (Object.prototype.hasOwnProperty.call(EXPLICIT_HOLIDAYS, key)) {
      return EXPLICIT_HOLIDAYS[key];
    }
    if (year >= 2025 && year <= 2027) {
      return null;
    }
    var fallback = buildFallbackHolidayMap(year);
    return fallback[key] || null;
  }

  function isSchoolClosedDay(year, month, day) {
    var wd = getIsoWeekday(year, month, day);
    if (wd === 6 || wd === 7) {
      return {
        closed: true,
        reason: 'weekend',
        label: wd === 6 ? 'Суббота — выходной' : 'Воскресенье — выходной'
      };
    }
    var holiday = getRussianHolidayName(year, month, day);
    if (holiday) {
      return {
        closed: true,
        reason: 'holiday',
        label: holiday
      };
    }
    return {
      closed: false,
      reason: null,
      label: null
    };
  }

  var api = {
    getRussianHolidayName: getRussianHolidayName,
    isSchoolClosedDay: isSchoolClosedDay,
    getIsoWeekday: getIsoWeekday,
    formatDateKey: formatDateKey
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SchoolHolidays = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

(function (root) {
  'use strict';

  var Holidays = root.SchoolHolidays || (typeof require === 'function' ? require('./holidays.js') : null);

  var MSK_OFFSET_MS = 3 * 3600 * 1000;

  var TIME_SLOTS_MON_THU = [
    { num: 1, start: '9:20', end: '9:55' },
    { num: 2, start: '10:05', end: '10:40' },
    { num: 3, start: '10:45', end: '11:20' },
    { num: 4, start: '11:25', end: '12:00' },
    { num: 5, start: '12:05', end: '12:40' },
    { num: 6, start: '12:45', end: '13:15', arriveNextBy: '13:35', arriveNote: 'Пересменка 20 мин · быть на 7 уроке к 13:35' },
    { num: 7, start: '13:40', end: '14:15' },
    { num: 8, start: '14:20', end: '14:55' }
  ];

  var TIME_SLOTS_TUE_FRI = [
    { num: 1, start: '9:30', end: '10:10' },
    { num: 2, start: '10:20', end: '11:00' },
    { num: 3, start: '11:05', end: '11:45' },
    { num: 4, start: '11:50', end: '12:30' },
    { num: 5, start: '12:40', end: '13:20' },
    { num: 6, start: '13:40', end: '14:20' },
    { num: 7, start: '14:25', end: '15:05' }
  ];

  var TIME_SLOTS_WED = TIME_SLOTS_TUE_FRI.slice(0, 6);

  var SUBJECTS_BY_WEEKDAY = {
    1: [
      'Разговоры о важном',
      'Биология',
      'Физика',
      'Алгебра',
      'Литература',
      'Геометрия',
      'Английский язык',
      'Химия'
    ],
    2: [
      'Алгебра',
      'Русский язык',
      'Физкультура',
      'Литература',
      'Химия',
      'Химия',
      'Геометрия'
    ],
    3: [
      'История',
      'Русский язык',
      'Физика',
      'Обществознание',
      'Информатика',
      'Индивидуальный проект'
    ],
    4: [
      'Биология',
      'Профориентация',
      'История',
      'Литература',
      'Физкультура',
      'Английский язык',
      'Основы педагогики',
      'Основы психологии'
    ],
    5: [
      'География',
      'Биология',
      'Вероятность и статистика',
      'ОБЗР',
      'Английский язык',
      'Обществознание',
      'Родной язык'
    ]
  };

  var WEEKDAY_NAMES_NOM = {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота',
    7: 'Воскресенье'
  };

  var WEEKDAY_PREP_ACC = {
    1: 'в понедельник',
    2: 'во вторник',
    3: 'в среду',
    4: 'в четверг',
    5: 'в пятницу'
  };

  var MONTHS_GENITIVE = [
    '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  function toSeconds(hhmm) {
    var parts = hhmm.split(':');
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60;
  }

  function buildDaySchedule(weekday) {
    if (weekday < 1 || weekday > 5) {
      return null;
    }
    var slots = (weekday === 1 || weekday === 4)
      ? TIME_SLOTS_MON_THU
      : (weekday === 3 ? TIME_SLOTS_WED : TIME_SLOTS_TUE_FRI);
    var subjects = SUBJECTS_BY_WEEKDAY[weekday];

    var lessons = [];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      lessons.push({
        num: s.num,
        subject: subjects[i],
        start: s.start,
        end: s.end,
        startSec: toSeconds(s.start),
        endSec: toSeconds(s.end),
        arriveNextBy: s.arriveNextBy || null,
        arriveNextBySec: s.arriveNextBy ? toSeconds(s.arriveNextBy) : null,
        arriveNote: s.arriveNote || null
      });
    }

    // Derive breaks & shift changes directly from the lesson bell slots
    var breaks = [];
    for (var j = 0; j < lessons.length - 1; j++) {
      var curr = lessons[j];
      var next = lessons[j + 1];
      var totalGapMin = Math.round((next.startSec - curr.endSec) / 60);

      if (curr.arriveNextBySec && curr.arriveNextBySec < next.startSec) {
        // Mon/Thu 13:15 -> 13:35 (20 min пересменка), then 13:35 -> 13:40 (5 min сбор в классе)
        breaks.push({
          afterLesson: curr.num,
          beforeLesson: next.num,
          start: curr.end,
          end: curr.arriveNextBy,
          startSec: curr.endSec,
          endSec: curr.arriveNextBySec,
          bellStartSec: next.startSec,
          bellStart: next.start,
          durationMin: Math.round((curr.arriveNextBySec - curr.endSec) / 60),
          kind: 'shift_change',
          label: 'Пересменка',
          mustArriveBy: curr.arriveNextBy,
          note: 'Быть на уроке в ' + curr.arriveNextBy + ' · ' + next.num + ' урок начнётся в ' + next.start
        });
        breaks.push({
          afterLesson: curr.num,
          beforeLesson: next.num,
          start: curr.arriveNextBy,
          end: next.start,
          startSec: curr.arriveNextBySec,
          endSec: next.startSec,
          bellStartSec: next.startSec,
          bellStart: next.start,
          durationMin: Math.round((next.startSec - curr.arriveNextBySec) / 60),
          kind: 'gather',
          label: 'Сбор в классе',
          mustArriveBy: curr.arriveNextBy,
          note: 'На уроке нужно быть с ' + curr.arriveNextBy + ' · звонок в ' + next.start
        });
      } else {
        var isShift = totalGapMin >= 20;
        breaks.push({
          afterLesson: curr.num,
          beforeLesson: next.num,
          start: curr.end,
          end: next.start,
          startSec: curr.endSec,
          endSec: next.startSec,
          bellStartSec: next.startSec,
          bellStart: next.start,
          durationMin: totalGapMin,
          kind: isShift ? 'shift_change' : 'break',
          label: isShift ? 'Пересменка' : 'Перемена',
          mustArriveBy: null,
          note: null
        });
      }
    }

    return {
      weekday: weekday,
      weekdayName: WEEKDAY_NAMES_NOM[weekday],
      lessons: lessons,
      breaks: breaks,
      firstLesson: lessons[0],
      lastLesson: lessons[lessons.length - 1],
      dayStart: lessons[0].start,
      dayEnd: lessons[lessons.length - 1].end,
      dayStartSec: lessons[0].startSec,
      dayEndSec: lessons[lessons.length - 1].endSec
    };
  }

  var WEEK_SCHEDULE = {
    1: buildDaySchedule(1),
    2: buildDaySchedule(2),
    3: buildDaySchedule(3),
    4: buildDaySchedule(4),
    5: buildDaySchedule(5)
  };

  /**
   * Converts UTC epoch ms to Moscow (UTC+3) calendar and clock components.
   */
  function getMskParts(epochMs) {
    var d = new Date(epochMs + MSK_OFFSET_MS);
    var dow = d.getUTCDay();
    var isoWeekday = dow === 0 ? 7 : dow;
    var hours = d.getUTCHours();
    var minutes = d.getUTCMinutes();
    var seconds = d.getUTCSeconds();
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      weekday: isoWeekday,
      hours: hours,
      minutes: minutes,
      seconds: seconds,
      secOfDay: hours * 3600 + minutes * 60 + seconds,
      ms: d.getUTCMilliseconds()
    };
  }

  function addDaysToMskDate(year, month, day, offsetDays) {
    var dt = new Date(Date.UTC(year, month - 1, day + offsetDays));
    var dow = dt.getUTCDay();
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
      weekday: dow === 0 ? 7 : dow
    };
  }

  function formatChillTarget(dateParts) {
    var prep = WEEKDAY_PREP_ACC[dateParts.weekday];
    var monthName = MONTHS_GENITIVE[dateParts.month];
    return prep + ', ' + dateParts.day + ' ' + monthName;
  }

  function formatDateShort(dateParts) {
    return dateParts.day + ' ' + MONTHS_GENITIVE[dateParts.month];
  }

  function findNextSchoolDay(year, month, day, includeToday) {
    var startOffset = includeToday ? 0 : 1;
    for (var offset = startOffset; offset <= 30; offset++) {
      var candidate = addDaysToMskDate(year, month, day, offset);
      if (candidate.weekday >= 1 && candidate.weekday <= 5) {
        var closedInfo = Holidays.isSchoolClosedDay(candidate.year, candidate.month, candidate.day);
        if (!closedInfo.closed) {
          var daySched = WEEK_SCHEDULE[candidate.weekday];
          var firstLessonStartMs = Date.UTC(
            candidate.year,
            candidate.month - 1,
            candidate.day,
            0, 0, daySched.dayStartSec
          ) - MSK_OFFSET_MS;
          return {
            year: candidate.year,
            month: candidate.month,
            day: candidate.day,
            weekday: candidate.weekday,
            weekdayName: WEEKDAY_NAMES_NOM[candidate.weekday],
            daysAhead: offset,
            phrase: formatChillTarget(candidate),
            dateShort: formatDateShort(candidate),
            schedule: daySched,
            firstLessonStartMs: firstLessonStartMs
          };
        }
      }
    }
    return null;
  }

  /**
   * Computes the complete school UI state for a given UTC epoch timestamp (in ms),
   * strictly evaluated in Moscow time (UTC+3).
   */
  function getSchoolState(epochMs) {
    var msk = getMskParts(epochMs);
    var closedInfo = Holidays.isSchoolClosedDay(msk.year, msk.month, msk.day);
    var todaySchedule = WEEK_SCHEDULE[msk.weekday] || null;

    if (closedInfo.closed || !todaySchedule) {
      var nextFromClosed = findNextSchoolDay(msk.year, msk.month, msk.day, false);
      return {
        mode: 'chill',
        reason: closedInfo.reason || 'weekend',
        reasonLabel: closedInfo.label,
        msk: msk,
        todaySchedule: null,
        nextSchoolDay: nextFromClosed,
        secondsUntilNextSchool: nextFromClosed
          ? Math.max(0, Math.ceil((nextFromClosed.firstLessonStartMs - epochMs) / 1000))
          : null,
        headline: 'Школа ' + nextFromClosed.phrase + ', чилл',
        firstLessonText: 'Первый урок в ' + nextFromClosed.schedule.dayStart
      };
    }

    var sec = msk.secOfDay;

    // Before first lesson today
    if (sec < todaySchedule.dayStartSec) {
      var nextToday = findNextSchoolDay(msk.year, msk.month, msk.day, true);
      return {
        mode: 'chill',
        reason: 'before_school',
        reasonLabel: 'До начала уроков',
        msk: msk,
        todaySchedule: todaySchedule,
        nextSchoolDay: nextToday,
        secondsUntilNextSchool: todaySchedule.dayStartSec - sec,
        headline: 'Школа ' + nextToday.phrase + ', чилл',
        firstLessonText: 'Первый урок в ' + todaySchedule.dayStart
      };
    }

    // After last lesson today
    if (sec >= todaySchedule.dayEndSec) {
      var nextAfter = findNextSchoolDay(msk.year, msk.month, msk.day, false);
      return {
        mode: 'chill',
        reason: 'after_school',
        reasonLabel: 'Уроки закончились',
        msk: msk,
        todaySchedule: todaySchedule,
        nextSchoolDay: nextAfter,
        secondsUntilNextSchool: nextAfter
          ? Math.max(0, Math.ceil((nextAfter.firstLessonStartMs - epochMs) / 1000))
          : null,
        headline: 'Школа ' + nextAfter.phrase + ', чилл',
        firstLessonText: 'Первый урок в ' + nextAfter.schedule.dayStart
      };
    }

    // Inside a lesson
    for (var i = 0; i < todaySchedule.lessons.length; i++) {
      var lesson = todaySchedule.lessons[i];
      if (sec >= lesson.startSec && sec < lesson.endSec) {
        var nextLesson = i + 1 < todaySchedule.lessons.length
          ? todaySchedule.lessons[i + 1]
          : null;
        var lessonDurationSec = lesson.endSec - lesson.startSec;
        var lessonElapsedSec = sec - lesson.startSec;
        var lessonRemainingSec = lesson.endSec - sec;
        var dayRemainingSec = todaySchedule.dayEndSec - sec;

        return {
          mode: 'lesson',
          msk: msk,
          todaySchedule: todaySchedule,
          lesson: lesson,
          nextLesson: nextLesson,
          totalLessons: todaySchedule.lessons.length,
          lessonDurationSec: lessonDurationSec,
          lessonElapsedSec: lessonElapsedSec,
          lessonRemainingSec: lessonRemainingSec,
          dayRemainingSec: dayRemainingSec,
          progress: lessonElapsedSec / lessonDurationSec
        };
      }
    }

    // Inside a break or shift change
    for (var b = 0; b < todaySchedule.breaks.length; b++) {
      var brk = todaySchedule.breaks[b];
      if (sec >= brk.startSec && sec < brk.endSec) {
        var upcomingLesson = todaySchedule.lessons[brk.beforeLesson - 1];
        var prevLesson = todaySchedule.lessons[brk.afterLesson - 1];
        var breakDurationSec = brk.endSec - brk.startSec;
        var breakElapsedSec = sec - brk.startSec;
        var breakRemainingSec = brk.endSec - sec;
        var remainingDay = todaySchedule.dayEndSec - sec;

        return {
          mode: 'break',
          msk: msk,
          todaySchedule: todaySchedule,
          breakInfo: brk,
          prevLesson: prevLesson,
          nextLesson: upcomingLesson,
          totalLessons: todaySchedule.lessons.length,
          breakDurationSec: breakDurationSec,
          breakElapsedSec: breakElapsedSec,
          breakRemainingSec: breakRemainingSec,
          bellRemainingSec: brk.bellStartSec - sec,
          dayRemainingSec: remainingDay,
          progress: breakElapsedSec / breakDurationSec
        };
      }
    }

    return null;
  }

  var api = {
    MSK_OFFSET_MS: MSK_OFFSET_MS,
    WEEK_SCHEDULE: WEEK_SCHEDULE,
    WEEKDAY_NAMES_NOM: WEEKDAY_NAMES_NOM,
    MONTHS_GENITIVE: MONTHS_GENITIVE,
    getMskParts: getMskParts,
    getSchoolState: getSchoolState,
    findNextSchoolDay: findNextSchoolDay,
    buildDaySchedule: buildDaySchedule
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SchoolSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

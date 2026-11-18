(function () {
  'use strict';

  var Schedule = window.SchoolSchedule;
  var TimeSync = window.NetworkTimeSync;

  var mskClockEl = document.getElementById('msk-clock');
  var clockStatusEl = document.getElementById('clock-status');
  var syncDotEl = document.getElementById('sync-dot');
  var syncMetaEl = document.getElementById('sync-meta');

  var tabNowBtn = document.getElementById('tab-now');
  var tabScheduleBtn = document.getElementById('tab-schedule');
  var viewNowEl = document.getElementById('view-now');
  var viewScheduleEl = document.getElementById('view-schedule');
  var nowContainerEl = document.getElementById('now-container');

  var dayTabsEl = document.getElementById('day-tabs');
  var daySummaryEl = document.getElementById('day-summary');
  var scheduleListEl = document.getElementById('schedule-list');
  var themeToggleBtn = document.getElementById('theme-toggle');

  var SHORT_WEEKDAYS = {
    1: 'Пн',
    2: 'Вт',
    3: 'Ср',
    4: 'Чт',
    5: 'Пт'
  };

  var activeTab = 'now';
  var selectedScheduleDay = null;
  var initialWaitDone = false;
  var lastStateSignature = null;
  var lastScheduleSignature = null;
  var activeRefs = null;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMMSS(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var mins = Math.floor(s / 60);
    var secs = s % 60;
    return pad2(mins) + ':' + pad2(secs);
  }

  function formatBreakTimer(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var mins = Math.floor(s / 60);
    var secs = s % 60;
    if (mins > 0) {
      return mins + ' мин ' + pad2(secs) + ' сек';
    }
    return secs + ' сек';
  }

  function formatDayRemaining(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var hours = Math.floor(s / 3600);
    var mins = Math.floor((s % 3600) / 60);
    var secs = s % 60;
    if (hours > 0) {
      return hours + ' ч ' + mins + ' мин';
    }
    if (mins > 0) {
      return mins + ' мин ' + pad2(secs) + ' сек';
    }
    return secs + ' сек';
  }

  function formatChillCountdown(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var days = Math.floor(s / 86400);
    var hours = Math.floor((s % 86400) / 3600);
    var mins = Math.floor((s % 3600) / 60);
    if (days >= 1) {
      return 'через ' + days + ' дн ' + hours + ' ч';
    }
    if (hours >= 1) {
      return 'через ' + hours + ' ч ' + mins + ' мин';
    }
    if (mins >= 1) {
      return 'через ' + mins + ' мин ' + pad2(s % 60) + ' сек';
    }
    return 'через ' + s + ' сек';
  }

  function formatDriftShort(driftMs) {
    var absSec = Math.round(Math.abs(driftMs) / 1000);
    if (absSec < 60) return absSec + ' сек';
    var mins = Math.round(absSec / 60);
    if (mins < 60) return mins + ' мин';
    var hours = (absSec / 3600).toFixed(1).replace(/\.0$/, '');
    return hours + ' ч';
  }

  function updateSyncUI(status) {
    if (status.synced) {
      syncDotEl.className = 'sync-dot synced';
      clockStatusEl.title = 'Время синхронизировано по сети (' + status.source + ', пинг ' + status.rttMs + ' мс)';
      if (status.driftMs !== null && Math.abs(status.driftMs) > 15000) {
        syncMetaEl.textContent = 'МСК по сети (' + status.source + ') · часы устройства отличаются на ' + formatDriftShort(status.driftMs);
      } else {
        syncMetaEl.textContent = 'Точное время МСК по сети (' + status.source + ')';
      }
    } else if (status.syncing) {
      syncDotEl.className = 'sync-dot syncing';
      clockStatusEl.title = 'Синхронизация времени МСК с сетью...';
      syncMetaEl.textContent = 'Синхронизация времени с сетью…';
    } else {
      syncDotEl.className = 'sync-dot offline';
      clockStatusEl.title = 'Нет связи с серверами времени, используются часы устройства';
      syncMetaEl.textContent = 'Нет сети · используются локальные часы (повтор через 20 сек)';
    }
  }

  var clock = TimeSync.createNetworkClock({
    onStatusChange: function (status) {
      if (status.synced || !status.syncing) {
        initialWaitDone = true;
      }
      updateSyncUI(status);
      renderTick();
    }
  });

  setTimeout(function () {
    if (!initialWaitDone) {
      initialWaitDone = true;
      renderTick();
    }
  }, 1200);

  function getStateSignature(state) {
    if (!state) return 'none';
    if (state.mode === 'chill') {
      var nextKey = state.nextSchoolDay
        ? state.nextSchoolDay.year + '-' + state.nextSchoolDay.month + '-' + state.nextSchoolDay.day
        : '';
      return 'chill:' + state.reason + ':' + (state.reasonLabel || '') + ':' + nextKey;
    }
    if (state.mode === 'lesson') {
      return 'lesson:' + state.todaySchedule.weekday + ':' + state.lesson.num;
    }
    if (state.mode === 'break') {
      return 'break:' + state.todaySchedule.weekday + ':' + state.breakInfo.afterLesson + ':' + state.breakInfo.kind;
    }
    return 'unknown';
  }

  function renderNowCardStructure(state) {
    activeRefs = null;

    if (state.mode === 'chill') {
      var metaParts = [];
      if (state.nextSchoolDay) {
        var sched = state.nextSchoolDay.schedule;
        metaParts.push(
          state.nextSchoolDay.daysAhead === 0 ? 'Сегодня' : (state.nextSchoolDay.daysAhead === 1 ? 'Завтра' : state.nextSchoolDay.weekdayName)
        );
        metaParts.push('1 урок: ' + sched.firstLesson.subject);
        metaParts.push(sched.lessons.length + ' уроков (до ' + sched.dayEnd + ')');
      }

      var pillClass = state.reason === 'holiday' ? 'status-pill amber' : 'status-pill';
      var pillText = state.reasonLabel || 'Внеурочное время';

      nowContainerEl.innerHTML =
        '<div class="chill-card">' +
          '<span class="' + pillClass + '">' + escapeHtml(pillText) + '</span>' +
          '<h1 class="chill-headline">' + escapeHtml(state.headline) + '</h1>' +
          '<p class="chill-first-lesson">' + escapeHtml(state.firstLessonText) + '</p>' +
          '<p class="chill-meta" data-ref="chillMeta">' + escapeHtml(metaParts.join(' · ')) + '</p>' +
        '</div>';

      activeRefs = {
        mode: 'chill',
        baseMeta: metaParts.join(' · '),
        chillMeta: nowContainerEl.querySelector('[data-ref="chillMeta"]')
      };
      return;
    }

    if (state.mode === 'lesson') {
      var nextHtml = state.nextLesson
        ? '<div class="fact-value">' + escapeHtml(state.nextLesson.subject) + '</div>' +
          '<div class="fact-sub">начало в ' + escapeHtml(state.nextLesson.start) + '</div>'
        : '<div class="fact-value">Последний урок</div>' +
          '<div class="fact-sub">после него домой</div>';

      var arriveBanner = state.lesson.arriveNote
        ? '<div class="notice-banner">' + escapeHtml(state.lesson.arriveNote) + '</div>'
        : '';

      nowContainerEl.innerHTML =
        '<div class="active-card">' +
          '<div class="card-top">' +
            '<span class="status-pill accent">' +
              escapeHtml(state.todaySchedule.weekdayName) + ' · Урок ' + state.lesson.num + ' из ' + state.totalLessons +
            '</span>' +
            '<span class="slot-range">' + escapeHtml(state.lesson.start + ' – ' + state.lesson.end) + '</span>' +
          '</div>' +
          '<div class="hero-block">' +
            '<span class="hero-kicker">Сейчас урок</span>' +
            '<h1 class="lesson-title">' + escapeHtml(state.lesson.subject) + '</h1>' +
            '<div class="countdown-row">' +
              '<span class="countdown-big" data-ref="lessonLeft">' + formatMMSS(state.lessonRemainingSec) + '</span>' +
              '<span class="countdown-caption">до конца урока</span>' +
            '</div>' +
          '</div>' +
          '<div class="progress-track"><div class="progress-fill" data-ref="progress" style="width:' + Math.min(100, Math.max(0, state.progress * 100)).toFixed(2) + '%"></div></div>' +
          arriveBanner +
          '<div class="facts-grid">' +
            '<div class="fact-item">' +
              '<span class="fact-label">Кончается в</span>' +
              '<div class="fact-value">' + escapeHtml(state.lesson.end) + '</div>' +
            '</div>' +
            '<div class="fact-item">' +
              '<span class="fact-label">Следующий урок</span>' +
              nextHtml +
            '</div>' +
            '<div class="fact-item">' +
              '<span class="fact-label">До конца уроков</span>' +
              '<div class="fact-value" data-ref="dayLeft">' + escapeHtml(formatDayRemaining(state.dayRemainingSec)) + '</div>' +
              '<div class="fact-sub">конец дня в ' + escapeHtml(state.todaySchedule.dayEnd) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      activeRefs = {
        mode: 'lesson',
        lessonLeft: nowContainerEl.querySelector('[data-ref="lessonLeft"]'),
        dayLeft: nowContainerEl.querySelector('[data-ref="dayLeft"]'),
        progress: nowContainerEl.querySelector('[data-ref="progress"]')
      };
      return;
    }

    if (state.mode === 'break') {
      var brk = state.breakInfo;
      var isUrgent = brk.kind === 'gather';
      var pillStyle = isUrgent ? 'status-pill amber' : 'status-pill green';
      var timerStyle = isUrgent ? 'break-timer-value urgent' : 'break-timer-value';
      var fillStyle = isUrgent ? 'progress-fill urgent-fill' : 'progress-fill break-fill';
      var badgeText = state.todaySchedule.weekdayName + ' · ' + brk.label + ' (' + brk.durationMin + ' мин)';

      var noteHtml = brk.note
        ? '<div class="notice-banner">' + escapeHtml(brk.note) + '</div>'
        : '';

      nowContainerEl.innerHTML =
        '<div class="active-card">' +
          '<div class="card-top">' +
            '<span class="' + pillStyle + '">' + escapeHtml(badgeText) + '</span>' +
            '<span class="slot-range">' + escapeHtml(brk.start + ' – ' + brk.end) + '</span>' +
          '</div>' +
          '<div class="hero-block">' +
            '<h1 class="break-headline">' +
              'Перемена. Осталось <span class="' + timerStyle + '" data-ref="breakLeft">' +
              escapeHtml(formatBreakTimer(state.breakRemainingSec)) +
              '</span> до конца.' +
            '</h1>' +
          '</div>' +
          '<div class="progress-track"><div class="' + fillStyle + '" data-ref="progress" style="width:' + Math.min(100, Math.max(0, state.progress * 100)).toFixed(2) + '%"></div></div>' +
          noteHtml +
          '<div class="facts-grid">' +
            '<div class="fact-item">' +
              '<span class="fact-label">Следующий урок (' + state.nextLesson.num + ' из ' + state.totalLessons + ')</span>' +
              '<div class="fact-value">' + escapeHtml(state.nextLesson.subject) + '</div>' +
              '<div class="fact-sub">' + escapeHtml(state.nextLesson.start + ' – ' + state.nextLesson.end) + '</div>' +
            '</div>' +
            '<div class="fact-item">' +
              '<span class="fact-label">До конца уроков</span>' +
              '<div class="fact-value" data-ref="dayLeft">' + escapeHtml(formatDayRemaining(state.dayRemainingSec)) + '</div>' +
              '<div class="fact-sub">конец дня в ' + escapeHtml(state.todaySchedule.dayEnd) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      activeRefs = {
        mode: 'break',
        breakLeft: nowContainerEl.querySelector('[data-ref="breakLeft"]'),
        dayLeft: nowContainerEl.querySelector('[data-ref="dayLeft"]'),
        progress: nowContainerEl.querySelector('[data-ref="progress"]')
      };
    }
  }

  function updateNowCardDynamic(state) {
    if (!activeRefs) return;

    if (state.mode === 'chill' && activeRefs.chillMeta) {
      if (state.nextSchoolDay && state.secondsUntilNextSchool !== null && state.nextSchoolDay.daysAhead <= 1) {
        activeRefs.chillMeta.textContent =
          activeRefs.baseMeta + ' · ' + formatChillCountdown(state.secondsUntilNextSchool);
      } else {
        activeRefs.chillMeta.textContent = activeRefs.baseMeta;
      }
      document.title = '10Б — Чилл';
      return;
    }

    if (state.mode === 'lesson') {
      var mmss = formatMMSS(state.lessonRemainingSec);
      if (activeRefs.lessonLeft) activeRefs.lessonLeft.textContent = mmss;
      if (activeRefs.dayLeft) activeRefs.dayLeft.textContent = formatDayRemaining(state.dayRemainingSec);
      if (activeRefs.progress) {
        activeRefs.progress.style.width = Math.min(100, Math.max(0, state.progress * 100)).toFixed(2) + '%';
      }
      document.title = mmss + ' · ' + state.lesson.subject + ' — 10Б';
      return;
    }

    if (state.mode === 'break') {
      if (activeRefs.breakLeft) activeRefs.breakLeft.textContent = formatBreakTimer(state.breakRemainingSec);
      if (activeRefs.dayLeft) activeRefs.dayLeft.textContent = formatDayRemaining(state.dayRemainingSec);
      if (activeRefs.progress) {
        activeRefs.progress.style.width = Math.min(100, Math.max(0, state.progress * 100)).toFixed(2) + '%';
      }
      document.title = 'Перемена ' + formatMMSS(state.breakRemainingSec) + ' — 10Б';
    }
  }

  function renderScheduleView(state) {
    var todayWd = state.msk.weekday;
    if (selectedScheduleDay === null) {
      if (todayWd >= 1 && todayWd <= 5 && state.mode !== 'chill') {
        selectedScheduleDay = todayWd;
      } else if (todayWd >= 1 && todayWd <= 5 && state.reason === 'before_school') {
        selectedScheduleDay = todayWd;
      } else if (state.nextSchoolDay) {
        selectedScheduleDay = state.nextSchoolDay.weekday;
      } else {
        selectedScheduleDay = 1;
      }
    }

    var currentHighlightKey = selectedScheduleDay === todayWd
      ? (state.mode === 'lesson'
          ? 'L' + state.lesson.num
          : (state.mode === 'break' ? 'B' + state.breakInfo.afterLesson + state.breakInfo.kind : 'day'))
      : 'other';

    var schedSig = selectedScheduleDay + ':' + todayWd + ':' + currentHighlightKey;
    if (schedSig === lastScheduleSignature) {
      return;
    }
    lastScheduleSignature = schedSig;

    // Day tabs
    var tabsHtml = '';
    for (var wd = 1; wd <= 5; wd++) {
      var cls = 'day-tab';
      if (wd === selectedScheduleDay) cls += ' active';
      if (wd === todayWd) cls += ' today-marker';
      tabsHtml += '<button type="button" class="' + cls + '" data-wd="' + wd + '" role="tab" aria-selected="' + (wd === selectedScheduleDay ? 'true' : 'false') + '">' + SHORT_WEEKDAYS[wd] + '</button>';
    }
    dayTabsEl.innerHTML = tabsHtml;

    var daySched = Schedule.WEEK_SCHEDULE[selectedScheduleDay];
    daySummaryEl.textContent = daySched.weekdayName + ' · ' + daySched.lessons.length + ' уроков · ' + daySched.dayStart + '–' + daySched.dayEnd;

    var isViewingToday = selectedScheduleDay === todayWd && state.todaySchedule !== null;
    var sec = state.msk.secOfDay;
    var listHtml = '';

    for (var i = 0; i < daySched.lessons.length; i++) {
      var lesson = daySched.lessons[i];
      var isCurrentLesson = isViewingToday && state.mode === 'lesson' && state.lesson.num === lesson.num;
      var isPastLesson = isViewingToday && sec >= lesson.endSec;

      var rowCls = 'lesson-row';
      if (isCurrentLesson) rowCls += ' is-current';
      else if (isPastLesson) rowCls += ' is-past';

      var badge = isCurrentLesson ? '<span class="row-badge">Сейчас</span>' : '';

      listHtml +=
        '<div class="' + rowCls + '">' +
          '<span class="row-num">' + lesson.num + '</span>' +
          '<span class="row-time">' + escapeHtml(lesson.start + ' – ' + lesson.end) + '</span>' +
          '<span class="row-subject"><span>' + escapeHtml(lesson.subject) + '</span>' + badge + '</span>' +
        '</div>';

      // Break dividers after lesson
      if (i < daySched.lessons.length - 1) {
        var nextLesson = daySched.lessons[i + 1];
        var matchingBreaks = daySched.breaks.filter(function (b) {
          return b.afterLesson === lesson.num;
        });
        var isActiveBreak = isViewingToday && state.mode === 'break' && state.breakInfo.afterLesson === lesson.num;
        var hasShift = matchingBreaks.some(function (b) { return b.kind === 'shift_change'; });

        var divCls = 'break-divider';
        if (isActiveBreak) divCls += ' is-current-break';
        else if (hasShift) divCls += ' is-shift';

        var leftText = '';
        if (lesson.arriveNextBy) {
          leftText = 'Пересменка 20 мин (быть на 7 уроке к ' + lesson.arriveNextBy + ')';
        } else if (hasShift) {
          leftText = 'Пересменка ' + matchingBreaks[0].durationMin + ' мин';
        } else {
          leftText = 'Перемена ' + matchingBreaks[0].durationMin + ' мин';
        }
        if (isActiveBreak) {
          leftText = 'Сейчас: ' + leftText;
        }

        listHtml +=
          '<div class="' + divCls + '">' +
            '<span>' + escapeHtml(leftText) + '</span>' +
            '<span>' + escapeHtml(lesson.end + ' – ' + nextLesson.start) + '</span>' +
          '</div>';
      }
    }

    scheduleListEl.innerHTML = listHtml;
  }

  function renderTick() {
    clock.checkResyncNeeded();

    if (!initialWaitDone) {
      return;
    }

    var nowEpochMs = clock.nowMs();
    var state = Schedule.getSchoolState(nowEpochMs);
    var msk = state.msk;

    mskClockEl.textContent = pad2(msk.hours) + ':' + pad2(msk.minutes) + ':' + pad2(msk.seconds);

    var sig = getStateSignature(state);
    if (sig !== lastStateSignature) {
      lastStateSignature = sig;
      renderNowCardStructure(state);
    }
    updateNowCardDynamic(state);

    if (activeTab === 'schedule') {
      renderScheduleView(state);
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    var isNow = tab === 'now';

    tabNowBtn.classList.toggle('active', isNow);
    tabNowBtn.setAttribute('aria-selected', isNow ? 'true' : 'false');
    tabScheduleBtn.classList.toggle('active', !isNow);
    tabScheduleBtn.setAttribute('aria-selected', !isNow ? 'true' : 'false');

    viewNowEl.hidden = !isNow;
    viewNowEl.classList.toggle('active', isNow);
    viewScheduleEl.hidden = isNow;
    viewScheduleEl.classList.toggle('active', !isNow);

    if (!isNow && initialWaitDone) {
      lastScheduleSignature = null;
      renderScheduleView(Schedule.getSchoolState(clock.nowMs()));
    }
  }

  tabNowBtn.addEventListener('click', function () {
    switchTab('now');
  });

  tabScheduleBtn.addEventListener('click', function () {
    switchTab('schedule');
  });

  dayTabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.day-tab');
    if (!btn) return;
    var wd = parseInt(btn.getAttribute('data-wd'), 10);
    if (wd >= 1 && wd <= 5) {
      selectedScheduleDay = wd;
      lastScheduleSignature = null;
      if (initialWaitDone) {
        renderScheduleView(Schedule.getSchoolState(clock.nowMs()));
      }
    }
  });

  themeToggleBtn.addEventListener('click', function () {
    var rootEl = document.documentElement;
    var currentAttr = rootEl.getAttribute('data-theme');
    var systemLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var currentlyLight = currentAttr === 'light' || (!currentAttr && systemLight);
    var next = currentlyLight ? 'dark' : 'light';
    rootEl.setAttribute('data-theme', next);
    try {
      localStorage.setItem('10b_theme', next);
    } catch (e) {}
  });

  window.addEventListener('online', function () {
    clock.sync();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      clock.sync();
      renderTick();
    }
  });

  // Start network sync immediately and tick smoothly every 250ms
  clock.sync();
  setInterval(renderTick, 250);
})();

(function (root) {
  'use strict';

  var MSK_OFFSET_MS = 3 * 3600 * 1000;

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timerId = null;
    var opts = Object.assign({ cache: 'no-store' }, options || {});
    if (controller) {
      opts.signal = controller.signal;
      timerId = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }
    return fetch(url, opts).finally(function () {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    });
  }

  function buildSources() {
    var sources = [
      {
        name: 'time.now',
        precisionMs: 1,
        priority: 1,
        fetchEpochMs: function () {
          var t0 = performance.now();
          return fetchWithTimeout(
            'https://time.now/developer/api/timezone/Europe/Moscow?_=' + Math.random().toString(36).slice(2),
            { method: 'GET' },
            10000
          )
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            })
            .then(function (data) {
              var t1 = performance.now();
              var rtt = t1 - t0;
              var epoch = null;
              if (data && typeof data.utc_datetime === 'string') {
                var parsed = Date.parse(data.utc_datetime);
                if (!Number.isNaN(parsed)) epoch = parsed;
              }
              if (epoch === null && data && typeof data.unixtime === 'number') {
                epoch = data.unixtime * 1000 + 500;
              }
              if (epoch === null) throw new Error('Invalid time.now payload');
              return {
                source: 'time.now',
                epochMs: epoch,
                perfAnchor: t1 - Math.min(rtt, 1000) / 2,
                rttMs: rtt,
                precisionMs: 1
              };
            });
        }
      },
      {
        name: 'timeapi.io',
        precisionMs: 1,
        priority: 2,
        fetchEpochMs: function () {
          var t0 = performance.now();
          return fetchWithTimeout(
            'https://timeapi.io/api/time/current/zone?timeZone=Europe/Moscow&_=' + Math.random().toString(36).slice(2),
            { method: 'GET' },
            10000
          )
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            })
            .then(function (data) {
              var t1 = performance.now();
              var rtt = t1 - t0;
              if (!data || typeof data.year !== 'number' || typeof data.hour !== 'number') {
                throw new Error('Invalid timeapi.io payload');
              }
              var epoch = Date.UTC(
                data.year,
                data.month - 1,
                data.day,
                data.hour,
                data.minute,
                data.seconds,
                data.milliSeconds || 0
              ) - MSK_OFFSET_MS;
              return {
                source: 'timeapi.io',
                epochMs: epoch,
                perfAnchor: t1 - Math.min(rtt, 1000) / 2,
                rttMs: rtt,
                precisionMs: 1
              };
            });
        }
      },
      {
        name: 'cloudflare',
        precisionMs: 1000,
        priority: 3,
        fetchEpochMs: function () {
          var t0 = performance.now();
          return fetchWithTimeout(
            'https://www.cloudflare.com/cdn-cgi/trace?_=' + Math.random().toString(36).slice(2),
            { method: 'GET' },
            10000
          )
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.text();
            })
            .then(function (text) {
              var t1 = performance.now();
              var rtt = t1 - t0;
              var match = /^ts=([0-9]+(?:\.[0-9]+)?)$/m.exec(text);
              if (!match) throw new Error('Missing ts in cloudflare trace');
              var rawStr = match[1];
              var tsSec = parseFloat(rawStr);
              if (!Number.isFinite(tsSec)) throw new Error('Invalid ts');
              var isWholeSecond = /\.000$/.test(rawStr) || rawStr.indexOf('.') === -1;
              var epoch = Math.round(tsSec * 1000) + (isWholeSecond ? 500 : 0);
              return {
                source: 'cloudflare',
                epochMs: epoch,
                perfAnchor: t1 - Math.min(rtt, 1000) / 2,
                rttMs: rtt,
                precisionMs: isWholeSecond ? 1000 : 1
              };
            });
        }
      }
    ];

    // Add remote same-origin HTTP Date header fallback (skip local/file origins where server clock = broken device clock)
    if (typeof window !== 'undefined' && window.location) {
      var proto = window.location.protocol;
      var host = window.location.hostname;
      var isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
      if ((proto === 'https:' || proto === 'http:') && !isLocal) {
        sources.push({
          name: 'origin-http',
          precisionMs: 1000,
          priority: 4,
          fetchEpochMs: function () {
            var t0 = performance.now();
            return fetchWithTimeout(
              window.location.pathname + '?_ts=' + Math.random().toString(36).slice(2),
              { method: 'HEAD' },
              9000
            ).then(function (res) {
              var t1 = performance.now();
              var rtt = t1 - t0;
              var hdr = res.headers.get('Date');
              if (!hdr) throw new Error('No Date header');
              var parsed = Date.parse(hdr);
              if (Number.isNaN(parsed)) throw new Error('Invalid Date header');
              return {
                source: 'server-header',
                epochMs: parsed + 500,
                perfAnchor: t1 - Math.min(rtt, 1000) / 2,
                rttMs: rtt,
                precisionMs: 1000
              };
            });
          }
        });
      }
    }

    return sources;
  }

  function createNetworkClock(options) {
    var opts = options || {};
    var onStatusChange = typeof opts.onStatusChange === 'function' ? opts.onStatusChange : function () {};

    var state = {
      synced: false,
      syncing: false,
      source: null,
      anchorEpochMs: null,
      anchorPerfMs: null,
      rttMs: null,
      driftMs: null,
      lastSyncPerfMs: null,
      lastAttemptPerfMs: null,
      lastWallCheckMs: Date.now(),
      lastPerfCheckMs: performance.now(),
      errorCount: 0
    };

    var syncPromise = null;

    function notify() {
      onStatusChange(getStatus());
    }

    function applyAnchor(sample) {
      state.synced = true;
      state.source = sample.source;
      state.anchorEpochMs = sample.epochMs;
      state.anchorPerfMs = sample.perfAnchor;
      state.rttMs = Math.round(sample.rttMs);
      state.lastSyncPerfMs = performance.now();
      state.lastWallCheckMs = Date.now();
      state.lastPerfCheckMs = state.lastSyncPerfMs;
      state.errorCount = 0;

      // Measure how far off the local device clock is vs network UTC
      var approxLocalNow = Date.now();
      var networkNow = sample.epochMs + (state.lastSyncPerfMs - sample.perfAnchor);
      state.driftMs = Math.round(approxLocalNow - networkNow);
    }

    function pickBestSample(samples) {
      var pool = samples.slice();
      if (pool.length >= 3) {
        var nowPerf = performance.now();
        var projected = pool.map(function (s) {
          return { sample: s, est: s.epochMs + (nowPerf - s.perfAnchor) };
        }).sort(function (a, b) {
          return a.est - b.est;
        });
        var medianEst = projected[Math.floor(projected.length / 2)].est;
        var consistent = projected.filter(function (item) {
          return Math.abs(item.est - medianEst) <= 5000;
        }).map(function (item) {
          return item.sample;
        });
        if (consistent.length > 0) {
          pool = consistent;
        }
      }

      // Prefer sub-second precision sources with low RTT, fallback to lowest RTT
      var valid = pool.sort(function (a, b) {
        if (a.precisionMs !== b.precisionMs) {
          return a.precisionMs - b.precisionMs;
        }
        return a.rttMs - b.rttMs;
      });
      return valid[0] || null;
    }

    function sync() {
      if (syncPromise) return syncPromise;

      state.syncing = true;
      state.lastAttemptPerfMs = performance.now();
      notify();

      var sources = buildSources();
      var collected = [];
      var appliedFast = false;

      var attempts = sources.map(function (src) {
        return src.fetchEpochMs().then(function (sample) {
          collected.push(sample);
          // Apply the very first successful response immediately so UI never waits on slower endpoints
          if (!appliedFast) {
            appliedFast = true;
            applyAnchor(sample);
            notify();
          }
          return sample;
        }).catch(function () {
          return null;
        });
      });

      syncPromise = Promise.all(attempts)
        .then(function () {
          state.lastAttemptPerfMs = performance.now();
          if (collected.length > 0) {
            var best = pickBestSample(collected);
            if (best) {
              applyAnchor(best);
            }
          } else {
            state.errorCount += 1;
          }
          state.syncing = false;
          syncPromise = null;
          notify();
          return getStatus();
        });

      return syncPromise;
    }

    function nowMs() {
      if (state.synced && state.anchorEpochMs !== null && state.anchorPerfMs !== null) {
        return state.anchorEpochMs + (performance.now() - state.anchorPerfMs);
      }
      return Date.now();
    }

    /**
     * Detects sleep/suspend jumps where monotonic perf timer and wall clock diverge significantly,
     * or periodic 5-minute refresh interval.
     */
    function checkResyncNeeded() {
      var nowWall = Date.now();
      var nowPerf = performance.now();
      var wallDelta = nowWall - state.lastWallCheckMs;
      var perfDelta = nowPerf - state.lastPerfCheckMs;
      state.lastWallCheckMs = nowWall;
      state.lastPerfCheckMs = nowPerf;

      // Sleep/wake detection: perf clock paused while wall clock jumped
      if (Math.abs(wallDelta - perfDelta) > 5000) {
        sync();
        return;
      }
      if (!state.synced && !state.syncing && state.lastAttemptPerfMs !== null && (nowPerf - state.lastAttemptPerfMs) > 20000) {
        sync();
        return;
      }
      if (state.synced && !state.syncing && state.lastSyncPerfMs !== null && (nowPerf - state.lastSyncPerfMs) > 300000) {
        sync();
      }
    }

    function getStatus() {
      return {
        synced: state.synced,
        syncing: state.syncing,
        source: state.source,
        rttMs: state.rttMs,
        driftMs: state.driftMs
      };
    }

    return {
      sync: sync,
      nowMs: nowMs,
      checkResyncNeeded: checkResyncNeeded,
      getStatus: getStatus
    };
  }

  var api = {
    createNetworkClock: createNetworkClock
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.NetworkTimeSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

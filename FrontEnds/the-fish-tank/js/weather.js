window.WeatherApp = (() => {
  const container = document.getElementById('weather');

  function deltaClass(delta) {
    const abs = Math.abs(delta);
    if (abs < 1) return 'delta-low';
    if (abs <= 2) return 'delta-mid';
    return 'delta-high';
  }

  function formatDelta(delta) {
    const sign = delta > 0 ? '+' : '';
    return sign + delta.toFixed(1) + '\u00b0';
  }

  var use24h = localStorage.getItem('timeFormat') === '24h';

  var units = ['C', 'F', 'K'];
  var currentUnit = localStorage.getItem('tempUnit') || 'C';

  function convertTemp(celsius) {
    if (currentUnit === 'F') return (celsius * 9 / 5) + 32;
    if (currentUnit === 'K') return celsius + 273.15;
    return celsius;
  }

  function formatTemp(celsius) {
    var val = convertTemp(celsius);
    var suffix = currentUnit === 'K' ? ' K' : '\u00b0' + currentUnit;
    return val.toFixed(1) + suffix;
  }

  function convertDelta(delta) {
    if (currentUnit === 'F') return delta * 9 / 5;
    return delta;
  }

  function formatDeltaTemp(delta) {
    var val = convertDelta(delta);
    var sign = val > 0 ? '+' : '';
    return sign + val.toFixed(1) + '\u00b0';
  }

  function formatTime(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var mm = minutes < 10 ? '0' + minutes : '' + minutes;
    if (use24h) {
      var hh = hours < 10 ? '0' + hours : '' + hours;
      return hh + ':' + mm;
    }
    var h = hours % 12 || 12;
    var ampm = hours < 12 ? 'AM' : 'PM';
    return h + ':' + mm + ' ' + ampm;
  }

  function formatDateTime(date) {
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var year = date.getFullYear();
    return year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day +
      ' ' + formatTime(date);
  }

  var STALE_AFTER_MS = 6 * 60 * 60 * 1000;

  function parseTimestamp(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  function isStale(date) {
    return !!date && (Date.now() - date.getTime()) > STALE_AFTER_MS;
  }

  // Renders a warning when the payload predates the staleness threshold, so a
  // frozen static fallback (or a stale R2 object) degrades visibly.
  function staleNoticeHtml(ts) {
    var d = parseTimestamp(ts);
    if (!isStale(d)) return '';
    return '<div class="stale-notice">\u26a0 Data from ' + formatDateTime(d) + '</div>';
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getPropertyLabel(key, propertyMeta) {
    if (propertyMeta && propertyMeta[key] && propertyMeta[key].label) {
      return propertyMeta[key].label;
    }
    return key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  function formatProperty(key, value, propertyMeta) {
    if (value === undefined || value === null) return '—';
    var meta = propertyMeta && propertyMeta[key];
    if (meta && meta.format === 'temperature') {
      return formatTemp(value);
    }
    var unit = (meta && meta.unit) ? ' ' + meta.unit : '';
    return value + unit;
  }

  function resolvePropertyKey(suffix, propertyMeta) {
    if (!propertyMeta) return suffix;
    if (propertyMeta[suffix]) return suffix;
    for (var key in propertyMeta) {
      if (propertyMeta.hasOwnProperty(key) && key.endsWith('_' + suffix)) return key;
    }
    return suffix;
  }

  function createMultiSelect(id, options, selected, onChange) {
    var container = document.createElement('div');
    container.className = 'multi-select';
    container.id = id;

    var trigger = document.createElement('div');
    trigger.className = 'multi-select-trigger';
    trigger.textContent = selected.length === 0 ? 'All' : selected.join(', ');
    container.appendChild(trigger);

    var dropdown = document.createElement('div');
    dropdown.className = 'multi-select-dropdown';

    options.forEach(function(opt) {
      var label = document.createElement('label');
      label.className = 'multi-select-option';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt;
      cb.checked = selected.indexOf(opt) !== -1;
      cb.addEventListener('change', function() {
        var checked = [];
        dropdown.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
          if (c.checked) checked.push(c.value);
        });
        if (checked.length === 0) {
          trigger.textContent = 'All';
          onChange([]);
        } else {
          trigger.textContent = checked.join(', ');
          onChange(checked);
        }
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + opt));
      dropdown.appendChild(label);
    });

    var clearBtn = document.createElement('div');
    clearBtn.className = 'multi-select-clear';
    clearBtn.textContent = 'Clear all';
    clearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
        c.checked = false;
      });
      trigger.textContent = 'All';
      onChange([]);
    });
    dropdown.appendChild(clearBtn);

    container.appendChild(dropdown);

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.multi-select.open').forEach(function(el) {
        if (el !== container) el.classList.remove('open');
      });
      container.classList.toggle('open');
    });

    return container;
  }

  document.addEventListener('click', function() {
    document.querySelectorAll('.multi-select.open').forEach(function(el) {
      el.classList.remove('open');
    });
  });

  function discoverHistoryProperties(historyEntry) {
    var pattern = /^(actual|predicted|delta)_(.+)$/;
    var found = {};
    Object.keys(historyEntry).forEach(function(key) {
      var match = key.match(pattern);
      if (match) {
        var prefix = match[1];
        var suffix = match[2];
        if (!found[suffix]) found[suffix] = {};
        found[suffix][prefix] = true;
      }
    });
    var props = [];
    Object.keys(found).forEach(function(suffix) {
      if (found[suffix].actual && found[suffix].predicted && found[suffix].delta) {
        props.push(suffix);
      }
    });
    props.sort();
    return props;
  }

  function renderCurrent(current) {
    if (!current) return '<div class="dash-card"><p>No current reading available</p></div>';
    var time = current.timestamp
      ? new Date(current.timestamp)
      : new Date(current.date + 'T' + (current.hour < 10 ? '0' : '') + current.hour + ':00:00Z');
    return '<div class="dash-card">' +
      '<h2>Current Reading</h2>' +
      '<div class="card-time">' + formatDateTime(time) + '</div>' +
      '<div class="temp-row">' +
        '<div class="temp-block"><span class="temp-label">Indoor</span><span class="temp-value">' + formatTemp(current.temp_indoor) + '</span></div>' +
        '<div class="temp-block"><span class="temp-label">Outdoor</span><span class="temp-value">' + formatTemp(current.temp_outdoor) + '</span></div>' +
      '</div>' +
    '</div>';
  }

  function renderPrediction(pred) {
    if (!pred) return '<div class="dash-card"><p>No prediction available yet</p></div>';
    var forTime = pred.prediction_for ? new Date(pred.prediction_for) : null;
    var timeStr = forTime ? formatTime(forTime) : 'Next hour';
    var modelStr = pred.model_version ? '<div class="card-meta">Model v' + pred.model_version + '</div>' : '';
    return '<div class="dash-card">' +
      '<h2>Next Hour Forecast</h2>' +
      '<div class="card-time">' + timeStr + '</div>' +
      '<div class="temp-row">' +
        '<div class="temp-block"><span class="temp-label">Indoor</span><span class="temp-value">' + formatTemp(pred.temp_indoor) + '</span></div>' +
        '<div class="temp-block"><span class="temp-label">Outdoor</span><span class="temp-value">' + formatTemp(pred.temp_outdoor) + '</span></div>' +
      '</div>' +
      modelStr +
    '</div>';
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      return '<div class="history-empty">Prediction history building up\u2026</div>';
    }
    var rows = history.map(function(h) {
      var time = h.timestamp
        ? new Date(h.timestamp)
        : new Date(h.date + 'T' + (h.hour < 10 ? '0' : '') + h.hour + ':00:00Z');
      return '<tr>' +
        '<td>' + formatDateTime(time) + '</td>' +
        '<td>' + (h.model_version ? 'v' + h.model_version : '\u2014') + '</td>' +
        '<td>' + formatTemp(h.actual_indoor) + '</td>' +
        '<td>' + formatTemp(h.predicted_indoor) + '</td>' +
        '<td class="' + deltaClass(h.delta_indoor) + '">' + formatDeltaTemp(h.delta_indoor) + '</td>' +
        '<td>' + formatTemp(h.actual_outdoor) + '</td>' +
        '<td>' + formatTemp(h.predicted_outdoor) + '</td>' +
        '<td class="' + deltaClass(h.delta_outdoor) + '">' + formatDeltaTemp(h.delta_outdoor) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="history-section">' +
      '<h2>Prediction History</h2>' +
      '<div class="table-scroll">' +
      '<table id="history-table">' +
        '<thead><tr>' +
          '<th>Time</th><th>Model</th>' +
          '<th>Indoor</th><th>Predicted</th><th>\u0394</th>' +
          '<th>Outdoor</th><th>Predicted</th><th>\u0394</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '</div>' +
    '</div>';
  }

  var browseState = {
    category: 'readings',
    viewMode: 'formatted',
    selectedDate: null,
    selectedHour: null,
    selectedModel: null,
    validationModelFilter: null,
    currentData: null
  };

  // --- Database Layer ---
  var DB_CACHE_NAME = 'fishtank_db';
  var DB_CACHE_TTL = 24 * 60 * 60 * 1000;
  var SQL = null;
  var _db = null;
  var _dbReady = null;
  var _dbFailed = false;

  function loadSqlJs() {
    if (SQL) return Promise.resolve(SQL);
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
      script.onload = function() {
        initSqlJs({ locateFile: function(file) {
          return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/' + file;
        }}).then(function(sqlModule) {
          SQL = sqlModule;
          resolve(SQL);
        }).catch(reject);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function getCachedDb() {
    return new Promise(function(resolve) {
      try {
        var req = indexedDB.open(DB_CACHE_NAME, 1);
        req.onupgradeneeded = function(e) {
          e.target.result.createObjectStore('db');
        };
        req.onsuccess = function(e) {
          var store = e.target.result.transaction('db', 'readonly').objectStore('db');
          var get = store.get('data');
          get.onsuccess = function() {
            var cached = get.result;
            if (cached && cached.generatedAt && cached.bytes) {
              var age = Date.now() - cached.cachedAt;
              if (age < DB_CACHE_TTL) {
                resolve(cached);
                return;
              }
            }
            resolve(null);
          };
          get.onerror = function() { resolve(null); };
        };
        req.onerror = function() { resolve(null); };
      } catch (err) {
        resolve(null);
      }
    });
  }

  function setCachedDb(bytes, generatedAt) {
    try {
      var req = indexedDB.open(DB_CACHE_NAME, 1);
      req.onupgradeneeded = function(e) {
        e.target.result.createObjectStore('db');
      };
      req.onsuccess = function(e) {
        var store = e.target.result.transaction('db', 'readwrite').objectStore('db');
        store.put({ bytes: bytes, generatedAt: generatedAt, cachedAt: Date.now() }, 'data');
      };
    } catch (err) {
      // IndexedDB not available, session-only caching
    }
  }

  function decompressGzip(compressedBytes) {
    if (typeof DecompressionStream !== 'undefined') {
      var ds = new DecompressionStream('gzip');
      var blob = new Blob([compressedBytes]);
      var stream = blob.stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function(buf) {
        return new Uint8Array(buf);
      });
    }
    return Promise.reject(new Error('DecompressionStream not supported'));
  }

  function initDatabase(progressCallback) {
    if (_db) return Promise.resolve(_db);
    if (_dbReady) return _dbReady;

    _dbReady = loadSqlJs().then(function() {
      return getCachedDb();
    }).then(function(cached) {
      if (cached) {
        _db = new SQL.Database(new Uint8Array(cached.bytes));
        if (progressCallback) progressCallback(100, 'Loaded from cache');
        return _db;
      }
      if (!FishTankAuth.isAuthenticated()) {
        throw new Error('Authentication required');
      }
      if (progressCallback) progressCallback(0, 'Downloading database\u2026');
      return Promise.race([
        fetch(AUTH_API_URL + '/data/database', {
          headers: FishTankAuth.authHeaders()
        }).then(function(r) {
          if (r.status === 401) {
            FishTankAuth.signOut();
            throw new Error('Session expired');
          }
          if (!r.ok) throw new Error('DB fetch failed: ' + r.status);
          var total = parseInt(r.headers.get('content-length') || '0', 10);
          if (!r.body || !r.body.getReader) return r.arrayBuffer();
          var reader = r.body.getReader();
          var chunks = [];
          var loaded = 0;
          function pump() {
            return reader.read().then(function(result) {
              if (result.done) {
                var all = new Uint8Array(loaded);
                var offset = 0;
                chunks.forEach(function(c) { all.set(c, offset); offset += c.length; });
                return all;
              }
              chunks.push(result.value);
              loaded += result.value.length;
              if (progressCallback && total) {
                progressCallback(Math.round((loaded / total) * 80), 'Downloading\u2026 ' + Math.round(loaded / 1024) + ' KB');
              }
              return pump();
            });
          }
          return pump();
        }),
        new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error('DB download timeout')); }, 15000);
        })
      ]).then(function(compressed) {
        if (progressCallback) progressCallback(85, 'Decompressing\u2026');
        return decompressGzip(compressed).then(function(dbBytes) {
          if (progressCallback) progressCallback(95, 'Initializing\u2026');
          _db = new SQL.Database(dbBytes);
          var meta = _db.exec("SELECT value FROM _metadata WHERE key='generated_at'");
          var genAt = meta.length && meta[0].values.length ? meta[0].values[0][0] : '';
          setCachedDb(dbBytes.buffer, genAt);
          if (progressCallback) progressCallback(100, 'Ready');
          return _db;
        });
      });
    }).catch(function(err) {
      console.error('Database load failed:', err);
      _dbFailed = true;
      _dbReady = null;
      return null;
    });

    return _dbReady;
  }

  function queryDb(sql, params) {
    if (!_db) return [];
    var result = _db.exec(sql, params);
    if (!result.length) return [];
    var cols = result[0].columns;
    return result[0].values.map(function(row) {
      var obj = {};
      cols.forEach(function(col, i) { obj[col] = row[i]; });
      return obj;
    });
  }

  // --- SQL Query Functions ---
  function queryReadingsDates() {
    return queryDb("SELECT DISTINCT date FROM readings ORDER BY date DESC");
  }

  function queryReadingsHours(date) {
    var rows = queryDb("SELECT DISTINCT hour FROM readings WHERE date = ? ORDER BY hour", [date]);
    return rows.map(function(r) {
      var h = r.hour;
      return (h < 10 ? '0' : '') + h + '0000';
    });
  }

  function queryReading(date, hour) {
    var hourNum = parseInt(hour.substring(0, 2), 10);
    var rows = queryDb("SELECT * FROM readings WHERE date = ? AND hour = ? ORDER BY timestamp DESC LIMIT 1", [date, hourNum]);
    if (!rows.length) return null;
    var r = rows[0];
    return {
      body: {
        devices: [{
          station_name: 'Weather Station',
          dashboard_data: {
            time_utc: r.timestamp,
            Temperature: r.temp_indoor,
            Humidity: r.humidity_indoor,
            CO2: r.co2,
            Noise: r.noise,
            Pressure: r.pressure
          },
          modules: [{
            type: 'NAModule1',
            dashboard_data: {
              Temperature: r.temp_outdoor,
              Humidity: r.humidity_outdoor,
              min_temp: r.temp_outdoor_min,
              max_temp: r.temp_outdoor_max
            }
          }]
        }]
      }
    };
  }

  function queryPredictionModels() {
    return queryDb("SELECT DISTINCT model_type FROM predictions ORDER BY model_type");
  }

  function queryPredictionsDates(model) {
    if (model) {
      return queryDb("SELECT DISTINCT substr(for_hour, 1, 10) as date FROM predictions WHERE model_type = ? ORDER BY date DESC", [model]);
    }
    return queryDb("SELECT DISTINCT substr(for_hour, 1, 10) as date FROM predictions ORDER BY date DESC");
  }

  function queryPredictionsHours(date, model) {
    var rows;
    if (model) {
      rows = queryDb("SELECT DISTINCT substr(for_hour, 12, 2) as hh, substr(for_hour, 15, 2) as mm FROM predictions WHERE substr(for_hour, 1, 10) = ? AND model_type = ? ORDER BY hh, mm", [date, model]);
    } else {
      rows = queryDb("SELECT DISTINCT substr(for_hour, 12, 2) as hh, substr(for_hour, 15, 2) as mm FROM predictions WHERE substr(for_hour, 1, 10) = ? ORDER BY hh, mm", [date]);
    }
    return rows.map(function(r) { return r.hh + r.mm + '00'; });
  }

  function queryPrediction(date, hour, model) {
    var hh = hour.substring(0, 2);
    var mm = hour.substring(2, 4);
    var timePrefix = date + 'T' + hh + ':' + mm;
    if (model) {
      var rows = queryDb("SELECT * FROM predictions WHERE for_hour LIKE ? AND model_type = ? ORDER BY generated_at DESC LIMIT 1", [timePrefix + '%', model]);
      if (!rows.length) return [];
      return [dbRowToPrediction(rows[0])];
    }
    var allRows = queryDb("SELECT * FROM predictions WHERE for_hour LIKE ? ORDER BY model_type, generated_at DESC", [timePrefix + '%']);
    var seen = {};
    var unique = [];
    allRows.forEach(function(r) {
      if (!seen[r.model_type]) {
        seen[r.model_type] = true;
        unique.push(r);
      }
    });
    return unique.map(dbRowToPrediction);
  }

  function dbRowToPrediction(row) {
    var pred = {
      model_type: row.model_type,
      model_version: row.model_version,
      generated_at: row.generated_at,
      prediction: {
        prediction_for: row.for_hour,
        values: {}
      }
    };
    if (row.temp_indoor_predicted !== null) pred.prediction.values.temp_indoor = row.temp_indoor_predicted;
    if (row.temp_outdoor_predicted !== null) pred.prediction.values.temp_outdoor = row.temp_outdoor_predicted;
    if (row.last_reading_temp_indoor !== null || row.last_reading_temp_outdoor !== null) {
      pred.last_reading = {};
      if (row.last_reading_temp_indoor !== null) pred.last_reading.temp_indoor = row.last_reading_temp_indoor;
      if (row.last_reading_temp_outdoor !== null) pred.last_reading.temp_outdoor = row.last_reading_temp_outdoor;
    }
    return pred;
  }

  function queryPublicStationsDates() {
    return queryDb("SELECT DISTINCT substr(fetched_at, 1, 10) as date FROM public_stations ORDER BY date DESC");
  }

  function queryPublicStationsHours(date) {
    var rows = queryDb("SELECT DISTINCT substr(fetched_at, 12, 2) as hh, substr(fetched_at, 15, 2) as mm FROM public_stations WHERE substr(fetched_at, 1, 10) = ? ORDER BY hh, mm", [date]);
    return rows.map(function(r) { return r.hh + r.mm + '00'; });
  }

  function queryPublicStationsData(date, hour) {
    var hh = hour.substring(0, 2);
    var mm = hour.substring(2, 4);
    var timePrefix = date + 'T' + hh + ':' + mm;
    var rows = queryDb("SELECT * FROM public_stations WHERE fetched_at LIKE ? ORDER BY station_id", [timePrefix + '%']);
    if (!rows.length) return null;
    return {
      fetched_at: rows[0].fetched_at,
      station_count: rows.length,
      stations: rows
    };
  }

  function queryValidationDates() {
    return queryDb("SELECT DISTINCT substr(for_hour, 1, 10) as date FROM prediction_history ORDER BY date DESC");
  }

  function queryValidationData(date) {
    var rows = queryDb("SELECT * FROM prediction_history WHERE substr(for_hour, 1, 10) = ? ORDER BY for_hour, model_type", [date]);
    if (!rows.length) return null;
    var modelSet = {};
    var entries = rows.map(function(r) {
      if (r.model_type) modelSet[r.model_type] = true;
      return {
        for_hour: r.for_hour,
        model_type: r.model_type,
        model_version: r.model_version,
        predicted: { temp_indoor: r.predicted_indoor, temp_outdoor: r.predicted_outdoor },
        actual: { temp_indoor: r.actual_indoor, temp_outdoor: r.actual_outdoor },
        error: { temp_indoor: r.error_indoor, temp_outdoor: r.error_outdoor }
      };
    });
    return { entries: entries, models: Object.keys(modelSet).sort() };
  }

  function queryPredictionHistoryFromDb(filters) {
    var sql = "SELECT * FROM prediction_history WHERE 1=1";
    var params = [];

    if (filters.models && filters.models.length) {
      sql += " AND model_type IN (" + filters.models.map(function() { return "?"; }).join(",") + ")";
      params = params.concat(filters.models);
    }
    if (filters.dateStart) {
      sql += " AND for_hour >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND for_hour <= ?";
      params.push(filters.dateEnd + 'T23:59:59');
    }

    sql += " ORDER BY for_hour DESC";

    if (filters.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    return queryDb(sql, params);
  }

  function renderBrowseFromDb() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl || !_db) return;

    var cat = browseState.category;
    var dates;
    if (cat === 'readings') {
      dates = queryReadingsDates().map(function(r) { return r.date; });
    } else if (cat === 'predictions') {
      dates = queryPredictionsDates(browseState.selectedModel).map(function(r) { return r.date; });
    } else if (cat === 'public-stations') {
      dates = queryPublicStationsDates().map(function(r) { return r.date; });
    } else if (cat === 'validation') {
      dates = queryValidationDates().map(function(r) { return r.date; });
    } else {
      dates = [];
    }

    if (!browseState.selectedDate || dates.indexOf(browseState.selectedDate) === -1) {
      browseState.selectedDate = dates[0] || null;
    }

    var html = '<div class="browse-category-bar">';
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      html += '<button class="browse-btn browse-cat-btn' + (cat === c.key ? ' active' : '') + '" data-cat="' + c.key + '">' + c.label + '</button>';
    }
    html += '</div>';

    html += '<div class="browse-controls">';
    var dateOptions = dates.map(function(d) {
      var sel = d === browseState.selectedDate ? ' selected' : '';
      return '<option value="' + d + '"' + sel + '>' + d + '</option>';
    }).join('');
    if (dates.length > 0) {
      html += '<select class="browse-date-select">' + dateOptions + '</select>';
    }
    html += '<button class="browse-btn' + (browseState.viewMode === 'formatted' ? ' active' : '') + '" data-vmode="formatted">Formatted</button>' +
      '<button class="browse-btn' + (browseState.viewMode === 'raw' ? ' active' : '') + '" data-vmode="raw">Raw JSON</button>';
    html += '</div>';

    if (cat === 'predictions') {
      var models = queryPredictionModels().map(function(r) { return r.model_type; });
      if (models.length > 0) {
        html += '<div class="model-filter-bar">' +
          '<button class="browse-btn model-filter-pill' + (!browseState.selectedModel ? ' active' : '') + '" data-model="">All Models</button>';
        for (var m = 0; m < models.length; m++) {
          html += '<button class="browse-btn model-filter-pill' + (browseState.selectedModel === models[m] ? ' active' : '') + '" data-model="' + models[m] + '">' + escapeHtml(models[m]) + '</button>';
        }
        html += '</div>';
      }
    }

    if (cat !== 'validation') {
      var hours = [];
      if (browseState.selectedDate) {
        if (cat === 'readings') {
          hours = queryReadingsHours(browseState.selectedDate);
        } else if (cat === 'predictions') {
          hours = queryPredictionsHours(browseState.selectedDate, browseState.selectedModel);
        } else if (cat === 'public-stations') {
          hours = queryPublicStationsHours(browseState.selectedDate);
        }
      }
      var hourBtns = hours.map(function(h) {
        var label = formatHourLabel(h);
        var cls = h === browseState.selectedHour ? ' active' : '';
        return '<button class="hour-btn' + cls + '" data-hour="' + h + '">' + label + '</button>';
      }).join('');
      html += '<div class="hour-grid">' + (hourBtns || '<span class="browse-loading">No data for this date</span>') + '</div>';
    }

    html += '<div class="browse-display"></div>';
    browseEl.innerHTML = html;

    wireBrowseDbHandlers();

    if (cat === 'validation' && browseState.selectedDate) {
      loadRawDataFromDb();
    } else if (browseState.currentData && browseState.selectedHour) {
      renderBrowseDisplay();
    }
  }

  function wireBrowseDbHandlers() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl) return;

    browseEl.querySelectorAll('[data-cat]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.category = btn.dataset.cat;
        browseState.selectedHour = null;
        browseState.currentData = null;
        browseState.selectedDate = null;
        browseState.selectedModel = null;
        browseState.validationModelFilter = null;
        renderBrowseFromDb();
      });
    });

    var dateSelect = browseEl.querySelector('.browse-date-select');
    if (dateSelect) {
      dateSelect.addEventListener('change', function() {
        browseState.selectedDate = dateSelect.value;
        browseState.selectedHour = null;
        browseState.currentData = null;
        renderBrowseFromDb();
      });
    }

    browseEl.querySelectorAll('[data-vmode]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.viewMode = btn.dataset.vmode;
        browseEl.querySelectorAll('[data-vmode]').forEach(function(b) { b.classList.toggle('active', b === btn); });
        renderBrowseDisplay();
      });
    });

    browseEl.querySelectorAll('[data-model]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.selectedModel = btn.dataset.model || null;
        browseState.selectedHour = null;
        browseState.currentData = null;
        renderBrowseFromDb();
      });
    });

    browseEl.querySelectorAll('.hour-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.selectedHour = btn.dataset.hour;
        browseEl.querySelectorAll('.hour-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
        loadRawDataFromDb();
      });
    });
  }

  function loadRawDataFromDb() {
    var cat = browseState.category;
    var date = browseState.selectedDate;
    var hour = browseState.selectedHour;
    var display = document.querySelector('.browse-display');

    if (cat === 'readings') {
      browseState.currentData = queryReading(date, hour);
      renderBrowseDisplay();
    } else if (cat === 'predictions') {
      var results = queryPrediction(date, hour, browseState.selectedModel);
      browseState.currentData = results.length === 1 ? results[0] : results;
      renderBrowseDisplay();
    } else if (cat === 'public-stations') {
      browseState.currentData = queryPublicStationsData(date, hour);
      renderBrowseDisplay();
    } else if (cat === 'validation') {
      browseState.currentData = queryValidationData(date);
      renderBrowseDisplay();
    }
  }

  function enterBrowseData() {
    var browseEl = document.getElementById('subtab-browse');

    if (_db) {
      renderBrowseFromDb();
      return;
    }

    if (_dbFailed) {
      renderBrowseUnavailable();
      return;
    }

    if (browseEl) {
      browseEl.innerHTML = '<div class="db-loading">' +
        '<div class="db-loading-bar"><div class="db-loading-fill" id="db-progress-fill"></div></div>' +
        '<p class="db-loading-text" id="db-progress-text">Initializing\u2026</p></div>';
    }

    initDatabase(function(pct, msg) {
      var fill = document.getElementById('db-progress-fill');
      var text = document.getElementById('db-progress-text');
      if (fill) fill.style.width = pct + '%';
      if (text) text.textContent = msg;
    }).then(function(db) {
      if (db) {
        renderBrowseFromDb();
      } else {
        renderBrowseUnavailable();
      }
    });
  }

  function renderBrowseUnavailable() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl) return;
    browseEl.innerHTML = '<div class="dash-card">' +
      '<p class="dash-error">Data unavailable</p>' +
      '<p>The weather database could not be loaded. Check your connection and try again.</p>' +
      '<button class="browse-btn" id="db-retry-btn">Retry</button>' +
    '</div>';
    var retryBtn = document.getElementById('db-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function() {
        _dbFailed = false;
        _dbReady = null;
        enterBrowseData();
      });
    }
  }

  function renderFormattedReading(data) {
    var device = data && data.body && data.body.devices && data.body.devices[0];
    if (!device) return '<p class="dash-error">Unrecognized reading format</p>';

    var dash = device.dashboard_data || {};
    var stationName = device.station_name || 'Weather Station';
    var timestamp = dash.time_utc ? new Date(dash.time_utc * 1000) : null;
    var indoorTemp = dash.Temperature;

    var outdoorTemp = null;
    var outdoorHumidity = null;
    var modules = device.modules || [];
    for (var i = 0; i < modules.length; i++) {
      if (modules[i].type === 'NAModule1' && modules[i].dashboard_data) {
        outdoorTemp = modules[i].dashboard_data.Temperature;
        outdoorHumidity = modules[i].dashboard_data.Humidity;
        if (modules[i].dashboard_data.min_temp !== undefined) {
          var minTemp = modules[i].dashboard_data.min_temp;
          var maxTemp = modules[i].dashboard_data.max_temp;
        }
        break;
      }
    }

    var html = '<div class="data-card">' +
      '<h4>' + escapeHtml(stationName) + '</h4>';

    if (timestamp) {
      html += '<div class="data-field"><span class="data-label">Time</span><span class="data-value">' + formatDateTime(timestamp) + '</span></div>';
    }

    if (indoorTemp !== undefined && indoorTemp !== null) {
      html += '<div class="data-field"><span class="data-label">Indoor Temp</span><span class="data-value">' + formatTemp(indoorTemp) + '</span></div>';
    }
    if (dash.Humidity !== undefined) {
      html += '<div class="data-field"><span class="data-label">Indoor Humidity</span><span class="data-value">' + dash.Humidity + '%</span></div>';
    }
    if (dash.CO2 !== undefined) {
      html += '<div class="data-field"><span class="data-label">CO2</span><span class="data-value">' + dash.CO2 + ' ppm</span></div>';
    }
    if (dash.Noise !== undefined) {
      html += '<div class="data-field"><span class="data-label">Noise</span><span class="data-value">' + dash.Noise + ' dB</span></div>';
    }
    if (dash.Pressure !== undefined) {
      html += '<div class="data-field"><span class="data-label">Pressure</span><span class="data-value">' + dash.Pressure + ' mbar</span></div>';
    }
    if (outdoorTemp !== null) {
      html += '<div class="data-field"><span class="data-label">Outdoor Temp</span><span class="data-value">' + formatTemp(outdoorTemp) + '</span></div>';
    }
    if (outdoorHumidity !== null) {
      html += '<div class="data-field"><span class="data-label">Outdoor Humidity</span><span class="data-value">' + outdoorHumidity + '%</span></div>';
    }
    if (typeof minTemp !== 'undefined') {
      html += '<div class="data-field"><span class="data-label">Min Temp</span><span class="data-value">' + formatTemp(minTemp) + '</span></div>';
      html += '<div class="data-field"><span class="data-label">Max Temp</span><span class="data-value">' + formatTemp(maxTemp) + '</span></div>';
    }

    html += '</div>';
    return html;
  }

  function renderFormattedPrediction(data) {
    var html = '<div class="data-card">' +
      '<h4>Prediction</h4>';

    if (data.model_type) {
      html += '<div class="data-field"><span class="data-label">Model</span><span class="data-value">' +
        '<span class="model-badge">' + escapeHtml(data.model_type) + '</span>' +
        (data.model_version ? ' v' + data.model_version : '') +
        '</span></div>';
    } else if (data.model_version) {
      html += '<div class="data-field"><span class="data-label">Model</span><span class="data-value">v' + data.model_version + '</span></div>';
    }

    if (data.generated_at) {
      html += '<div class="data-field"><span class="data-label">Generated At</span><span class="data-value">' + formatDateTime(new Date(data.generated_at)) + '</span></div>';
    }

    if (data.prediction) {
      if (data.prediction.prediction_for) {
        html += '<div class="data-field"><span class="data-label">Prediction For</span><span class="data-value">' + formatDateTime(new Date(data.prediction.prediction_for)) + '</span></div>';
      }
      if (data.prediction.values && typeof data.prediction.values === 'object') {
        var pm = null;
        Object.keys(data.prediction.values).forEach(function(key) {
          html += '<div class="data-field"><span class="data-label">Predicted ' + getPropertyLabel(key, pm) + '</span><span class="data-value">' + formatProperty(key, data.prediction.values[key], pm) + '</span></div>';
        });
      } else {
        if (data.prediction.temp_indoor !== undefined) {
          html += '<div class="data-field"><span class="data-label">Predicted Indoor</span><span class="data-value">' + formatTemp(data.prediction.temp_indoor) + '</span></div>';
        }
        if (data.prediction.temp_outdoor !== undefined) {
          html += '<div class="data-field"><span class="data-label">Predicted Outdoor</span><span class="data-value">' + formatTemp(data.prediction.temp_outdoor) + '</span></div>';
        }
      }
    }

    if (data.last_reading) {
      html += '</div><div class="data-card"><h4>Last Reading at Time of Prediction</h4>';
      if (data.last_reading.temp_indoor !== undefined) {
        html += '<div class="data-field"><span class="data-label">Indoor Temp</span><span class="data-value">' + formatTemp(data.last_reading.temp_indoor) + '</span></div>';
      }
      if (data.last_reading.temp_outdoor !== undefined) {
        html += '<div class="data-field"><span class="data-label">Outdoor Temp</span><span class="data-value">' + formatTemp(data.last_reading.temp_outdoor) + '</span></div>';
      }
    }

    html += '</div>';
    return html;
  }

  function formatCoord(val, posLabel, negLabel) {
    if (val === null || val === undefined) return '—';
    var label = val >= 0 ? posLabel : negLabel;
    return Math.abs(val).toFixed(2) + '°' + label;
  }

  function renderFormattedPublicStation(data) {
    if (!data || !data.stations) return '<p class="dash-error">Unrecognized public station format</p>';

    var ts = data.fetched_at ? formatDateTime(new Date(data.fetched_at)) : 'Unknown time';
    var count = data.station_count || data.stations.length;
    var html = '<div class="data-card"><h4>' + escapeHtml(ts) + ' — ' + count + ' stations</h4></div>';

    for (var i = 0; i < data.stations.length; i++) {
      var s = data.stations[i];
      var loc = formatCoord(s.lat, 'N', 'S') + ', ' + formatCoord(s.lon, 'E', 'W');
      html += '<div class="data-card">' +
        '<h4>' + escapeHtml(s.station_id || 'Unknown') + '</h4>' +
        '<div class="data-field"><span class="data-label">Location</span><span class="data-value">' + loc + '</span></div>' +
        '<div class="data-field"><span class="data-label">Temperature</span><span class="data-value">' + (s.temperature !== null && s.temperature !== undefined ? formatTemp(s.temperature) : '—') + '</span></div>' +
        '<div class="data-field"><span class="data-label">Humidity</span><span class="data-value">' + (s.humidity !== null && s.humidity !== undefined ? s.humidity + '%' : '—') + '</span></div>' +
        '<div class="data-field"><span class="data-label">Pressure</span><span class="data-value">' + (s.pressure !== null && s.pressure !== undefined ? s.pressure + ' hPa' : '—') + '</span></div>' +
        '<div class="data-field"><span class="data-label">Rain (1h)</span><span class="data-value">' + (s.rain_60min !== null && s.rain_60min !== undefined ? s.rain_60min + ' mm' : '—') + '</span></div>' +
        '<div class="data-field"><span class="data-label">Rain (24h)</span><span class="data-value">' + (s.rain_24h !== null && s.rain_24h !== undefined ? s.rain_24h + ' mm' : '—') + '</span></div>' +
        '<div class="data-field"><span class="data-label">Wind</span><span class="data-value">' + (s.wind_strength !== null && s.wind_strength !== undefined ? s.wind_strength + ' km/h' : '—') + '</span></div>' +
        '</div>';
    }
    return html;
  }

  function renderFormattedValidation(data) {
    if (!data || !data.entries) return '<p class="dash-error">Unrecognized validation format</p>';

    var filter = browseState.validationModelFilter;
    var entries = data.entries;
    if (filter) {
      entries = entries.filter(function(e) { return e.model_type === filter; });
    }

    var models = data.models || [];
    var html = '<div class="model-filter-bar">' +
      '<button class="browse-btn model-filter-pill' + (!filter ? ' active' : '') + '" data-vmodel="">All Models</button>';
    for (var m = 0; m < models.length; m++) {
      html += '<button class="browse-btn model-filter-pill' + (filter === models[m] ? ' active' : '') + '" data-vmodel="' + models[m] + '">' + escapeHtml(models[m]) + '</button>';
    }
    html += '</div>';

    if (entries.length === 0) {
      html += '<p class="browse-loading">No entries for this filter</p>';
      return html;
    }

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var targetTime = e.for_hour ? formatDateTime(new Date(e.for_hour)) : '—';
      var title = (e.model_type || 'Unknown') + (e.model_version ? ' v' + e.model_version : '') + ' — ' + targetTime;

      html += '<div class="data-card">' +
        '<h4><span class="model-badge">' + escapeHtml(e.model_type || '') + '</span> ' + escapeHtml(title) + '</h4>';

      if (e.predicted && e.actual && e.error) {
        html += '<div class="validation-table">' +
          '<div class="validation-row validation-header">' +
            '<span class="validation-cell"></span>' +
            '<span class="validation-cell">Predicted</span>' +
            '<span class="validation-cell">Actual</span>' +
            '<span class="validation-cell">Error</span>' +
          '</div>';
        var keys = Object.keys(e.predicted);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          var label = getPropertyLabel(key, null);
          var pred = e.predicted[key];
          var actual = e.actual[key];
          var err = e.error[key];
          var errAbs = Math.abs(err);
          var errClass = errAbs < 1 ? 'error-low' : (errAbs <= 3 ? 'error-medium' : 'error-high');
          var isTemp = key.indexOf('temp') !== -1;
          html += '<div class="validation-row">' +
            '<span class="validation-cell data-label">' + label + '</span>' +
            '<span class="validation-cell data-value">' + (isTemp ? formatTemp(pred) : pred) + '</span>' +
            '<span class="validation-cell data-value">' + (isTemp ? formatTemp(actual) : actual) + '</span>' +
            '<span class="validation-cell data-value ' + errClass + '">' + (isTemp ? formatDeltaTemp(err) : (err > 0 ? '+' : '') + err.toFixed(1)) + '</span>' +
          '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    return html;
  }

  function renderBrowseDisplay() {
    var display = document.querySelector('.browse-display');
    if (!display || !browseState.currentData) return;

    if (browseState.viewMode === 'raw') {
      display.innerHTML = '<pre class="raw-json">' + escapeHtml(JSON.stringify(browseState.currentData, null, 2)) + '</pre>';
      return;
    }

    var cat = browseState.category;
    if (cat === 'readings') {
      display.innerHTML = renderFormattedReading(browseState.currentData);
    } else if (cat === 'predictions') {
      var data = browseState.currentData;
      if (Array.isArray(data)) {
        display.innerHTML = data.map(function(d) { return renderFormattedPrediction(d); }).join('');
      } else {
        display.innerHTML = renderFormattedPrediction(data);
      }
    } else if (cat === 'public-stations') {
      display.innerHTML = renderFormattedPublicStation(browseState.currentData);
    } else if (cat === 'validation') {
      display.innerHTML = renderFormattedValidation(browseState.currentData);
      wireValidationModelFilter();
    }
  }

  function wireValidationModelFilter() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl) return;
    var vmodelBtns = browseEl.querySelectorAll('[data-vmodel]');
    vmodelBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.validationModelFilter = btn.dataset.vmodel || null;
        renderBrowseDisplay();
      });
    });
  }

  function formatHourLabel(h) {
    if (!h || h.length < 4) return h;
    var hh = parseInt(h.substring(0, 2), 10);
    var mm = h.substring(2, 4);
    if (use24h) {
      return (hh < 10 ? '0' + hh : hh) + ':' + mm;
    }
    var h12 = hh % 12 || 12;
    var ampm = hh < 12 ? 'AM' : 'PM';
    return h12 + ':' + mm + ' ' + ampm;
  }

  var CATEGORIES = [
    { key: 'readings', label: 'Home Readings' },
    { key: 'predictions', label: 'Predictions' },
    { key: 'public-stations', label: 'Public Stations' },
    { key: 'validation', label: 'Prediction History' }
  ];

  var activeSubtab = 'dashboard';

  var workflowLoaded = false;
  var workflowData = null;
  var countdownInterval = null;

  function loadWorkflow() {
    var el = document.getElementById('subtab-workflow');
    if (el) el.innerHTML = '<p class="browse-loading">Loading pipeline status\u2026</p>';

    fetch('https://api.the-fish-tank.com/ml/status')
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function(data) {
        workflowData = data;
        renderWorkflow();
      })
      .catch(function() {
        if (el) el.innerHTML = '<p class="dash-error">Pipeline status unavailable</p>';
      });
  }

  function formatDurationSec(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.round(seconds % 60);
    return m + 'm ' + s + 's';
  }

  function formatDurationMs(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(function() {
      var el = document.getElementById('workflow-countdown');
      if (!el || !workflowData || !workflowData.last_run) return;
      var lastRun = new Date(workflowData.last_run.timestamp).getTime();
      var next = lastRun + 20 * 60 * 1000;
      var now = Date.now();
      var diff = next - now;
      if (diff <= 0) {
        var overdue = Math.floor(Math.abs(diff) / 60000);
        el.textContent = overdue === 0 ? 'Due now' : 'Overdue by ' + overdue + 'm';
      } else {
        var m = Math.floor(diff / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        el.textContent = m + 'm ' + s + 's';
      }
    }, 1000);
  }

  function renderWorkflow() {
    var el = document.getElementById('subtab-workflow');
    if (!el || !workflowData) return;

    var html = '';
    var run = workflowData.last_run;

    if (run) {
      var statusLabel = run.status === 'ok' ? 'Success' : run.status === 'error' ? 'Error' : run.status === 'partial' ? 'Partial' : run.status;
      var dotClass = run.status === 'ok' ? 'success' : run.status === 'error' ? 'failure' : 'in_progress';
      var time = run.timestamp ? formatDateTime(new Date(run.timestamp)) : '\u2014';

      html += '<div class="dash-card">' +
        '<h2>Latest Run</h2>' +
        '<div class="data-field"><span class="data-label">Status</span><span class="data-value"><span class="status-dot ' + dotClass + '"></span> ' + statusLabel + '</span></div>' +
        '<div class="data-field"><span class="data-label">Trigger</span><span class="data-value">Scheduled</span></div>' +
        '<div class="data-field"><span class="data-label">Time</span><span class="data-value">' + time + '</span></div>' +
        '<div class="data-field"><span class="data-label">Duration</span><span class="data-value">' + formatDurationSec(run.duration_seconds) + '</span></div>' +
      '</div>';

      if (run.steps && run.steps.length > 0) {
        var stepRows = run.steps.map(function(step) {
          var sDot = step.status === 'ok' ? 'success' : 'failure';
          var sLabel = step.status === 'ok' ? 'OK' : 'Error';
          var name = step.name.replace(/_/g, ' ');
          var row = '<tr>' +
            '<td class="step-name">' + name + '</td>' +
            '<td><span class="status-dot ' + sDot + '"></span> ' + sLabel + '</td>' +
            '<td>' + formatDurationMs(step.duration_ms) + '</td>' +
          '</tr>';
          if (step.error) {
            row += '<tr><td colspan="3" class="step-error">' + escapeHtml(step.error) + '</td></tr>';
          }
          return row;
        }).join('');

        html += '<div class="dash-card">' +
          '<h2>Pipeline Steps</h2>' +
          '<table class="pipeline-table">' +
            '<thead><tr><th>Step</th><th>Status</th><th>Duration</th></tr></thead>' +
            '<tbody>' + stepRows + '</tbody>' +
          '</table>' +
        '</div>';
      }
    }

    if (run && run.timestamp) {
      var nextTime = formatDateTime(new Date(new Date(run.timestamp).getTime() + 20 * 60 * 1000));
      html += '<div class="dash-card">' +
        '<h2>Next Scheduled Run</h2>' +
        '<div class="data-field"><span class="data-label">Scheduled</span><span class="data-value">' + nextTime + '</span></div>' +
        '<div class="data-field"><span class="data-label">Countdown</span><span class="countdown-value" id="workflow-countdown">\u2014</span></div>' +
      '</div>';
    }

    var pred = workflowData.last_prediction;
    if (pred && pred.models) {
      var modelNames = Object.keys(pred.models);
      modelNames.sort(function(a, b) {
        var aMulti = a.indexOf('multiHorizon') === 0;
        var bMulti = b.indexOf('multiHorizon') === 0;
        if (aMulti && !bMulti) return 1;
        if (!aMulti && bMulti) return -1;
        return a.localeCompare(b);
      });

      var predRows = modelNames.map(function(name) {
        var m = pred.models[name];
        return '<tr>' +
          '<td>' + name + '</td>' +
          '<td>' + formatTemp(m.indoor) + '</td>' +
          '<td>' + formatTemp(m.outdoor) + '</td>' +
        '</tr>';
      }).join('');

      html += '<div class="dash-card">' +
        '<h2>Latest Predictions</h2>' +
        '<table class="pipeline-table">' +
          '<thead><tr><th>Model</th><th>Indoor</th><th>Outdoor</th></tr></thead>' +
          '<tbody>' + predRows + '</tbody>' +
        '</table>' +
      '</div>';
    }

    el.innerHTML = html;
    startCountdown();
  }

  var latestData = null;

  function buildToolbarHtml() {
    return '<div class="dash-toolbar">' +
      '<div class="toolbar-group">' +
        '<span class="toolbar-label">Time</span>' +
        '<div class="toolbar-toggle" id="time-format-toggle">' +
          '<button class="toggle-option' + (!use24h ? ' active' : '') + '" data-value="12h">12h</button>' +
          '<button class="toggle-option' + (use24h ? ' active' : '') + '" data-value="24h">24h</button>' +
        '</div>' +
      '</div>' +
      '<div class="toolbar-group">' +
        '<span class="toolbar-label">Unit</span>' +
        '<div class="toolbar-toggle" id="unit-toggle">' +
          '<button class="toggle-option' + (currentUnit === 'C' ? ' active' : '') + '" data-value="C">\u00b0C</button>' +
          '<button class="toggle-option' + (currentUnit === 'F' ? ' active' : '') + '" data-value="F">\u00b0F</button>' +
          '<button class="toggle-option' + (currentUnit === 'K' ? ' active' : '') + '" data-value="K">K</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function wireToolbarHandlers(root, rerender) {
    root.querySelector('#time-format-toggle').addEventListener('click', function(e) {
      var btn = e.target.closest('.toggle-option');
      if (!btn) return;
      use24h = btn.dataset.value === '24h';
      localStorage.setItem('timeFormat', use24h ? '24h' : '12h');
      rerender();
    });
    root.querySelector('#unit-toggle').addEventListener('click', function(e) {
      var btn = e.target.closest('.toggle-option');
      if (!btn) return;
      currentUnit = btn.dataset.value;
      localStorage.setItem('tempUnit', currentUnit);
      rerender();
    });
  }

  function timeAgoText(date) {
    var mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 48) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  }

  function outdoorKey(values, pm) {
    var key = null;
    Object.keys(values).forEach(function(k) {
      if (key) return;
      var isTemp = (pm && pm[k] && pm[k].format === 'temperature') || k.indexOf('temp') !== -1;
      if (isTemp && k.indexOf('outdoor') !== -1) key = k;
    });
    if (!key) Object.keys(values).forEach(function(k) {
      if (!key && ((pm && pm[k] && pm[k].format === 'temperature') || k.indexOf('temp') !== -1)) key = k;
    });
    return key || Object.keys(values)[0] || null;
  }

  // Turns an internal model_type into a short readable {horizon, family} label.
  function modelLabel(mt) {
    if (!mt) return { h: '', fam: '' };
    var hm = mt.match(/(\d+)\s*h/i);
    var h = hm ? hm[1] + 'h' : '';
    var fam;
    if (/multiHorizon/i.test(mt)) fam = 'multi-horizon';
    else if (/raw/i.test(mt)) fam = 'raw';
    else if (/RC|GB|pub/i.test(mt)) fam = 'ensemble';
    else fam = mt;
    return { h: h || '•', fam: fam };
  }

  // Picks a random handful of the most-recent forecast per model so the tile
  // shows a rotating sample of the live model ensemble on each load.
  function homeModelChipsHtml(data, pm) {
    if (!Array.isArray(data.predictions) || !data.predictions.length) return '';
    var byModel = {};
    data.predictions.forEach(function(p) {
      if (!p.model_type || !p.values) return;
      var t = parseTimestamp(p.prediction_for);
      if (!t) return;
      var cur = byModel[p.model_type];
      if (!cur || t.getTime() > cur.t.getTime()) byModel[p.model_type] = { t: t, p: p };
    });
    var list = Object.keys(byModel).map(function(k) { return byModel[k]; });
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    var rows = list.slice(0, 3).map(function(e) {
      var key = outdoorKey(e.p.values, pm);
      if (!key) return '';
      var lbl = modelLabel(e.p.model_type);
      return '<div class="wx-model">' +
        '<span class="wx-model-h">' + escapeHtml(lbl.h) + '</span>' +
        '<span class="wx-model-fam">' + escapeHtml(lbl.fam) + '</span>' +
        '<span class="wx-model-val">' + formatProperty(key, e.p.values[key], pm) + '</span>' +
        '<span class="wx-model-for">' + formatTime(e.t) + '</span>' +
      '</div>';
    }).join('');
    if (!rows) return '';
    var total = Object.keys(byModel).length;
    return '<div class="wx-models-head">Recent model forecasts · ' + total + ' live</div>' +
      '<div class="wx-models">' + rows + '</div>';
  }

  // Renders the compact weather tile on the home hub and updates the hero
  // status strip. The full dashboard (toolbar, prediction cards) lives behind
  // sign-in in the weather view.
  function renderHomeSummary(data) {
    var el = document.getElementById('home-weather-tile');
    if (!el) return;

    var pm = data.property_meta || null;
    var readings = (data.current && data.current.readings) || {};
    var order = ['temp_outdoor', 'temp_indoor'];
    var keys = Object.keys(readings).sort(function(a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    var blocks = keys.slice(0, 2).map(function(key) {
      return '<div>' +
        '<div class="hub-big">' + formatProperty(key, readings[key], pm) + '</div>' +
        '<div class="hub-sub">' + getPropertyLabel(key, pm).toLowerCase() + '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      staleNoticeHtml(data.generated_at) +
      (blocks ? '<div class="hub-metric-row">' + blocks + '</div>'
              : '<div class="hub-sub">No current reading</div>') +
      homeModelChipsHtml(data, pm);

    var d = parseTimestamp(data.generated_at);
    var statusEl = document.getElementById('hub-weather-status');
    if (statusEl && d) {
      statusEl.textContent = 'Potter weather · updated ' + timeAgoText(d);
    }
    var dotState = isStale(d) ? 'stale' : 'success';
    ['hub-weather-dot', 'hub-tile-dot'].forEach(function(id) {
      var dot = document.getElementById(id);
      if (dot && d) dot.className = 'status-dot ' + dotState;
    });
  }

  function render(data) {
    latestData = data;

    var isV2 = false;
    if (data.schema_version && data.schema_version >= 2) {
      if (data.current && data.current.readings &&
          typeof data.current.readings === 'object' &&
          Array.isArray(data.predictions)) {
        isV2 = true;
      }
    }

    try {
      if (isV2) {
        renderV2(data);
      } else {
        renderV1(data);
      }
    } catch (e) {
      console.error('Render error, falling back to v1:', e);
      try { renderV1(data); } catch (e2) {
        container.innerHTML =
          '<p>Error loading weather data. Please refresh.</p>';
      }
    }

    var homeEl = document.getElementById('home');
    if (homeEl && homeEl.classList.contains('active')) {
      renderHomeSummary(data);
    }
  }

  function renderV1(data) {
    container.innerHTML =
      '<div class="dashboard">' +
        '<div class="dash-subnav">' +
          '<button class="subnav-btn' + (activeSubtab === 'dashboard' ? ' active' : '') + '" data-subtab="dashboard">Dashboard</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'browse' ? ' active' : '') + '" data-subtab="browse">Browse Data</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'workflow' ? ' active' : '') + '" data-subtab="workflow">Workflow</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'rankings' ? ' active' : '') + '" data-subtab="rankings">Feature Rankings</button>' +
        '</div>' +
        buildToolbarHtml() +
        '<div class="dash-subtab" id="subtab-dashboard"' + (activeSubtab !== 'dashboard' ? ' style="display:none"' : '') + '>' +
          '<div class="dash-cards">' +
            renderCurrent(data.current) +
            renderPrediction(data.next_prediction) +
          '</div>' +
          renderHistory(data.history) +
          '<div class="dash-updated">Last updated: ' + formatDateTime(new Date(data.generated_at)) + '</div>' +
        '</div>' +
        '<div class="dash-subtab" id="subtab-browse"' + (activeSubtab !== 'browse' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-workflow"' + (activeSubtab !== 'workflow' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-rankings"' + (activeSubtab !== 'rankings' ? ' style="display:none"' : '') + '></div>' +
      '</div>';

    wireSharedHandlers(data);
  }

  var PRED_FILTER_KEY = 'fishtank_pred_filter';
  var predictionState = {
    predictions: [],
    propertyMeta: null,
    filterModels: [],
    filterHorizon: 'all'
  };

  try {
    var savedPredFilter = localStorage.getItem(PRED_FILTER_KEY);
    if (savedPredFilter) {
      var pf = JSON.parse(savedPredFilter);
      if (pf.filterModels) predictionState.filterModels = pf.filterModels;
      if (pf.filterHorizon) predictionState.filterHorizon = pf.filterHorizon;
    }
  } catch (e) {}

  function savePredFilterPrefs() {
    try {
      localStorage.setItem(PRED_FILTER_KEY, JSON.stringify({
        filterModels: predictionState.filterModels,
        filterHorizon: predictionState.filterHorizon
      }));
    } catch (e) {}
  }

  function getHorizon(pred) {
    var modelType = pred.model_type || '';
    var match = modelType.match(/_(\d+)h$/);
    if (match) return parseInt(match[1], 10);
    if (pred.prediction_for && pred.generated_at) {
      var diff = new Date(pred.prediction_for).getTime() - new Date(pred.generated_at).getTime();
      var hours = Math.round(diff / 3600000);
      if (hours > 1) return hours;
    }
    return 1;
  }

  function getHorizonLabel(hours) {
    if (hours === 1) return '1h Forecast';
    return hours + 'h Forecast';
  }

  function getHorizonGroupLabel(hours) {
    if (hours === 1) return 'Next Hour';
    return hours + '-Hour Forecast';
  }

  var historyState = {
    fullData: [],
    filtered: [],
    sorted: [],
    rendered: 0,
    pageSize: 50,
    sortCol: 'timestamp',
    sortAsc: false,
    filterModel: [],
    filterVersion: [],
    filterHorizon: 'all',
    filterDateStart: '',
    filterDateEnd: '',
    propertyMeta: null,
    properties: []
  };

  function renderV2(data) {
    var pm = data.property_meta || null;
    historyState.propertyMeta = pm;
    historyState.fullData = data.history || [];
    historyState.properties = historyState.fullData.length > 0
      ? discoverHistoryProperties(historyState.fullData[0])
      : (pm ? Object.keys(pm).map(function(k) { return k.replace(/^temp_/, ''); }) : []);

    if (pm) {
      var metaOrder = Object.keys(pm).map(function(k) {
        var parts = k.split('_');
        return parts.length > 1 ? parts.slice(1).join('_') : k;
      });
      var unique = [];
      metaOrder.forEach(function(s) {
        if (unique.indexOf(s) === -1 && historyState.properties.indexOf(s) !== -1) unique.push(s);
      });
      historyState.properties.forEach(function(s) {
        if (unique.indexOf(s) === -1) unique.push(s);
      });
      historyState.properties = unique;
    }

    container.innerHTML =
      '<div class="dashboard">' +
        '<div class="dash-subnav">' +
          '<button class="subnav-btn' + (activeSubtab === 'dashboard' ? ' active' : '') + '" data-subtab="dashboard">Dashboard</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'browse' ? ' active' : '') + '" data-subtab="browse">Browse Data</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'workflow' ? ' active' : '') + '" data-subtab="workflow">Workflow</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'rankings' ? ' active' : '') + '" data-subtab="rankings">Feature Rankings</button>' +
        '</div>' +
        buildToolbarHtml() +
        '<div class="dash-subtab" id="subtab-dashboard"' + (activeSubtab !== 'dashboard' ? ' style="display:none"' : '') + '>' +
          renderCurrentV2(data.current, pm) +
          '<div id="dash-compass-container"></div>' +
          '<div id="predictions-v2-container"></div>' +
          '<div id="history-v2-container"></div>' +
          '<div class="dash-updated">Last updated: ' + formatDateTime(new Date(data.generated_at)) + '</div>' +
        '</div>' +
        '<div class="dash-subtab" id="subtab-browse"' + (activeSubtab !== 'browse' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-workflow"' + (activeSubtab !== 'workflow' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-rankings"' + (activeSubtab !== 'rankings' ? ' style="display:none"' : '') + '></div>' +
      '</div>';

    initPredictionsV2(data.predictions, pm);
    initHistoryV2();
    wireSharedHandlers(data);
    loadDashCompass();
  }

  function renderCurrentV2(current, propertyMeta) {
    if (!current || !current.readings) {
      return '<div class="dash-card dash-card-current"><p>No current reading available</p></div>';
    }
    var time = current.timestamp ? new Date(current.timestamp) : new Date();
    var keys = Object.keys(current.readings);
    var blocks = keys.map(function(key) {
      return '<div class="temp-block">' +
        '<span class="temp-label">' + getPropertyLabel(key, propertyMeta) + '</span>' +
        '<span class="temp-value">' + formatProperty(key, current.readings[key], propertyMeta) + '</span>' +
      '</div>';
    }).join('');

    return '<div class="dash-card dash-card-current">' +
      '<h2>Current Reading</h2>' +
      '<div class="card-time">' + formatDateTime(time) + '</div>' +
      '<div class="temp-row">' + blocks + '</div>' +
    '</div>';
  }

  function renderPredictionsV2(predictions, propertyMeta) {
    predictionState.predictions = predictions || [];
    predictionState.propertyMeta = propertyMeta;
    return buildPredictionContent();
  }

  function initPredictionsV2(predictions, propertyMeta) {
    predictionState.predictions = predictions || [];
    predictionState.propertyMeta = propertyMeta;
    var el = document.getElementById('predictions-v2-container');
    if (!el) return;
    el.innerHTML = buildPredictionContent();
    wirePredictionHandlers();
  }

  function refreshPredictionsV2() {
    var el = document.getElementById('predictions-v2-container');
    if (!el) return;
    el.innerHTML = buildPredictionContent();
    wirePredictionHandlers();
  }

  function buildPredictionContent() {
    var predictions = predictionState.predictions;
    var pm = predictionState.propertyMeta;

    if (!predictions || predictions.length === 0) {
      return '<p class="empty-state">No predictions available</p>';
    }

    var now = new Date();
    var sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    var filtered = predictions.filter(function(pred) {
      if (!pred.prediction_for) return true;
      return new Date(pred.prediction_for) > sixHoursAgo;
    });

    if (predictionState.filterModels.length > 0) {
      filtered = filtered.filter(function(pred) {
        return predictionState.filterModels.indexOf(pred.model_type) !== -1;
      });
    }

    if (predictionState.filterHorizon !== 'all') {
      var targetH = parseInt(predictionState.filterHorizon, 10);
      filtered = filtered.filter(function(pred) {
        return getHorizon(pred) === targetH;
      });
    }

    var allModels = {};
    var allHorizons = {};
    predictions.forEach(function(pred) {
      if (pred.model_type) allModels[pred.model_type] = true;
      allHorizons[getHorizon(pred)] = true;
    });
    var modelList = Object.keys(allModels).sort();
    var horizonList = Object.keys(allHorizons).map(Number).sort(function(a, b) { return a - b; });

    var filterHtml = '<div class="prediction-filters">' +
      '<span id="pred-filter-model-container"></span>' +
      '<div class="pred-horizon-btns">' +
        '<button class="pred-horizon-btn' + (predictionState.filterHorizon === 'all' ? ' active' : '') + '" data-horizon="all">All</button>';
    horizonList.forEach(function(h) {
      filterHtml += '<button class="pred-horizon-btn' + (predictionState.filterHorizon === String(h) ? ' active' : '') + '" data-horizon="' + h + '">' + h + 'h</button>';
    });
    filterHtml += '</div></div>';

    if (filtered.length === 0) {
      return filterHtml + '<p class="empty-state">No predictions match current filters</p>';
    }

    filtered.sort(function(a, b) {
      var ta = a.prediction_for ? new Date(a.prediction_for).getTime() : 0;
      var tb = b.prediction_for ? new Date(b.prediction_for).getTime() : 0;
      return ta - tb;
    });

    var groups = {};
    var horizonOrder = [];
    filtered.forEach(function(pred) {
      var h = getHorizon(pred);
      if (!groups[h]) {
        groups[h] = [];
        horizonOrder.push(h);
      }
      groups[h].push(pred);
    });
    horizonOrder.sort(function(a, b) { return a - b; });

    var cardsHtml = '';
    horizonOrder.forEach(function(h) {
      if (horizonOrder.length > 1) {
        cardsHtml += '<div class="prediction-group-label">' + getHorizonGroupLabel(h) + '</div>';
      }
      cardsHtml += '<div class="prediction-group-cards">';
      groups[h].forEach(function(pred) {
        var forTime = pred.prediction_for ? new Date(pred.prediction_for) : null;
        var timeStr = forTime ? formatTime(forTime) : 'Next hour';
        var values = pred.values || {};
        var blocks = Object.keys(values).map(function(key) {
          return '<div class="temp-block">' +
            '<span class="temp-label">' + getPropertyLabel(key, pm) + '</span>' +
            '<span class="temp-value">' + formatProperty(key, values[key], pm) + '</span>' +
          '</div>';
        }).join('');

        cardsHtml += '<div class="dash-card dash-card-prediction">' +
          '<div class="prediction-header">' +
            '<h2>' + getHorizonLabel(h) + '</h2>' +
            '<span class="model-badge">' + escapeHtml(pred.model_type || 'unknown') + '</span>' +
          '</div>' +
          '<div class="card-time">' + timeStr +
            (pred.model_version ? ' <span class="card-meta">v' + pred.model_version + '</span>' : '') +
          '</div>' +
          '<div class="temp-row">' + blocks + '</div>' +
        '</div>';
      });
      cardsHtml += '</div>';
    });

    return filterHtml + '<div class="dash-predictions">' + cardsHtml + '</div>';
  }

  function wirePredictionHandlers() {
    var predictions = predictionState.predictions || [];
    var allModels = {};
    predictions.forEach(function(pred) {
      if (pred.model_type) allModels[pred.model_type] = true;
    });
    var modelList = Object.keys(allModels).sort();

    var modelContainer = document.getElementById('pred-filter-model-container');
    if (modelContainer) {
      modelContainer.innerHTML = '';
      modelContainer.appendChild(createMultiSelect('pred-filter-model', modelList, predictionState.filterModels, function(selected) {
        predictionState.filterModels = selected;
        savePredFilterPrefs();
        refreshPredictionsV2();
      }));
    }

    var horizonBtns = document.querySelectorAll('.pred-horizon-btn');
    horizonBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        predictionState.filterHorizon = btn.dataset.horizon;
        savePredFilterPrefs();
        refreshPredictionsV2();
      });
    });
  }

  function getHistoryTimestamp(entry) {
    if (entry.timestamp) return new Date(entry.timestamp);
    return new Date(entry.date + 'T' + (entry.hour < 10 ? '0' : '') + entry.hour + ':00:00Z');
  }

  function getHistoryHorizon(entry) {
    var modelType = entry.model_type || '';
    var match = modelType.match(/_(\d+)h$/);
    if (match) return parseInt(match[1], 10);
    return 1;
  }

  function getHistoryHorizonLabel(entry) {
    return getHistoryHorizon(entry) + 'h';
  }

  function applyHistoryFilters() {
    if (_db && !_dbFailed) {
      applyHistoryFiltersFromDb();
      return;
    }
    var data = historyState.fullData;
    historyState.filtered = data.filter(function(entry) {
      if (historyState.filterModel.length > 0 && historyState.filterModel.indexOf(entry.model_type) === -1) return false;
      if (historyState.filterVersion.length > 0 && historyState.filterVersion.indexOf(String(entry.model_version)) === -1) return false;
      if (historyState.filterHorizon !== 'all') {
        if (getHistoryHorizon(entry) !== parseInt(historyState.filterHorizon, 10)) return false;
      }
      if (historyState.filterDateStart || historyState.filterDateEnd) {
        var d = entry.date || (entry.timestamp ? entry.timestamp.substring(0, 10) : '');
        if (historyState.filterDateStart && d < historyState.filterDateStart) return false;
        if (historyState.filterDateEnd && d > historyState.filterDateEnd) return false;
      }
      return true;
    });
  }

  function applyHistoryFiltersFromDb() {
    var sql = "SELECT * FROM prediction_history WHERE 1=1";
    var params = [];

    if (historyState.filterModel.length > 0) {
      sql += " AND model_type IN (" + historyState.filterModel.map(function() { return "?"; }).join(",") + ")";
      params = params.concat(historyState.filterModel);
    }
    if (historyState.filterVersion.length > 0) {
      sql += " AND model_version IN (" + historyState.filterVersion.map(function() { return "?"; }).join(",") + ")";
      params = params.concat(historyState.filterVersion.map(Number));
    }
    if (historyState.filterDateStart) {
      sql += " AND for_hour >= ?";
      params.push(historyState.filterDateStart);
    }
    if (historyState.filterDateEnd) {
      sql += " AND for_hour <= ?";
      params.push(historyState.filterDateEnd + 'T23:59:59');
    }
    if (historyState.filterHorizon !== 'all') {
      sql += " AND model_type LIKE ?";
      params.push('%_' + historyState.filterHorizon + 'h');
    }

    sql += " ORDER BY for_hour DESC";

    var rows = queryDb(sql, params);
    historyState.filtered = rows.map(function(r) {
      return {
        timestamp: r.for_hour,
        date: r.for_hour ? r.for_hour.substring(0, 10) : '',
        model_type: r.model_type,
        model_version: r.model_version,
        actual_indoor: r.actual_indoor,
        actual_outdoor: r.actual_outdoor,
        predicted_indoor: r.predicted_indoor,
        predicted_outdoor: r.predicted_outdoor,
        delta_indoor: r.error_indoor,
        delta_outdoor: r.error_outdoor
      };
    });

    if (historyState.properties.length === 0) {
      historyState.properties = ['indoor', 'outdoor'];
    }
  }

  function applyHistorySort() {
    if (_db && !_dbFailed && historyState.filtered.length > 0 && historyState.filtered[0].timestamp) {
      // Data from DB is already sorted by for_hour DESC; re-sort if user changed column
    }
    var col = historyState.sortCol;
    var asc = historyState.sortAsc;
    historyState.sorted = historyState.filtered.slice().sort(function(a, b) {
      var va, vb;
      if (col === 'timestamp') {
        va = getHistoryTimestamp(a).getTime();
        vb = getHistoryTimestamp(b).getTime();
      } else if (col === 'horizon') {
        va = getHistoryHorizon(a);
        vb = getHistoryHorizon(b);
      } else if (col === 'model_type') {
        va = a.model_type || '';
        vb = b.model_type || '';
      } else if (col === 'model_version') {
        va = a.model_version || 0;
        vb = b.model_version || 0;
      } else {
        va = a[col] !== undefined && a[col] !== null ? a[col] : -Infinity;
        vb = b[col] !== undefined && b[col] !== null ? b[col] : -Infinity;
      }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }

  function buildHistoryTableV2() {
    var pm = historyState.propertyMeta;
    var props = historyState.properties;
    var sorted = historyState.sorted;
    var limit = Math.min(historyState.rendered + historyState.pageSize, sorted.length);

    var headerCells = '<th class="sortable" data-sort="timestamp">Time' + sortIndicator('timestamp') + '</th>' +
      '<th class="sortable" data-sort="model_type">Model' + sortIndicator('model_type') + '</th>' +
      '<th class="sortable model-version-col" data-sort="model_version">Version' + sortIndicator('model_version') + '</th>' +
      '<th class="sortable horizon-col" data-sort="horizon">Horizon' + sortIndicator('horizon') + '</th>';

    props.forEach(function(suffix) {
      var metaKey = resolvePropertyKey(suffix, pm);
      var label = getPropertyLabel(metaKey, pm);
      headerCells += '<th class="sortable" data-sort="actual_' + suffix + '">' + label + sortIndicator('actual_' + suffix) + '</th>' +
        '<th class="sortable" data-sort="predicted_' + suffix + '">Predicted' + sortIndicator('predicted_' + suffix) + '</th>' +
        '<th class="sortable" data-sort="delta_' + suffix + '">\u0394' + sortIndicator('delta_' + suffix) + '</th>';
    });

    var avgCells = '<th></th><th></th><th></th><th></th>';
    props.forEach(function(suffix) {
      var deltas = sorted.filter(function(e) {
        return e['delta_' + suffix] !== undefined && e['delta_' + suffix] !== null;
      }).map(function(e) {
        return e['delta_' + suffix];
      });
      var avgDelta = deltas.length > 0
        ? deltas.reduce(function(a, b) { return a + b; }, 0) / deltas.length
        : null;
      avgCells += '<th></th><th></th>';
      if (avgDelta !== null) {
        avgCells += '<th class="avg-delta ' + deltaClass(avgDelta) + '">avg ' + formatDeltaTemp(avgDelta) + '</th>';
      } else {
        avgCells += '<th></th>';
      }
    });

    var rows = '';
    for (var i = 0; i < limit; i++) {
      var entry = sorted[i];
      var time = getHistoryTimestamp(entry);
      rows += '<tr>' +
        '<td>' + formatDateTime(time) + '</td>' +
        '<td>' + (entry.model_type ? escapeHtml(entry.model_type) : '—') + '</td>' +
        '<td class="model-version-col">' + (entry.model_version ? 'v' + entry.model_version : '—') + '</td>' +
        '<td class="horizon-col">' + getHistoryHorizonLabel(entry) + '</td>';
      props.forEach(function(suffix) {
        var actual = entry['actual_' + suffix];
        var predicted = entry['predicted_' + suffix];
        var delta = entry['delta_' + suffix];
        var propKey = resolvePropertyKey(suffix, pm);
        rows += '<td>' + formatProperty(propKey, actual, pm) + '</td>' +
          '<td>' + formatProperty(propKey, predicted, pm) + '</td>' +
          '<td class="' + (delta !== undefined && delta !== null ? deltaClass(delta) : '') + '">' +
            (delta !== undefined && delta !== null ? formatDeltaTemp(delta) : '—') + '</td>';
      });
      rows += '</tr>';
    }

    historyState.rendered = limit;
    var showMore = limit < sorted.length;

    return '<div class="history-section">' +
      '<h2>Prediction History</h2>' +
      buildHistoryFilters() +
      '<div class="history-row-count">Showing ' + limit + ' of ' + sorted.length + ' predictions</div>' +
      '<div class="table-scroll">' +
      '<table id="history-table">' +
        '<thead><tr>' + headerCells + '</tr><tr class="avg-row">' + avgCells + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '</div>' +
      (showMore ? '<button class="show-more-btn" id="history-show-more">Show more</button>' : '') +
    '</div>';
  }

  function sortIndicator(col) {
    if (historyState.sortCol !== col) return '';
    return historyState.sortAsc ? ' \u25B2' : ' \u25BC';
  }

  function buildHistoryFilters() {
    var dates = historyState.fullData.map(function(e) {
      return e.date || (e.timestamp ? e.timestamp.substring(0, 10) : '');
    }).filter(Boolean);
    var minDate = dates.length > 0 ? dates.reduce(function(a, b) { return a < b ? a : b; }) : '';
    var maxDate = dates.length > 0 ? dates.reduce(function(a, b) { return a > b ? a : b; }) : '';

    var horizonSet = {};
    var source = historyState.fullData;
    if (_db && !_dbFailed) {
      queryDb("SELECT DISTINCT model_type FROM prediction_history ORDER BY model_type").forEach(function(r) {
        horizonSet[getHistoryHorizon({ model_type: r.model_type })] = true;
      });
    } else {
      source.forEach(function(e) { horizonSet[getHistoryHorizon(e)] = true; });
    }
    var horizons = Object.keys(horizonSet).map(Number).sort(function(a, b) { return a - b; });

    var horizonBtns = '<div class="history-horizon-btns">' +
      '<button class="hist-horizon-btn' + (historyState.filterHorizon === 'all' ? ' active' : '') + '" data-horizon="all">All</button>';
    horizons.forEach(function(h) {
      horizonBtns += '<button class="hist-horizon-btn' + (historyState.filterHorizon === String(h) ? ' active' : '') + '" data-horizon="' + h + '">' + h + 'h</button>';
    });
    horizonBtns += '</div>';

    return '<div class="history-filters">' +
      '<span id="filter-model-container"></span>' +
      '<span id="filter-version-container"></span>' +
      horizonBtns +
      '<input type="date" id="filter-date-start" class="history-filter-date" value="' + historyState.filterDateStart + '"' +
        (minDate ? ' min="' + minDate + '"' : '') + (maxDate ? ' max="' + maxDate + '"' : '') + '>' +
      '<input type="date" id="filter-date-end" class="history-filter-date" value="' + historyState.filterDateEnd + '"' +
        (minDate ? ' min="' + minDate + '"' : '') + (maxDate ? ' max="' + maxDate + '"' : '') + '>' +
    '</div>';
  }

  function initHistoryV2() {
    if (!historyState.filterDateStart && !historyState.filterDateEnd) {
      var today = new Date();
      var sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      historyState.filterDateEnd = today.toISOString().substring(0, 10);
      historyState.filterDateStart = sevenDaysAgo.toISOString().substring(0, 10);
    }
    applyHistoryFilters();
    applyHistorySort();
    historyState.rendered = 0;
    var histContainer = document.getElementById('history-v2-container');
    if (!histContainer) return;

    if (historyState.sorted.length === 0 && historyState.fullData.length === 0) {
      histContainer.innerHTML = '<div class="history-empty">Prediction history building up\u2026</div>';
      return;
    }

    histContainer.innerHTML = buildHistoryTableV2();
    wireHistoryHandlers();
  }

  function refreshHistoryV2() {
    applyHistoryFilters();
    applyHistorySort();
    historyState.rendered = 0;
    var histContainer = document.getElementById('history-v2-container');
    if (!histContainer) return;

    if (historyState.sorted.length === 0) {
      histContainer.innerHTML = '<div class="history-section">' +
        '<h2>Prediction History</h2>' +
        buildHistoryFilters() +
        '<div class="history-row-count">0 predictions match filters</div>' +
        '<div class="history-empty">No predictions match current filters</div>' +
        '</div>';
      wireHistoryHandlers();
      return;
    }

    histContainer.innerHTML = buildHistoryTableV2();
    wireHistoryHandlers();
  }

  function buildFilterDropdowns() {
    var modelOptions = [];
    var modelSet = {};

    if (_db && !_dbFailed) {
      queryDb("SELECT DISTINCT model_type FROM prediction_history ORDER BY model_type").forEach(function(r) {
        modelOptions.push(r.model_type);
      });
    } else {
      historyState.fullData.forEach(function(entry) {
        if (entry.model_type && !modelSet[entry.model_type]) {
          modelSet[entry.model_type] = true;
          modelOptions.push(entry.model_type);
        }
      });
      modelOptions.sort();
    }

    var modelContainer = document.getElementById('filter-model-container');
    if (modelContainer) {
      modelContainer.innerHTML = '';
      modelContainer.appendChild(createMultiSelect('filter-model', modelOptions, historyState.filterModel, function(selected) {
        historyState.filterModel = selected;
        historyState.filterVersion = [];
        refreshHistoryV2();
      }));
    }

    var versionOptions = [];
    var versionSet = {};

    if (_db && !_dbFailed) {
      var vSql = "SELECT DISTINCT model_version FROM prediction_history";
      var vParams = [];
      if (historyState.filterModel.length > 0) {
        vSql += " WHERE model_type IN (" + historyState.filterModel.map(function() { return "?"; }).join(",") + ")";
        vParams = historyState.filterModel;
      }
      vSql += " ORDER BY model_version";
      queryDb(vSql, vParams).forEach(function(r) {
        versionOptions.push(String(r.model_version));
      });
    } else {
      historyState.fullData.forEach(function(entry) {
        var v = String(entry.model_version);
        if (historyState.filterModel.length > 0 && historyState.filterModel.indexOf(entry.model_type) === -1) return;
        if (!versionSet[v]) {
          versionSet[v] = true;
          versionOptions.push(v);
        }
      });
      versionOptions.sort(function(a, b) { return Number(a) - Number(b); });
    }

    var versionContainer = document.getElementById('filter-version-container');
    if (versionContainer) {
      versionContainer.innerHTML = '';
      versionContainer.appendChild(createMultiSelect('filter-version', versionOptions, historyState.filterVersion, function(selected) {
        historyState.filterVersion = selected;
        refreshHistoryV2();
      }));
    }
  }

  function wireHistoryHandlers() {
    buildFilterDropdowns();

    var histHorizonBtns = document.querySelectorAll('.hist-horizon-btn');
    histHorizonBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        historyState.filterHorizon = btn.dataset.horizon;
        refreshHistoryV2();
      });
    });

    var sortHeaders = document.querySelectorAll('#history-table .sortable');
    sortHeaders.forEach(function(th) {
      th.addEventListener('click', function() {
        var col = th.dataset.sort;
        if (historyState.sortCol === col) {
          historyState.sortAsc = !historyState.sortAsc;
        } else {
          historyState.sortCol = col;
          historyState.sortAsc = true;
        }
        refreshHistoryV2();
      });
    });

    var dateStart = document.getElementById('filter-date-start');
    if (dateStart) {
      dateStart.addEventListener('change', function() {
        historyState.filterDateStart = dateStart.value;
        refreshHistoryV2();
      });
    }

    var dateEnd = document.getElementById('filter-date-end');
    if (dateEnd) {
      dateEnd.addEventListener('change', function() {
        historyState.filterDateEnd = dateEnd.value;
        refreshHistoryV2();
      });
    }

    var showMoreBtn = document.getElementById('history-show-more');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', function() {
        var tbody = document.querySelector('#history-table tbody');
        if (!tbody) return;
        var sorted = historyState.sorted;
        var pm = historyState.propertyMeta;
        var props = historyState.properties;
        var start = historyState.rendered;
        var end = Math.min(start + historyState.pageSize, sorted.length);

        for (var i = start; i < end; i++) {
          var entry = sorted[i];
          var time = getHistoryTimestamp(entry);
          var tr = document.createElement('tr');
          var cells = '<td>' + formatDateTime(time) + '</td>' +
            '<td>' + (entry.model_type ? escapeHtml(entry.model_type) : '—') + '</td>' +
            '<td class="model-version-col">' + (entry.model_version ? 'v' + entry.model_version : '—') + '</td>' +
            '<td class="horizon-col">' + getHistoryHorizonLabel(entry) + '</td>';
          props.forEach(function(suffix) {
            var actual = entry['actual_' + suffix];
            var predicted = entry['predicted_' + suffix];
            var delta = entry['delta_' + suffix];
            var propKey = resolvePropertyKey(suffix, pm);
            cells += '<td>' + formatProperty(propKey, actual, pm) + '</td>' +
              '<td>' + formatProperty(propKey, predicted, pm) + '</td>' +
              '<td class="' + (delta !== undefined && delta !== null ? deltaClass(delta) : '') + '">' +
                (delta !== undefined && delta !== null ? formatDeltaTemp(delta) : '—') + '</td>';
          });
          tr.innerHTML = cells;
          tbody.appendChild(tr);
        }

        historyState.rendered = end;
        var countEl = document.querySelector('.history-row-count');
        if (countEl) countEl.textContent = 'Showing ' + end + ' of ' + sorted.length + ' predictions';
        if (end >= sorted.length) showMoreBtn.style.display = 'none';
      });
    }

    container.querySelectorAll('.table-scroll').forEach(function(el) {
      el.addEventListener('scroll', function() {
        var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5;
        el.classList.toggle('scrolled-end', atEnd);
      });
    });
  }

  function renderFeatureRankings(data) {
    var container = document.getElementById('subtab-rankings');
    var rankings = data.feature_rankings;

    if (!rankings || rankings.length === 0) {
      container.innerHTML =
        '<div class="rankings-empty">' +
          '<h2>Feature Rankings</h2>' +
          '<p>No feature rankings available yet. Rankings are generated during model training when sufficient data has accumulated.</p>' +
        '</div>';
      return;
    }

    var modelOptions = '<option value="__compare__">Compare All</option>';
    modelOptions += rankings.map(function(r) {
      return '<option value="' + escapeHtml(r.model_type) + '">' + escapeHtml(r.model_type) + '</option>';
    }).join('');

    container.innerHTML =
      '<div class="rankings-section">' +
        '<h2>Feature Rankings</h2>' +
        '<div class="rankings-controls">' +
          '<select id="rankings-model-select" class="rankings-select">' +
            modelOptions +
          '</select>' +
          '<select id="rankings-topn-select" class="rankings-select">' +
            '<option value="10">Top 10</option>' +
            '<option value="25">Top 25</option>' +
            '<option value="50" selected>Top 50</option>' +
            '<option value="100">Top 100</option>' +
            '<option value="0">All</option>' +
          '</select>' +
          '<input type="text" id="rankings-search" class="rankings-search" placeholder="Search features\u2026">' +
          '<span id="rankings-meta" class="rankings-meta"></span>' +
        '</div>' +
        '<div id="rankings-list"></div>' +
      '</div>';

    var select = document.getElementById('rankings-model-select');
    var topNSelect = document.getElementById('rankings-topn-select');
    var searchInput = document.getElementById('rankings-search');

    function refreshRankings() {
      if (select.value === '__compare__') {
        renderRankingsComparison(rankings, searchInput.value, parseInt(topNSelect.value, 10));
      } else {
        renderRankingsForModel(rankings, select.value, searchInput.value, parseInt(topNSelect.value, 10));
      }
    }

    refreshRankings();

    select.addEventListener('change', refreshRankings);
    topNSelect.addEventListener('change', refreshRankings);
    var searchTimer = null;
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refreshRankings, 200);
    });
  }

  function renderRankingsForModel(rankings, modelType, searchFilter, topN) {
    var data = rankings.find(function(r) { return r.model_type === modelType; });
    if (!data) return;

    var meta = document.getElementById('rankings-meta');
    var genDate = data.generated_at ? formatDateTime(new Date(data.generated_at)) : '';
    meta.textContent = data.nonzero_count + ' of ' + data.feature_count + ' features with signal' +
      (genDate ? ' — updated ' + genDate : '');

    var features = data.features;
    if (searchFilter) {
      var q = searchFilter.toLowerCase();
      features = features.filter(function(f) { return f.name.toLowerCase().indexOf(q) !== -1; });
    }
    if (topN > 0) {
      features = features.slice(0, topN);
    }

    var maxCoef = 0;
    features.forEach(function(f) {
      var abs = Math.abs(f.coefficient);
      if (abs > maxCoef) maxCoef = abs;
    });

    var rows = features.map(function(f, i) {
      var abs = Math.abs(f.coefficient);
      var pct = maxCoef > 0 ? (abs / maxCoef * 100) : 0;
      var direction = f.coefficient > 0 ? 'positive' : 'negative';
      var sign = f.coefficient > 0 ? '+' : '';
      return '<div class="ranking-row">' +
        '<span class="ranking-rank">' + (i + 1) + '</span>' +
        '<span class="ranking-name">' + escapeHtml(f.name) + '</span>' +
        '<span class="ranking-bar-container">' +
          '<span class="ranking-bar ranking-bar-' + direction + '" style="width:' + pct.toFixed(1) + '%"></span>' +
        '</span>' +
        '<span class="ranking-coef coef-' + direction + '">' + sign + f.coefficient.toFixed(4) + '</span>' +
      '</div>';
    }).join('');

    document.getElementById('rankings-list').innerHTML = rows ||
      '<div class="rankings-empty"><p>No features match search</p></div>';
  }

  function renderRankingsComparison(rankings, searchFilter, topN) {
    var meta = document.getElementById('rankings-meta');
    meta.textContent = 'Comparing ' + rankings.length + ' models';

    var allFeatures = {};
    rankings.forEach(function(r) {
      r.features.forEach(function(f) {
        if (!allFeatures[f.name]) allFeatures[f.name] = {};
        allFeatures[f.name][r.model_type] = f.coefficient;
      });
    });

    var featureNames = Object.keys(allFeatures);
    if (searchFilter) {
      var q = searchFilter.toLowerCase();
      featureNames = featureNames.filter(function(n) { return n.toLowerCase().indexOf(q) !== -1; });
    }

    featureNames.sort(function(a, b) {
      var maxA = 0, maxB = 0;
      rankings.forEach(function(r) {
        if (allFeatures[a][r.model_type]) maxA = Math.max(maxA, Math.abs(allFeatures[a][r.model_type]));
        if (allFeatures[b][r.model_type]) maxB = Math.max(maxB, Math.abs(allFeatures[b][r.model_type]));
      });
      return maxB - maxA;
    });

    if (topN > 0) {
      featureNames = featureNames.slice(0, topN);
    }

    var headerCells = '<th class="compare-feature-col">Feature</th>';
    rankings.forEach(function(r) {
      var label = r.model_type.replace(/_/g, ' ');
      headerCells += '<th class="compare-coef-col">' + escapeHtml(label) + '</th>';
    });

    var bodyRows = featureNames.map(function(name) {
      var cells = '<td class="compare-feature-col">' + escapeHtml(name) + '</td>';
      rankings.forEach(function(r) {
        var coef = allFeatures[name][r.model_type];
        if (coef !== undefined) {
          var direction = coef > 0 ? 'positive' : 'negative';
          var sign = coef > 0 ? '+' : '';
          cells += '<td class="compare-coef-col coef-' + direction + '">' + sign + coef.toFixed(4) + '</td>';
        } else {
          cells += '<td class="compare-coef-col">—</td>';
        }
      });
      return '<tr>' + cells + '</tr>';
    }).join('');

    document.getElementById('rankings-list').innerHTML =
      '<div class="table-scroll">' +
      '<table class="rankings-compare-table">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
      '</table>' +
      '</div>';
  }

  function wireSharedHandlers(data) {
    container.querySelectorAll('.table-scroll').forEach(function(el) {
      el.addEventListener('scroll', function() {
        var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5;
        el.classList.toggle('scrolled-end', atEnd);
      });
    });

    if (activeSubtab === 'browse') {
      enterBrowseData();
    } else if (activeSubtab === 'workflow' && workflowData) {
      renderWorkflow();
    } else if (activeSubtab === 'rankings') {
      renderFeatureRankings(data);
    }

    wireToolbarHandlers(container, function() { render(data); });

    var subnavBtns = container.querySelectorAll('.subnav-btn');
    subnavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.dataset.subtab;
        activeSubtab = target;
        if (target === 'dashboard') {
          history.replaceState(null, '', '#weather');
          wirePredictionHandlers();
        } else {
          history.replaceState(null, '', '#weather/' + target);
        }
        subnavBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        document.getElementById('subtab-dashboard').style.display = target === 'dashboard' ? '' : 'none';
        document.getElementById('subtab-browse').style.display = target === 'browse' ? '' : 'none';
        document.getElementById('subtab-workflow').style.display = target === 'workflow' ? '' : 'none';
        document.getElementById('subtab-rankings').style.display = target === 'rankings' ? '' : 'none';
        if (target !== 'workflow' && countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        if (target === 'browse') {
          enterBrowseData();
        } else if (target === 'workflow' && !workflowLoaded) {
          workflowLoaded = true;
          loadWorkflow();
        } else if (target === 'workflow' && workflowData) {
          renderWorkflow();
        } else if (target === 'rankings') {
          renderFeatureRankings(data);
        }
      });
    });
  }

  function renderError() {
    container.innerHTML =
      '<div class="dashboard">' +
        '<p class="dash-error">Weather data unavailable</p>' +
      '</div>';
  }

  var CACHE_KEY = 'fishtank_weather_data';
  var CACHE_TTL = 5 * 60 * 1000;

  function start() {
    // Auth check — redirect to home if not signed in
    if (!FishTankAuth.isAuthenticated()) {
      window.location.hash = '';
      return;
    }

    var hash = location.hash.replace('#', '');
    if (hash.startsWith('weather/')) {
      var sub = hash.split('/')[1];
      if (['dashboard', 'browse', 'workflow', 'rankings'].indexOf(sub) !== -1) {
        activeSubtab = sub;
      }
    }

    try {
      var cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < CACHE_TTL) {
          delete parsed._cachedAt;
          render(parsed);
          return;
        }
      }
    } catch (e) { /* localStorage unavailable or corrupt */ }

    fetch(AUTH_API_URL + '/data/weather', {
      headers: FishTankAuth.authHeaders()
    })
      .then(function(res) {
        if (res.status === 401) {
          FishTankAuth.signOut();
          return;
        }
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function(data) {
        if (!data) return;
        try {
          var toCache = JSON.parse(JSON.stringify(data));
          toCache._cachedAt = Date.now();
          localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
        } catch (e) {}
        render(data);
      })
      .catch(renderError);
  }

  function stop() {
    browseState.selectedHour = null;
    browseState.currentData = null;
    workflowLoaded = false;
    workflowData = null;
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function loadHomeSummary() {
    var homeEl = document.getElementById('home');
    if (!homeEl || !homeEl.classList.contains('active')) return;

    var workerUrl = AUTH_API_URL ? AUTH_API_URL + '/data/weather-public' : null;
    var primary = workerUrl ? fetch(workerUrl) : Promise.reject();
    primary
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function(data) {
        latestData = data;
        renderHomeSummary(data);
        renderNearby(data.public_stations);
      })
      .catch(function() {
        fetch('data/weather-public.json')
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          })
          .then(function(data) {
            latestData = data;
            renderHomeSummary(data);
            renderNearby(data.public_stations);
          })
          .catch(function() {
            var el = document.getElementById('home-weather-tile');
            if (el) el.innerHTML = '<div class="hub-sub">Live conditions unavailable</div>';
          });
      });
  }

  // ========== Compass Station View ==========

  var latestCompassData = null;

  function compassBearing(lat1, lon1, lat2, lon2) {
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function compassDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function computeStationPositions(stations, homeLocation) {
    if (!stations || !stations.length) return [];
    var hasServerBearing = stations[0].bearing != null;
    var cLat, cLon;
    if (!hasServerBearing) {
      if (homeLocation && homeLocation.lat != null && homeLocation.lon != null) {
        cLat = homeLocation.lat;
        cLon = homeLocation.lon;
      } else {
        var sumLat = 0, sumLon = 0;
        stations.forEach(function(s) { sumLat += s.lat; sumLon += s.lon; });
        cLat = sumLat / stations.length;
        cLon = sumLon / stations.length;
      }
    }

    var maxDist = 0;
    var positions = stations.map(function(s) {
      var b, d;
      if (hasServerBearing) {
        b = s.bearing;
        d = s.distance_km != null ? s.distance_km : 0;
      } else {
        b = compassBearing(cLat, cLon, s.lat, s.lon);
        d = compassDistance(cLat, cLon, s.lat, s.lon);
      }
      var distMi = s.distance_mi != null ? s.distance_mi : Math.round(d * 0.621371 * 10) / 10;
      if (d > maxDist) maxDist = d;
      return { id: s.id,
               temperature: s.temperature, humidity: s.humidity, pressure: s.pressure,
               rain_60min: s.rain_60min, wind_strength: s.wind_strength, wind_angle: s.wind_angle,
               bearing: b, distance: d, distance_mi: distMi };
    });

    if (maxDist === 0) maxDist = 1;
    positions.forEach(function(p) {
      p.normDist = p.distance / maxDist;
      var angle = (p.bearing - 90) * Math.PI / 180;
      var r = Math.max(0.1, p.normDist) * 0.42;
      p.leftPct = 50 + r * 100 * Math.cos(angle);
      p.topPct = 50 + r * 100 * Math.sin(angle);
    });
    return positions;
  }

  function tempColor(celsius) {
    if (celsius < 0) return '#4a9eff';
    if (celsius <= 10) return '#4acfcf';
    if (celsius <= 20) return '#ffaa4a';
    return '#ff6b4a';
  }

  function formatCompassTemp(celsius) {
    var val = convertTemp(celsius);
    return val.toFixed(1) + '\u00b0';
  }

  function groupStations(positions) {
    var groups = [];
    var used = {};
    for (var i = 0; i < positions.length; i++) {
      if (used[i]) continue;
      var group = [positions[i]];
      used[i] = true;
      for (var j = i + 1; j < positions.length; j++) {
        if (used[j]) continue;
        if (Math.abs(positions[i].leftPct - positions[j].leftPct) < 8 &&
            Math.abs(positions[i].topPct - positions[j].topPct) < 8) {
          group.push(positions[j]);
          used[j] = true;
        }
      }
      groups.push(group);
    }
    return groups;
  }

  function buildSatelliteEl(pos) {
    var sat = document.createElement('div');
    sat.className = 'compass-satellite';
    sat.setAttribute('role', 'listitem');
    sat.setAttribute('tabindex', '0');
    var dirLabel = bearingToLabel(pos.bearing);
    sat.setAttribute('aria-label', 'Station ' + pos.distance_mi + ' miles ' + dirLabel + ', ' + formatCompassTemp(pos.temperature));

    var temp = document.createElement('div');
    temp.className = 'satellite-temp';
    temp.style.background = tempColor(pos.temperature);
    temp.textContent = formatCompassTemp(pos.temperature);
    sat.appendChild(temp);

    var dist = document.createElement('div');
    dist.className = 'satellite-distance';
    dist.textContent = pos.distance_mi + ' mi';
    sat.appendChild(dist);

    var detail = document.createElement('div');
    detail.className = 'satellite-detail';
    var parts = [];
    if (pos.humidity != null) parts.push('Humidity: ' + pos.humidity + '%');
    if (pos.pressure != null) parts.push(pos.pressure + ' mb');
    if (pos.rain_60min != null) parts.push('Rain: ' + pos.rain_60min + ' mm');
    if (pos.wind_strength != null) parts.push('Wind: ' + pos.wind_strength + ' km/h');
    detail.textContent = parts.join(' · ');
    if (parts.length) sat.appendChild(detail);

    sat.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') sat.blur();
    });

    return sat;
  }

  function bearingToLabel(bearing) {
    var dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    var idx = Math.round(bearing / 45) % 8;
    return dirs[idx];
  }

  function bearingToCardinal(bearing) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(bearing / 45) % 8];
  }

  function renderCompassList(stations) {
    var sorted = stations.slice().sort(function(a, b) { return a.distance_mi - b.distance_mi; });
    var list = document.createElement('div');
    list.className = 'compass-list';
    sorted.forEach(function(s) {
      var row = document.createElement('div');
      row.className = 'compass-list-item';

      var dir = document.createElement('span');
      dir.className = 'list-direction';
      dir.textContent = bearingToCardinal(s.bearing);
      row.appendChild(dir);

      var dist = document.createElement('span');
      dist.className = 'list-distance';
      dist.textContent = s.distance_mi + ' mi';
      row.appendChild(dist);

      var temp = document.createElement('span');
      temp.className = 'list-temp';
      temp.style.background = tempColor(s.temperature);
      temp.innerHTML = formatCompassTemp(s.temperature);
      row.appendChild(temp);

      var detail = document.createElement('span');
      detail.className = 'list-detail';
      var parts = [];
      if (s.humidity != null) parts.push(s.humidity + '%');
      if (s.pressure != null) parts.push(s.pressure + ' hPa');
      detail.innerHTML = parts.join(' &middot; ');
      row.appendChild(detail);

      list.appendChild(row);
    });
    return list;
  }

  function renderCompass(data, targetId) {
    var el = document.getElementById(targetId || 'home-compass');
    if (!el) return;
    if (!data || !data.stations || !data.stations.length) {
      el.innerHTML = '';
      return;
    }

    var positions = computeStationPositions(data.stations, data.home_location);
    var groups = groupStations(positions);

    var card = document.createElement('div');
    card.className = 'compass-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Nearby weather stations');

    var header = document.createElement('div');
    header.className = 'compass-header';
    var heading = document.createElement('h2');
    heading.textContent = 'Nearby Stations';
    header.appendChild(heading);
    var toggle = document.createElement('button');
    toggle.className = 'compass-toggle';
    toggle.setAttribute('aria-label', 'Switch to list view');
    toggle.setAttribute('tabindex', '0');
    toggle.innerHTML = '<span class="toggle-icon">&#9776;</span>';
    header.appendChild(toggle);
    card.appendChild(header);

    var layout = document.createElement('div');
    layout.className = 'compass-layout';

    // SVG background: rings + cardinal labels
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 300 300');
    svg.setAttribute('class', 'compass-bg');
    svg.setAttribute('aria-hidden', 'true');

    [40, 80, 120].forEach(function(r) {
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', 150);
      circle.setAttribute('cy', 150);
      circle.setAttribute('r', r);
      circle.setAttribute('class', 'compass-ring');
      svg.appendChild(circle);
    });

    var cardinals = [
      { label: 'N', angle: -90, primary: true },
      { label: 'NE', angle: -45, primary: false },
      { label: 'E', angle: 0, primary: true },
      { label: 'SE', angle: 45, primary: false },
      { label: 'S', angle: 90, primary: true },
      { label: 'SW', angle: 135, primary: false },
      { label: 'W', angle: 180, primary: true },
      { label: 'NW', angle: -135, primary: false }
    ];
    cardinals.forEach(function(c) {
      var rad = c.angle * Math.PI / 180;
      var lx = 150 + 136 * Math.cos(rad);
      var ly = 150 + 136 * Math.sin(rad);
      var text = document.createElementNS(ns, 'text');
      text.setAttribute('x', lx);
      text.setAttribute('y', ly);
      text.setAttribute('class', 'compass-cardinal' + (c.label === 'N' ? ' compass-cardinal-n' : ''));
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('text-anchor', 'middle');
      if (!c.primary) text.setAttribute('font-size', '9');
      text.textContent = c.label;
      svg.appendChild(text);
    });

    layout.appendChild(svg);

    // Center card (user's home station)
    var centerCard = document.createElement('div');
    centerCard.className = 'compass-center';
    centerCard.setAttribute('role', 'listitem');
    centerCard.setAttribute('aria-label', 'Home station');

    var centerTemp = document.createElement('div');
    centerTemp.className = 'center-temp';
    var centerLabel = document.createElement('div');
    centerLabel.className = 'center-label';
    centerLabel.textContent = 'Home';
    var centerDetail = document.createElement('div');
    centerDetail.className = 'center-detail';

    if (latestData && latestData.current && latestData.current.readings) {
      var r = latestData.current.readings;
      var indoor = r.temp_indoor;
      var outdoor = r.temp_outdoor;
      centerTemp.textContent = formatTemp(indoor != null ? indoor : outdoor);
      var detailParts = [];
      if (indoor != null) detailParts.push('In ' + formatTemp(indoor));
      if (outdoor != null) detailParts.push('Out ' + formatTemp(outdoor));
      centerDetail.textContent = detailParts.join(' \u00b7 ');
    } else {
      centerTemp.textContent = '\u2014';
      centerDetail.textContent = '';
    }

    centerCard.appendChild(centerTemp);
    centerCard.appendChild(centerLabel);
    centerCard.appendChild(centerDetail);
    layout.appendChild(centerCard);

    // Satellite cards and stacks
    groups.forEach(function(group) {
      if (group.length === 1) {
        var pos = group[0];
        var sat = buildSatelliteEl(pos);
        sat.style.left = pos.leftPct + '%';
        sat.style.top = pos.topPct + '%';
        var floatDelay = (Math.random() * 4).toFixed(1) + 's';
        var floatDuration = (3.5 + Math.random() * 2).toFixed(1) + 's';
        sat.style.animationDelay = floatDelay;
        sat.style.animationDuration = floatDuration;
        layout.appendChild(sat);
      } else {
        var avgLeft = 0, avgTop = 0;
        group.forEach(function(p) { avgLeft += p.leftPct; avgTop += p.topPct; });
        avgLeft /= group.length;
        avgTop /= group.length;

        var stack = document.createElement('div');
        stack.className = 'compass-stack';
        stack.style.left = avgLeft + '%';
        stack.style.top = avgTop + '%';
        stack.setAttribute('role', 'listitem');
        stack.setAttribute('aria-label', group.length + ' stations ' + bearingToLabel(group[0].bearing));
        stack.setAttribute('tabindex', '0');

        var badge = document.createElement('div');
        badge.className = 'stack-badge';
        badge.textContent = group.length;
        var floatDelay2 = (Math.random() * 4).toFixed(1) + 's';
        var floatDuration2 = (3.5 + Math.random() * 2).toFixed(1) + 's';
        badge.style.animationDelay = floatDelay2;
        badge.style.animationDuration = floatDuration2;
        stack.appendChild(badge);

        group.forEach(function(pos) {
          var sat = buildSatelliteEl(pos);
          sat.style.position = 'relative';
          sat.style.transform = 'none';
          sat.removeAttribute('tabindex');
          layout.appendChild(sat);
          stack.appendChild(sat);
        });

        stack.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') stack.blur();
        });

        layout.appendChild(stack);
      }
    });

    card.appendChild(layout);

    // List view (hidden by default)
    var listEl = renderCompassList(positions);
    card.appendChild(listEl);

    // Toggle handler
    toggle.addEventListener('click', function() {
      var showingList = layout.style.display === 'none';
      if (showingList) {
        layout.style.display = 'block';
        listEl.style.display = 'none';
        toggle.innerHTML = '<span class="toggle-icon">&#9776;</span>';
        toggle.setAttribute('aria-label', 'Switch to list view');
        localStorage.setItem('compass-view-mode', 'compass');
      } else {
        layout.style.display = 'none';
        listEl.style.display = 'block';
        toggle.innerHTML = '<span class="toggle-icon">&#9678;</span>';
        toggle.setAttribute('aria-label', 'Switch to compass view');
        localStorage.setItem('compass-view-mode', 'list');
      }
    });

    // Restore saved view preference
    if (localStorage.getItem('compass-view-mode') === 'list') {
      layout.style.display = 'none';
      listEl.style.display = 'block';
      toggle.innerHTML = '<span class="toggle-icon">&#9678;</span>';
      toggle.setAttribute('aria-label', 'Switch to compass view');
    }

    // Timestamp
    var d = parseTimestamp(data.fetched_at);
    var stale = isStale(d);
    var timeStr = '';
    if (d) {
      // Stale data gets the full date so an old reading can't pass as today's.
      timeStr = stale ? formatDateTime(d) : formatTime(d);
    }
    var stationCount = data.station_count || data.stations.length;
    var meta = document.createElement('div');
    meta.className = 'compass-meta' + (stale ? ' stale' : '');
    meta.textContent = stationCount + ' stations' + (timeStr ? ' \u00b7 Updated ' + timeStr : '');
    card.appendChild(meta);

    el.innerHTML = '';
    el.appendChild(card);
  }

  function loadDashCompass() {
    var container = document.getElementById('dash-compass-container');
    if (!container) return;

    if (latestData && latestData.public_stations &&
        latestData.public_stations.stations && latestData.public_stations.stations.length) {
      renderCompass(latestData.public_stations, 'dash-compass-container');
      return;
    }

    var workerUrl = AUTH_API_URL ? AUTH_API_URL + '/data/weather-public' : null;
    var primary = workerUrl ? fetch(workerUrl) : Promise.reject();
    primary
      .then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function(d) {
        if (d && d.public_stations) {
          if (!latestData) latestData = {};
          latestData.public_stations = d.public_stations;
          renderCompass(d.public_stations, 'dash-compass-container');
        }
      })
      .catch(function() {
        fetch('data/weather-public.json')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d && d.public_stations) {
              if (!latestData) latestData = {};
              latestData.public_stations = d.public_stations;
              renderCompass(d.public_stations, 'dash-compass-container');
            }
          })
          .catch(function() {});
      });
  }

  // Compact nearby-stations summary for the home hub tile: how the neighborhood's
  // readings spread around home. The full radar compass lives on the weather
  // dashboard (#dash-compass-container).
  function renderNearby(ps) {
    var el = document.getElementById('nearby-body');
    if (!el) return;
    var stations = (ps && ps.stations) || [];
    var withTemp = stations.filter(function(s) { return typeof s.temperature === 'number'; });
    if (!withTemp.length) { el.innerHTML = '<div class="hub-sub">No nearby station data</div>'; return; }

    var temps = withTemp.map(function(s) { return s.temperature; });
    var maxMi = 0;
    stations.forEach(function(s) {
      var mi = s.distance_mi != null ? s.distance_mi : (s.distance_km != null ? s.distance_km * 0.621371 : 0);
      if (mi > maxMi) maxMi = mi;
    });
    var home = (latestData && latestData.current && latestData.current.readings &&
      typeof latestData.current.readings.temp_outdoor === 'number') ? latestData.current.readings.temp_outdoor : null;
    var all = home != null ? temps.concat([home]) : temps;
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var span = (hi - lo) || 1;
    function pct(t) { return Math.max(0, Math.min(100, (t - lo) / span * 100)); }

    var ticks = withTemp.map(function(s) {
      return '<span class="nearby-tick" style="left:' + pct(s.temperature).toFixed(1) +
        '%;background:' + tempColor(s.temperature) + '"></span>';
    }).join('');
    var homeMarker = home != null ? '<span class="nearby-home" style="left:' + pct(home).toFixed(1) + '%"></span>' : '';

    el.innerHTML =
      '<div class="nearby-inner">' +
        '<div class="nearby-head">' +
          '<div class="hub-label">Nearby stations</div>' +
          '<div><span class="hub-big">' + withTemp.length + '</span> ' +
          '<span class="hub-sub">reporting' + (maxMi ? ' · within ' + Math.round(maxMi) + ' mi' : '') + '</span></div>' +
        '</div>' +
        '<div class="nearby-range">' +
          '<div class="nearby-bar">' + ticks + homeMarker + '</div>' +
          '<div class="nearby-scale">' +
            '<span>coolest ' + formatCompassTemp(lo) + '</span>' +
            (home != null ? '<span class="nearby-mid">◉ home ' + formatCompassTemp(home) + '</span>' : '') +
            '<span>warmest ' + formatCompassTemp(hi) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Reveal the tile now that it has real data — it pops in and pushes the
    // homelab/open-source tiles below it down.
    var tile = document.getElementById('nearby-tile');
    if (tile) tile.classList.add('is-loaded');
  }

  function loadCompassData() {
    var homeEl = document.getElementById('home');
    if (!homeEl || !homeEl.classList.contains('active')) return;

    if (latestData && latestData.public_stations) {
      renderNearby(latestData.public_stations);
    } else {
      setTimeout(function() {
        if (latestData && latestData.public_stations) renderNearby(latestData.public_stations);
        else {
          var el = document.getElementById('nearby-body');
          if (el) el.innerHTML = '<div class="hub-label">Nearby stations</div><div class="hub-sub">Unavailable right now</div>';
        }
      }, 3000);
    }
  }

  return { start: start, stop: stop, loadHomeSummary: loadHomeSummary, loadCompassData: loadCompassData };
})();

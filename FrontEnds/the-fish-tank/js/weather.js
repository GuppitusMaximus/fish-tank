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

  var MANIFEST_URL = 'https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/FrontEnds/the-fish-tank/data/data-index.json';
  var DATA_BASE_URL = 'https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/BackEnds/the-snake-tank/data';

  function cacheBust(url) {
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + '_t=' + Date.now();
  }

  var manifest = null;
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
  var DB_URL = 'https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/FrontEnds/the-fish-tank/data/frontend.db.gz';
  var DB_LOCAL_URL = 'data/frontend.db.gz';
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
      if (progressCallback) progressCallback(0, 'Downloading database\u2026');
      var fetchUrl = cacheBust(DB_URL);
      return Promise.race([
        fetch(fetchUrl).then(function(r) {
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
      console.error('Database load failed, falling back to JSON:', err);
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
      if (!manifestLoaded) {
        manifestLoaded = true;
        loadManifest();
      } else if (manifest) {
        renderBrowse();
      }
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
        if (!manifestLoaded) {
          manifestLoaded = true;
          loadManifest();
        } else if (manifest) {
          renderBrowse();
        }
      }
    });
  }

  function loadManifest() {
    return fetch(cacheBust(MANIFEST_URL))
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .catch(function() {
        return fetch('data/data-index.json')
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          });
      })
      .then(function(data) {
        manifest = data;
        renderBrowse();
      })
      .catch(function() {
        var browseEl = document.getElementById('subtab-browse');
        if (browseEl) browseEl.innerHTML = '<p class="dash-error">Data index unavailable</p>';
      });
  }

  function fetchJson(remotePath, localPath) {
    var url = cacheBust(DATA_BASE_URL + remotePath);
    var local = '../../BackEnds/the-snake-tank/data' + remotePath;
    if (localPath) local = localPath;
    return fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .catch(function() {
        return fetch(local)
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          });
      });
  }

  function loadRawData() {
    if (_db && !_dbFailed) {
      loadRawDataFromDb();
      return;
    }
    var cat = browseState.category;
    var date = browseState.selectedDate;
    var hour = browseState.selectedHour;
    var display = document.querySelector('.browse-display');
    if (display) display.innerHTML = '<p class="browse-loading">Loading\u2026</p>';

    if (cat === 'readings') {
      fetchJson('/' + date + '/' + hour + '.json')
        .then(function(data) { browseState.currentData = data; renderBrowseDisplay(); })
        .catch(function() { if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>'; });

    } else if (cat === 'predictions') {
      var model = browseState.selectedModel;
      var models = getModelsForHour(date, hour);
      if (model) {
        var path = '/predictions/' + date + '/' + hour + '_' + model + '.json';
        fetchJson(path)
          .catch(function() {
            if (model === 'simple') return fetchJson('/predictions/' + date + '/' + hour + '.json');
            throw new Error('not found');
          })
          .then(function(data) { browseState.currentData = data; renderBrowseDisplay(); })
          .catch(function() { if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>'; });
      } else if (models.length === 0) {
        fetchJson('/predictions/' + date + '/' + hour + '.json')
          .then(function(data) { browseState.currentData = data; renderBrowseDisplay(); })
          .catch(function() { if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>'; });
      } else {
        var fetches = models.map(function(m) {
          return fetchJson('/predictions/' + date + '/' + hour + '_' + m + '.json')
            .catch(function() {
              if (m === 'simple') return fetchJson('/predictions/' + date + '/' + hour + '.json');
              return null;
            });
        });
        Promise.all(fetches)
          .then(function(results) {
            var combined = [];
            for (var i = 0; i < results.length; i++) {
              if (results[i]) combined.push(results[i]);
            }
            browseState.currentData = combined.length === 1 ? combined[0] : combined;
            renderBrowseDisplay();
          })
          .catch(function() { if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>'; });
      }

    } else if (cat === 'public-stations') {
      fetchJson('/public-stations/' + date + '/' + hour + '.json')
        .then(function(data) { browseState.currentData = data; renderBrowseDisplay(); })
        .catch(function() { if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>'; });

    } else if (cat === 'validation') {
      fetchJson('/validation/' + date + '.json')
        .then(function(data) { browseState.currentData = data; renderBrowseDisplay(); })
        .catch(function() { if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>'; });
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

  function getDatesForCategory() {
    if (!manifest) return [];
    var cat = browseState.category;
    if (cat === 'readings') {
      return manifest.readings ? Object.keys(manifest.readings).sort().reverse() : [];
    } else if (cat === 'predictions') {
      var pd = manifest.predictions;
      if (!pd) return [];
      if (pd.dates) return Object.keys(pd.dates).sort().reverse();
      return Object.keys(pd).sort().reverse();
    } else if (cat === 'public-stations') {
      return manifest.public_stations ? Object.keys(manifest.public_stations).sort().reverse() : [];
    } else if (cat === 'validation') {
      return Array.isArray(manifest.validation) ? manifest.validation.slice() : [];
    }
    return [];
  }

  function getHoursForDate(date) {
    if (!manifest) return [];
    var cat = browseState.category;
    if (cat === 'readings') {
      return manifest.readings && manifest.readings[date] ? manifest.readings[date].slice().sort() : [];
    } else if (cat === 'predictions') {
      var pd = manifest.predictions;
      if (!pd) return [];
      if (pd.dates && pd.dates[date]) {
        var hours = Object.keys(pd.dates[date]).sort();
        var model = browseState.selectedModel;
        if (model) {
          return hours.filter(function(h) {
            return pd.dates[date][h].indexOf(model) !== -1;
          });
        }
        return hours;
      }
      if (pd[date]) return pd[date].slice().sort();
      return [];
    } else if (cat === 'public-stations') {
      return manifest.public_stations && manifest.public_stations[date] ? manifest.public_stations[date].slice().sort() : [];
    }
    return [];
  }

  function getModelsForHour(date, hour) {
    if (!manifest || !manifest.predictions || !manifest.predictions.dates) return [];
    var dateObj = manifest.predictions.dates[date];
    if (!dateObj || !dateObj[hour]) return [];
    return dateObj[hour];
  }

  function getAvailableModels() {
    if (!manifest || !manifest.predictions || !manifest.predictions.models) return [];
    return manifest.predictions.models;
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

  function renderBrowse() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl || !manifest) return;

    var cat = browseState.category;
    var dates = getDatesForCategory();
    if (!browseState.selectedDate || dates.indexOf(browseState.selectedDate) === -1) {
      browseState.selectedDate = dates[0] || null;
    }

    var html = '';
    if (_dbFailed) {
      html += '<div class="db-fallback-banner">Database unavailable \u2014 browsing via cached data</div>';
    }
    html += '<div class="browse-category-bar">';
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

    if (cat === 'predictions' && getAvailableModels().length > 0) {
      var models = getAvailableModels();
      html += '<div class="model-filter-bar">' +
        '<button class="browse-btn model-filter-pill' + (!browseState.selectedModel ? ' active' : '') + '" data-model="">All Models</button>';
      for (var m = 0; m < models.length; m++) {
        html += '<button class="browse-btn model-filter-pill' + (browseState.selectedModel === models[m] ? ' active' : '') + '" data-model="' + models[m] + '">' + escapeHtml(models[m]) + '</button>';
      }
      html += '</div>';
    }

    if (cat !== 'validation') {
      var hours = browseState.selectedDate ? getHoursForDate(browseState.selectedDate) : [];
      var hourBtns = hours.map(function(h) {
        var label = formatHourLabel(h);
        var cls = h === browseState.selectedHour ? ' active' : '';
        return '<button class="hour-btn' + cls + '" data-hour="' + h + '">' + label + '</button>';
      }).join('');
      html += '<div class="hour-grid">' + (hourBtns || '<span class="browse-loading">No data for this date</span>') + '</div>';
    }

    html += '<div class="browse-display"></div>';
    browseEl.innerHTML = html;

    wireBrowseHandlers();

    if (cat === 'validation' && browseState.selectedDate) {
      loadRawData();
    } else if (browseState.currentData && browseState.selectedHour) {
      renderBrowseDisplay();
    }
  }

  function wireBrowseHandlers() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl) return;

    var catBtns = browseEl.querySelectorAll('[data-cat]');
    catBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.category = btn.dataset.cat;
        browseState.selectedHour = null;
        browseState.currentData = null;
        browseState.selectedDate = null;
        browseState.selectedModel = null;
        browseState.validationModelFilter = null;
        renderBrowse();
      });
    });

    var dateSelect = browseEl.querySelector('.browse-date-select');
    if (dateSelect) {
      dateSelect.addEventListener('change', function() {
        browseState.selectedDate = dateSelect.value;
        browseState.selectedHour = null;
        browseState.currentData = null;
        renderBrowse();
      });
    }

    var vmodeBtns = browseEl.querySelectorAll('[data-vmode]');
    vmodeBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.viewMode = btn.dataset.vmode;
        vmodeBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        renderBrowseDisplay();
      });
    });

    var modelBtns = browseEl.querySelectorAll('[data-model]');
    modelBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.selectedModel = btn.dataset.model || null;
        browseState.selectedHour = null;
        browseState.currentData = null;
        renderBrowse();
      });
    });

    var hourBtns = browseEl.querySelectorAll('.hour-btn');
    hourBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.selectedHour = btn.dataset.hour;
        hourBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        loadRawData();
      });
    });
  }

  var manifestLoaded = false;
  var activeSubtab = 'dashboard';

  var workflowLoaded = false;
  var workflowData = null;
  var countdownInterval = null;

  var WORKFLOW_URL = 'https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/FrontEnds/the-fish-tank/data/workflow.json';

  function loadWorkflow() {
    var el = document.getElementById('subtab-workflow');
    if (el) el.innerHTML = '<p class="browse-loading">Loading workflow data\u2026</p>';

    fetch(cacheBust(WORKFLOW_URL))
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .catch(function() {
        return fetch('data/workflow.json')
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          });
      })
      .then(function(data) {
        workflowData = data;
        renderWorkflow();
      })
      .catch(function() {
        if (el) el.innerHTML = '<p class="dash-error">Workflow data unavailable</p>';
      });
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(function() {
      var el = document.getElementById('workflow-countdown');
      if (!el || !workflowData || !workflowData.schedule) return;
      var next = new Date(workflowData.schedule.next_run).getTime();
      var now = Date.now();
      var diff = next - now;
      if (diff <= 0) {
        var overdue = Math.floor(Math.abs(diff) / 60000);
        el.textContent = overdue === 0 ? 'Due now' : 'Overdue by ' + overdue + 'm';
      } else {
        var h = Math.floor(diff / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        el.textContent = h + 'h ' + m + 'm ' + s + 's';
      }
    }, 1000);
  }

  function renderWorkflow() {
    var el = document.getElementById('subtab-workflow');
    if (!el || !workflowData) return;

    var html = '';

    // Status banner
    var latest = workflowData.latest;
    if (latest) {
      var status = latest.conclusion || latest.status || 'unknown';
      var statusLabel = status === 'success' ? 'Success' : status === 'failure' ? 'Failed' : status === 'in_progress' ? 'In Progress' : status === 'cancelled' ? 'Cancelled' : status;
      var trigger = latest.event === 'schedule' || latest.event === 'workflow_dispatch' ? 'Scheduled' : latest.event;
      var time = latest.created_at ? formatDateTime(new Date(latest.created_at)) : '\u2014';

      html += '<div class="dash-card">' +
        '<h2>Latest Run</h2>' +
        '<div class="data-field"><span class="data-label">Status</span><span class="data-value"><span class="status-dot ' + status + '"></span> ' + statusLabel + '</span></div>' +
        '<div class="data-field"><span class="data-label">Trigger</span><span class="data-value">' + trigger + '</span></div>' +
        '<div class="data-field"><span class="data-label">Time</span><span class="data-value">' + time + '</span></div>' +
        '<div class="data-field"><span class="data-label">Duration</span><span class="data-value">' + (latest.duration_display || '\u2014') + '</span></div>' +
        (latest.html_url ? '<a class="workflow-link" href="' + latest.html_url + '" target="_blank" rel="noopener">View on GitHub \u2192</a>' : '') +
      '</div>';
    }

    // Next run countdown
    if (workflowData.schedule) {
      var nextTime = formatDateTime(new Date(workflowData.schedule.next_run));
      html += '<div class="dash-card">' +
        '<h2>Next Scheduled Run</h2>' +
        '<div class="data-field"><span class="data-label">Scheduled</span><span class="data-value">' + nextTime + '</span></div>' +
        '<div class="data-field"><span class="data-label">Countdown</span><span class="countdown-value" id="workflow-countdown">\u2014</span></div>' +
      '</div>';
    }

    // Stats card
    var stats = workflowData.stats;
    if (stats) {
      var rateClass = stats.success_rate > 95 ? 'delta-low' : stats.success_rate > 80 ? 'delta-mid' : 'delta-high';
      html += '<div class="dash-card">' +
        '<h2>Stats (' + stats.period_hours + 'h)</h2>' +
        '<div class="data-field"><span class="data-label">Success Rate</span><span class="data-value ' + rateClass + '">' + stats.success_rate + '%</span></div>' +
        '<div class="data-field"><span class="data-label">Avg Duration</span><span class="data-value">' + (stats.avg_duration_display || '\u2014') + '</span></div>' +
        '<div class="data-field"><span class="data-label">Total Runs</span><span class="data-value">' + stats.total_runs + '</span></div>' +
        (stats.failure_count > 0 ? '<div class="data-field"><span class="data-label">Failures</span><span class="data-value delta-high">' + stats.failure_count + '</span></div>' : '') +
      '</div>';
    }

    // Run history table
    var runs = workflowData.runs;
    if (runs && runs.length > 0) {
      var rows = runs.map(function(r) {
        var conclusion = r.conclusion || 'in_progress';
        var statusCls = conclusion === 'success' ? 'delta-low' : conclusion === 'failure' ? 'delta-high' : 'delta-mid';
        var label = conclusion === 'success' ? 'Success' : conclusion === 'failure' ? 'Failed' : conclusion === 'in_progress' ? 'In Progress' : conclusion === 'cancelled' ? 'Cancelled' : conclusion;
        var trigger = r.event === 'schedule' || r.event === 'workflow_dispatch' ? 'Scheduled' : r.event;
        var time = r.created_at ? formatDateTime(new Date(r.created_at)) : '\u2014';
        return '<tr>' +
          '<td>' + time + '</td>' +
          '<td>' + (r.duration_display || '\u2014') + '</td>' +
          '<td class="' + statusCls + '">' + label + '</td>' +
          '<td>' + trigger + '</td>' +
        '</tr>';
      }).join('');

      html += '<div class="history-section">' +
        '<h2>Run History</h2>' +
        '<div class="table-scroll workflow-history-scroll">' +
        '<table id="workflow-table">' +
          '<thead><tr><th>Time</th><th>Duration</th><th>Status</th><th>Trigger</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '</div>' +
      '</div>';
    }

    el.innerHTML = html;
    el.querySelectorAll('.table-scroll').forEach(function(scroll) {
      scroll.addEventListener('scroll', function() {
        var atEnd = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 5;
        scroll.classList.toggle('scrolled-end', atEnd);
      });
    });
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

  function renderHomeSummary(data) {
    var el = document.getElementById('home-weather');
    if (!el) return;

    var isV2 = data.schema_version && data.schema_version >= 2 &&
      data.current && data.current.readings &&
      typeof data.current.readings === 'object' &&
      Array.isArray(data.predictions);

    var pm = data.property_meta || null;

    var currentHtml, predictionsHtml;
    if (isV2) {
      currentHtml = renderCurrentV2(data.current, pm);
      predictionsHtml = renderPredictionsV2(data.predictions, pm);
    } else {
      currentHtml = renderCurrent(data.current);
      predictionsHtml = renderPrediction(data.next_prediction);
    }

    el.innerHTML =
      buildToolbarHtml() +
      currentHtml +
      (isV2 ? predictionsHtml : '<div class="dash-cards">' + predictionsHtml + '</div>');

    wireToolbarHandlers(el, function() { renderHomeSummary(latestData); });
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
          renderPredictionsV2(data.predictions, pm) +
          '<div id="history-v2-container"></div>' +
          '<div class="dash-updated">Last updated: ' + formatDateTime(new Date(data.generated_at)) + '</div>' +
        '</div>' +
        '<div class="dash-subtab" id="subtab-browse"' + (activeSubtab !== 'browse' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-workflow"' + (activeSubtab !== 'workflow' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-rankings"' + (activeSubtab !== 'rankings' ? ' style="display:none"' : '') + '></div>' +
      '</div>';

    initHistoryV2();
    wireSharedHandlers(data);
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
    if (!predictions || predictions.length === 0) {
      return '<p class="empty-state">No predictions available</p>';
    }
    var now = new Date();
    predictions = predictions.filter(function(pred) {
      if (!pred.prediction_for) return true;
      return new Date(pred.prediction_for) > now;
    });
    if (predictions.length === 0) {
      return '<p class="empty-state">No current predictions</p>';
    }
    var cards = predictions.map(function(pred) {
      var forTime = pred.prediction_for ? new Date(pred.prediction_for) : null;
      var timeStr = forTime ? formatTime(forTime) : 'Next hour';
      var values = pred.values || {};
      var blocks = Object.keys(values).map(function(key) {
        return '<div class="temp-block">' +
          '<span class="temp-label">' + getPropertyLabel(key, propertyMeta) + '</span>' +
          '<span class="temp-value">' + formatProperty(key, values[key], propertyMeta) + '</span>' +
        '</div>';
      }).join('');

      return '<div class="dash-card dash-card-prediction">' +
        '<div class="prediction-header">' +
          '<h2>Forecast</h2>' +
          '<span class="model-badge">' + escapeHtml(pred.model_type || 'unknown') + '</span>' +
        '</div>' +
        '<div class="card-time">' + timeStr +
          (pred.model_version ? ' <span class="card-meta">v' + pred.model_version + '</span>' : '') +
        '</div>' +
        '<div class="temp-row">' + blocks + '</div>' +
      '</div>';
    }).join('');

    return '<div class="dash-predictions">' + cards + '</div>';
  }

  function getHistoryTimestamp(entry) {
    if (entry.timestamp) return new Date(entry.timestamp);
    return new Date(entry.date + 'T' + (entry.hour < 10 ? '0' : '') + entry.hour + ':00:00Z');
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
      '<th class="sortable model-version-col" data-sort="model_version">Version' + sortIndicator('model_version') + '</th>';

    props.forEach(function(suffix) {
      var metaKey = resolvePropertyKey(suffix, pm);
      var label = getPropertyLabel(metaKey, pm);
      headerCells += '<th class="sortable" data-sort="actual_' + suffix + '">' + label + sortIndicator('actual_' + suffix) + '</th>' +
        '<th class="sortable" data-sort="predicted_' + suffix + '">Predicted' + sortIndicator('predicted_' + suffix) + '</th>' +
        '<th class="sortable" data-sort="delta_' + suffix + '">\u0394' + sortIndicator('delta_' + suffix) + '</th>';
    });

    var avgCells = '<th></th><th></th><th></th>';
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
        '<td class="model-version-col">' + (entry.model_version ? 'v' + entry.model_version : '—') + '</td>';
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

    return '<div class="history-filters">' +
      '<span id="filter-model-container"></span>' +
      '<span id="filter-version-container"></span>' +
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
            '<td class="model-version-col">' + (entry.model_version ? 'v' + entry.model_version : '—') + '</td>';
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

    var modelOptions = rankings.map(function(r) {
      return '<option value="' + escapeHtml(r.model_type) + '">' + escapeHtml(r.model_type) + '</option>';
    }).join('');

    container.innerHTML =
      '<div class="rankings-section">' +
        '<h2>Feature Rankings</h2>' +
        '<div class="rankings-controls">' +
          '<select id="rankings-model-select" class="rankings-select">' +
            modelOptions +
          '</select>' +
          '<span id="rankings-meta" class="rankings-meta"></span>' +
        '</div>' +
        '<div id="rankings-list"></div>' +
      '</div>';

    var select = document.getElementById('rankings-model-select');
    renderRankingsForModel(rankings, select.value);

    select.addEventListener('change', function() {
      renderRankingsForModel(rankings, select.value);
    });
  }

  function renderRankingsForModel(rankings, modelType) {
    var data = rankings.find(function(r) { return r.model_type === modelType; });
    if (!data) return;

    var meta = document.getElementById('rankings-meta');
    var genDate = data.generated_at ? formatDateTime(new Date(data.generated_at)) : '';
    meta.textContent = data.nonzero_count + ' of ' + data.feature_count + ' features with signal' +
      (genDate ? ' — updated ' + genDate : '');

    var maxCoef = 0;
    data.features.forEach(function(f) {
      var abs = Math.abs(f.coefficient);
      if (abs > maxCoef) maxCoef = abs;
    });

    var rows = data.features.map(function(f, i) {
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
        '<span class="ranking-coef">' + sign + f.coefficient.toFixed(4) + '</span>' +
      '</div>';
    }).join('');

    document.getElementById('rankings-list').innerHTML = rows;
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

  var RAW_URL = 'https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/FrontEnds/the-fish-tank/data/weather.json';

  var CACHE_KEY = 'fishtank_weather_data';
  var CACHE_TTL = 5 * 60 * 1000;

  function start() {
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

    fetch(RAW_URL)
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function(data) {
        try {
          var toCache = JSON.parse(JSON.stringify(data));
          toCache._cachedAt = Date.now();
          localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
        } catch (e) { /* localStorage full or unavailable */ }
        render(data);
      })
      .catch(function() {
        fetch('data/weather.json')
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          })
          .then(render)
          .catch(renderError);
      });
  }

  function stop() {
    manifestLoaded = false;
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
    try {
      var cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < CACHE_TTL) {
          delete parsed._cachedAt;
          latestData = parsed;
          renderHomeSummary(parsed);
          return;
        }
      }
    } catch (e) { /* localStorage unavailable or corrupt */ }

    fetch(RAW_URL)
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function(data) {
        try {
          var toCache = JSON.parse(JSON.stringify(data));
          toCache._cachedAt = Date.now();
          localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
        } catch (e) { /* localStorage full or unavailable */ }
        latestData = data;
        renderHomeSummary(data);
      })
      .catch(function() {
        fetch('data/weather.json')
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          })
          .then(function(data) {
            latestData = data;
            renderHomeSummary(data);
          })
          .catch(function() {});
      });
  }

  return { start: start, stop: stop, loadHomeSummary: loadHomeSummary };
})();

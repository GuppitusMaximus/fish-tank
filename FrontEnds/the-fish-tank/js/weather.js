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
    dataType: 'readings',
    viewMode: 'formatted',
    selectedDate: null,
    selectedHour: null,
    currentData: null
  };

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

  function loadRawData(type, date, hour) {
    var path = type === 'predictions' ? '/predictions/' : '/';
    var url = cacheBust(DATA_BASE_URL + path + date + '/' + hour + '.json');
    var localPath = '../../BackEnds/the-snake-tank/data' + path + date + '/' + hour + '.json';

    var display = document.querySelector('.browse-display');
    if (display) display.innerHTML = '<p class="browse-loading">Loading\u2026</p>';

    return fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .catch(function() {
        return fetch(localPath)
          .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          });
      })
      .then(function(data) {
        browseState.currentData = data;
        renderBrowseDisplay();
      })
      .catch(function() {
        if (display) display.innerHTML = '<p class="dash-error">Failed to load data</p>';
      });
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

  function renderBrowseDisplay() {
    var display = document.querySelector('.browse-display');
    if (!display || !browseState.currentData) return;

    if (browseState.viewMode === 'raw') {
      display.innerHTML = '<pre class="raw-json">' + escapeHtml(JSON.stringify(browseState.currentData, null, 2)) + '</pre>';
    } else {
      if (browseState.dataType === 'predictions') {
        display.innerHTML = renderFormattedPrediction(browseState.currentData);
      } else {
        display.innerHTML = renderFormattedReading(browseState.currentData);
      }
    }
  }

  function getDatesForType() {
    if (!manifest) return [];
    var bucket = browseState.dataType === 'predictions' ? manifest.predictions : manifest.readings;
    if (!bucket) return [];
    return Object.keys(bucket).sort().reverse();
  }

  function getHoursForDate(date) {
    if (!manifest) return [];
    var bucket = browseState.dataType === 'predictions' ? manifest.predictions : manifest.readings;
    if (!bucket || !bucket[date]) return [];
    return bucket[date].slice().sort();
  }

  function renderBrowse() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl || !manifest) return;

    var dates = getDatesForType();
    if (!browseState.selectedDate || dates.indexOf(browseState.selectedDate) === -1) {
      browseState.selectedDate = dates[0] || null;
    }

    var dateOptions = dates.map(function(d) {
      var sel = d === browseState.selectedDate ? ' selected' : '';
      return '<option value="' + d + '"' + sel + '>' + d + '</option>';
    }).join('');

    var hours = browseState.selectedDate ? getHoursForDate(browseState.selectedDate) : [];
    var hourBtns = hours.map(function(h) {
      var label = h.length === 6
        ? h.substring(0, 2) + ':' + h.substring(2, 4) + ':' + h.substring(4)
        : h.substring(0, 2) + ':' + h.substring(2);
      var cls = h === browseState.selectedHour ? ' active' : '';
      return '<button class="hour-btn' + cls + '" data-hour="' + h + '">' + label + '</button>';
    }).join('');

    browseEl.innerHTML =
      '<div class="browse-controls">' +
        '<button class="browse-btn' + (browseState.dataType === 'readings' ? ' active' : '') + '" data-dtype="readings">Readings</button>' +
        '<button class="browse-btn' + (browseState.dataType === 'predictions' ? ' active' : '') + '" data-dtype="predictions">Predictions</button>' +
        '<select class="browse-date-select">' + dateOptions + '</select>' +
        '<button class="browse-btn' + (browseState.viewMode === 'formatted' ? ' active' : '') + '" data-vmode="formatted">Formatted</button>' +
        '<button class="browse-btn' + (browseState.viewMode === 'raw' ? ' active' : '') + '" data-vmode="raw">Raw JSON</button>' +
      '</div>' +
      '<div class="hour-grid">' + (hourBtns || '<span class="browse-loading">No data for this date</span>') + '</div>' +
      '<div class="browse-display"></div>';

    wireBrowseHandlers();

    if (browseState.currentData && browseState.selectedHour) {
      renderBrowseDisplay();
    }
  }

  function wireBrowseHandlers() {
    var browseEl = document.getElementById('subtab-browse');
    if (!browseEl) return;

    var dtypeBtns = browseEl.querySelectorAll('[data-dtype]');
    dtypeBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.dataType = btn.dataset.dtype;
        browseState.selectedHour = null;
        browseState.currentData = null;
        browseState.selectedDate = null;
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

    var hourBtns = browseEl.querySelectorAll('.hour-btn');
    hourBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        browseState.selectedHour = btn.dataset.hour;
        hourBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        loadRawData(browseState.dataType, browseState.selectedDate, browseState.selectedHour);
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

  function render(data) {
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
  }

  function renderV1(data) {
    var btnLabel = use24h ? '24h' : '12h';
    var unitLabel = currentUnit === 'K' ? 'K' : '\u00b0' + currentUnit;
    container.innerHTML =
      '<div class="dashboard">' +
        '<div class="dash-controls">' +
          '<button id="time-format-toggle" class="format-toggle" title="Switch time format">' + btnLabel + '</button>' +
          '<button id="unit-toggle" class="format-toggle" title="Switch temperature unit">' + unitLabel + '</button>' +
        '</div>' +
        '<div class="dash-subnav">' +
          '<button class="subnav-btn' + (activeSubtab === 'dashboard' ? ' active' : '') + '" data-subtab="dashboard">Dashboard</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'browse' ? ' active' : '') + '" data-subtab="browse">Browse Data</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'workflow' ? ' active' : '') + '" data-subtab="workflow">Workflow</button>' +
        '</div>' +
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
    filterModel: '',
    filterVersion: '',
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

    var btnLabel = use24h ? '24h' : '12h';
    var unitLabel = currentUnit === 'K' ? 'K' : '\u00b0' + currentUnit;

    container.innerHTML =
      '<div class="dashboard">' +
        '<div class="dash-controls">' +
          '<button id="time-format-toggle" class="format-toggle" title="Switch time format">' + btnLabel + '</button>' +
          '<button id="unit-toggle" class="format-toggle" title="Switch temperature unit">' + unitLabel + '</button>' +
        '</div>' +
        '<div class="dash-subnav">' +
          '<button class="subnav-btn' + (activeSubtab === 'dashboard' ? ' active' : '') + '" data-subtab="dashboard">Dashboard</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'browse' ? ' active' : '') + '" data-subtab="browse">Browse Data</button>' +
          '<button class="subnav-btn' + (activeSubtab === 'workflow' ? ' active' : '') + '" data-subtab="workflow">Workflow</button>' +
        '</div>' +
        '<div class="dash-subtab" id="subtab-dashboard"' + (activeSubtab !== 'dashboard' ? ' style="display:none"' : '') + '>' +
          renderCurrentV2(data.current, pm) +
          renderPredictionsV2(data.predictions, pm) +
          '<div id="history-v2-container"></div>' +
          '<div class="dash-updated">Last updated: ' + formatDateTime(new Date(data.generated_at)) + '</div>' +
        '</div>' +
        '<div class="dash-subtab" id="subtab-browse"' + (activeSubtab !== 'browse' ? ' style="display:none"' : '') + '></div>' +
        '<div class="dash-subtab" id="subtab-workflow"' + (activeSubtab !== 'workflow' ? ' style="display:none"' : '') + '></div>' +
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
    var data = historyState.fullData;
    var fm = historyState.filterModel.trim().toLowerCase();
    var fv = historyState.filterVersion.trim();
    historyState.filtered = data.filter(function(entry) {
      if (fm && !(entry.model_type || '').toLowerCase().includes(fm)) return false;
      if (fv && String(entry.model_version) !== fv) return false;
      if (historyState.filterDateStart || historyState.filterDateEnd) {
        var d = entry.date || (entry.timestamp ? entry.timestamp.substring(0, 10) : '');
        if (historyState.filterDateStart && d < historyState.filterDateStart) return false;
        if (historyState.filterDateEnd && d > historyState.filterDateEnd) return false;
      }
      return true;
    });
  }

  function applyHistorySort() {
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
        '<thead><tr>' + headerCells + '</tr></thead>' +
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
    var models = {};
    var versions = {};
    historyState.fullData.forEach(function(entry) {
      if (entry.model_type) models[entry.model_type] = true;
      if (entry.model_version !== undefined) versions[entry.model_type + '|' + entry.model_version] = entry.model_version;
    });

    var modelDatalist = '<datalist id="model-type-list">';
    Object.keys(models).sort().forEach(function(m) {
      modelDatalist += '<option value="' + escapeHtml(m) + '">';
    });
    modelDatalist += '</datalist>';

    var fm = historyState.filterModel.trim().toLowerCase();
    var versionDatalist = '<datalist id="model-version-list">';
    var versionSet = {};
    Object.keys(versions).forEach(function(key) {
      var parts = key.split('|');
      if (!fm || (parts[0] || '').toLowerCase().includes(fm)) {
        var v = parts[1];
        if (!versionSet[v]) {
          versionSet[v] = true;
          versionDatalist += '<option value="' + v + '">';
        }
      }
    });
    versionDatalist += '</datalist>';

    var dates = historyState.fullData.map(function(e) {
      return e.date || (e.timestamp ? e.timestamp.substring(0, 10) : '');
    }).filter(Boolean);
    var minDate = dates.length > 0 ? dates.reduce(function(a, b) { return a < b ? a : b; }) : '';
    var maxDate = dates.length > 0 ? dates.reduce(function(a, b) { return a > b ? a : b; }) : '';

    return '<div class="history-filters">' +
      modelDatalist +
      '<input type="text" id="filter-model" class="history-filter-input"' +
        ' list="model-type-list" placeholder="Model type\u2026"' +
        ' value="' + escapeHtml(historyState.filterModel) + '">' +
      versionDatalist +
      '<input type="text" id="filter-version" class="history-filter-input"' +
        ' list="model-version-list" placeholder="Version\u2026"' +
        ' value="' + escapeHtml(historyState.filterVersion) + '">' +
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

  function wireHistoryHandlers() {
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

    var filterDebounce = null;
    function debouncedRefresh() {
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(refreshHistoryV2, 200);
    }

    var modelFilter = document.getElementById('filter-model');
    if (modelFilter) {
      modelFilter.addEventListener('input', function() {
        historyState.filterModel = modelFilter.value;
        historyState.filterVersion = '';
        debouncedRefresh();
      });
    }

    var versionFilter = document.getElementById('filter-version');
    if (versionFilter) {
      versionFilter.addEventListener('input', function() {
        historyState.filterVersion = versionFilter.value;
        debouncedRefresh();
      });
    }

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

  function wireSharedHandlers(data) {
    container.querySelectorAll('.table-scroll').forEach(function(el) {
      el.addEventListener('scroll', function() {
        var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5;
        el.classList.toggle('scrolled-end', atEnd);
      });
    });

    if (activeSubtab === 'browse' && manifest) {
      renderBrowse();
    } else if (activeSubtab === 'workflow' && workflowData) {
      renderWorkflow();
    }

    document.getElementById('time-format-toggle').addEventListener('click', function() {
      use24h = !use24h;
      localStorage.setItem('timeFormat', use24h ? '24h' : '12h');
      render(data);
    });

    document.getElementById('unit-toggle').addEventListener('click', function() {
      var idx = units.indexOf(currentUnit);
      currentUnit = units[(idx + 1) % units.length];
      localStorage.setItem('tempUnit', currentUnit);
      render(data);
    });

    var subnavBtns = container.querySelectorAll('.subnav-btn');
    subnavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.dataset.subtab;
        activeSubtab = target;
        subnavBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        document.getElementById('subtab-dashboard').style.display = target === 'dashboard' ? '' : 'none';
        document.getElementById('subtab-browse').style.display = target === 'browse' ? '' : 'none';
        document.getElementById('subtab-workflow').style.display = target === 'workflow' ? '' : 'none';
        if (target !== 'workflow' && countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        if (target === 'browse' && !manifestLoaded) {
          manifestLoaded = true;
          loadManifest();
        } else if (target === 'browse' && manifest) {
          renderBrowse();
        } else if (target === 'workflow' && !workflowLoaded) {
          workflowLoaded = true;
          loadWorkflow();
        } else if (target === 'workflow' && workflowData) {
          renderWorkflow();
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
    activeSubtab = 'dashboard';
    browseState.selectedHour = null;
    browseState.currentData = null;
    workflowLoaded = false;
    workflowData = null;
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  return { start: start, stop: stop };
})();

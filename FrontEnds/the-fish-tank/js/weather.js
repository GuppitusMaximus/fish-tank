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
    return '<div class="dash-card">' +
      '<h2>Next Hour Forecast</h2>' +
      '<div class="card-time">' + timeStr + '</div>' +
      '<div class="temp-row">' +
        '<div class="temp-block"><span class="temp-label">Indoor</span><span class="temp-value">' + formatTemp(pred.temp_indoor) + '</span></div>' +
        '<div class="temp-block"><span class="temp-label">Outdoor</span><span class="temp-value">' + formatTemp(pred.temp_outdoor) + '</span></div>' +
      '</div>' +
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
          '<th>Time</th>' +
          '<th>Indoor</th><th>Predicted</th><th>\u0394</th>' +
          '<th>Outdoor</th><th>Predicted</th><th>\u0394</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '</div>' +
    '</div>';
  }

  function render(data) {
    var btnLabel = use24h ? '24h' : '12h';
    var unitLabel = currentUnit === 'K' ? 'K' : '\u00b0' + currentUnit;
    container.innerHTML =
      '<div class="dashboard">' +
        '<div class="dash-controls">' +
          '<button id="time-format-toggle" class="format-toggle" title="Switch time format">' + btnLabel + '</button>' +
          '<button id="unit-toggle" class="format-toggle" title="Switch temperature unit">' + unitLabel + '</button>' +
        '</div>' +
        '<div class="dash-cards">' +
          renderCurrent(data.current) +
          renderPrediction(data.next_prediction) +
        '</div>' +
        renderHistory(data.history) +
        '<div class="dash-updated">Last updated: ' + formatDateTime(new Date(data.generated_at)) + '</div>' +
      '</div>';

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
  }

  function renderError() {
    container.innerHTML =
      '<div class="dashboard">' +
        '<p class="dash-error">Weather data unavailable</p>' +
      '</div>';
  }

  var RAW_URL = 'https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/FrontEnds/the-fish-tank/data/weather.json';

  function start() {
    fetch(RAW_URL)
      .then(function(res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(render)
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

  function stop() {}

  return { start: start, stop: stop };
})();

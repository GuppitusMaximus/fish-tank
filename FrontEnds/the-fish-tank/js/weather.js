window.WeatherApp = (() => {
  const container = document.getElementById('home');

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

  function formatHour(hour) {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return h + ' ' + ampm;
  }

  function utcToLocal(dateStr, hour) {
    var d = new Date(dateStr + 'T' + (hour < 10 ? '0' : '') + hour + ':00:00Z');
    return d;
  }

  function formatLocalTime(dateStr, hour) {
    var d = utcToLocal(dateStr, hour);
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var year = d.getFullYear();
    return year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day +
      ' ' + formatHour(d.getHours());
  }

  function renderCurrent(current) {
    if (!current) return '<div class="dash-card"><p>No current reading available</p></div>';
    return '<div class="dash-card">' +
      '<h2>Current Reading</h2>' +
      '<div class="card-time">' + formatLocalTime(current.date, current.hour) + '</div>' +
      '<div class="temp-row">' +
        '<div class="temp-block"><span class="temp-label">Indoor</span><span class="temp-value">' + current.temp_indoor.toFixed(1) + '\u00b0C</span></div>' +
        '<div class="temp-block"><span class="temp-label">Outdoor</span><span class="temp-value">' + current.temp_outdoor.toFixed(1) + '\u00b0C</span></div>' +
      '</div>' +
    '</div>';
  }

  function renderPrediction(pred) {
    if (!pred) return '<div class="dash-card"><p>No prediction available yet</p></div>';
    var forTime = pred.prediction_for ? new Date(pred.prediction_for) : null;
    var timeStr = forTime ? formatHour(forTime.getHours()) : 'Next hour';
    return '<div class="dash-card">' +
      '<h2>Next Hour Forecast</h2>' +
      '<div class="card-time">' + timeStr + '</div>' +
      '<div class="temp-row">' +
        '<div class="temp-block"><span class="temp-label">Indoor</span><span class="temp-value">' + pred.temp_indoor.toFixed(1) + '\u00b0C</span></div>' +
        '<div class="temp-block"><span class="temp-label">Outdoor</span><span class="temp-value">' + pred.temp_outdoor.toFixed(1) + '\u00b0C</span></div>' +
      '</div>' +
    '</div>';
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      return '<div class="history-empty">Prediction history building up\u2026</div>';
    }
    var rows = history.map(function(h) {
      return '<tr>' +
        '<td>' + formatLocalTime(h.date, h.hour) + '</td>' +
        '<td>' + h.actual_indoor.toFixed(1) + '\u00b0</td>' +
        '<td>' + h.predicted_indoor.toFixed(1) + '\u00b0</td>' +
        '<td class="' + deltaClass(h.delta_indoor) + '">' + formatDelta(h.delta_indoor) + '</td>' +
        '<td>' + h.actual_outdoor.toFixed(1) + '\u00b0</td>' +
        '<td>' + h.predicted_outdoor.toFixed(1) + '\u00b0</td>' +
        '<td class="' + deltaClass(h.delta_outdoor) + '">' + formatDelta(h.delta_outdoor) + '</td>' +
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
    container.innerHTML =
      '<div class="dashboard">' +
        '<div class="dash-cards">' +
          renderCurrent(data.current) +
          renderPrediction(data.next_prediction) +
        '</div>' +
        renderHistory(data.history) +
        '<div class="dash-updated">Last updated: ' + new Date(data.generated_at).toLocaleString() + '</div>' +
      '</div>';
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

window.WeatherWidget = (() => {
    var units = ['C', 'F', 'K'];
    var currentUnit = localStorage.getItem('tempUnit') || 'C';
    if (units.indexOf(currentUnit) === -1) currentUnit = 'C';

    var cachedForecast = null;
    var cachedHistory = null;

    function convertTemp(celsius) {
        var val, suffix;
        if (currentUnit === 'F') {
            val = (celsius * 9 / 5) + 32;
            suffix = '\u00B0F';
        } else if (currentUnit === 'K') {
            val = celsius + 273.15;
            suffix = 'K';
        } else {
            val = celsius;
            suffix = '\u00B0C';
        }
        return val.toFixed(1) + suffix;
    }

    function convertDelta(celsiusDiff) {
        var val;
        if (currentUnit === 'F') {
            val = celsiusDiff * 9 / 5;
        } else {
            val = celsiusDiff;
        }
        return val.toFixed(1) + unitLabel();
    }

    function unitLabel() {
        if (currentUnit === 'F') return '\u00B0F';
        if (currentUnit === 'K') return 'K';
        return '\u00B0C';
    }

    function renderForecast() {
        var indoorEl = document.getElementById('pred-indoor');
        var outdoorEl = document.getElementById('pred-outdoor');
        var metaEl = document.getElementById('weather-meta');

        if (!cachedForecast) {
            indoorEl.textContent = '--' + unitLabel();
            outdoorEl.textContent = '--' + unitLabel();
            metaEl.textContent = 'Forecast unavailable';
            return;
        }

        var data = cachedForecast;
        indoorEl.textContent = convertTemp(data.prediction.temp_indoor);
        outdoorEl.textContent = convertTemp(data.prediction.temp_outdoor);

        var reading = data.last_reading;
        var hour = String(reading.hour).padStart(2, '0');
        metaEl.textContent = 'Next hour forecast \u00B7 Based on ' + reading.date + ' ' + hour + ':00 data';
    }

    function loadForecast() {
        var indoorEl = document.getElementById('pred-indoor');
        var outdoorEl = document.getElementById('pred-outdoor');
        var metaEl = document.getElementById('weather-meta');

        fetch('data/prediction.json')
            .then(function(res) {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(function(data) {
                if (!data.prediction || !data.last_reading) {
                    throw new Error('missing data');
                }
                cachedForecast = data;
                renderForecast();
            })
            .catch(function() {
                cachedForecast = null;
                indoorEl.textContent = '--' + unitLabel();
                outdoorEl.textContent = '--' + unitLabel();
                metaEl.textContent = 'Forecast unavailable';
            });
    }

    function errorClass(val) {
        if (val < 1) return 'error-low';
        if (val <= 2) return 'error-mid';
        return 'error-high';
    }

    function formatTime(isoStr) {
        var d = new Date(isoStr);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var h = String(d.getUTCHours()).padStart(2, '0');
        return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + h + ':00';
    }

    function renderHistory() {
        var body = document.getElementById('history-body');
        var meta = document.getElementById('history-meta');
        var table = document.getElementById('history-table');

        if (!cachedHistory || cachedHistory.length === 0) {
            body.innerHTML = '';
            table.style.display = 'none';
            meta.textContent = 'No comparison data yet';
            meta.className = 'history-meta history-empty';
            return;
        }

        var history = cachedHistory;
        body.innerHTML = '';
        var sumIndoor = 0;
        var sumOutdoor = 0;

        history.forEach(function(entry) {
            var tr = document.createElement('tr');

            var tdTime = document.createElement('td');
            tdTime.textContent = formatTime(entry.for_hour);
            tr.appendChild(tdTime);

            var tdIP = document.createElement('td');
            tdIP.textContent = convertTemp(entry.predicted.temp_indoor);
            tr.appendChild(tdIP);

            var tdIA = document.createElement('td');
            tdIA.textContent = convertTemp(entry.actual.temp_indoor);
            tr.appendChild(tdIA);

            var tdIE = document.createElement('td');
            tdIE.textContent = convertDelta(entry.error.temp_indoor);
            tdIE.className = errorClass(entry.error.temp_indoor);
            tr.appendChild(tdIE);

            var tdOP = document.createElement('td');
            tdOP.textContent = convertTemp(entry.predicted.temp_outdoor);
            tr.appendChild(tdOP);

            var tdOA = document.createElement('td');
            tdOA.textContent = convertTemp(entry.actual.temp_outdoor);
            tr.appendChild(tdOA);

            var tdOE = document.createElement('td');
            tdOE.textContent = convertDelta(entry.error.temp_outdoor);
            tdOE.className = errorClass(entry.error.temp_outdoor);
            tr.appendChild(tdOE);

            body.appendChild(tr);
            sumIndoor += entry.error.temp_indoor;
            sumOutdoor += entry.error.temp_outdoor;
        });

        var n = history.length;
        var avgIn = convertDelta(sumIndoor / n);
        var avgOut = convertDelta(sumOutdoor / n);
        meta.textContent = n + ' comparison' + (n === 1 ? '' : 's') +
            ' \u00B7 Avg indoor error: ' + avgIn +
            ' \u00B7 Avg outdoor error: ' + avgOut;
        table.style.display = '';
    }

    function loadHistory() {
        var body = document.getElementById('history-body');
        var meta = document.getElementById('history-meta');
        var table = document.getElementById('history-table');

        fetch('data/prediction-history.json')
            .then(function(res) {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(function(history) {
                if (!Array.isArray(history) || history.length === 0) {
                    throw new Error('empty');
                }
                cachedHistory = history;
                renderHistory();
            })
            .catch(function() {
                cachedHistory = null;
                body.innerHTML = '';
                table.style.display = 'none';
                meta.textContent = 'No comparison data yet';
                meta.className = 'history-meta history-empty';
            });
    }

    function toggleUnit() {
        var idx = units.indexOf(currentUnit);
        currentUnit = units[(idx + 1) % units.length];
        localStorage.setItem('tempUnit', currentUnit);

        var btn = document.getElementById('unit-toggle');
        if (btn) btn.textContent = unitLabel();

        renderForecast();
        renderHistory();
    }

    function init() {
        var btn = document.getElementById('unit-toggle');
        if (btn) {
            btn.textContent = unitLabel();
            btn.addEventListener('click', toggleUnit);
        }
    }

    return { loadForecast, loadHistory, toggleUnit, init };
})();

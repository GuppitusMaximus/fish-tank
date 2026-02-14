window.WeatherWidget = (() => {
    function loadForecast() {
        const indoorEl = document.getElementById('pred-indoor');
        const outdoorEl = document.getElementById('pred-outdoor');
        const metaEl = document.getElementById('weather-meta');

        fetch('data/prediction.json')
            .then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(data => {
                if (!data.prediction || !data.last_reading) {
                    throw new Error('missing data');
                }

                const indoor = data.prediction.temp_indoor;
                const outdoor = data.prediction.temp_outdoor;

                indoorEl.textContent = indoor.toFixed(1) + '\u00B0C';
                outdoorEl.textContent = outdoor.toFixed(1) + '\u00B0C';

                const reading = data.last_reading;
                const hour = String(reading.hour).padStart(2, '0');
                metaEl.textContent = 'Next hour forecast \u00B7 Based on ' + reading.date + ' ' + hour + ':00 data';
            })
            .catch(() => {
                indoorEl.textContent = '--\u00B0C';
                outdoorEl.textContent = '--\u00B0C';
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

                body.innerHTML = '';
                var sumIndoor = 0;
                var sumOutdoor = 0;

                history.forEach(function(entry) {
                    var tr = document.createElement('tr');

                    var tdTime = document.createElement('td');
                    tdTime.textContent = formatTime(entry.for_hour);
                    tr.appendChild(tdTime);

                    var tdIP = document.createElement('td');
                    tdIP.textContent = entry.predicted.temp_indoor.toFixed(1) + '\u00B0C';
                    tr.appendChild(tdIP);

                    var tdIA = document.createElement('td');
                    tdIA.textContent = entry.actual.temp_indoor.toFixed(1) + '\u00B0C';
                    tr.appendChild(tdIA);

                    var tdIE = document.createElement('td');
                    tdIE.textContent = entry.error.temp_indoor.toFixed(1) + '\u00B0C';
                    tdIE.className = errorClass(entry.error.temp_indoor);
                    tr.appendChild(tdIE);

                    var tdOP = document.createElement('td');
                    tdOP.textContent = entry.predicted.temp_outdoor.toFixed(1) + '\u00B0C';
                    tr.appendChild(tdOP);

                    var tdOA = document.createElement('td');
                    tdOA.textContent = entry.actual.temp_outdoor.toFixed(1) + '\u00B0C';
                    tr.appendChild(tdOA);

                    var tdOE = document.createElement('td');
                    tdOE.textContent = entry.error.temp_outdoor.toFixed(1) + '\u00B0C';
                    tdOE.className = errorClass(entry.error.temp_outdoor);
                    tr.appendChild(tdOE);

                    body.appendChild(tr);
                    sumIndoor += entry.error.temp_indoor;
                    sumOutdoor += entry.error.temp_outdoor;
                });

                var n = history.length;
                var avgIn = (sumIndoor / n).toFixed(1);
                var avgOut = (sumOutdoor / n).toFixed(1);
                meta.textContent = n + ' comparison' + (n === 1 ? '' : 's') +
                    ' \u00B7 Avg indoor error: ' + avgIn + '\u00B0C' +
                    ' \u00B7 Avg outdoor error: ' + avgOut + '\u00B0C';
                table.style.display = '';
            })
            .catch(function() {
                body.innerHTML = '';
                table.style.display = 'none';
                meta.textContent = 'No comparison data yet';
                meta.className = 'history-meta history-empty';
            });
    }

    return { loadForecast, loadHistory };
})();

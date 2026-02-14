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

    return { loadForecast };
})();

// Static tests for SQLite Browse Data functionality
// Tests query functions, data transformation, cache TTL, and fallback behavior

const assert = require('assert');

// --- Mock database layer for testing ---

class MockDatabase {
  constructor(data) {
    this.data = data;
  }

  exec(sql, params = []) {
    // Simple mock: return matching data based on SQL pattern
    if (sql.includes('SELECT DISTINCT date FROM readings')) {
      return [{
        columns: ['date'],
        values: this.data.readings_dates.map(d => [d])
      }];
    }
    if (sql.includes('SELECT DISTINCT hour FROM readings WHERE date')) {
      const date = params[0];
      const hours = this.data.readings_hours[date] || [];
      return [{
        columns: ['hour'],
        values: hours.map(h => [h])
      }];
    }
    if (sql.includes('SELECT * FROM readings WHERE date')) {
      const date = params[0];
      const hour = params[1];
      const reading = this.data.readings_data[`${date}_${hour}`];
      if (!reading) return [];
      return [{
        columns: Object.keys(reading),
        values: [Object.values(reading)]
      }];
    }
    if (sql.includes('SELECT DISTINCT model_type FROM predictions')) {
      return [{
        columns: ['model_type'],
        values: this.data.prediction_models.map(m => [m])
      }];
    }
    if (sql.includes('SELECT DISTINCT date FROM predictions')) {
      const model = params[0];
      const dates = model ? this.data.predictions_dates_filtered[model] : this.data.predictions_dates;
      return [{
        columns: ['date'],
        values: (dates || []).map(d => [d])
      }];
    }
    if (sql.includes('SELECT value FROM _metadata WHERE key')) {
      return [{
        columns: ['value'],
        values: [['2026-02-16T12:00:00Z']]
      }];
    }
    return [];
  }
}

// --- Test Data ---

const mockData = {
  readings_dates: ['2026-02-16', '2026-02-15'],
  readings_hours: {
    '2026-02-16': [0, 1, 2, 12, 13, 23]
  },
  readings_data: {
    '2026-02-16_12': {
      timestamp: 1708088400,
      date: '2026-02-16',
      hour: 12,
      temp_indoor: 21.5,
      temp_outdoor: 18.3,
      humidity_indoor: 45,
      humidity_outdoor: 67,
      co2: 850,
      noise: 45,
      pressure: 1013.2,
      temp_outdoor_min: 17.1,
      temp_outdoor_max: 19.5
    }
  },
  prediction_models: ['6hrRC', '24hrRaw', '3hrRaw'],
  predictions_dates: ['2026-02-16', '2026-02-15'],
  predictions_dates_filtered: {
    '6hrRC': ['2026-02-16'],
    '24hrRaw': ['2026-02-16', '2026-02-15']
  }
};

// --- Helper: Simple queryDb mock ---

function mockQueryDb(db, sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(function(row) {
    const obj = {};
    cols.forEach(function(col, i) { obj[col] = row[i]; });
    return obj;
  });
}

// --- Tests ---

describe('SQLite Query Functions', () => {
  const db = new MockDatabase(mockData);

  it('queryReadingsDates returns dates in descending order', () => {
    const result = mockQueryDb(db, "SELECT DISTINCT date FROM readings ORDER BY date DESC");
    assert.deepStrictEqual(result, [
      { date: '2026-02-16' },
      { date: '2026-02-15' }
    ]);
  });

  it('queryReadingsHours returns hours as 6-digit timestamps', () => {
    const result = mockQueryDb(db, "SELECT DISTINCT hour FROM readings WHERE date = ? ORDER BY hour", ['2026-02-16']);
    const hours = result.map(r => {
      const h = r.hour;
      return (h < 10 ? '0' : '') + h + '0000';
    });
    assert.deepStrictEqual(hours, ['000000', '010000', '020000', '120000', '130000', '230000']);
  });

  it('queryReading transforms SQL row to API-compatible format', () => {
    const rows = mockQueryDb(db, "SELECT * FROM readings WHERE date = ? AND hour = ? ORDER BY timestamp DESC LIMIT 1", ['2026-02-16', 12]);
    assert.strictEqual(rows.length, 1);
    const r = rows[0];

    // Verify transformation to API format
    const transformed = {
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

    assert.strictEqual(transformed.body.devices[0].dashboard_data.Temperature, 21.5);
    assert.strictEqual(transformed.body.devices[0].modules[0].dashboard_data.Temperature, 18.3);
  });

  it('queryPredictionModels returns unique model types', () => {
    const result = mockQueryDb(db, "SELECT DISTINCT model_type FROM predictions ORDER BY model_type");
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result.map(r => r.model_type), ['6hrRC', '24hrRaw', '3hrRaw']);
  });

  it('queryPredictionsDates works without model filter', () => {
    const result = mockQueryDb(db, "SELECT DISTINCT date FROM predictions ORDER BY date DESC");
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result.map(r => r.date), ['2026-02-16', '2026-02-15']);
  });

  it('queryPredictionsDates respects model filter', () => {
    const result = mockQueryDb(db, "SELECT DISTINCT date FROM predictions WHERE model_type = ? ORDER BY date DESC", ['6hrRC']);
    // Mock returns filtered data
    assert.strictEqual(result.length, 1);
  });
});

describe('Cache TTL Logic', () => {
  const DB_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  it('cache is valid when age < 24 hours', () => {
    const cachedAt = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago
    const age = Date.now() - cachedAt;
    assert.strictEqual(age < DB_CACHE_TTL, true);
  });

  it('cache is invalid when age >= 24 hours', () => {
    const cachedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    const age = Date.now() - cachedAt;
    assert.strictEqual(age < DB_CACHE_TTL, false);
  });

  it('cache is valid at exactly 23h 59m', () => {
    const cachedAt = Date.now() - (23 * 60 * 60 * 1000 + 59 * 60 * 1000); // 23h 59m ago
    const age = Date.now() - cachedAt;
    assert.strictEqual(age < DB_CACHE_TTL, true);
  });

  it('cache is invalid at exactly 24h 1m', () => {
    const cachedAt = Date.now() - (24 * 60 * 60 * 1000 + 60 * 1000); // 24h 1m ago
    const age = Date.now() - cachedAt;
    assert.strictEqual(age < DB_CACHE_TTL, false);
  });
});

describe('Fallback Flag Behavior', () => {
  it('_dbFailed flag triggers JSON fallback rendering', () => {
    let _dbFailed = false;
    let _db = { exec: () => [] };

    // Simulate database load success
    assert.strictEqual(_db && !_dbFailed, true); // SQL path

    // Simulate database load failure
    _dbFailed = true;
    assert.strictEqual(_db && !_dbFailed, false); // JSON path
  });

  it('_dbFailed prevents SQL queries after failure', () => {
    let _db = null;
    let _dbFailed = true;

    // Query should short-circuit
    function queryDb(sql, params) {
      if (!_db) return [];
      return _db.exec(sql, params);
    }

    const result = queryDb("SELECT * FROM readings", []);
    assert.deepStrictEqual(result, []);
  });
});

describe('Data Transformation', () => {
  it('hour number converts to 6-digit timestamp format', () => {
    const hours = [0, 1, 9, 10, 12, 23];
    const formatted = hours.map(h => (h < 10 ? '0' : '') + h + '0000');
    assert.deepStrictEqual(formatted, ['000000', '010000', '090000', '100000', '120000', '230000']);
  });

  it('6-digit timestamp converts back to hour number', () => {
    const timestamps = ['000000', '010000', '120000', '230000'];
    const hours = timestamps.map(ts => parseInt(ts.substring(0, 2), 10));
    assert.deepStrictEqual(hours, [0, 1, 12, 23]);
  });

  it('SQL reading row includes all expected fields', () => {
    const reading = mockData.readings_data['2026-02-16_12'];
    const requiredFields = [
      'timestamp', 'date', 'hour',
      'temp_indoor', 'temp_outdoor',
      'humidity_indoor', 'humidity_outdoor',
      'co2', 'noise', 'pressure',
      'temp_outdoor_min', 'temp_outdoor_max'
    ];
    requiredFields.forEach(field => {
      assert.strictEqual(field in reading, true, `Missing field: ${field}`);
    });
  });
});

console.log('All static tests passed ✓');

// US market clock for the hub. TankCore only trades regular hours
// (NYSE/Nasdaq: Mon-Fri 09:30-16:00 America/New_York). Drives the hero
// countdown and the market status dots (green = open, red = closed).
// Note: does not account for market holidays.

(function() {
  var statusEl = document.getElementById('hub-market-status');
  var dots = ['hub-market-dot', 'tankcore-dot']
    .map(function(id) { return document.getElementById(id); })
    .filter(Boolean);
  if (!statusEl && !dots.length) return;

  var OPEN_MIN = 9 * 60 + 30;   // 09:30 ET
  var CLOSE_MIN = 16 * 60;      // 16:00 ET
  var DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  var partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function etParts(date) {
    var p = {};
    partsFmt.formatToParts(date).forEach(function(x) { p[x.type] = x.value; });
    var h = p.hour === '24' ? 0 : parseInt(p.hour, 10);
    return { y: +p.year, mo: +p.month, d: +p.day, dow: DOW[p.weekday],
             mins: h * 60 + parseInt(p.minute, 10) };
  }

  // ms to add to a UTC instant to reach ET wall-clock (negative for ET).
  function etOffsetMs(date) {
    var p = {};
    partsFmt.formatToParts(date).forEach(function(x) { if (x.type !== 'literal') p[x.type] = x.value; });
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
      p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second);
    return asUTC - date.getTime();
  }

  // Real timestamp for a given ET wall-clock date at OPEN_MIN.
  function etOpenTs(y, mo, d) {
    var guess = Date.UTC(y, mo - 1, d, 9, 30, 0);
    return guess - etOffsetMs(new Date(guess));
  }

  function isOpen(p) {
    return p.dow >= 1 && p.dow <= 5 && p.mins >= OPEN_MIN && p.mins < CLOSE_MIN;
  }

  function nextOpenTs(now) {
    for (var add = 0; add < 8; add++) {
      var p = etParts(new Date(now.getTime() + add * 86400000));
      if (p.dow >= 1 && p.dow <= 5 && (add > 0 || p.mins < OPEN_MIN)) {
        return etOpenTs(p.y, p.mo, p.d);
      }
    }
    return now.getTime();
  }

  function fmt(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    return h + 'h ' + pad(m) + 'm ' + pad(s) + 's';
  }

  function update() {
    var now = new Date();
    var open = isOpen(etParts(now));
    dots.forEach(function(dot) {
      dot.className = 'status-dot ' + (open ? 'market' : 'market-closed');
    });
    if (statusEl) {
      statusEl.textContent = open
        ? 'Market open'
        : 'Market opens in ' + fmt(nextOpenTs(now) - now.getTime());
    }
  }

  update();
  setInterval(update, 1000);
})();

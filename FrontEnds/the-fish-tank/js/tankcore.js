// TankCore tile — live QTP aggregates for signed-in visitors.
// Anonymous visitors see the static sample pane (blurred behind the veil);
// signing in swaps to this renderer, fed by the auth Worker's /data/tankcore
// (JWT-gated, KV-backed, pushed from the trader every few minutes).
var TankCoreApp = (function () {
  'use strict';

  var FEED_URL = (typeof AUTH_API_URL !== 'undefined' && AUTH_API_URL)
    ? AUTH_API_URL + '/data/tankcore' : null;
  var SKELETON = '<div class="wx-skeleton"><span></span><span></span><span></span></div>';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtPct(p) {
    var n = Number(p) || 0;
    var sign = n > 0 ? '+' : (n < 0 ? '−' : '');
    return sign + Math.abs(n).toFixed(2);
  }

  function ago(iso) {
    if (!iso) return null;
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return null;
    var m = Math.round(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 48) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  // Polyline over a 120x30 box; flat series draw a mid-line so the tile never
  // renders an empty box.
  function spark(values, color) {
    var v = (values || []).map(Number).filter(function (x) { return isFinite(x); });
    if (v.length < 2) v = [0, 0];
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
    var span = max - min || 1;
    var pts = v.map(function (y, i) {
      var x = (i / (v.length - 1)) * 120;
      var yy = 27 - ((y - min) / span) * 24;
      return x.toFixed(1) + ',' + yy.toFixed(1);
    });
    var last = pts[pts.length - 1].split(',');
    return '<svg class="hub-spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2" fill="' + color + '"/></svg>';
  }

  function render(d) {
    var el = document.getElementById('tankcore-live');
    if (!el) return;
    var hasTrades = (d.trades_30d || 0) > 0;
    var pnlColor = (d.pnl_30d_pct || 0) >= 0 ? '#3ddc97' : '#ff7a7a';
    var modeLabel = d.mode === 'live' ? 'live' : 'shadow';

    var pnlBlock = '<div><div class="hub-big" style="color:' + pnlColor + '">' +
      esc(fmtPct(d.pnl_30d_pct)) + '<small>%</small></div>' +
      '<div class="hub-sub">30-day P&amp;L · ' + esc(modeLabel) +
      (hasTrades ? ' · ' + esc(d.wins_30d) + '/' + esc(d.trades_30d) + ' wins' : ' · no closed trades yet') +
      '</div></div>';
    var sigBlock = '<div><div class="hub-big">' + esc(d.decisions_today) + '</div>' +
      '<div class="hub-sub">decisions today · ' + esc(d.approved_today) + ' approved</div></div>';

    var sparkHtml = hasTrades
      ? spark(d.pnl_curve_30d, pnlColor)
      : spark(d.decisions_14d, '#3ddc97');
    var sparkLabel = hasTrades ? 'cumulative P&amp;L, 30d' : 'decisions per day, 14d';

    var symbols = (d.symbols || []).slice(0, 6).map(esc).join(' · ');
    var extra = (d.symbols || []).length > 6 ? ' +' + ((d.symbols || []).length - 6) : '';
    var updated = ago(d.generated_at);
    var stale = updated === null || (Date.now() - new Date(d.generated_at).getTime()) > 20 * 60 * 1000;
    var barAge = d.last_bar_at ? ago(d.last_bar_at) : null;

    el.innerHTML =
      '<div class="hub-metric-row">' + pnlBlock + sigBlock + '</div>' +
      sparkHtml +
      '<div class="hub-sub tc-foot">' +
        '<span>' + symbols + esc(extra) + '</span>' +
        '<span class="tc-meta">' + esc(sparkLabel) +
          (d.open_positions ? ' · ' + esc(d.open_positions) + ' open' : '') +
          (barAge ? ' · last bar ' + esc(barAge) : '') +
          (updated ? ' · ' + (stale ? 'stale, ' : '') + esc(updated) : '') +
        '</span>' +
      '</div>';
  }

  function renderMessage(msg) {
    var el = document.getElementById('tankcore-live');
    if (el) el.innerHTML = '<div class="hub-sub tc-msg">' + esc(msg) + '</div>';
  }

  function clear() {
    var el = document.getElementById('tankcore-live');
    if (el) el.innerHTML = SKELETON;
  }

  function load() {
    var el = document.getElementById('tankcore-live');
    if (!el) return;
    if (typeof FishTankAuth === 'undefined' || !FishTankAuth.isAuthenticated()) return;
    if (!FEED_URL) { renderMessage('Live feed not configured'); return; }
    el.innerHTML = SKELETON;
    fetch(FEED_URL, { headers: FishTankAuth.authHeaders() })
      .then(function (res) {
        if (res.status === 404) throw new Error('nodata');
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(render)
      .catch(function (err) {
        renderMessage(err && err.message === 'nodata'
          ? 'No stats pushed yet — the trader reports after its first session.'
          : 'Live feed unavailable right now.');
      });
  }

  return { load: load, clear: clear };
})();

// TankCore tile — live QTP aggregates for signed-in visitors.
// Anonymous visitors see the static sample pane (blurred behind the veil);
// signing in swaps to this renderer, fed by the auth Worker's /data/tankcore
// (JWT-gated, KV-backed, pushed from the trader every few minutes).
var TankCoreApp = (function () {
  'use strict';

  var FEED_URL = (typeof AUTH_API_URL !== 'undefined' && AUTH_API_URL)
    ? AUTH_API_URL + '/data/tankcore' : null;
  var SKELETON = '<div class="wx-skeleton"><span></span><span></span><span></span></div>';

  var PHASE_LABELS = {
    premarket: 'pre-market',
    regular: 'market open',
    postmarket: 'after hours',
    closed: 'closed'
  };

  // Codes the decision engine emits today; anything new falls through to the
  // lower-cased code so an unseen reason still reads as words.
  var REJECT_LABELS = {
    MAX_POSITIONS: 'max positions',
    MAX_EXPOSURE: 'exposure cap',
    EXISTING_POSITION: 'already in position',
    DAILY_LOSS_LIMIT: 'daily loss limit',
    RISK_BUDGET_EXHAUSTED: 'risk budget used',
    RISK_STATE_UNAVAILABLE: 'risk state unavailable',
    LOW_SCORE: 'low score'
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Own properties only — the feed is untrusted and a phase or code of
  // "constructor" would otherwise pull a function off the prototype chain.
  function lookup(map, key) {
    var k = String(key == null ? '' : key);
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
  }

  function fmtPct(p) {
    var n = Number(p) || 0;
    var sign = n > 0 ? '+' : (n < 0 ? '−' : '');
    return sign + Math.abs(n).toFixed(2);
  }

  // Counts render as 0 rather than NaN when a field is missing, so the funnel
  // still draws a full row on the pre-v2 payload.
  function fmtNum(v) {
    var n = Number(v);
    return isFinite(n) ? n.toLocaleString() : '0';
  }

  // Feed exposures are whole-percent figures (0–100).
  function fmtWholePct(v) {
    var n = Number(v);
    return (isFinite(n) ? Math.round(n) : 0) + '%';
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

  // "Apr 7", carrying the year once the date leaves the current one.
  function shortDate(iso) {
    if (!iso) return null;
    var t = new Date(iso);
    if (isNaN(t.getTime())) return null;
    var opts = { month: 'short', day: 'numeric' };
    if (t.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return t.toLocaleDateString(undefined, opts);
  }

  // Takes already-escaped markup — chips interleave escaped values with
  // literal separators.
  function chip(html, cls) {
    return '<span class="hub-tag' + (cls ? ' ' + cls : '') + '">' + html + '</span>';
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

  // Every v2 field is optional: null and undefined both mean "not sent", and
  // the pre-v2 payload must still produce a full tile.
  function render(d) {
    var el = document.getElementById('tankcore-live');
    if (!el) return;
    var hasTrades = (d.trades_30d || 0) > 0;
    var pnlColor = (d.pnl_30d_pct || 0) >= 0 ? '#3ddc97' : '#ff7a7a';
    var modeLabel = d.mode === 'live' ? 'live' : 'shadow';

    // In shadow mode the 30-day P&L is structurally zero, so the hero leads
    // with how long the trader has been watching instead; the P&L hero comes
    // back on its own as soon as there are closed trades.
    var heroBlock;
    if (hasTrades) {
      heroBlock = '<div><div class="hub-big" style="color:' + pnlColor + '">' +
        esc(fmtPct(d.pnl_30d_pct)) + '<small>%</small></div>' +
        '<div class="hub-sub">30-day P&amp;L · ' + esc(modeLabel) +
        ' · ' + esc(d.wins_30d) + '/' + esc(d.trades_30d) + ' wins' +
        '</div></div>';
    } else {
      var since = shortDate(d.first_event_at);
      var days = d.trading_days_total == null ? d.active_days_30d : d.trading_days_total;
      // Without a total or a start date the count is only the 30-day window,
      // so say so rather than implying it covers all of history.
      var scope = (d.trading_days_total == null && since === null)
        ? 'sessions (30d)' : 'sessions observed';
      heroBlock = '<div><div class="hub-big">' + esc(fmtNum(days)) + '</div>' +
        '<div class="hub-sub">' + scope + ' · ' + esc(modeLabel) +
        (since ? ' since ' + esc(since) : '') + '</div></div>';
    }

    var sigBlock = '<div><div class="hub-big">' + esc(d.decisions_today) + '</div>' +
      '<div class="hub-sub">decisions today · ' + esc(d.approved_today) + ' approved</div></div>';

    // Zeros stay visible: an empty funnel during a closed session is honest.
    var funnel = '<div class="hub-sub tc-funnel">' +
      esc(fmtNum(d.bars_today)) + ' bars &rarr; ' +
      esc(fmtNum(d.setups_today)) + ' setups &rarr; ' +
      esc(fmtNum(d.decisions_today)) + ' decisions &rarr; ' +
      esc(fmtNum(d.approved_today)) + ' approved</div>';

    var chips = [];
    var phase = lookup(PHASE_LABELS, d.session_phase);
    if (phase) chips.push(chip(esc(phase)));

    // Ranges only exist once the opening range has closed, so the chip is
    // meaningless before the regular session.
    var symbolCount = (d.symbols || []).length;
    if (d.range_locked_symbols != null && symbolCount > 0 &&
        (d.session_phase === 'regular' || d.session_phase === 'postmarket')) {
      chips.push(chip('range locked ' + esc(fmtNum(d.range_locked_symbols)) +
        '/' + esc(fmtNum(symbolCount))));
    }

    if (d.open_positions != null) {
      var risk = esc(fmtNum(d.open_positions)) +
        (d.max_positions != null ? '/' + esc(fmtNum(d.max_positions)) : '') + ' positions';
      if (d.exposure_pct != null) {
        risk += ' · ' + esc(fmtWholePct(d.exposure_pct)) +
          (d.exposure_cap_pct != null ? ' of ' + esc(fmtWholePct(d.exposure_cap_pct)) : '') +
          ' exposure';
      }
      var atCap =
        (d.max_positions != null && Number(d.open_positions) >= Number(d.max_positions)) ||
        (d.exposure_pct != null && d.exposure_cap_pct != null &&
          Number(d.exposure_pct) >= Number(d.exposure_cap_pct));
      chips.push(chip(risk, atCap ? 'tc-warn' : ''));
    }

    if (d.halted === true) chips.push(chip('halted', 'tc-alert'));

    var chipsHtml = chips.length ? '<div class="tc-chips">' + chips.join('') + '</div>' : '';

    var rejectHtml = '';
    var rejected = Number(d.rejected_today) || 0;
    if (rejected > 0) {
      var list = Array.isArray(d.rejection_reasons_today) ? d.rejection_reasons_today : [];
      var reasons = list.slice(0, 3).map(function (r) {
        var code = String((r && r.code) == null ? '' : r.code);
        var label = lookup(REJECT_LABELS, code) || code.toLowerCase().replace(/_/g, ' ');
        return esc(label) + ' ×' + esc(fmtNum(r && r.count));
      });
      rejectHtml = '<div class="hub-sub tc-reject">rejected: ' +
        (reasons.length ? reasons.join(' · ') : esc(fmtNum(rejected))) + '</div>';
    }

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
      '<div class="hub-metric-row">' + heroBlock + sigBlock + '</div>' +
      funnel +
      chipsHtml +
      rejectHtml +
      sparkHtml +
      '<div class="hub-sub tc-foot">' +
        '<span>' + symbols + esc(extra) + '</span>' +
        '<span class="tc-meta">' + esc(sparkLabel) +
          (barAge ? ' · last bar ' + esc(barAge) : '') +
          (updated ? ' · ' + (stale ? 'stale, ' : '') + 'updated ' + esc(updated) : '') +
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

// Homelab quick-glance stats for the home hub tile.
// Fetches an aggregate public stats feed and renders CPU / memory / guests /
// uptime. Falls back to a static snapshot (no "live" claim) when the feed is
// unavailable. Full dashboards (Grafana/Proxmox) stay behind sign-in.

var HomelabApp = (function() {
  var FEED_URL = (typeof AUTH_API_URL !== 'undefined' && AUTH_API_URL)
    ? AUTH_API_URL + '/data/homelab-public' : null;

  // Representative snapshot shown until the live feed is wired up.
  var SNAPSHOT = {
    cpu_pct: 1, cores: 16,
    mem_used_gb: 46, mem_total_gb: 66,
    guests_running: 6, guests_total: 8,
    uptime_days: 135,
    live: false
  };

  function statBlock(value, unit, label) {
    return '<div class="hl-stat">' +
      '<div class="hub-big">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      '<div class="hub-sub">' + label + '</div>' +
    '</div>';
  }

  function render(d) {
    var el = document.getElementById('homelab-stats');
    if (!el) return;
    var memPct = d.mem_total_gb ? Math.round(d.mem_used_gb / d.mem_total_gb * 100) : null;
    el.innerHTML =
      '<div class="hl-stats">' +
        statBlock(Math.round(d.cpu_pct), '%', 'CPU · ' + d.cores + 'c') +
        statBlock(Math.round(d.mem_used_gb), '/' + Math.round(d.mem_total_gb) + ' GB',
                  'memory' + (memPct != null ? ' · ' + memPct + '%' : '')) +
        statBlock(d.guests_running, '/' + d.guests_total, 'guests up') +
        statBlock(d.uptime_days, 'd', 'uptime') +
      '</div>';

    var dot = document.getElementById('homelab-dot');
    if (dot) dot.className = 'status-dot ' + (d.live ? 'success' : 'cancelled');
  }

  function load() {
    if (!document.getElementById('homelab-stats')) return;
    var primary = FEED_URL ? fetch(FEED_URL) : Promise.reject();
    primary
      .then(function(res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function(data) { data.live = true; render(data); })
      .catch(function() { render(SNAPSHOT); });
  }

  return { load: load };
})();

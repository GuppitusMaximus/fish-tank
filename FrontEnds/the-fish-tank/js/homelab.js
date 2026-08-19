// Homelab quick-glance stats for the home hub tile.
// Fetches an aggregate public stats feed and renders CPU / memory / services /
// agents (live + today) / uptime, plus a "token maxing" group (24h tokens,
// runs, lines written, memory size). Falls back to a static snapshot (no
// "live" claim) when the feed is unavailable. Full dashboards
// (Grafana/Proxmox) stay behind sign-in.

var HomelabApp = (function() {
  var FEED_URL = (typeof AUTH_API_URL !== 'undefined' && AUTH_API_URL)
    ? AUTH_API_URL + '/data/homelab-public' : null;

  // Representative snapshot shown until the live feed is wired up.
  var SNAPSHOT = {
    cpu_pct: 1, cores: 16,
    mem_used_gb: 46, mem_total_gb: 66,
    services_running: 6, services_total: 6,
    agents_running: 0,
    agents_24h: 0,
    uptime_days: 135,
    tokens_out_24h: 1300000,
    runs_ok_24h: 12, runs_failed_24h: 0,
    loc_24h: 5900,
    memory_entries: 530, memory_insights: 84,
    live: false
  };

  // 1234567 -> '1.2M', 5880 -> '5.9k', 987 -> '987'
  function fmtCompact(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return ((n / 1e6).toFixed(1) + 'M').replace('.0M', 'M');
    if (n >= 1000) return ((n / 1000).toFixed(1) + 'k').replace('.0k', 'k');
    return '' + Math.round(n);
  }

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
    var blocks = [
      statBlock(Math.round(d.cpu_pct), '%', 'CPU · ' + d.cores + 'c'),
      statBlock(Math.round(d.mem_used_gb), '/' + Math.round(d.mem_total_gb) + ' GB',
                'memory' + (memPct != null ? ' · ' + memPct + '%' : '')),
      // Older feeds lack services_*; fall back to the guest counts (which
      // then include agent workers) so rollout order can't break the tile.
      d.services_running != null
        ? statBlock(d.services_running, '/' + d.services_total, 'services')
        : statBlock(d.guests_running, '/' + d.guests_total, 'guests up')
    ];
    // Older feeds lack agents_running; skip the block so the row stays full.
    if (d.agents_running != null) {
      var agentsLabel = 'agents' +
        (d.agents_24h != null ? ' · ' + d.agents_24h + ' today' : '');
      blocks.push(statBlock(d.agents_running, '', agentsLabel));
    }
    blocks.push(statBlock(d.uptime_days, 'd', 'uptime'));
    var html = '<div class="hl-stats">' + blocks.join('') + '</div>';

    // Token-maxing group — skipped entirely on older feeds without the field.
    if (d.tokens_out_24h != null) {
      var runsTotal = (d.runs_ok_24h || 0) + (d.runs_failed_24h || 0);
      html += '<div class="hl-group-label">token maxing · 24h</div>' +
        '<div class="hl-stats">' +
          statBlock(fmtCompact(d.tokens_out_24h), '', 'tokens') +
          statBlock(d.runs_ok_24h, '/' + runsTotal, 'runs ok') +
          statBlock(fmtCompact(d.loc_24h), '', 'lines written') +
          statBlock(d.memory_entries, '+' + d.memory_insights, 'memory') +
        '</div>';
    }
    el.innerHTML = html;

    var fresh = d.live;
    if (fresh && d.generated_at) {
      var age = Date.now() - new Date(d.generated_at).getTime();
      if (isNaN(age) || age > 15 * 60 * 1000) fresh = false; // stale after 15 min
    }
    var dot = document.getElementById('homelab-dot');
    if (dot) dot.className = 'status-dot ' + (fresh ? 'success' : 'cancelled');
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

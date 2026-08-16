// Fathom Fall live status + deployed version for the hub. Fetches the game's
// version.json straight from fathomfall.com (CORS-open). A successful response
// means the site is live; the version updates automatically on each game deploy.

(function() {
  var VERSION_URL = 'https://www.fathomfall.com/version.json';

  function apply(live, version) {
    ['hub-ff-dot', 'ff-tile-dot'].forEach(function(id) {
      var dot = document.getElementById(id);
      if (dot) dot.className = 'status-dot ' + (live ? 'success' : 'failure');
    });
    var status = document.getElementById('hub-ff-status');
    if (status) {
      // Dot color (green/red) conveys live/offline; text is just name + version.
      status.textContent = 'Fathom Fall' + (version ? ' · v' + version : '');
    }
    var tileVer = document.getElementById('ff-tile-version');
    if (tileVer) tileVer.textContent = version ? 'v' + version : '';
  }

  function load() {
    fetch(VERSION_URL, { cache: 'no-store' })
      .then(function(res) {
        // Any response means the site is up. Parse the version if it's real JSON;
        // if version.json isn't published yet the SPA fallback returns HTML.
        if (!res.ok) return { live: true, version: null };
        return res.json().then(
          function(d) { return { live: true, version: (d && d.version) || null }; },
          function() { return { live: true, version: null }; }
        );
      })
      .then(function(s) { apply(s.live, s.version); })
      .catch(function() { apply(false, null); });
  }

  load();
})();

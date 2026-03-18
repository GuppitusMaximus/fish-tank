var FathomFallAdmin = (function() {
    var API_BASE = 'https://api.the-fish-tank.com';
    var initialized = false;
    var playersPage = 1;
    var snapshotsPage = 1;

    function start() {
        if (!initialized) {
            initialized = true;
            document.getElementById('ff-player-search').addEventListener('input',
                debounce(function() { playersPage = 1; loadPlayers(); }, 300));
            document.getElementById('ff-refresh-players').addEventListener('click', function() {
                loadStats();
                playersPage = 1;
                snapshotsPage = 1;
                loadPlayers();
                loadSnapshots();
            });
        }
        loadStats();
        loadPlayers();
        loadSnapshots();
    }

    function stop() {}

    function apiFetch(path) {
        return fetch(API_BASE + path, {
            headers: FishTankAuth.authHeaders()
        }).then(function(r) {
            if (!r.ok) throw new Error('API error: ' + r.status);
            return r.json();
        });
    }

    function loadStats() {
        var container = document.getElementById('ff-stats');
        container.innerHTML = '<div class="admin-stat-card"><div class="stat-label">Loading...</div></div>';
        apiFetch('/pvp/admin/stats').then(function(data) {
            container.innerHTML = '';
            var stats = [
                { label: 'Total Players', value: data.totalPlayers },
                { label: 'Active This Month', value: data.activeThisMonth },
                { label: 'Total Snapshots', value: data.totalSnapshots },
                { label: 'Top Floor', value: data.topFloor },
                { label: 'Avg Floor', value: data.avgHighestFloor != null ? data.avgHighestFloor.toFixed(1) : '—' }
            ];
            stats.forEach(function(s) {
                var card = document.createElement('div');
                card.className = 'admin-stat-card';
                card.innerHTML = '<div class="stat-value">' + (s.value != null ? s.value : '—') + '</div>' +
                    '<div class="stat-label">' + s.label + '</div>';
                container.appendChild(card);
            });
        }).catch(function(err) {
            container.innerHTML = '<div class="admin-stat-card"><div class="stat-label">Failed to load stats</div></div>';
        });
    }

    function loadPlayers() {
        var search = document.getElementById('ff-player-search').value;
        var query = '?page=' + playersPage;
        if (search) query += '&search=' + encodeURIComponent(search);

        var tbody = document.querySelector('#ff-players-table tbody');
        tbody.innerHTML = '<tr><td colspan="6" style="opacity:0.4">Loading...</td></tr>';

        apiFetch('/pvp/admin/players' + query).then(function(data) {
            tbody.innerHTML = '';
            var players = data.players || [];
            if (players.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="opacity:0.4">No players found</td></tr>';
            } else {
                players.forEach(function(p) {
                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + esc(p.displayName || p.playerId) + '</td>' +
                        '<td>' + esc(p.platform || '—') + '</td>' +
                        '<td>' + (p.highestFloor != null ? p.highestFloor : '—') + '</td>' +
                        '<td>' + (p.snapshotCount != null ? p.snapshotCount : '—') + '</td>' +
                        '<td>' + relativeTime(p.lastActive) + '</td>' +
                        '<td>' + formatDate(p.createdAt) + '</td>';
                    tr.style.cursor = 'pointer';
                    tr.addEventListener('click', function() { showPlayerDetail(p.playerId); });
                    tbody.appendChild(tr);
                });
            }
            renderPagination('ff-players-pagination', playersPage, Math.ceil((data.total || 0) / (data.perPage || 50)) || 1, function(page) {
                playersPage = page;
                loadPlayers();
            });
        }).catch(function() {
            tbody.innerHTML = '<tr><td colspan="6" style="opacity:0.4">Failed to load players</td></tr>';
        });
    }

    function loadSnapshots() {
        var query = '?page=' + snapshotsPage;
        var tbody = document.querySelector('#ff-snapshots-table tbody');
        tbody.innerHTML = '<tr><td colspan="5" style="opacity:0.4">Loading...</td></tr>';

        apiFetch('/pvp/admin/snapshots' + query).then(function(data) {
            tbody.innerHTML = '';
            var snaps = data.snapshots || [];
            if (snaps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="opacity:0.4">No snapshots found</td></tr>';
            } else {
                snaps.forEach(function(s) {
                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + esc(s.displayName || s.playerId) + '</td>' +
                        '<td>' + esc(s.character || '—') + '</td>' +
                        '<td>' + (s.floor != null ? s.floor : '—') + '</td>' +
                        '<td>' + (s.powerLevel != null ? s.powerLevel : '—') + '</td>' +
                        '<td>' + relativeTime(s.createdAt) + '</td>';
                    tbody.appendChild(tr);
                });
            }
            renderPagination('ff-snapshots-pagination', snapshotsPage, Math.ceil((data.total || 0) / (data.perPage || 50)) || 1, function(page) {
                snapshotsPage = page;
                loadSnapshots();
            });
        }).catch(function() {
            tbody.innerHTML = '<tr><td colspan="5" style="opacity:0.4">Failed to load snapshots</td></tr>';
        });
    }

    function showPlayerDetail(playerId) {
        var panel = document.getElementById('ff-player-detail');
        var mainTables = document.getElementById('ff-main-tables');
        panel.style.display = 'block';
        mainTables.style.display = 'none';
        panel.innerHTML = '<div style="opacity:0.4">Loading player...</div>';

        apiFetch('/pvp/admin/player/' + encodeURIComponent(playerId)).then(function(data) {
            var p = data.player || data;
            var snaps = data.snapshots || [];

            var html = '<div class="admin-controls" style="margin-bottom:16px">' +
                '<button class="admin-btn" id="ff-detail-back">← Back to Players</button>' +
                '<h3 style="margin:0 0 0 12px">' + esc(p.displayName || p.playerId) + '</h3>' +
                '</div>' +
                '<div class="admin-stats-grid" style="margin-bottom:16px">' +
                '<div class="admin-stat-card"><div class="stat-value">' + esc(p.platform || '—') + '</div><div class="stat-label">Platform</div></div>' +
                '<div class="admin-stat-card"><div class="stat-value">' + (p.highestFloor != null ? p.highestFloor : '—') + '</div><div class="stat-label">Highest Floor</div></div>' +
                '<div class="admin-stat-card"><div class="stat-value">' + formatDate(p.createdAt) + '</div><div class="stat-label">Joined</div></div>' +
                '</div>';

            if (snaps.length > 0) {
                html += '<h3>Snapshot History</h3>' +
                    '<table class="admin-table"><thead><tr>' +
                    '<th>Floor</th><th>Character</th><th>Power</th><th>Date</th>' +
                    '</tr></thead><tbody>';
                snaps.forEach(function(s) {
                    html += '<tr>' +
                        '<td>' + (s.floor != null ? s.floor : '—') + '</td>' +
                        '<td>' + esc(s.character || '—') + '</td>' +
                        '<td>' + (s.powerLevel != null ? s.powerLevel : '—') + '</td>' +
                        '<td>' + relativeTime(s.createdAt) + '</td>' +
                        '</tr>';
                });
                html += '</tbody></table>';
            } else {
                html += '<p style="opacity:0.4">No snapshots for this player</p>';
            }

            panel.innerHTML = html;
            document.getElementById('ff-detail-back').addEventListener('click', function() {
                panel.style.display = 'none';
                mainTables.style.display = 'block';
            });
        }).catch(function() {
            panel.innerHTML = '<div style="opacity:0.4">Failed to load player details</div>' +
                '<button class="admin-btn" id="ff-detail-back">← Back</button>';
            document.getElementById('ff-detail-back').addEventListener('click', function() {
                panel.style.display = 'none';
                mainTables.style.display = 'block';
            });
        });
    }

    function renderPagination(containerId, currentPage, totalPages, onPageChange) {
        var container = document.getElementById(containerId);
        container.innerHTML = '';
        if (totalPages <= 1) return;

        var prev = document.createElement('button');
        prev.className = 'admin-btn';
        prev.textContent = '← Prev';
        prev.disabled = currentPage <= 1;
        prev.addEventListener('click', function() { onPageChange(currentPage - 1); });

        var info = document.createElement('span');
        info.style.cssText = 'font-size:0.8rem;opacity:0.5;padding:0 8px;line-height:28px';
        info.textContent = 'Page ' + currentPage + ' of ' + totalPages;

        var next = document.createElement('button');
        next.className = 'admin-btn';
        next.textContent = 'Next →';
        next.disabled = currentPage >= totalPages;
        next.addEventListener('click', function() { onPageChange(currentPage + 1); });

        container.appendChild(prev);
        container.appendChild(info);
        container.appendChild(next);
    }

    function relativeTime(dateStr) {
        if (!dateStr) return '—';
        var now = Date.now();
        var then = new Date(dateStr).getTime();
        if (isNaN(then)) return '—';
        var diff = now - then;
        var secs = Math.floor(diff / 1000);
        if (secs < 60) return 'just now';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        var days = Math.floor(hrs / 24);
        if (days < 30) return days + 'd ago';
        var months = Math.floor(days / 30);
        return months + 'mo ago';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString();
    }

    function esc(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function debounce(fn, ms) {
        var timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    return {
        start: start,
        stop: stop
    };
})();

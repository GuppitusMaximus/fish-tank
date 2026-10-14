// The company intro's tank and guppy, adapted to a quiet homepage patrol.
(async function () {
    var canvas = document.getElementById('company-mascot');
    var toggle = document.getElementById('mascot-toggle');
    if (!canvas || !toggle) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var sprites;
    try {
        sprites = await Promise.all(['hull-side', 'turret-side', 'head-iso-v7', 'turret-iso', 'turret-front', 'head-front-v7'].map(async function (name) {
            var img = new Image();
            img.src = '/assets/company/' + name + '.png';
            await img.decode();
            return img;
        }));
    } catch (_) { canvas.parentElement.hidden = true; return; }

    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var paused = motion.matches;
    var visible = true;
    var cinematic = document.getElementById('intro-cinematic');
    var videos = cinematic ? [cinematic] : [];
    var time = 0;
    var last = null;
    var frame = null;
    var width = 600;
    var height = 105;
    var clamp = function (n) { return Math.max(0, Math.min(1, n)); };
    var ease = function (n) { n = clamp(n); return n * n * (3 - 2 * n); };

    function fireCloud(x, y, rx, ry, color) {
        if (rx <= 0 || ry <= 0) return;
        ctx.fillStyle = color;
        for (var row = -ry; row <= ry; row += 2) {
            var span = Math.sqrt(Math.max(0, 1 - row * row / (ry * ry))) * rx;
            ctx.fillRect(Math.round(x - span), Math.round(y + row), Math.max(2, Math.round(span * 2)), 2);
        }
    }

    function render(t) {
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        var half = 9;
        var cycle = t % (half * 2);
        var right = cycle < half;
        var leg = cycle % half;
        var moving = leg < 6.8;
        var travel = ease(leg / 6.8);
        var margin = Math.min(185, width * .4);
        var x = right ? margin + (width - 2 * margin) * travel : width - margin - (width - 2 * margin) * travel;
        var age = leg - 7.1;
        var firing = age >= 0 && age < 1.1;
        var recoil = age >= 0 && age < .7 ? 11 * Math.exp(-age * 7) * Math.sin(clamp(age / .06) * Math.PI / 2) : 0;
        var shudder = age >= 0 && age < .65 ? Math.exp(-age * 6) : 0;
        var shudderX = Math.round(Math.sin(age * 88) * 3 * shudder);
        var shudderY = -Math.round(Math.abs(Math.sin(age * 60)) * 3 * shudder);
        var phase = travel * (width - 2 * margin);
        var bump = moving ? Math.floor(phase / 6) % 2 : 0;
        ctx.fillStyle = '#2b4145';
        ctx.fillRect(0, 100, width, 1);
        ctx.save();
        ctx.translate(Math.round(x), 0);
        ctx.scale(right ? 1 : -1, 1);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(-52, 97, 104, 3);
        ctx.translate(-59 - recoil * .55 + shudderX, 51 + bump + shudderY);
        ctx.drawImage(sprites[0], 0, 0);
        // Track links follow the original side-view belt path.
        var points = [[7,24],[105,24],[113,29],[116,35],[112,42],[106,45],[15,45],[7,42],[2,35],[3,29],[7,24]];
        var segments = points.slice(1).map(function (p, i) {
            var a = points[i];
            return {a: a, b: p, length: Math.hypot(p[0] - a[0], p[1] - a[1])};
        });
        var total = segments.reduce(function (sum, s) { return sum + s.length; }, 0);
        for (var d = 0; d < total; d += 6) {
            var pos = (d + phase) % total;
            var segment = segments[segments.length - 1];
            for (var s of segments) { if (pos <= s.length) { segment = s; break; } pos -= s.length; }
            var p = pos / segment.length;
            var px = Math.round(segment.a[0] + (segment.b[0] - segment.a[0]) * p);
            var py = Math.round(segment.a[1] + (segment.b[1] - segment.a[1]) * p);
            ctx.fillStyle = '#111d25'; ctx.fillRect(px - 1, py - 1, 3, 3);
            ctx.fillStyle = '#87959a'; ctx.fillRect(px, py, 1, 2);
        }
        // Occasionally glance at the viewer while the hull keeps driving.
        // Each pose pivots around the same hatch, independent of the tracks.
        var glance = Math.floor(t / half) % 3 !== 2 && leg >= 2.3 && leg < 4.8;
        var front = glance && leg >= 2.7 && leg < 4.4;
        var turret = sprites[glance ? (front ? 4 : 3) : 1];
        var head = sprites[front ? 5 : 2];
        var hatch = glance ? (front ? 37 : 29) : 24;
        var foreground = glance ? (front ? 39 : 34) : 23;
        var turretX = 58 - hatch - recoil;
        var turretY = glance ? (front ? -50 : -45) : -40;
        ctx.drawImage(turret, turretX, turretY);
        var duck = firing ? 3 * Math.sin(clamp(age / .4) * Math.PI) : 0;
        ctx.drawImage(head, 0, 0, 26, 22 - duck, turretX + hatch - 13, turretY + foreground - 22 + duck, 26, 22 - duck);
        ctx.drawImage(turret, 0, foreground, turret.width, turret.height - foreground, turretX, turretY + foreground, turret.width, turret.height - foreground);
        if (moving) {
            for (var i = 0; i < 6; i++) {
                var dust = (t * 2 + i / 6) % 1;
                ctx.fillStyle = 'rgba(168,190,188,' + ((1 - dust) * .14) + ')';
                ctx.fillRect(-8 - dust * 24, 45 - dust * 6 + (i % 2) * 2, 3, 2);
            }
        }
        if (firing) {
            var muzzleX = turretX + 96;
            var muzzleY = turretY + 31;
            if (age < .32) {
                var blast = clamp(age / .045) * clamp((.32 - age) / .2);
                fireCloud(muzzleX + 20 * blast, muzzleY, 36 * blast, 24 * blast, '#a7421b');
                fireCloud(muzzleX + 22 * blast, muzzleY, 30 * blast, 19 * blast, '#f07624');
                fireCloud(muzzleX + 21 * blast, muzzleY, 23 * blast, 13 * blast, '#ffbc48');
                fireCloud(muzzleX + 16 * blast, muzzleY, 17 * blast, 7 * blast, '#fff2af');
                ctx.fillStyle = '#fffde6'; ctx.fillRect(muzzleX, muzzleY - 2, 27 * blast, 4);
            }
            // A thin, expanding wall of muzzle gas follows the projectile.
            if (age < .48) {
                var wave = clamp(age / .48);
                var gasX = muzzleX + 5 + wave * 42;
                for (var g = 0; g < 22; g++) {
                    var angle = g * Math.PI * 2 / 22;
                    ctx.fillStyle = 'rgba(224,210,172,' + ((1 - wave) * .55) + ')';
                    ctx.fillRect(Math.round(gasX + Math.cos(angle) * (5 + wave * 14)), Math.round(muzzleY + Math.sin(angle) * (7 + wave * 28)), 3 + wave * 3, 3 + wave * 3);
                }
            }
            if (age < .7) {
                var projectileX = muzzleX + age * 175;
                fireCloud(projectileX - 10, muzzleY, 23, 7, '#a7421b');
                fireCloud(projectileX - 3, muzzleY, 16, 10, '#f07624');
                fireCloud(projectileX, muzzleY, 11, 8, '#ffbc48');
                fireCloud(projectileX + 2, muzzleY, 6, 4, '#fff2af');
            }
            for (var j = 0; j < 8; j++) {
                var smokeAge = age - .06 - j * .018;
                if (smokeAge < 0) continue;
                var smokeY = muzzleY + (j % 2 ? 1 : -1) * (5 + j * 2) - smokeAge * 15;
                fireCloud(muzzleX + 8 + j * 4 + smokeAge * 18, smokeY, 5 + smokeAge * 10, 4 + smokeAge * 7, 'rgba(168,190,188,' + (clamp(1 - smokeAge / 1.04) * .22) + ')');
            }
        }
        ctx.restore();
    }

    function allowed() { return !paused && visible && !document.hidden && !videos.some(function (v) { return !v.paused; }); }
    function tick(now) {
        frame = null;
        if (!allowed()) { last = null; return; }
        if (last !== null) time += Math.min((now - last) / 1000, .05);
        last = now;
        render(time);
        frame = requestAnimationFrame(tick);
    }
    function sync() {
        if (allowed() && frame === null) { last = null; frame = requestAnimationFrame(tick); }
        if (!allowed() && frame !== null) { cancelAnimationFrame(frame); frame = null; last = null; }
        toggle.textContent = paused ? 'Play mascot' : 'Pause mascot';
        toggle.setAttribute('aria-pressed', String(paused));
    }
    function resize() {
        width = Math.max(200, Math.round(canvas.clientWidth / 1.2));
        var density = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * density);
        canvas.height = Math.round(height * density);
        ctx.setTransform(density, 0, 0, density, 0, 0);
        render(time);
    }
    toggle.hidden = false;
    canvas.parentElement.hidden = false;
    resize();
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); }).observe(canvas);
    toggle.addEventListener('click', function () { paused = !paused; sync(); });
    motion.addEventListener('change', function () { paused = motion.matches; if (paused) { time = 0; render(time); } sync(); });
    document.addEventListener('visibilitychange', sync);
    videos.forEach(function (video) { ['play', 'pause', 'ended'].forEach(function (event) { video.addEventListener(event, sync); }); });
    sync();
})();

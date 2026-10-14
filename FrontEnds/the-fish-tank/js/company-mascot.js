// The company intro's tank and guppy, adapted to a quiet homepage patrol.
(async function () {
    var canvas = document.getElementById('company-mascot');
    var toggle = document.getElementById('mascot-toggle');
    if (!canvas || !toggle) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var sprites;
    try {
        sprites = await Promise.all(['hull-side', 'turret-side', 'head-iso-v7'].map(async function (name) {
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

    function render(t) {
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        var half = 9;
        var cycle = t % (half * 2);
        var right = cycle < half;
        var leg = cycle % half;
        var moving = leg < 6.8;
        var travel = ease(leg / 6.8);
        var margin = Math.min(130, width * .29);
        var x = right ? margin + (width - 2 * margin) * travel : width - margin - (width - 2 * margin) * travel;
        var age = leg - 7.1;
        var firing = age >= 0 && age < 1.1;
        var recoil = age >= 0 && age < .55 ? 6 * Math.exp(-age * 9) * Math.sin(clamp(age / .07) * Math.PI / 2) : 0;
        var phase = travel * (width - 2 * margin);
        var bump = moving ? Math.floor(phase / 6) % 2 : 0;
        ctx.fillStyle = '#2b4145';
        ctx.fillRect(0, 100, width, 1);
        ctx.save();
        ctx.translate(Math.round(x), 0);
        ctx.scale(right ? 1 : -1, 1);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(-52, 97, 104, 3);
        ctx.translate(-59 - recoil * .3, 51 + bump);
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
        var turretX = 34 - recoil;
        var turretY = -40;
        ctx.drawImage(sprites[1], turretX, turretY);
        var duck = firing ? 3 * Math.sin(clamp(age / .4) * Math.PI) : 0;
        ctx.drawImage(sprites[2], 0, 0, 26, 22 - duck, turretX + 11, turretY + 1 + duck, 26, 22 - duck);
        ctx.drawImage(sprites[1], 0, 23, 98, 23, turretX, turretY + 23, 98, 23);
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
            if (age < .14) {
                ctx.fillStyle = '#e8c78d'; ctx.fillRect(muzzleX, muzzleY - 4, 9, 8);
                ctx.fillStyle = '#fff5d2'; ctx.fillRect(muzzleX, muzzleY - 2, 5, 4);
            }
            if (age < .65) {
                ctx.fillStyle = '#e8c78d'; ctx.fillRect(muzzleX + age * 190, muzzleY - 1, 6, 3);
            }
            for (var j = 0; j < 5; j++) {
                ctx.fillStyle = 'rgba(168,190,188,' + ((1 - age / 1.1) * .26) + ')';
                ctx.fillRect(muzzleX + age * (10 + j * 6), muzzleY - age * (8 + j * 4), 3 + age * 5, 3 + age * 5);
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

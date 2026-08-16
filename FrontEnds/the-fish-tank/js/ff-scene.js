// Ambient battle scene for the Fathom Fall hub tile.
// Party tidekin (left) trade attacks with monsters (right) using the game's
// own 256px sprite sheets (idle row 0, attack row 1), downscaled. Sprite
// images are loaded after first paint so they never block the hub.

(function() {
  var scene = document.getElementById('ff-scene');
  if (!scene) return;

  var BASE = 'assets/ff/';
  var VER = '?v=7';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var party = [].slice.call(scene.querySelectorAll('.ff-party .ff-sprite'));
  var enemy = [].slice.call(scene.querySelectorAll('.ff-enemy .ff-sprite'));
  var t = 0;
  var started = false;

  function loadImages() {
    scene.querySelectorAll('.ff-sprite').forEach(function(el) {
      el.style.backgroundImage = "url('" + BASE + el.dataset.ff + ".png" + VER + "')";
    });
  }

  function strike(from, toList) {
    if (!from.length || !toList.length) return;
    var a = from[t % from.length];
    var tgt = toList[Math.floor(Math.random() * toList.length)];
    a.classList.add('attacking', 'lunge');
    setTimeout(function() { tgt.classList.add('hit'); }, 250);
    setTimeout(function() { a.classList.remove('lunge'); }, 320);
    setTimeout(function() { a.classList.remove('attacking'); }, 500);
    setTimeout(function() { tgt.classList.remove('hit'); }, 450);
  }

  function tick() {
    if (document.hidden) { schedule(1200); return; }
    // party presses the attack; enemies retaliate every third beat
    if (t % 3 === 2) strike(enemy, party);
    else strike(party, enemy);
    t++;
    schedule(1300 + Math.random() * 700);
  }

  function schedule(ms) { setTimeout(tick, ms); }

  function start() {
    if (started) return;
    started = true;
    loadImages();
    if (!reduce) schedule(700);
  }

  // Defer past first paint so the sprite PNGs don't compete with the hub load.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(start, { timeout: 1800 });
  } else {
    window.addEventListener('load', function() { setTimeout(start, 400); });
  }
})();

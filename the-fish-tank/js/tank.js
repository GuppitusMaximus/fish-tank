window.FishTankApp = (() => {
  const tank = document.getElementById('tank');
  const fishes = [];
  let initialized = false;
  let running = false;
  let animFrameId = 0;
  let lastTime = 0;
  let bubbleInterval = null;

  // Color palettes: [body, belly, fin/tail accent]
  const palettes = [
    ['#e8734a', '#f4a87a', '#c95530'],
    ['#4a90d9', '#7ab8f5', '#3068a8'],
    ['#f0c040', '#f5da78', '#c89e20'],
    ['#e05080', '#f08aaa', '#b83060'],
    ['#50c878', '#80e8a8', '#30a858'],
    ['#9b6dcc', '#bfa0e0', '#7a4aaa'],
    ['#e07830', '#f0a868', '#b85818'],
    ['#40b0c0', '#70d0e0', '#2890a0'],
  ];

  function randomBetween(a, b) {
    return a + Math.random() * (b - a);
  }

  function createFishSVG(colors, size) {
    const [body, belly, accent] = colors;
    const w = size;
    const h = size * 0.55;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 60 33');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);

    svg.innerHTML = `
      <!-- tail -->
      <polygon class="tail" points="52,16.5 60,6 60,27" fill="${accent}" />
      <!-- body -->
      <ellipse cx="28" cy="16.5" rx="24" ry="14" fill="${body}" />
      <!-- belly -->
      <ellipse cx="26" cy="20" rx="16" ry="7" fill="${belly}" opacity="0.5" />
      <!-- dorsal fin -->
      <path class="fin" d="M20,3 Q28,0 32,3 Q28,6 24,5Z" fill="${accent}" opacity="0.8" />
      <!-- eye -->
      <circle cx="12" cy="14" r="3.5" fill="white" />
      <circle cx="11" cy="13.5" r="2" fill="#1a1a2e" />
      <circle cx="10.2" cy="12.8" r="0.7" fill="white" />
    `;

    return svg;
  }

  class Fish {
    constructor(x, y) {
      const colors = palettes[Math.floor(Math.random() * palettes.length)];
      this.size = randomBetween(36, 62);
      this.x = x;
      this.y = y;
      this.speedX = randomBetween(0.4, 1.5) * (Math.random() < 0.5 ? 1 : -1);
      this.speedY = 0;
      this.wobbleOffset = Math.random() * Math.PI * 2;
      this.wobbleSpeed = randomBetween(1.5, 3);
      this.wobbleAmp = randomBetween(0.3, 0.8);
      this.facingLeft = this.speedX < 0;

      this.el = document.createElement('div');
      this.el.className = 'fish';
      this.el.style.width = this.size + 'px';
      this.el.style.height = (this.size * 0.55) + 'px';

      const svg = createFishSVG(colors, this.size);
      this.el.appendChild(svg);

      tank.appendChild(this.el);
      this.updateDOM();
    }

    update(dt, time) {
      const rect = tank.getBoundingClientRect();
      const maxX = rect.width - this.size;
      const maxY = rect.height - this.size * 0.55 - 40;

      this.x += this.speedX * dt * 60;

      this.speedY = Math.sin(time * this.wobbleSpeed + this.wobbleOffset) * this.wobbleAmp;
      this.y += this.speedY * dt * 60;

      if (this.x <= 0) {
        this.x = 0;
        this.speedX = Math.abs(this.speedX);
      } else if (this.x >= maxX) {
        this.x = maxX;
        this.speedX = -Math.abs(this.speedX);
      }

      if (this.y < 10) this.y = 10;
      if (this.y > maxY) this.y = maxY;

      this.facingLeft = this.speedX < 0;

      this.updateDOM();
    }

    updateDOM() {
      this.el.style.transform =
        `translate(${this.x}px, ${this.y}px) scaleX(${this.facingLeft ? 1 : -1})`;
    }
  }

  function spawnBubble() {
    const rect = tank.getBoundingClientRect();
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const size = randomBetween(4, 12);
    const left = randomBetween(5, rect.width - 15);
    const duration = randomBetween(3, 6);

    bubble.style.width = size + 'px';
    bubble.style.height = size + 'px';
    bubble.style.left = left + 'px';
    bubble.style.bottom = '40px';
    bubble.style.animationDuration = duration + 's';

    tank.appendChild(bubble);
    setTimeout(() => bubble.remove(), duration * 1000);
  }

  function loop(timestamp) {
    if (!running) return;
    const time = timestamp / 1000;
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0.016;
    lastTime = timestamp;

    for (const fish of fishes) {
      fish.update(dt, time);
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function init() {
    tank.addEventListener('click', (e) => {
      const rect = tank.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      fishes.push(new Fish(x, y));
    });

    const rect = tank.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const x = randomBetween(40, rect.width - 80);
      const y = randomBetween(30, rect.height - 100);
      fishes.push(new Fish(x, y));
    }
  }

  function start() {
    if (!initialized) {
      initialized = true;
      init();
    }
    running = true;
    lastTime = 0;
    animFrameId = requestAnimationFrame(loop);
    bubbleInterval = setInterval(spawnBubble, 800);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(animFrameId);
    if (bubbleInterval) {
      clearInterval(bubbleInterval);
      bubbleInterval = null;
    }
  }

  return { start, stop };
})();

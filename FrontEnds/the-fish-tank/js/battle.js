window.BattleApp = (() => {
  const arena = document.getElementById('arena');
  const tanks = [];
  const projectiles = [];
  let initialized = false;
  let running = false;
  let animFrameId = 0;
  let lastTime = 0;

  const palettes = [
    ['#4a6b35', '#6b8f4a', '#3a5528'],
    ['#6b6040', '#8a805a', '#4a4228'],
    ['#5a5a5a', '#7a7a7a', '#3a3a3a'],
    ['#6a5030', '#8a7050', '#4a3018'],
    ['#3a5060', '#5a7888', '#2a3840'],
    ['#705838', '#907850', '#504020'],
  ];

  const guppyPalettes = [
    ['#e8734a', '#f4a87a', '#c95530'],
    ['#4a90d9', '#7ab8f5', '#3068a8'],
    ['#f0c040', '#f5da78', '#c89e20'],
    ['#e05080', '#f08aaa', '#b83060'],
    ['#50c878', '#80e8a8', '#30a858'],
    ['#9b6dcc', '#bfa0e0', '#7a4aaa'],
  ];

  function randomBetween(a, b) {
    return a + Math.random() * (b - a);
  }

  function createTankSVG(tankColors, guppyColors) {
    const [hull, hullLight, hullDark] = tankColors;
    const [fishBody, fishBelly, fishAccent] = guppyColors;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 60');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '60');

    svg.innerHTML = `
      <!-- treads -->
      <rect x="5" y="42" width="90" height="14" rx="7" fill="${hullDark}" />
      <circle cx="16" cy="49" r="5" fill="${hullLight}" opacity="0.4" />
      <circle cx="32" cy="49" r="5" fill="${hullLight}" opacity="0.4" />
      <circle cx="50" cy="49" r="5" fill="${hullLight}" opacity="0.4" />
      <circle cx="68" cy="49" r="5" fill="${hullLight}" opacity="0.4" />
      <circle cx="84" cy="49" r="5" fill="${hullLight}" opacity="0.4" />
      <!-- hull -->
      <rect x="10" y="30" width="80" height="16" rx="3" fill="${hull}" />
      <rect x="15" y="32" width="70" height="10" rx="2" fill="${hullLight}" opacity="0.3" />
      <!-- turret base -->
      <rect x="30" y="20" width="35" height="14" rx="4" fill="${hull}" />
      <!-- barrel -->
      <g class="turret">
        <rect x="2" y="24" width="38" height="5" rx="2.5" fill="${hullDark}" />
      </g>
      <!-- glass dome cockpit -->
      <ellipse cx="47" cy="20" rx="14" ry="12" fill="rgba(180,220,255,0.15)" stroke="rgba(180,220,255,0.3)" stroke-width="0.8" />
      <!-- guppy pilot inside dome -->
      <ellipse cx="47" cy="21" rx="8" ry="5" fill="${fishBody}" />
      <ellipse cx="45" cy="23" rx="5" ry="2.5" fill="${fishBelly}" opacity="0.5" />
      <polygon points="55,21 59,17 59,25" fill="${fishAccent}" />
      <circle cx="42" cy="19" r="1.8" fill="white" />
      <circle cx="41.5" cy="18.7" r="1" fill="#1a1a2e" />
      <circle cx="41.2" cy="18.3" r="0.4" fill="white" />
    `;

    return svg;
  }

  class Tank {
    constructor(x, y) {
      this.tankColors = palettes[Math.floor(Math.random() * palettes.length)];
      this.guppyColors = guppyPalettes[Math.floor(Math.random() * guppyPalettes.length)];
      this.width = 100;
      this.height = 60;
      this.x = x;
      this.y = y;
      this.speedX = randomBetween(0.3, 0.8) * (Math.random() < 0.5 ? 1 : -1);
      this.facingLeft = this.speedX < 0;
      this.bobbleOffset = Math.random() * Math.PI * 2;
      this.bobbleSpeed = randomBetween(2, 4);
      this.health = 3;
      this.alive = true;
      this.fireCooldown = randomBetween(1.5, 3);
      this.fireTimer = randomBetween(0, this.fireCooldown);
      this.dustTimer = 0;

      this.el = document.createElement('div');
      this.el.className = 'tank';
      this.el.style.width = this.width + 'px';
      this.el.style.height = this.height + 'px';

      this.svg = createTankSVG(this.tankColors, this.guppyColors);
      this.el.appendChild(this.svg);
      this.turret = this.svg.querySelector('.turret');

      arena.appendChild(this.el);
      this.updateDOM();
    }

    update(dt, time) {
      if (!this.alive) return;

      const rect = arena.getBoundingClientRect();
      const groundY = rect.height - 50 - this.height;
      const maxX = rect.width - this.width;

      this.x += this.speedX * dt * 60;
      this.y = groundY + Math.sin(time * this.bobbleSpeed + this.bobbleOffset) * 2;

      if (this.x <= 0) {
        this.x = 0;
        this.speedX = Math.abs(this.speedX);
      } else if (this.x >= maxX) {
        this.x = maxX;
        this.speedX = -Math.abs(this.speedX);
      }

      this.facingLeft = this.speedX < 0;
      this.aimTurret();

      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireAtNearest();
        this.fireTimer = this.fireCooldown + randomBetween(-0.5, 0.5);
      }

      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.spawnDust();
        this.dustTimer = randomBetween(0.15, 0.35);
      }

      this.updateDOM();
    }

    aimTurret() {
      const nearest = this.findNearest();
      if (!nearest || !this.turret) return;

      const cx = this.x + this.width / 2;
      const cy = this.y + 26;
      const tx = nearest.x + nearest.width / 2;
      const ty = nearest.y + 26;
      const angle = Math.atan2(ty - cy, tx - cx) * (180 / Math.PI);

      this.turret.setAttribute('transform', `rotate(${angle}, 40, 26)`);
    }

    findNearest() {
      let nearest = null;
      let minDist = Infinity;
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height / 2;

      for (const other of tanks) {
        if (other === this || !other.alive) continue;
        const dx = (other.x + other.width / 2) - cx;
        const dy = (other.y + other.height / 2) - cy;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          nearest = other;
        }
      }
      return nearest;
    }

    fireAtNearest() {
      const target = this.findNearest();
      if (!target) return;

      const cx = this.x + this.width / 2;
      const cy = this.y + 26;
      const tx = target.x + target.width / 2;
      const ty = target.y + 26;
      const angle = Math.atan2(ty - cy, tx - cx);

      const bx = cx + Math.cos(angle) * 40;
      const by = cy + Math.sin(angle) * 40;

      projectiles.push(new Projectile(bx, by, angle, this));
    }

    spawnDust() {
      const dust = document.createElement('div');
      dust.className = 'dust';
      const size = randomBetween(4, 10);
      const duration = randomBetween(0.6, 1.2);
      dust.style.width = size + 'px';
      dust.style.height = size + 'px';
      dust.style.left = (this.x + randomBetween(10, this.width - 10)) + 'px';
      dust.style.top = (this.y + this.height - 10) + 'px';
      dust.style.animationDuration = duration + 's';
      arena.appendChild(dust);
      setTimeout(() => dust.remove(), duration * 1000);
    }

    takeDamage() {
      this.health--;
      if (this.health <= 0) {
        this.destroy();
      }
    }

    destroy() {
      this.alive = false;
      for (let i = 0; i < 5; i++) {
        const smoke = document.createElement('div');
        smoke.className = 'destroy-smoke';
        const size = randomBetween(15, 30);
        smoke.style.width = size + 'px';
        smoke.style.height = size + 'px';
        smoke.style.borderRadius = '50%';
        smoke.style.background = `radial-gradient(circle, rgba(80,80,80,0.6), rgba(40,40,40,0.2))`;
        smoke.style.left = (this.x + this.width / 2 + randomBetween(-20, 20)) + 'px';
        smoke.style.top = (this.y + this.height / 2 + randomBetween(-10, 10)) + 'px';
        arena.appendChild(smoke);
        setTimeout(() => smoke.remove(), 1000);
      }
      this.el.style.transition = 'opacity 0.6s';
      this.el.style.opacity = '0';
      setTimeout(() => {
        this.el.remove();
        const idx = tanks.indexOf(this);
        if (idx !== -1) tanks.splice(idx, 1);
      }, 600);
    }

    updateDOM() {
      this.el.style.transform =
        `translate(${this.x}px, ${this.y}px) scaleX(${this.facingLeft ? 1 : -1})`;
    }
  }

  class Projectile {
    constructor(x, y, angle, owner) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.speed = 300;
      this.owner = owner;
      this.alive = true;

      this.el = document.createElement('div');
      this.el.className = 'projectile';
      arena.appendChild(this.el);
      this.updateDOM();
    }

    update(dt) {
      if (!this.alive) return;

      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;

      const rect = arena.getBoundingClientRect();
      if (this.x < -10 || this.x > rect.width + 10 || this.y < -10 || this.y > rect.height + 10) {
        this.remove();
        return;
      }

      for (const tank of tanks) {
        if (tank === this.owner || !tank.alive) continue;
        const tx = tank.x + tank.width / 2;
        const ty = tank.y + tank.height / 2;
        const dx = this.x - tx;
        const dy = this.y - ty;
        if (dx * dx + dy * dy < 900) {
          this.hit(tank);
          return;
        }
      }

      this.updateDOM();
    }

    hit(tank) {
      this.alive = false;
      this.el.remove();
      tank.takeDamage();
      spawnExplosion(this.x, this.y);
    }

    remove() {
      this.alive = false;
      this.el.remove();
    }

    updateDOM() {
      this.el.style.left = (this.x - 3) + 'px';
      this.el.style.top = (this.y - 3) + 'px';
    }
  }

  function spawnExplosion(x, y) {
    const exp = document.createElement('div');
    exp.className = 'explosion';
    exp.style.left = x + 'px';
    exp.style.top = y + 'px';
    arena.appendChild(exp);
    setTimeout(() => exp.remove(), 400);
  }

  function loop(timestamp) {
    if (!running) return;
    const time = timestamp / 1000;
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0.016;
    lastTime = timestamp;

    for (const tank of tanks) {
      tank.update(dt, time);
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      projectiles[i].update(dt);
      if (!projectiles[i].alive) {
        projectiles.splice(i, 1);
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function init() {
    arena.addEventListener('click', (e) => {
      const rect = arena.getBoundingClientRect();
      const x = e.clientX - rect.left - 50;
      const groundY = rect.height - 50 - 60;
      tanks.push(new Tank(Math.max(0, Math.min(x, rect.width - 100)), groundY));
    });

    const rect = arena.getBoundingClientRect();
    const groundY = rect.height - 50 - 60;
    for (let i = 0; i < 4; i++) {
      const x = randomBetween(20, rect.width - 120);
      tanks.push(new Tank(x, groundY));
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
  }

  function stop() {
    running = false;
    cancelAnimationFrame(animFrameId);
  }

  return { start, stop };
})();

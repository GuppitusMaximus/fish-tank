window.FighterApp = (() => {
  const sky = document.getElementById('sky');
  const planes = [];
  const missiles = [];
  let initialized = false;
  let running = false;
  let animFrameId = 0;
  let lastTime = 0;

  const planePalettes = [
    ['#4a6b35', '#6b8f4a', '#3a5528'],
    ['#5a5a5a', '#7a7a7a', '#3a3a3a'],
    ['#3a5060', '#5a7888', '#2a3840'],
    ['#6a5030', '#8a7050', '#4a3018'],
    ['#6b6040', '#8a805a', '#4a4228'],
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

  function createPlaneSVG(planeColors, guppyColors) {
    const [hull, hullLight, hullDark] = planeColors;
    const [fishBody, fishBelly, fishAccent] = guppyColors;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 50');
    svg.setAttribute('width', '120');
    svg.setAttribute('height', '50');

    svg.innerHTML = `
      <!-- fuselage -->
      <ellipse cx="55" cy="25" rx="40" ry="8" fill="${hull}" />
      <ellipse cx="55" cy="23" rx="36" ry="5" fill="${hullLight}" opacity="0.3" />
      <!-- nose -->
      <ellipse cx="95" cy="25" rx="6" ry="4" fill="${hullDark}" />
      <!-- wings -->
      <polygon points="40,25 55,25 50,6 35,6" fill="${hullDark}" />
      <polygon points="40,25 55,25 50,44 35,44" fill="${hullDark}" />
      <polygon points="42,25 55,25 51,8 37,8" fill="${hullLight}" opacity="0.2" />
      <!-- tail fin -->
      <polygon points="15,25 22,25 18,10 12,12" fill="${hullDark}" />
      <polygon points="15,25 22,25 18,40 12,38" fill="${hullDark}" />
      <!-- tail stabilizer -->
      <polygon points="16,25 24,25 20,18 14,20" fill="${hull}" opacity="0.7" />
      <!-- cockpit canopy -->
      <ellipse cx="70" cy="24" rx="10" ry="7" fill="rgba(180,220,255,0.2)" stroke="rgba(180,220,255,0.35)" stroke-width="0.8" />
      <!-- guppy pilot -->
      <ellipse cx="70" cy="25" rx="6" ry="3.5" fill="${fishBody}" />
      <ellipse cx="68" cy="26.5" rx="4" ry="1.8" fill="${fishBelly}" opacity="0.5" />
      <polygon points="64,25 61,22 61,28" fill="${fishAccent}" />
      <circle cx="74" cy="23.5" r="1.5" fill="white" />
      <circle cx="74.5" cy="23.2" r="0.8" fill="#1a1a2e" />
      <circle cx="74.8" cy="22.9" r="0.3" fill="white" />
      <!-- propeller spinner -->
      <circle cx="100" cy="25" r="2.5" fill="${hullDark}" />
      <!-- propeller blades (animated via CSS) -->
      <g class="propeller">
        <rect x="99" y="17" width="2" height="16" rx="1" fill="${hullLight}" opacity="0.5" />
      </g>
    `;

    return svg;
  }

  class Plane {
    constructor(x, y) {
      this.planeColors = planePalettes[Math.floor(Math.random() * planePalettes.length)];
      this.guppyColors = guppyPalettes[Math.floor(Math.random() * guppyPalettes.length)];
      this.width = 120;
      this.height = 50;
      this.x = x;
      this.y = y;
      this.speedX = randomBetween(1, 2.5) * (Math.random() < 0.5 ? 1 : -1);
      this.speedY = randomBetween(0.2, 0.6) * (Math.random() < 0.5 ? 1 : -1);
      this.facingLeft = this.speedX < 0;
      this.wobbleOffset = Math.random() * Math.PI * 2;
      this.wobbleSpeed = randomBetween(1.5, 3);
      this.wobbleAmp = randomBetween(0.3, 0.6);
      this.health = 3;
      this.alive = true;
      this.fireCooldown = randomBetween(1.5, 3);
      this.fireTimer = randomBetween(0, this.fireCooldown);
      this.contrailTimer = 0;

      this.el = document.createElement('div');
      this.el.className = 'plane';
      this.el.style.width = this.width + 'px';
      this.el.style.height = this.height + 'px';

      this.svg = createPlaneSVG(this.planeColors, this.guppyColors);
      this.el.appendChild(this.svg);

      sky.appendChild(this.el);
      this.updateDOM();
    }

    update(dt, time) {
      if (!this.alive && !this.crashing) return;

      const rect = sky.getBoundingClientRect();
      const maxX = rect.width - this.width;
      const groundY = rect.height - this.height - 10;

      if (this.crashing) {
        this.crashVelY += 200 * dt;
        this.x += this.crashVelX * dt;
        this.y += this.crashVelY * dt;
        this.crashAngle += this.crashSpin * dt;

        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0) {
          this.spawnCrashSmoke();
          this.smokeTimer = 0.08;
        }

        if (this.y >= groundY) {
          this.crashImpact();
          return;
        }

        this.updateDOM();
        return;
      }

      const maxY = groundY - 10;

      this.x += this.speedX * dt * 60;
      this.y += (this.speedY + Math.sin(time * this.wobbleSpeed + this.wobbleOffset) * this.wobbleAmp) * dt * 60;

      if (this.x <= 0) {
        this.x = 0;
        this.speedX = Math.abs(this.speedX);
      } else if (this.x >= maxX) {
        this.x = maxX;
        this.speedX = -Math.abs(this.speedX);
      }

      if (this.y <= 10) {
        this.y = 10;
        this.speedY = Math.abs(this.speedY);
      } else if (this.y >= maxY) {
        this.y = maxY;
        this.speedY = -Math.abs(this.speedY);
      }

      this.facingLeft = this.speedX < 0;

      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireAtNearest();
        this.fireTimer = this.fireCooldown + randomBetween(-0.5, 0.5);
      }

      this.contrailTimer -= dt;
      if (this.contrailTimer <= 0) {
        this.spawnContrail();
        this.contrailTimer = randomBetween(0.05, 0.12);
      }

      this.updateDOM();
    }

    findNearest() {
      let nearest = null;
      let minDist = Infinity;
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height / 2;

      for (const other of planes) {
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
      const cy = this.y + this.height / 2;
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height / 2;
      const angle = Math.atan2(ty - cy, tx - cx);

      const bx = cx + Math.cos(angle) * 50;
      const by = cy + Math.sin(angle) * 50;

      missiles.push(new Missile(bx, by, angle, this));
    }

    spawnContrail() {
      const trail = document.createElement('div');
      trail.className = 'contrail';
      const size = randomBetween(3, 7);
      const duration = randomBetween(0.5, 1.0);
      trail.style.width = size + 'px';
      trail.style.height = size + 'px';
      const tailX = this.facingLeft ? this.x + this.width - 10 : this.x + 10;
      trail.style.left = tailX + 'px';
      trail.style.top = (this.y + this.height / 2 - size / 2) + 'px';
      trail.style.animationDuration = duration + 's';
      sky.appendChild(trail);
      setTimeout(() => trail.remove(), duration * 1000);
    }

    takeDamage() {
      this.health--;
      if (this.health <= 0) {
        this.destroy();
      }
    }

    destroy() {
      this.alive = false;
      this.crashing = true;
      this.crashVelX = this.speedX * 40;
      this.crashVelY = randomBetween(30, 80);
      this.crashAngle = 0;
      this.crashSpin = (this.facingLeft ? -1 : 1) * randomBetween(80, 150);
      this.smokeTimer = 0;
      this.el.style.opacity = '0.85';
    }

    spawnCrashSmoke() {
      const smoke = document.createElement('div');
      smoke.className = 'destroy-smoke';
      const size = randomBetween(8, 18);
      smoke.style.width = size + 'px';
      smoke.style.height = size + 'px';
      smoke.style.borderRadius = '50%';
      smoke.style.background = 'radial-gradient(circle, rgba(60,60,60,0.6), rgba(30,30,30,0.2))';
      smoke.style.left = (this.x + this.width / 2 + randomBetween(-10, 10)) + 'px';
      smoke.style.top = (this.y + this.height / 2 + randomBetween(-5, 5)) + 'px';
      sky.appendChild(smoke);
      setTimeout(() => smoke.remove(), 1000);
    }

    crashImpact() {
      this.crashing = false;
      for (let i = 0; i < 8; i++) {
        const debris = document.createElement('div');
        debris.className = 'destroy-smoke';
        const size = randomBetween(12, 30);
        debris.style.width = size + 'px';
        debris.style.height = size + 'px';
        debris.style.borderRadius = '50%';
        debris.style.background = i < 4
          ? 'radial-gradient(circle, rgba(255,160,30,0.7), rgba(255,80,10,0.3))'
          : 'radial-gradient(circle, rgba(80,80,80,0.6), rgba(40,40,40,0.2))';
        debris.style.left = (this.x + this.width / 2 + randomBetween(-30, 30)) + 'px';
        debris.style.top = (this.y + this.height / 2 + randomBetween(-15, 5)) + 'px';
        sky.appendChild(debris);
        setTimeout(() => debris.remove(), 1000);
      }
      spawnExplosion(this.x + this.width / 2, this.y + this.height / 2);
      this.el.style.transition = 'opacity 0.3s';
      this.el.style.opacity = '0';
      setTimeout(() => {
        this.el.remove();
        const idx = planes.indexOf(this);
        if (idx !== -1) planes.splice(idx, 1);
      }, 300);
    }

    updateDOM() {
      const rot = this.crashing ? this.crashAngle : 0;
      this.el.style.transform =
        `translate(${this.x}px, ${this.y}px) scaleX(${this.facingLeft ? 1 : -1}) rotate(${rot}deg)`;
    }
  }

  class Missile {
    constructor(x, y, angle, owner) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.speed = 350;
      this.owner = owner;
      this.alive = true;

      this.el = document.createElement('div');
      this.el.className = 'missile';
      this.el.style.transform = `rotate(${angle}rad)`;
      sky.appendChild(this.el);
      this.updateDOM();
    }

    update(dt) {
      if (!this.alive) return;

      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;

      const rect = sky.getBoundingClientRect();
      if (this.x < -10 || this.x > rect.width + 10 || this.y < -10 || this.y > rect.height + 10) {
        this.remove();
        return;
      }

      for (const plane of planes) {
        if (plane === this.owner || !plane.alive) continue;
        const px = plane.x + plane.width / 2;
        const py = plane.y + plane.height / 2;
        const dx = this.x - px;
        const dy = this.y - py;
        if (dx * dx + dy * dy < 900) {
          this.hit(plane);
          return;
        }
      }

      this.updateDOM();
    }

    hit(plane) {
      this.alive = false;
      this.el.remove();
      plane.takeDamage();
      spawnExplosion(this.x, this.y);
    }

    remove() {
      this.alive = false;
      this.el.remove();
    }

    updateDOM() {
      this.el.style.left = (this.x - 5) + 'px';
      this.el.style.top = (this.y - 2) + 'px';
    }
  }

  function spawnExplosion(x, y) {
    const exp = document.createElement('div');
    exp.className = 'explosion';
    exp.style.left = x + 'px';
    exp.style.top = y + 'px';
    sky.appendChild(exp);
    setTimeout(() => exp.remove(), 400);
  }

  function loop(timestamp) {
    if (!running) return;
    const time = timestamp / 1000;
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0.016;
    lastTime = timestamp;

    for (const plane of planes) {
      plane.update(dt, time);
    }

    for (let i = missiles.length - 1; i >= 0; i--) {
      missiles[i].update(dt);
      if (!missiles[i].alive) {
        missiles.splice(i, 1);
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function init() {
    sky.addEventListener('click', (e) => {
      const rect = sky.getBoundingClientRect();
      const x = e.clientX - rect.left - 60;
      const y = e.clientY - rect.top - 25;
      planes.push(new Plane(
        Math.max(0, Math.min(x, rect.width - 120)),
        Math.max(10, Math.min(y, rect.height - 70))
      ));
    });

    const rect = sky.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      const x = randomBetween(20, rect.width - 140);
      const y = randomBetween(30, rect.height - 100);
      planes.push(new Plane(x, y));
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

// Design Mocks view — hub redesign exploration (auth-gated).
// Static content module: renders the three homepage direction mockups,
// the gated-widget pattern demo, and the build plan.

var MocksApp = (function() {
  var rendered = false;

  var CONTENT = `
<div class="doc-head">
  <div class="eyebrow">the-fish-tank.com · design exploration · aug 2026</div>
  <p class="lede">Three directions for turning the homepage into a project hub, built in the site's own palette. Plus the gated-widget pattern for TankCore, a 2026 trend briefing, and a build plan mapped to the codebase.</p>
</div>

<section id="mx-brief">
  <h2>The brief, restated</h2>
  <p>Today an anonymous visitor lands on what is effectively a weather app: current-reading card, prediction cards, station compass — full width, full attention. The hub inverts that hierarchy. <strong>The homepage's job becomes "here's what gets built and run here, live"</strong> — weather demotes to one proof-of-life tile among several, Fathom Fall gets real shelf space instead of a dropdown entry, and TankCore joins as a teaser: visible enough to intrigue, blurred enough to make signing in mean something.</p>
  <p class="dim">The good news: the existing visual language — translucent blue cards on near-black navy, 1px borders, 12px radii, uppercase letterspaced labels — is genuinely close to what's current. This is a re-composition, not a re-skin.</p>
</section>

<section id="mx-trends">
  <h2>Trend briefing — what's real in 2026</h2>
  <p class="dim">Filtered for a no-build vanilla-JS site on GitHub Pages. Verdicts reflect mid-2026 "did it actually ship" retrospectives, not January's prediction posts.</p>
  <div class="trend-table">
    <div class="trend-row"><span class="chip use">Adopt</span><span><b>Bento grids.</b> The default structural pattern now (Apple, Vercel, Linear); one study measured ~23% more scroll depth vs. classic 12-col layouts. Asymmetric tile sizes = built-in hierarchy: perfect for "one hub, many unequal projects." Rules of thumb: max 2 hero tiles, 12–16px gaps, tile size reflects priority not content volume.</span></div>
    <div class="trend-row"><span class="chip use">Adopt</span><span><b>Token-based dark theme.</b> The 2026 consensus is that dark mode succeeds or fails on a named color-token system, not scattered literals. The site CSS has zero custom properties and the accent <code>rgba(100,160,220,…)</code> repeated ~40 times — the single highest-leverage fix and a prerequisite for everything else.</span></div>
    <div class="trend-row"><span class="chip use">Adopt</span><span><b>One-number tiles + sparklines.</b> Fintech dashboards (Stripe is everyone's reference) lead each card with a single headline figure, a delta, and an inline sparkline — never a wall of data. Exactly the shape for the TankCore and weather tiles.</span></div>
    <div class="trend-row"><span class="chip use">Adopt</span><span><b>Status-dot micro-signals.</b> Live status dots on tiles ("weather: live · updated 12m ago") signal that the hub is real infrastructure, not a static portfolio. The CSS already has <code>.status-dot</code> states.</span></div>
    <div class="trend-row"><span class="chip some">Sparingly</span><span><b>Glassmorphism.</b> Mid-year retrospectives flagged it as overpromised: <code>backdrop-filter: blur()</code> costs 15–30% FPS when used across whole layouts. But a single static frosted veil over one gated widget is the textbook <em>good</em> use — small area, no animation behind it, semantic purpose. Use it for the TankCore gate and nowhere else.</span></div>
    <div class="trend-row"><span class="chip some">Sparingly</span><span><b>Hover micro-interactions.</b> A 2px lift + border brighten on tiles, and that's it. Skeleton states with fixed min-heights matter more (tiles load async — reserving space protects layout stability).</span></div>
    <div class="trend-row"><span class="chip skip">Skip</span><span><b>3D / WebGL heroes.</b> 800KB–2MB of runtime before first paint; failed Core Web Vitals all year. Wrong for a static-hosted hub whose whole pitch is "fast and real."</span></div>
    <div class="trend-row"><span class="chip skip">Skip</span><span><b>Kinetic typography &amp; scroll-jacking.</b> Rarely shipped in production; fights screen readers and adds layout shift. The uppercase-letterspaced house style is quieter and better.</span></div>
  </div>
</section>

<section id="mx-direction-a">
  <h2>Direction A — Bento Hub</h2>
  <p>The recommended shape. A six-column bento grid: identity strip up top, one hero moment, then unequal tiles where size encodes what visitors should notice first. Weather keeps its data-density but inside a bounded tile; TankCore sits beside it at equal rank, gated. Hover the tiles — the lift/brighten is the whole micro-interaction budget.</p>

  <div class="frame">
    <div class="frame-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">the-fish-tank.com</span></div>
    <div class="frame-body">
      <div class="mk">
        <div class="mk-nav">
          <span>◉ The Fish Tank</span>
          <span class="burger">☰ Sign in</span>
        </div>
        <div class="bento">
          <div class="mk-card span4 rows2 mk-hero">
            <div class="mk-label">guppitus · builder of small reliable things</div>
            <div class="h">Games, weather models &amp; a trading engine — <b>running live</b> from a homelab and a VPS.</div>
            <div class="mx-sub" style="display:flex; gap:1rem; margin-top:0.6rem;">
              <span><span class="mx-dot g"></span> 4 services up</span>
              <span>uptime 99.2%</span>
              <span>last deploy 2h ago</span>
            </div>
          </div>
          <div class="mk-card span2 rows2" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div class="mk-label"><span class="mx-dot a"></span> Featured game</div>
              <div class="mk-title">Fathom Fall</div>
              <div class="mk-desc">Descend, fish, survive. A roguelite about going too deep.</div>
            </div>
            <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.6rem;">
              <span class="mx-tag">Play free</span><span class="mx-tag">v0.74</span>
            </div>
          </div>
          <div class="mk-card span3">
            <div class="mk-label"><span class="mx-dot g"></span> Potter weather · live</div>
            <div class="temp-pair">
              <div><div class="big">21.4<small>°C</small></div><div class="mx-sub">outdoor · now</div></div>
              <div><div class="big">23.1<small>°C</small></div><div class="mx-sub">indoor</div></div>
            </div>
            <svg class="spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0,22 L15,20 L30,21 L45,16 L60,14 L75,15 L90,10 L105,8 L120,9" fill="none" stroke="#4fc3f7" stroke-width="1.5"/>
              <circle cx="120" cy="9" r="2" fill="#4fc3f7"/>
            </svg>
            <div class="mx-sub">ML forecast +1h: 20.8° · 9 models · <span style="color:var(--mx-accent)">full dashboard →</span></div>
          </div>
          <div class="mk-card span3 mx-gated is-locked" id="gate-a">
            <div class="locked-content">
              <div class="mk-label"><span class="mx-dot m"></span> TankCore · paper trading</div>
              <div class="temp-pair">
                <div><div class="big">+2.4<small>%</small></div><div class="mx-sub">30-day P&amp;L</div></div>
                <div><div class="big">17</div><div class="mx-sub">signals today</div></div>
              </div>
              <svg class="spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0,18 L15,19 L30,14 L45,17 L60,12 L75,13 L90,7 L105,10 L120,6" fill="none" stroke="#3ddc97" stroke-width="1.5"/>
                <circle cx="120" cy="6" r="2" fill="#3ddc97"/>
              </svg>
              <div class="mx-sub">SPY · QQQ · momentum + mean-reversion</div>
            </div>
            <div class="gate-veil">
              <div class="lock">🔒</div>
              <div class="msg">Sign in for market predictions</div>
              <button class="gate-btn" type="button">Sign in</button>
            </div>
          </div>
          <div class="mk-card span2">
            <div class="mk-label">Homelab</div>
            <div class="mk-title" style="font-size:0.8rem;">Proxmox · Grafana</div>
            <div class="mk-desc">Ryzen 7 · 64GB · ZFS mirror. Metrics gated.</div>
          </div>
          <div class="mk-card span2">
            <div class="mk-label">Open source</div>
            <div class="mk-title" style="font-size:0.8rem;">github/GuppitusMaximus</div>
            <div class="mk-desc">fish-tank · showcase repos</div>
          </div>
          <div class="mk-card span2">
            <div class="mk-label">More games</div>
            <div class="mk-title" style="font-size:0.8rem;">Fish Games</div>
            <div class="mk-desc">Experiments &amp; prototypes shelf.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <p class="mock-caption">The TankCore tile demonstrates the gate: numbers blurred, veil message, market-green accent distinguishing it from the weather-blue. Toggle it below.</p>
  <button class="demo-toggle" type="button" data-gate="gate-a"><span class="mx-dot m"></span> Preview signed-in state</button>

  <div class="verdict">
    <div class="pro"><b>Why it works</b>Size = priority, legible in one screenful. Weather keeps prestige without dominating. Scales cleanly as projects are added — a new project is just a new tile. Closest to what visitors expect a 2026 "personal platform" to look like.</div>
    <div class="con"><b>Watch out</b>Bento is everywhere now; the identity has to come from the content (live data, ocean palette), not the grid itself. Needs skeleton min-heights per tile or async loads will cause layout shift.</div>
  </div>
</section>

<section id="mx-direction-b">
  <h2>Direction B — Mission Control</h2>
  <p>The counter-proposal: lean all the way into "this is real infrastructure." Monospace, dense rows, one line per system — like a <code>systemctl status</code> for your life. It's the anti-bento brutalist current that emerged this year as a differentiation play, and it's honest to the operator behind the site: a hub literally backed by cron jobs and LXCs.</p>

  <div class="frame">
    <div class="frame-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">the-fish-tank.com</span></div>
    <div class="frame-body">
      <div class="console">
        <div class="mk-nav" style="font-family:var(--mx-mono);">
          <span>THE FISH TANK — systems board</span>
          <span class="burger">☰ sign in</span>
        </div>
        <div class="console-head"><span>system</span><span>fri 2026-08-15 · 4/4 nominal</span></div>
        <div class="console-row">
          <span class="mx-dot g"></span>
          <span class="name">potter-weather</span>
          <span class="meta">ML pipeline · 9 models · cycle 45s · updated 12m ago</span>
          <span class="val">21.4°C ↗</span>
          <span class="act">open →</span>
        </div>
        <div class="console-row">
          <span class="mx-dot m"></span>
          <span class="name">tankcore</span>
          <span class="meta">market data + QTP processing · paper trading</span>
          <span class="val locked-val">••••••</span>
          <span class="act">🔒 sign in</span>
        </div>
        <div class="console-row">
          <span class="mx-dot g"></span>
          <span class="name">fathom-fall</span>
          <span class="meta">roguelite fishing · v0.74.0 · playable now</span>
          <span class="val">play ▸</span>
          <span class="act">free</span>
        </div>
        <div class="console-row">
          <span class="mx-dot g"></span>
          <span class="name">homelab</span>
          <span class="meta">proxmox · 6 guests · zfs mirror 2×12TB · grafana</span>
          <span class="val">99.2%</span>
          <span class="act">🔒 gated</span>
        </div>
        <div class="console-row" style="border-bottom:none;">
          <span class="mx-dot a"></span>
          <span class="name">fish-games</span>
          <span class="meta">prototype shelf · experiments</span>
          <span class="val">3 items</span>
          <span class="act">browse →</span>
        </div>
      </div>
    </div>
  </div>
  <p class="mock-caption">Locked rows print masked values (<code>••••••</code>) instead of a blur — the terminal-native version of the same gate.</p>

  <div class="verdict">
    <div class="pro"><b>Why it works</b>Massively distinctive — nobody will confuse this with a template. Cheap to build and extend (it's a list). Doubles as a genuine status page. Great resume artifact for platform/SRE-flavored roles.</div>
    <div class="con"><b>Watch out</b>Cold for the Fathom Fall audience — games deserve art, not a table row. Weak visual home for the compass widget. Harder to "flash up": austerity is the whole aesthetic.</div>
  </div>
</section>

<section id="mx-direction-c">
  <h2>Direction C — Editorial Portfolio</h2>
  <p>The showcase-first read: a big statement hero, then projects as numbered case-study cards with room to breathe. This direction treats the site primarily as a career artifact for humans deciding whether to interview — closer to the classic developer-portfolio canon than to a dashboard.</p>

  <div class="frame">
    <div class="frame-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">the-fish-tank.com</span></div>
    <div class="frame-body">
      <div class="edit">
        <div class="mk-nav">
          <span>◉ The Fish Tank</span>
          <span class="burger">☰ Sign in</span>
        </div>
        <div class="edit-hero">
          <div class="kicker">senior software engineer</div>
          <h4>I build <b>live systems</b> — games, ML pipelines, and a trading platform — and run them in production.</h4>
          <p>Everything below is deployed and real. The weather updates every 20 minutes; the games are playable; the metrics are measured.</p>
        </div>
        <div class="edit-list">
          <div class="mk-card edit-card">
            <div>
              <div class="num">CASE / WEATHER</div>
              <div class="mk-title">Potter Weather Predictions</div>
              <div class="mk-desc">Nine ML models forecasting a real backyard station · Postgres + R2 + Cloudflare Workers · 45-second training cycles.</div>
            </div>
            <div class="big" style="font-size:1.2rem;">21.4°<span class="mx-dot g" style="margin-left:0.5rem;"></span></div>
          </div>
          <div class="mk-card edit-card mx-gated is-locked" id="gate-c">
            <div class="locked-content" style="display:contents;">
              <div>
                <div class="num" style="color:var(--mx-market)">CASE / TRADING</div>
                <div class="mk-title">TankCore</div>
                <div class="mk-desc">Market-data ingestion and signal processing on homelab LXCs · Alpaca + Finnhub + FRED · TimescaleDB.</div>
              </div>
              <div class="big" style="font-size:1.2rem; color:var(--mx-market)">+2.4%</div>
            </div>
            <div class="gate-veil">
              <div class="msg">Sign in for market predictions</div>
              <button class="gate-btn" type="button">Sign in</button>
            </div>
          </div>
          <div class="mk-card edit-card">
            <div>
              <div class="num">CASE / GAMES</div>
              <div class="mk-title">Fathom Fall</div>
              <div class="mk-desc">A roguelite about descent, fishing, and knowing when to surface · vanilla JS, zero frameworks.</div>
            </div>
            <div class="mx-tag">Play</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <p class="mock-caption">Same gate pattern, editorial clothing — the veil sits over a case-study card instead of a data tile.</p>
  <button class="demo-toggle" type="button" data-gate="gate-c"><span class="mx-dot m"></span> Preview signed-in state</button>

  <div class="verdict">
    <div class="pro"><b>Why it works</b>Best storytelling per project; strongest for recruiters and the job search. Copy does real work ("everything below is deployed and real" is a killer claim that's actually true).</div>
    <div class="con"><b>Watch out</b>Least "hub"-like — live data becomes garnish instead of the main event. Weather compass has no obvious home. More copywriting burden per project.</div>
  </div>
</section>

<section id="mx-gate">
  <h2>The gate pattern, properly</h2>
  <p>The blurred-teaser is a well-established paywall pattern, and 2026 practice has firmed up its rules. Four things make or break it:</p>
  <ul class="notes">
    <li><strong>Blur + tint, not blur alone.</strong> <code>filter: blur(6–8px)</code> on the content, plus a semi-transparent navy veil (~35% opacity) over it. The tint keeps the CTA text readable at WCAG contrast regardless of what's behind it; pure blur doesn't.</li>
    <li><strong>Blur decoy data, never real data.</strong> CSS blur is cosmetic — real numbers in the DOM are one devtools-inspect away, and gating is client-side class toggling. The signed-out tile should render <em>plausible sample data</em> (or an already-public aggregate), served from the public endpoint. Real predictions arrive only via the authenticated fetch after sign-in. The blur then isn't security theater — it's honest staging.</li>
    <li><strong>Show the shape of the value.</strong> The teaser works because the visitor can see there IS a sparkline, a P&amp;L figure, a signal count — just not the values. A fully opaque "sign in" box converts worse than a ghost of the real thing. Disable <code>user-select</code> and <code>pointer-events</code> on the blurred layer.</li>
    <li><strong>One glass surface per page.</strong> Keep <code>backdrop-filter</code> out of it entirely (the veil is a simple rgba fill — cheaper and identical-looking over a blurred child). The gate stays performant even on the phones where glassmorphism tanked this year.</li>
  </ul>
  <p class="dim">Wiring into the existing auth: the veil is effectively <code>.auth-public-only</code>, the live-data renderer is <code>.auth-gated</code> — the existing <code>onSignedIn()/onSignedOut()</code> class sweep in <code>auth.js</code> handles both with zero new JS, plus one hook to trigger the authenticated TankCore fetch on sign-in.</p>
</section>

<section id="mx-recommendation">
  <h2>Recommendation</h2>
  <div class="mx-table-scroll"><table class="compare">
    <tr><th>Direction</th><th>Identity</th><th>Effort</th><th>Best for</th></tr>
    <tr class="pick"><td>A · Bento Hub</td><td>Current, data-forward, unmistakably "a platform"</td><td>Medium — grid + tile components + token layer</td><td>The stated goal: hub of projects with live widgets</td></tr>
    <tr><td>B · Mission Control</td><td>Distinctive, austere, ops-native</td><td>Low — it's a styled list</td><td>Differentiation; status-page truth</td></tr>
    <tr><td>C · Editorial</td><td>Warm, narrative, career-facing</td><td>Medium — mostly copywriting</td><td>Recruiters reading case studies</td></tr>
  </table></div>
  <p><strong>Go with A, and steal from B and C:</strong> the bento grid as the skeleton, Mission Control's status dots and "4 services up · last deploy 2h" strip inside the hero tile (the flashiest thing on the page precisely because it's true), and the Editorial direction's one-line project descriptions inside each tile. The compass keeps a home as an expandable tile or moves to the weather dashboard page.</p>

  <h3>Build order</h3>
  <div class="mx-steps">
    <div class="mx-step"><div><b>Token layer first.</b> Add a <code>:root</code> block to <code>style.css</code> with the palette above (native CSS custom properties — no build step needed on Pages) and sweep the ~40 hardcoded <code>rgba(100,160,220,…)</code> literals onto it.<div class="why">Prerequisite for everything; zero visual change; safe first commit.</div></div></div>
    <div class="mx-step"><div><b>Extract home rendering out of <code>weather.js</code>.</b> New <code>js/hub.js</code> owns <code>#home</code>; weather.js keeps the authed dashboard. Home DOM today is two empty divs filled by <code>renderHomeSummary()</code> — move that call behind a hub-owned "weather tile" renderer.<div class="why">weather.js is ~2,850 lines and shouldn't also own the homepage's future.</div></div></div>
    <div class="mx-step"><div><b>Static bento skeleton in <code>index.html</code></b> with min-height skeleton tiles (prevents layout shift), the hero/identity tile, and Fathom Fall promoted from dropdown to tile.<div class="why">Real markup instead of injected — simpler, faster first paint, indexable.</div></div></div>
    <div class="mx-step"><div><b>Weather tile + compass demotion.</b> Current temps + sparkline + "full dashboard →" link in a 3-col tile; compass becomes a toggle-open tile or dashboard-only.<div class="why">Keeps the beloved data; removes its monopoly on the page.</div></div></div>
    <div class="mx-step"><div><b>TankCore gated tile.</b> Decoy-data renderer + veil (<code>.auth-public-only</code>), authed renderer (<code>.auth-gated</code>), served by a new public endpoint on the auth Worker later — the tile can ship with static sample data before the backend exists.<div class="why">The gate pattern above; front-end can land independent of TankCore's API.</div></div></div>
    <div class="mx-step"><div><b>Responsive pass.</b> Bento collapses 6-col → 2-col → 1-col; today's single 600px breakpoint grows to two. Mind the <code>body { overflow: hidden }</code> + per-view scroll container — sticky elements must anchor to <code>#home</code>, not the window.<div class="why">The scroll-container gotcha; easy to trip on.</div></div></div>
  </div>
</section>

<section id="mx-sources">
  <h2>Sources</h2>
  <ul class="sources-list">
    <li><a href="https://studiomeyer.io/en/blog/webdesign-trends-2026-reality-check" target="_blank" rel="noopener">Web Design Trends 2026: What Actually Held Up After Six Months — Studio Meyer</a></li>
    <li><a href="https://www.orbix.studio/blogs/bento-grid-dashboard-design-aesthetics" target="_blank" rel="noopener">Bento Grid Dashboard Design: Complete Guide 2026 — Orbix</a></li>
    <li><a href="https://www.theedigital.com/blog/web-design-trends" target="_blank" rel="noopener">20 Top Web Design Trends 2026 — TheeDigital</a></li>
    <li><a href="https://www.wearetenet.com/blog/ui-ux-design-trends" target="_blank" rel="noopener">15 Important UI/UX Design Trends of 2026 — Tenet</a></li>
    <li><a href="https://uxpilot.ai/blogs/glassmorphism-ui" target="_blank" rel="noopener">Glassmorphism UI Features, Best Practices, and Examples — UX Pilot</a></li>
    <li><a href="https://www.frontendhero.dev/tutorial/blurred-paywall-area/" target="_blank" rel="noopener">Create a Blurred Paywall Area — Frontend Hero</a></li>
    <li><a href="https://ui-patterns.com/patterns/Paywall" target="_blank" rel="noopener">Paywall design pattern — UI Patterns</a></li>
    <li><a href="https://www.themasterly.com/blog/fintech-dashboard-design-guide" target="_blank" rel="noopener">Fintech Dashboard Design: Patterns &amp; Real Examples (2026) — Masterly</a></li>
    <li><a href="https://www.925studios.co/blog/saas-dashboard-design-examples-2026" target="_blank" rel="noopener">35 SaaS Dashboard Design Examples, Trends and Patterns — 925 Studios</a></li>
    <li><a href="https://elements.envato.com/learn/portfolio-trends" target="_blank" rel="noopener">Portfolio design trends for 2026 — Envato</a></li>
  </ul>
</section>
`;

  function setToggleLabel(btn, locked) {
    btn.innerHTML = '<span class="mx-dot m"></span> ' +
      (locked ? 'Preview signed-in state' : 'Restore signed-out state');
  }

  function wireHandlers(container) {
    container.addEventListener('click', function(e) {
      var toggle = e.target.closest('.demo-toggle');
      if (toggle) {
        var gate = document.getElementById(toggle.dataset.gate);
        if (gate) setToggleLabel(toggle, gate.classList.toggle('is-locked'));
        return;
      }
      var gateBtn = e.target.closest('.gate-btn');
      if (gateBtn) {
        var gated = gateBtn.closest('.mx-gated');
        if (!gated) return;
        gated.classList.remove('is-locked');
        var linked = container.querySelector('.demo-toggle[data-gate="' + gated.id + '"]');
        if (linked) setToggleLabel(linked, false);
      }
    });
  }

  function start() {
    if (!FishTankAuth.isAuthenticated()) {
      window.location.hash = '';
      return;
    }
    if (rendered) return;
    var container = document.getElementById('mocks');
    container.innerHTML = CONTENT;
    wireHandlers(container);
    rendered = true;
  }

  function stop() {}

  return { start: start, stop: stop };
})();

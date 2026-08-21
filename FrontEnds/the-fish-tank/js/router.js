// View router and navigation. Extracted from an inline <script> in index.html
// so the CSP can drop 'unsafe-inline' from script-src — inline script is the
// payload almost every XSS needs, and allowing it defeats most of the policy.

(() => {
    const views = {
        home: {
            el: document.getElementById('home'),
            app: null,
            title: 'The Fish Tank',
            hint: '',
            theme: 'theme-ocean'
        },
        weather: {
            el: document.getElementById('weather'),
            app: window.WeatherApp,
            title: 'Potter Weather Predictions',
            hint: '',
            theme: 'theme-ocean'
        },
        fishtank: {
            el: document.getElementById('tank'),
            app: window.FishTankApp,
            title: 'The Fish Tank',
            hint: 'Click to add a fish',
            theme: 'theme-ocean'
        },
        battle: {
            el: document.getElementById('arena'),
            app: window.BattleApp,
            title: 'The Tank Battle',
            hint: 'Click to deploy a tank',
            theme: 'theme-battle'
        },
        fighter: {
            el: document.getElementById('sky'),
            app: window.FighterApp,
            title: 'Fighter Fish',
            hint: 'Click to scramble a fighter',
            theme: 'theme-sky'
        },
        fathomfall: {
            el: document.getElementById('fathomfall'),
            app: window.FathomFallAdmin,
            title: 'Fathom Fall — Admin',
            hint: '',
            theme: 'theme-ocean'
        },
        mocks: {
            el: document.getElementById('mocks'),
            app: window.MocksApp,
            title: 'Hub Redesign Mocks',
            hint: '',
            theme: 'theme-ocean'
        },
    };

    const h1 = document.getElementById('page-title');
    const hint = document.getElementById('hint');
    const navLinks = document.querySelectorAll('nav a[data-view]');
    let current = null;

    function switchView(name) {
        if (current === name) return;

        if (!current) {
            Object.keys(views).forEach(function(k) {
                views[k].el.classList.remove('active');
            });
        }

        if (current) {
            views[current].el.classList.remove('active');
            if (views[current].app) views[current].app.stop();
        }

        const view = views[name];
        document.body.className = view.theme;
        view.el.classList.add('active');
        document.title = view.title;
        hint.textContent = view.hint;
        if (view.app) view.app.start();

        const gameViews = ['fishtank', 'battle', 'fighter'];
        navLinks.forEach(a => {
            a.classList.toggle('active', a.dataset.view === name);
        });
        const dropdownToggle = document.querySelector('.nav-dropdown-toggle');
        if (dropdownToggle) {
            dropdownToggle.classList.toggle('active', gameViews.includes(name));
        }

        var menu = document.querySelector('.nav-dropdown-menu');
        if (menu) menu.classList.remove('open');

        current = name;
        if (name === 'home') {
            history.replaceState(null, '', location.pathname);
            if (window.WeatherApp && window.WeatherApp.loadHomeSummary) {
                window.WeatherApp.loadHomeSummary();
            }
            if (window.WeatherApp && window.WeatherApp.loadCompassData) {
                window.WeatherApp.loadCompassData();
            }
        } else {
            history.replaceState(null, '', '#' + name);
        }
    }

    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.nav-dropdown-toggle');
        const menu = document.querySelector('.nav-dropdown-menu');
        const acctToggle = e.target.closest('.account-toggle');
        const acctMenu = document.querySelector('.account-menu');

        if (acctToggle) {
            e.preventDefault();
            acctMenu.classList.toggle('open');
            if (menu) menu.classList.remove('open');
            return;
        }
        if (toggle) {
            e.preventDefault();
            menu.classList.toggle('open');
            if (acctMenu) acctMenu.classList.remove('open');
            return;
        }
        if (e.target.closest('.hub-gate-btn')) {
            e.preventDefault();
            FishTankAuth.openSignInModal();
            return;
        }
        const link = e.target.closest('[data-view]');
        if (link) {
            e.preventDefault();
            if (menu) menu.classList.remove('open');
            if (acctMenu) acctMenu.classList.remove('open');
            switchView(link.dataset.view);
            return;
        }
        if (menu && !e.target.closest('.nav-dropdown')) {
            menu.classList.remove('open');
        }
        if (acctMenu && !e.target.closest('.account-dropdown')) {
            acctMenu.classList.remove('open');
        }
    });

    var initialView = 'home';
    var hash = location.hash.replace('#', '');
    if (hash && views[hash]) {
        initialView = hash;
    } else if (hash.startsWith('weather/')) {
        initialView = 'weather';
    }
    switchView(initialView);

    if (initialView === 'home' && window.WeatherApp && window.WeatherApp.loadHomeSummary) {
        window.WeatherApp.loadHomeSummary();
    }
    if (initialView === 'home' && window.WeatherApp && window.WeatherApp.loadCompassData) {
        window.WeatherApp.loadCompassData();
    }

    window.addEventListener('hashchange', function() {
        var hash = location.hash.replace('#', '');
        if (hash && views[hash]) {
            switchView(hash);
        } else if (hash.startsWith('weather/')) {
            switchView('weather');
        } else if (!hash) {
            switchView('home');
        }
    });
})();

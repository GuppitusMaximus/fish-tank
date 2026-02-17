// Authentication module for FishTank.
// Handles sign-in/out, JWT session management, and content gating.
// See Planning/docs/schemas/website-auth-api.md for the API contract.

var FishTankAuth = (function() {
  var TOKEN_KEY = 'fishtank_auth_token';
  var SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function isTokenExpired(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.exp && payload.exp < Math.floor(Date.now() / 1000);
    } catch (e) {
      return true;
    }
  }

  function isAuthenticated() {
    var token = getToken();
    if (!token) return false;
    if (isTokenExpired(token)) {
      clearToken();
      return false;
    }
    return true;
  }

  function authHeaders() {
    var token = getToken();
    if (!token) return {};
    return { 'Authorization': 'Bearer ' + token };
  }

  async function signIn(username, password) {
    var resp = await fetch(AUTH_API_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    var data = await resp.json();
    if (data.success && data.token) {
      setToken(data.token);
      onSignedIn();
      return { success: true };
    }
    return { success: false, error: data.error || 'Sign-in failed' };
  }

  async function signOut() {
    // Tell Worker (best-effort)
    if (AUTH_API_URL) {
      fetch(AUTH_API_URL + '/auth/logout', {
        method: 'POST',
        headers: authHeaders()
      }).catch(function() {});
    }

    clearToken();
    clearCachedData();
    onSignedOut();
  }

  function clearCachedData() {
    // Weather cache uses localStorage with embedded _cachedAt in JSON
    localStorage.removeItem('fishtank_weather_data');
    // Database cache uses IndexedDB (not localStorage)
    try { indexedDB.deleteDatabase('fishtank_db'); } catch (e) {}
  }

  function onSignedIn() {
    // Show gated content, hide public-only content
    document.querySelectorAll('.auth-gated').forEach(function(el) {
      el.classList.remove('auth-hidden');
    });
    document.querySelectorAll('.auth-public-only').forEach(function(el) {
      el.classList.add('auth-hidden');
    });

    // Play success animation on modal
    var modal = document.getElementById('signin-modal');
    if (modal) {
      modal.classList.add('auth-success');
      setTimeout(function() {
        modal.classList.remove('active');
        modal.classList.remove('auth-success');
      }, 1500);
    }
  }

  function onSignedOut() {
    // Hide gated content, show public-only content
    document.querySelectorAll('.auth-gated').forEach(function(el) {
      el.classList.add('auth-hidden');
    });
    document.querySelectorAll('.auth-public-only').forEach(function(el) {
      el.classList.remove('auth-hidden');
    });

    // If on a gated view, navigate to home
    if (window.location.hash === '#weather') {
      window.location.hash = '';
    }
  }

  function initAuthState() {
    if (isAuthenticated()) {
      onSignedIn();
    } else {
      onSignedOut();
    }
  }

  function openSignInModal() {
    var modal = document.getElementById('signin-modal');
    if (modal) modal.classList.add('active');
  }

  function closeSignInModal() {
    var modal = document.getElementById('signin-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.classList.remove('auth-error');
    }
  }

  function bindEvents() {
    // Sign-in form submit
    var form = document.getElementById('signin-form');
    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var username = document.getElementById('signin-username').value;
        var password = document.getElementById('signin-password').value;
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;

        var result = await signIn(username, password);
        btn.disabled = false;

        if (!result.success) {
          var modal = document.getElementById('signin-modal');
          if (modal) modal.classList.add('auth-error');
          setTimeout(function() {
            if (modal) modal.classList.remove('auth-error');
          }, 600);
        }
      });
    }

    // Open modal
    var openBtn = document.getElementById('signin-link');
    if (openBtn) {
      openBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openSignInModal();
      });
    }

    // Close modal
    var closeBtn = document.getElementById('signin-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSignInModal);
    }

    // Close on overlay click
    var modal = document.getElementById('signin-modal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeSignInModal();
      });
    }

    // Sign-out
    var signoutBtn = document.getElementById('signout-link');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        signOut();
      });
    }
  }

  return {
    isAuthenticated: isAuthenticated,
    authHeaders: authHeaders,
    signIn: signIn,
    signOut: signOut,
    initAuthState: initAuthState,
    bindEvents: bindEvents,
    openSignInModal: openSignInModal,
    closeSignInModal: closeSignInModal
  };
})();

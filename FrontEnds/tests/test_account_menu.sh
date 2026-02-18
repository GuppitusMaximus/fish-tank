#!/usr/bin/env bash
# QA: Account hamburger menu — verify sign-in/sign-out moved from nav to account dropdown
# Plan: qa-account-hamburger-menu

set -e
PASS=0
FAIL=0

HTML="the-fish-tank/index.html"
AUTH_CSS="the-fish-tank/css/auth.css"
STYLE_CSS="the-fish-tank/css/style.css"

ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

cd "$(dirname "$0")/.."

# --- Step 1: index.html checks ---

# No signin-link/signout-link inside <nav>
NAV_BLOCK=$(awk '/<nav>/,/<\/nav>/' "$HTML")
if echo "$NAV_BLOCK" | grep -q 'signin-link\|signout-link'; then
  fail "Auth links found inside <nav>"
else
  ok "No auth links inside <nav>"
fi

# .account-dropdown exists inside <header>
HEADER_BLOCK=$(awk '/<header>/,/<\/header>/' "$HTML")
if echo "$HEADER_BLOCK" | grep -q 'class="account-dropdown"'; then
  ok ".account-dropdown found inside <header>"
else
  fail ".account-dropdown not found inside <header>"
fi

# .account-toggle exists in header
if echo "$HEADER_BLOCK" | grep -q 'class="account-toggle"'; then
  ok ".account-toggle found inside <header>"
else
  fail ".account-toggle not found inside <header>"
fi

# .account-menu exists in header
if echo "$HEADER_BLOCK" | grep -q 'class="account-menu"'; then
  ok ".account-menu found inside <header>"
else
  fail ".account-menu not found inside <header>"
fi

# #signin-link has class auth-public-only
if echo "$HEADER_BLOCK" | grep -q 'id="signin-link".*auth-public-only\|auth-public-only.*id="signin-link"'; then
  ok "#signin-link has auth-public-only class"
else
  fail "#signin-link missing auth-public-only class"
fi

# #signout-link has classes auth-gated auth-hidden
if echo "$HEADER_BLOCK" | grep -q 'id="signout-link".*auth-gated.*auth-hidden'; then
  ok "#signout-link has auth-gated auth-hidden classes"
else
  fail "#signout-link missing auth-gated auth-hidden classes"
fi

# Click handler has .account-toggle reference
if grep -q 'account-toggle' "$HTML"; then
  ok "Click handler references .account-toggle"
else
  fail "Click handler missing .account-toggle reference"
fi

# Both menus close when the other opens
if grep -q 'acctMenu.*classList.*remove.*open\|acctMenu.classList.remove' "$HTML"; then
  ok "Nav dropdown closes account menu on open"
else
  fail "Nav dropdown does not close account menu"
fi

# --- Step 2: auth.css checks ---

# .account-dropdown has position: absolute
if grep -A5 '\.account-dropdown' "$AUTH_CSS" | grep -q 'position: absolute'; then
  ok ".account-dropdown has position: absolute"
else
  fail ".account-dropdown missing position: absolute"
fi

# .account-dropdown has right: 1rem
if grep -A5 '\.account-dropdown' "$AUTH_CSS" | grep -q 'right: 1rem'; then
  ok ".account-dropdown has right: 1rem"
else
  fail ".account-dropdown missing right: 1rem"
fi

# .account-toggle has no background or border (background: none; border: none)
if grep -A5 '\.account-toggle {' "$AUTH_CSS" | grep -q 'background: none'; then
  ok ".account-toggle has background: none"
else
  fail ".account-toggle missing background: none"
fi

if grep -A5 '\.account-toggle {' "$AUTH_CSS" | grep -q 'border: none'; then
  ok ".account-toggle has border: none"
else
  fail ".account-toggle missing border: none"
fi

# .account-menu has dark background + border + border-radius
if grep -A10 '\.account-menu {' "$AUTH_CSS" | grep -q 'background:'; then
  ok ".account-menu has background style"
else
  fail ".account-menu missing background style"
fi

if grep -A10 '\.account-menu {' "$AUTH_CSS" | grep -q 'border:'; then
  ok ".account-menu has border style"
else
  fail ".account-menu missing border style"
fi

if grep -A10 '\.account-menu {' "$AUTH_CSS" | grep -q 'border-radius:'; then
  ok ".account-menu has border-radius"
else
  fail ".account-menu missing border-radius"
fi

# .account-menu.open shows with flexbox column
if grep -A5 '\.account-menu\.open' "$AUTH_CSS" | grep -q 'display: flex'; then
  ok ".account-menu.open uses display: flex"
else
  fail ".account-menu.open missing display: flex"
fi

if grep -A5 '\.account-menu\.open' "$AUTH_CSS" | grep -q 'flex-direction: column'; then
  ok ".account-menu.open uses flex-direction: column"
else
  fail ".account-menu.open missing flex-direction: column"
fi

# --- Step 3: style.css checks ---

# header has position: relative
if grep -A10 '^header {' "$STYLE_CSS" | grep -q 'position: relative'; then
  ok "header has position: relative in style.css"
else
  fail "header missing position: relative in style.css"
fi

# --- Summary ---
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && exit 0 || exit 1

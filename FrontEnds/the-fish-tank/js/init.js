// Bootstrap, extracted from the trailing inline <script> in index.html.
// Must load LAST: it calls into the modules every other script defines.

FishTankAuth.initAuthState();
FishTankAuth.bindEvents();
if (window.HomelabApp) HomelabApp.load();
if (window.TankCoreApp) TankCoreApp.load();

# VPS Deployment Guide

## Overview

The snake-tank services (ML pipeline + PvP ghost service) run on a Hetzner VPS as systemd units. A GitHub Actions workflow auto-deploys on push to `main` when files under `BackEnds/the-snake-tank/` change.

## Services

| Service | Unit | App |
|---|---|---|
| ML pipeline | `fishtank-ml.service` | `app_ml.py` |
| PvP ghost | `fishtank-pvp.service` | `app_pvp.py` |

## Initial VPS Setup

### 1. Clone the repo

```bash
sudo mkdir -p /opt/fishtank
sudo chown fishtank:fishtank /opt/fishtank
git clone https://github.com/GuppitusMaximus/fish-tank.git /opt/fishtank
```

### 2. Install Python dependencies

```bash
cd /opt/fishtank/BackEnds/the-snake-tank
pip install --require-hashes -r requirements.txt
```

### 3. Run migrations

```bash
python migrate.py
```

### 3a. Configure the public weather reference point

`weather-public.json` is unauthenticated and world-readable. Its `public_stations` block
publishes a bearing and distance for each of the ~20 nearest Netatmo stations.

Those stations are themselves listed on Netatmo's **public** weathermap, so bearing and
distance measured from the house form a solvable constraint set — enough to trilaterate the
address. Rounding does not fix this; only moving the origin does. Geometry is therefore
measured from a published landmark, and the station *selection* uses that same origin, since
"the 20 nearest stations to my house" fingerprints the house by itself.

Set these in `/opt/fishtank/BackEnds/the-snake-tank/.env`:

```
WEATHER_REF_LAT=<latitude of a published landmark near the station cluster>
WEATHER_REF_LON=<longitude of that landmark>
WEATHER_REF_LABEL=<human-readable name, e.g. a town — surfaced in the UI>
```

Pick somewhere genuinely public — a town centre works well — and far enough from the house
that the solved origin is the landmark rather than the property.

**Never commit the actual values,** including in this file. They belong only in the VPS `.env`.

If `WEATHER_REF_LAT` or `WEATHER_REF_LON` is unset or unparseable, the export **omits the
`public_stations` block entirely** rather than falling back to home coordinates. That is
deliberate: a missing compass is a visible bug, whereas a silent fallback would republish the
address. Moving the reference point later needs no code change — edit `.env` and the next
pipeline run (every 20 min) picks it up.

### 4. Install systemd units

```bash
sudo cp systemd/fishtank-ml.service /etc/systemd/system/
sudo cp systemd/fishtank-pvp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fishtank-ml fishtank-pvp
sudo systemctl start fishtank-ml fishtank-pvp
```

### 5. Configure passwordless sudo for service restarts

Create `/etc/sudoers.d/fishtank-deploy`:

```
fishtank ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart fishtank-ml, /usr/bin/systemctl restart fishtank-pvp, /usr/bin/systemctl restart fishtank-ml fishtank-pvp
```

Install it:

```bash
sudo visudo -f /etc/sudoers.d/fishtank-deploy
# paste the line above, save
sudo chmod 0440 /etc/sudoers.d/fishtank-deploy
```

## CI/CD Setup

### GitHub Secrets

Add these secrets in the repo settings (Settings > Secrets and variables > Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | Hetzner VPS IP address or hostname |
| `VPS_SSH_KEY` | Private SSH key for the `fishtank` user |

### Install the workflow

Copy the workflow file to the repo root:

```bash
cp BackEnds/the-snake-tank/ci/deploy-vps.yml .github/workflows/deploy-vps.yml
git add .github/workflows/deploy-vps.yml
git commit -m "Add VPS deploy workflow"
git push
```

### What the workflow does

On every push to `main` that touches `BackEnds/the-snake-tank/**`:

1. SSH into the VPS as `fishtank`
2. `git pull origin main`
3. `pip install --require-hashes -r requirements.txt`
4. `python migrate.py`
5. `sudo systemctl restart fishtank-ml fishtank-pvp`

## Manual Deployment

If you need to deploy manually:

```bash
ssh fishtank@<VPS_HOST>
cd /opt/fishtank
git pull origin main
cd BackEnds/the-snake-tank
pip install --require-hashes -r requirements.txt
python migrate.py
sudo systemctl restart fishtank-ml fishtank-pvp
```

## Upgrading dependencies

`requirements.txt` is a generated lockfile: every package is pinned `==` with sha256 hashes, transitive ones included. **Never hand-edit it.** Direct dependencies live in `requirements.in`, and the lock is compiled from that.

To upgrade or add a dependency:

1. Edit `requirements.in` — change the `==` pin, or add the package.
2. Re-compile the lock on **linux/x86_64 with Python 3.12**, so the resolved wheels match prod (Ubuntu 24.04, Python 3.12.3):

   ```bash
   cd BackEnds/the-snake-tank
   uv pip compile requirements.in --generate-hashes --python-version 3.12 -o requirements.txt
   ```

   Install `uv` into a throwaway venv, never into the repo. If you have to compile on a different platform, add `--universal`.
3. Commit **both** files together. Editing `requirements.in` alone changes nothing — the deploy installs from `requirements.txt`.

> **Before bumping `scikit-learn` or `lightgbm` across a major version:** `predict.py` `joblib.load`s five `.joblib` models that exist only on the VPS and that nothing regenerates. The deploy restarts the services in the same run that installs the new versions, so a major bump loads those pickles under a library that may not read them. Stage that change; do not ship it as a routine pin bump.

## If `pip install` fails during deploy

The deploy script runs under `set -e` in the order `git pull` → `pip install` → `migrate.py` → `systemctl restart`. A lock that fails to install therefore aborts **after** the checkout has already been updated: the working tree on the VPS is new, but the running services still hold the old code in memory.

That is a working-but-inconsistent state, not an outage. Keep it that way:

1. **Do not restart the services to "clear it."** A restart loads the new tree against the old dependency set, which converts a recoverable state into a real one.
2. Fix the cause — usually a `requirements.txt` missing hashes, or out of sync with `requirements.in`. Re-compile it (see *Upgrading dependencies* above) or revert it to the last known-good commit.
3. Re-run the deploy and let it finish. The services restart on their own once `pip install` succeeds.

`--require-hashes` is what makes this fail closed: if someone regenerates or hand-edits `requirements.txt` and strips the hashes out, an unflagged `pip install` would install it anyway. With the flag, the deploy stops here instead.

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
pip install -r requirements.txt
```

### 3. Run migrations

```bash
python migrate.py
```

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
3. `pip install -r requirements.txt`
4. `python migrate.py`
5. `sudo systemctl restart fishtank-ml fishtank-pvp`

## Manual Deployment

If you need to deploy manually:

```bash
ssh fishtank@<VPS_HOST>
cd /opt/fishtank
git pull origin main
cd BackEnds/the-snake-tank
pip install -r requirements.txt
python migrate.py
sudo systemctl restart fishtank-ml fishtank-pvp
```

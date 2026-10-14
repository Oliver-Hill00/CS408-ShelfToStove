# CS408 ShelfToStove

Shelf-To-Stove is a recipe manager with pantry-based search: store recipes, track your pantry, and find what you can cook with what you already have. Currently a placeholder landing page (Checkpoint 1), deployable to EC2.

## Prerequisites (install these first)

- Node.js 18 or newer (includes npm) — https://nodejs.org
- ssh, tar and curl (only needed to deploy; Git Bash on Windows includes them, and rsync is used if present)

## Run locally

```bash
./start.sh
```

Then open http://localhost:3000.

## Install on EC2 (Ubuntu, us-west-2)

On a fresh Ubuntu instance (security group must allow inbound HTTP on port 80):

```bash
git clone https://github.com/Oliver-Hill00/CS408-ShelfToStove.git
cd CS408-ShelfToStove
sudo ./install.sh
```

This installs Node.js and nginx, starts the app as a service, and prints the public URL.

## Deploy updates from your laptop

Alternative one-time server setup (without cloning on the server):

```bash
scp -i ~/keys/mykey.pem -r deploy ubuntu@<PUBLIC-IP>:~
ssh -i ~/keys/mykey.pem ubuntu@<PUBLIC-IP>
sudo bash deploy/setup-ec2.sh
```

Every deploy, from your laptop:

```bash
./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem
```

## Files

| File | Purpose |
|---|---|
| `install.sh` | Full install on a fresh EC2 server: setup, copy code, install deps, start, health check |
| `start.sh` | Checks Node, installs dependencies, starts the app |
| `deploy/setup-ec2.sh` | Installs Node 22 + nginx, configures port 80 → 3000, installs the service |
| `deploy/shelftostove.service` | systemd unit: starts on boot, restarts on crash |
| `deploy/nginx-shelftostove.conf` | nginx reverse proxy config |
| `deploy/deploy.sh` | Runs tests, rsyncs code, restarts service, checks `/api/health` |

# CS408 ShelfToStove

Hello World landing page for the CS408 ShelfToStove project, deployable to EC2.

## Prerequisites (install these first)

- Node.js 18 or newer (includes npm) — https://nodejs.org
- ssh, tar and curl (only needed to deploy; Git Bash on Windows includes them, and rsync is used if present)

## Run locally

```bash
./start.sh
```

Then open http://localhost:3000.

## Deploy to EC2 (Ubuntu, us-west-2)

One-time server setup:

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
| `start.sh` | Checks Node, installs dependencies, starts the app |
| `deploy/setup-ec2.sh` | Installs Node 22 + nginx, configures port 80 → 3000, installs the service |
| `deploy/shelftostove.service` | systemd unit: starts on boot, restarts on crash |
| `deploy/nginx-shelftostove.conf` | nginx reverse proxy config |
| `deploy/deploy.sh` | Runs tests, rsyncs code, restarts service, checks `/api/health` |

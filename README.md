# CS408 ShelfToStove

Shelf-To-Stove is a recipe manager with pantry-based search: store recipes, track your pantry, and find what you can cook with what you already have. Express + SQLite on AWS EC2 behind Nginx.

## Prerequisites (install these first)

- Node.js 20 or newer (includes npm); the server uses Node 24. https://nodejs.org
- ssh, git and curl, only needed to deploy (Git Bash on Windows includes them)

## Run locally

```bash
./start.sh
```

This installs dependencies, creates the SQLite database in `data/`, seeds it, and starts the app at http://localhost:3000.

| Command | What it does |
|---|---|
| `npm run db:init` | Creates any missing tables from `db/schema.sql` (keeps data) |
| `npm run db:seed` | Loads 15 recipes and 60 ingredients; skipped if recipes already exist |
| `npm run db:seed -- --force` | Deletes existing data and reseeds |
| `npm run db:reset` | Drops every table, recreates, and reseeds |
| `npm test` | Runs the tests (uses an in-memory database) |

## Install on EC2

1. Launch an instance: Ubuntu Server 24.04 LTS, t3.micro, 8 GB storage, with your key pair.
2. Security group: SSH (22) from your IP only, HTTP (80) from `0.0.0.0/0`. Do not open port 3000.
3. Connect: `ssh -i ~/keys/Login.pem ubuntu@<public-ip>`
4. Download and run the install script (packages, Node.js 24, app code in `/opt/shelftostove`):
   ```bash
   curl -O https://raw.githubusercontent.com/Oliver-Hill00/CS408-ShelfToStove/main/scripts/install.sh
   chmod +x install.sh && ./install.sh
   ```
5. Run the configure script (`.env`, database, systemd service, Nginx):
   ```bash
   cd /opt/shelftostove && ./scripts/configure.sh
   ```
6. Open `http://<public-ip>` in a browser.
7. Verify run-on-boot: `sudo reboot`, wait a minute, and reload the page.
8. Check the seeded data: `sqlite3 /opt/shelftostove/data/shelftostove.db "SELECT COUNT(*) FROM recipes;"`

Both scripts are safe to run again. The public IP changes if the instance is stopped and started, so use the one shown in the EC2 console.

## Deploy updates

From your laptop, after `git push`:

```bash
./deploy/deploy.sh -h <public-ip> -i ~/keys/Login.pem
```

Or on the server: `cd /opt/shelftostove && git pull && npm ci --omit=dev && npm run db:init && sudo systemctl restart shelftostove`

Troubleshooting: `sudo systemctl status shelftostove` and `journalctl -u shelftostove -n 50`

## Files

| File | Purpose |
|---|---|
| `server.js` | Express app entry point |
| `db/schema.sql` | 7 tables: units, categories, recipes, ingredients, recipe_ingredients, pantry_items, shopping_list_items |
| `db/db.js` | Opens the SQLite connection (foreign keys on); path from `DB_PATH` |
| `db/init.js` / `db/seed.js` | `npm run db:init` / `npm run db:seed` |
| `scripts/install.sh` | EC2 step 1: system packages, Node.js 24, clone repo, npm ci |
| `scripts/configure.sh` | EC2 step 2: .env, database, systemd service, Nginx reverse proxy |
| `deploy/deploy.sh` | Laptop deploy: tests, then git pull and restart on the server |
| `start.sh` | Local setup and run |
| `test/` | Tests run with `npm test` |

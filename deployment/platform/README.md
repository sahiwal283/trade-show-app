# Trade Show App – Platform (Internal Hub) Deployment

This app runs at **booute.duckdns.org** under base path **/apps/trade-show** for the internal Core Platform. External users continue to use the same URL and log in with existing credentials.

## One-command deploy (from repo root)

```bash
./scripts/deploy-platform.sh all
```

This will:

1. **Backend** – Build and deploy to container 2220; restart `trade-show-app-backend`.
2. **Frontend** – Build with `VITE_APP_BASE_PATH=/apps/trade-show` and deploy to container 2120 under `.../current/apps/trade-show/`.
3. **Nginx (frontend)** – Push location blocks for `/apps/trade-show` and include them in the frontend container’s nginx, then reload.
4. **NPM** – Append two proxy locations to NPM proxy host 9 (booute.duckdns.org): `/apps/trade-show/api` → backend:3000, `/apps/trade-show` → frontend:80; reload nginx in the NPM container (104). The API location includes rewrite so `/apps/trade-show/api/*` is forwarded as `/api/*`.

## Before first deploy

1. **Backend .env on container 2220**  
   Add (get `PLATFORM_JWT_SECRET` from Core Platform container 1110 `.env`):

   ```bash
   PLATFORM_JWT_SECRET=<value from platform>
   APP_SLUG=trade-show
   APP_BASE_PATH=/apps/trade-show
   JWT_COOKIE_NAME=token
   ```

   Then restart:

   ```bash
   ssh root@192.168.1.190 "pct exec 2220 -- systemctl restart trade-show-app-backend"
   ```

2. **Platform UI**  
   In the Core Platform, add the app with slug **trade-show** and base path **/apps/trade-show** so users get the correct link and JWT `assigned_apps` includes `trade-show`. (You said you’ll do this manually.)

## Deploy only part of the stack

```bash
./scripts/deploy-platform.sh backend   # backend only
./scripts/deploy-platform.sh frontend  # frontend only
./scripts/deploy-platform.sh nginx     # frontend nginx snippet only
./scripts/deploy-platform.sh npm       # NPM locations only
```

## Files

| File | Purpose |
|------|--------|
| `nginx-frontend-trade-show.conf` | Nginx location blocks for `/apps/trade-show`; included in frontend container’s server block. |
| `update-npm-locations.py` | Appends Trade Show locations to NPM proxy host 9 and adds API rewrite in `advanced_config`. |
| `update-npm-locations.sh` | Copies the Python script into the `npmplus` Docker container, updates `/data/npmplus/database.sqlite`, and reloads nginx. |

## Infrastructure (do not change)

- **Proxmox host:** 192.168.1.190  
- **NPM LXC:** 104 (active database inside Docker: `/data/npmplus/database.sqlite`)  
- **Backend LXC:** 2220 (IP resolved at deploy time, port 3000)  
- **Frontend LXC:** 2120 (IP resolved at deploy time)  
- **Platform domain:** booute.duckdns.org  
- **Proxy host ID in NPM:** 9  

## After deploy

- **Platform URL:** https://booute.duckdns.org/apps/trade-show/
- **API (via platform):** https://booute.duckdns.org/apps/trade-show/api/
- **Health (direct to backend):** `curl http://192.168.1.129:3000/health`

Internal users opening the app from the platform hub get the platform JWT (cookie or header); the app resolves their local user by username and signs them in. External users see the normal login form and use existing credentials.

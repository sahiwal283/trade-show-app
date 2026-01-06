## Proxmox Production Deployment Guide

This guide deploys the Expense App on a Proxmox host with LXC containers, Nginx reverse proxy with TLS, PostgreSQL, and automation for backups.

### 0) Prerequisites
- Proxmox host reachable via SSH
- Debian/Ubuntu LXC template available
- Domain and DNS (optional but recommended)

### 1) Provision Containers (on Proxmox host)
```
pct enter <host>  # or SSH to the Proxmox host
cd /root
# Clone the repo if not available: git clone https://github.com/sahiwal283/expenseApp.git
cd expenseApp/deployment/proxmox
./create-lxcs.sh
```

### 2) OS Hardening (inside each container)
```
pct enter 201
cd /opt/expenseapp/deployment/common   # ensure repo is present or copy scripts
bash os-hardening.sh APP_USER=expense SSH_PORT=2222
```

### 3) Database Setup (inside prod-backend)
```
bash /opt/expenseapp/deployment/postgres/setup-postgres.sh DB_VERSION=14 \
  DB_NAME=expense_app DB_USER=expense_user DB_PASSWORD=<secure> LISTEN_ALL=false
```

### 4) Backend Install (inside prod-backend)
```
bash /opt/expenseapp/deployment/backend/install-backend.sh \
  REPO_URL=https://github.com/sahiwal283/expenseApp.git BRANCH=main RUN_SEED=false

# Edit /etc/expenseapp/backend.env for DB credentials and JWT secret
systemctl restart trade-show-app-backend
systemctl status trade-show-app-backend --no-pager -l
```

### 4.5) Database Schema Validation ⚠️ CRITICAL

**⚠️ MUST RUN BEFORE PRODUCTION DEPLOYMENT**

Validate database schema to ensure all required tables and columns exist:

```bash
# Connect to production database
pct exec 201 -- su - postgres -c 'psql -d expense_app_production'

# Verify all required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

# Expected core tables (verify all exist):
# - event_checklists
# - checklist_flights
# - checklist_hotels
# - checklist_car_rentals
# - checklist_booth_shipping
# - checklist_custom_items
# - checklist_templates
# - expenses
# - events
# - users
# - roles
# - settings

# Verify table column counts (critical tables)
SELECT 
  table_name,
  COUNT(column_name) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'event_checklists',
    'checklist_flights',
    'checklist_hotels',
    'checklist_car_rentals',
    'expenses',
    'events',
    'users'
  )
GROUP BY table_name
ORDER BY table_name;

# Expected column counts (verify match):
# - event_checklists: 8 columns (id, event_id, booth_ordered, booth_notes, booth_map_url, electricity_ordered, electricity_notes, templates_applied, created_at, updated_at)
# - checklist_flights: 8 columns
# - checklist_hotels: 10 columns
# - checklist_car_rentals: 11 columns
# - expenses: 20+ columns (verify based on current schema)

# Verify critical columns exist
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'event_checklists' AND column_name IN ('event_id', 'booth_ordered', 'electricity_ordered'))
    OR (table_name = 'checklist_flights' AND column_name IN ('checklist_id', 'attendee_id', 'booked'))
    OR (table_name = 'checklist_hotels' AND column_name IN ('checklist_id', 'attendee_id', 'booked'))
    OR (table_name = 'expenses' AND column_name IN ('id', 'user_id', 'event_id', 'status'))
  )
ORDER BY table_name, column_name;

# Verify foreign key constraints
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('event_checklists', 'checklist_flights', 'checklist_hotels', 'checklist_car_rentals')
ORDER BY tc.table_name;

# Exit psql
\q
```

**Validation Checklist:**
- [ ] All required tables exist
- [ ] Column counts match expected values
- [ ] Critical columns (foreign keys, status fields) exist
- [ ] Foreign key constraints are properly defined
- [ ] No missing indexes on foreign keys

**If validation fails:**
1. Review migration files in `backend/src/database/migrations/`
2. Run missing migrations manually
3. Re-run validation until all checks pass
4. **DO NOT proceed with deployment until validation passes**

### 5) Nginx Reverse Proxy + TLS (on Proxmox host)
```
apt-get update && apt-get install -y nginx
cp deployment/nginx/expenseapp.conf /etc/nginx/sites-available/expenseapp.conf
sed -i 's/YOUR_DOMAIN_OR_IP/expense.example.com/g' /etc/nginx/sites-available/expenseapp.conf
sed -i 's#BACKEND_UPSTREAM#http://<backend-container-ip>:5000#g' /etc/nginx/sites-available/expenseapp.conf
ln -sf /etc/nginx/sites-available/expenseapp.conf /etc/nginx/sites-enabled/expenseapp.conf
nginx -t && systemctl reload nginx

DOMAIN=expense.example.com EMAIL=admin@example.com \
  bash deployment/nginx/setup-letsencrypt.sh
```

### 6) Frontend Build & Publish (on Nginx host or CI)
```
WEB_ROOT=/var/www/trade-show-app/current \
  bash deployment/frontend/build-and-deploy.sh
systemctl reload nginx
```

### 7) Backups (inside prod-backend or dedicated backup host)
```
install -d -m 750 /etc/expenseapp
cat >/etc/expenseapp/backup.env <<EOF
BACKUP_DIR=/var/backups/expenseapp
DB_NAME=expense_app
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=expense_user
DB_PASSWORD=<secure>
RETENTION_DAYS=14
EOF

cp deployment/backup/expenseapp-backup.service /etc/systemd/system/
cp deployment/backup/expenseapp-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now expenseapp-backup.timer
systemctl list-timers | grep expenseapp-backup
```

### 8) Sandbox Container
- Repeat steps 2–6 for the sandbox CT, but isolated from production
- Use separate DB name and JWT secret

### 9) Monitoring
- Install node_exporter and postgres_exporter; scrape with Prometheus
- Use Grafana for dashboards and alerts

### 10) Rollbacks
- Re-deploy previous Git tag/commit in backend service
- Restore PostgreSQL from latest backup



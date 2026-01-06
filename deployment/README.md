## Deployment Automation (Proxmox + Debian/Ubuntu)

This folder contains automation scripts and configuration templates to deploy the Trade Show App on a Proxmox host with LXC containers and Nginx reverse proxy, targeting a secure, production-grade setup with a separate sandbox.

### Overview
- Proxmox host runs Nginx as reverse proxy + Let's Encrypt
- LXC containers:
  - prod-backend (API + PostgreSQL + Tesseract OCR)
  - prod-frontend (optional; static served by Proxmox Nginx)
  - sandbox (production-like stack for safe testing)

### Components
- proxmox/create-lxcs.sh — Creates/starts LXCs with sane defaults
- common/os-hardening.sh — Users, SSH, UFW, fail2ban, auto-updates
- postgres/setup-postgres.sh — Installs and hardens PostgreSQL; creates DB/user
- backend/install-backend.sh — Installs Node 18+, builds, sets up systemd
- backend/expenseapp-backend.service — systemd unit template
- frontend/build-and-deploy.sh — Builds React and publishes to web root
- nginx/expenseapp.conf — Nginx reverse proxy + static + security headers
- nginx/setup-letsencrypt.sh — Obtains TLS certs and auto-renewals
- backup/backup.sh — pg_dump backups + retention
- backup/expenseapp-backup.service|.timer — systemd scheduled backups

### High-level Steps
1) On Proxmox host: run proxmox/create-lxcs.sh to provision containers
2) In each container: run common/os-hardening.sh
3) In prod-backend container: run postgres/setup-postgres.sh
4) In prod-backend container: run backend/install-backend.sh
5) On Proxmox host: configure Nginx using nginx/expenseapp.conf and setup-letsencrypt.sh
6) On CI/your workstation: run frontend/build-and-deploy.sh to publish static assets
7) In prod-backend: enable backup timer using files in backup/

See `docs/DEPLOYMENT_PROXMOX.md` for end-to-end instructions and commands.

# Production Deployment Guide - Proxmox

**Version:** 0.6.0-alpha  
**Target:** Proxmox Home Server  
**Environment:** Production + Sandbox

---

## Overview

This guide provides complete production deployment instructions for deploying the Trade Show App on Proxmox using LXC containers.

### Architecture

```
Proxmox Host
├── Production LXC (192.168.x.10)
│   ├── PostgreSQL 14+
│   ├── Node.js Backend (Port 5000)
│   └── Nginx (Ports 80, 443)
│
└── Sandbox LXC (192.168.x.11)
    ├── PostgreSQL 14+
    ├── Node.js Backend (Port 5000)
    └── Nginx (Ports 8080, 8443)
```

---

## Prerequisites

- Proxmox VE 7.0 or higher
- Debian 11/12 or Ubuntu 22.04 LTS template
- Root access to Proxmox host
- Domain name (optional, for SSL)
- GitHub access for code deployment

---

## Deployment Steps

Follow these guides in order:

1. **[01-proxmox-setup.md](01-proxmox-setup.md)** - Create LXC containers
2. **[02-os-hardening.md](02-os-hardening.md)** - Secure the OS
3. **[03-postgresql-setup.md](03-postgresql-setup.md)** - Install database
4. **[04-backend-deployment.md](04-backend-deployment.md)** - Deploy Node.js API
5. **[05-frontend-deployment.md](05-frontend-deployment.md)** - Build and serve React app
6. **[06-nginx-ssl.md](06-nginx-ssl.md)** - Configure Nginx & SSL
7. **[07-monitoring.md](07-monitoring.md)** - Setup monitoring & backups
8. **[08-maintenance.md](08-maintenance.md)** - Update procedures

---

## Quick Deploy Script

For experienced users, use the automated deployment:

```bash
./deploy-all.sh production
```

This will execute all deployment steps automatically.

---

## Support

See individual guide files for detailed instructions on each deployment step.

# Proxmox Container Setup

## Create Production LXC Container

### Step 1: Create Container via Proxmox Web UI

1. Login to Proxmox: `https://your-proxmox-ip:8006`
2. Click "Create CT" (Container)
3. Configure:

**General:**
- CT ID: `100` (or next available)
- Hostname: `trade-show-app-prod`
- Password: Set a secure root password
- SSH public key: Add your SSH key

**Template:**
- Storage: `local`
- Template: `debian-12-standard` or `ubuntu-22.04-standard`

**Root Disk:**
- Storage: `local-lvm`
- Disk size: `20 GB`

**CPU:**
- Cores: `2`
- Type: `host`

**Memory:**
- Memory: `2048 MB`
- Swap: `512 MB`

**Network:**
- Bridge: `vmbr0`
- IPv4: `DHCP` or static (e.g., `192.168.1.10/24`)
- Gateway: Your network gateway
- IPv6: `DHCP` or disabled

**DNS:**
- DNS domain: Your domain
- DNS servers: `8.8.8.8 8.8.4.4`

### Step 2: Start Container

```bash
# From Proxmox host
pct start 100
```

### Step 3: Enter Container

```bash
pct enter 100
```

---

## Create Sandbox LXC Container

Repeat above steps with:
- CT ID: `101`
- Hostname: `trade-show-app-sandbox`
- IPv4: `192.168.1.11/24`
- Same resources as production

---

## Alternative: CLI Container Creation

```bash
# On Proxmox host
pct create 100 \
  local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst \
  --hostname trade-show-app-prod \
  --memory 2048 \
  --swap 512 \
  --cores 2 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --storage local-lvm \
  --rootfs local-lvm:20 \
  --password

pct start 100
```

---

## Verify Setup

```bash
# Check container status
pct list
pct status 100

# Enter container
pct enter 100

# Inside container, verify
hostname
ip addr
df -h
free -h
```

---

## Next Steps

Proceed to [02-os-hardening.md](02-os-hardening.md) for security configuration.

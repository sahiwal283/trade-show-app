#!/usr/bin/env bash
set -euo pipefail

# Proxmox LXC provisioning for Trade Show App
# Creates three containers: prod-backend, prod-frontend, sandbox
# Requires running on Proxmox host as root with access to `pct` and templates.

# ---- Configuration (override via env or edit here) ----
: "${STORAGE:=local-lvm}"              # Proxmox storage for root disks
: "${TEMPLATE:=local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst}"  # Or Ubuntu template
: "${BRIDGE:=vmbr0}"
: "${GATEWAY:=}"                        # e.g. 192.168.1.1 (optional if DHCP)
: "${DNS:=1.1.1.1}"
: "${SSH_PUBLIC_KEY_PATH:=~/.ssh/id_rsa.pub}"
: "${NESTING:=1}"
: "${UNPRIVILEGED:=1}"

# Container IDs
: "${CTID_BACKEND:=201}"
: "${CTID_FRONTEND:=202}"
: "${CTID_SANDBOX:=203}"

# Hostnames
: "${HOST_BACKEND:=expense-prod-backend}"
: "${HOST_FRONTEND:=expense-prod-frontend}"
: "${HOST_SANDBOX:=expense-sandbox}"

# Resources
: "${CPU_BACKEND:=2}"
: "${RAM_BACKEND:=4096}"
: "${DISK_BACKEND:=20}"

: "${CPU_FRONTEND:=1}"
: "${RAM_FRONTEND:=2048}"
: "${DISK_FRONTEND:=10}"

: "${CPU_SANDBOX:=2}"
: "${RAM_SANDBOX:=4096}"
: "${DISK_SANDBOX:=20}"

# Networking (set static IPs or leave empty for DHCP)
: "${IP_BACKEND:=}"
: "${IP_FRONTEND:=}"
: "${IP_SANDBOX:=}"

function ensure_ssh_key() {
  if [[ ! -f "$SSH_PUBLIC_KEY_PATH" ]]; then
    echo "ERROR: SSH public key not found at $SSH_PUBLIC_KEY_PATH" >&2
    exit 1
  fi
}

function build_netconf() {
  local ip="$1"
  if [[ -n "$ip" ]]; then
    # Static: use CIDR (e.g., 192.168.1.50/24)
    if [[ -n "$GATEWAY" ]]; then
      echo "name=eth0,bridge=$BRIDGE,ip=$ip,gw=$GATEWAY"
    else
      echo "name=eth0,bridge=$BRIDGE,ip=$ip"
    fi
  else
    # DHCP
    echo "name=eth0,bridge=$BRIDGE,ip=dhcp"
  fi
}

function create_ct() {
  local ctid="$1"; shift
  local hostname="$1"; shift
  local cores="$1"; shift
  local memory_mb="$1"; shift
  local disk_gb="$1"; shift
  local ip_addr="$1"; shift

  local netconf
  netconf=$(build_netconf "$ip_addr")

  echo "\n==> Creating CT $ctid ($hostname)"
  pct create "$ctid" "$TEMPLATE" \
    -hostname "$hostname" \
    -storage "$STORAGE" \
    -cores "$cores" \
    -memory "$memory_mb" \
    -rootfs "${STORAGE}:${disk_gb}" \
    -net0 "$netconf" \
    -features nesting=$NESTING \
    -unprivileged $UNPRIVILEGED \
    -onboot 1 \
    -ssh-public-keys "$SSH_PUBLIC_KEY_PATH" \
    -nameserver "$DNS"

  echo "Starting CT $ctid..."
  pct start "$ctid"
}

ensure_ssh_key

create_ct "$CTID_BACKEND" "$HOST_BACKEND" "$CPU_BACKEND" "$RAM_BACKEND" "$DISK_BACKEND" "$IP_BACKEND"
create_ct "$CTID_FRONTEND" "$HOST_FRONTEND" "$CPU_FRONTEND" "$RAM_FRONTEND" "$DISK_FRONTEND" "$IP_FRONTEND"
create_ct "$CTID_SANDBOX" "$HOST_SANDBOX" "$CPU_SANDBOX" "$RAM_SANDBOX" "$DISK_SANDBOX" "$IP_SANDBOX"

echo "\nAll containers created and started. Use 'pct enter <CTID>' to access."

# Suggested roles:
# - $HOST_BACKEND: API + PostgreSQL + OCR, expose only required ports internally
# - $HOST_FRONTEND: optional (static hosting can be done by Proxmox Nginx)
# - $HOST_SANDBOX: full stack for testing



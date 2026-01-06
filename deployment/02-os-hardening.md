# OS Hardening & Security Setup

Execute these commands inside each LXC container.

## Initial Setup

```bash
# Update system
apt update && apt upgrade -y

# Install essential tools
apt install -y curl wget git vim ufw fail2ban sudo

# Create non-root user for app
adduser expenseapp
usermod -aG sudo expenseapp

# Switch to new user
su - expenseapp
```

---

## SSH Hardening

```bash
# Generate SSH key (if not done)
ssh-keygen -t ed25519 -C "trade-show-app-server"

# Edit SSH config
sudo vim /etc/ssh/sshd_config
```

**Add/modify these settings:**
```
Port 2222                          # Change default port
PermitRootLogin no                 # Disable root login
PasswordAuthentication no          # Use keys only
PubkeyAuthentication yes
MaxAuthTries 3
MaxSessions 2
```

```bash
# Restart SSH
sudo systemctl restart sshd
```

---

## Firewall Configuration

```bash
# Configure UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (new port)
sudo ufw allow 2222/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow backend (only from localhost)
# Backend port 5000 will NOT be exposed externally

# Enable firewall
sudo ufw enable
sudo ufw status
```

---

## Fail2Ban Setup

```bash
# Configure fail2ban for SSH
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo vim /etc/fail2ban/jail.local
```

**Modify:**
```ini
[sshd]
enabled = true
port = 2222
maxretry = 3
bantime = 3600
findtime = 600
```

```bash
# Start fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo fail2ban-client status
```

---

## Automatic Security Updates

```bash
# Install unattended-upgrades
sudo apt install -y unattended-upgrades apt-listchanges

# Configure
sudo dpkg-reconfigure -plow unattended-upgrades
```

Edit `/etc/apt/apt.conf.d/50unattended-upgrades`:
```
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "your-email@domain.com";
```

---

## System Limits & Optimization

```bash
# Increase file limits
sudo vim /etc/security/limits.conf
```

Add:
```
expenseapp soft nofile 65536
expenseapp hard nofile 65536
```

---

## Next Steps

Proceed to [03-postgresql-setup.md](03-postgresql-setup.md)

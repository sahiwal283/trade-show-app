# 🛡️ Schema Validation - Quick Reference

**Version:** 1.27.15

---

## ⚡ Quick Commands

```bash
# Validate production (before deployment)
./scripts/validate-schema.sh production

# Validate sandbox (after testing)
./scripts/validate-schema.sh sandbox

# Validate local (during development)
./scripts/validate-schema.sh local
```

---

## 📊 Exit Codes

| Code | Status | Action |
|------|--------|--------|
| `0` | ✅ Passed | Safe to deploy |
| `1` | ❌ Failed | **DEPLOYMENT BLOCKED** |
| `2` | 🔧 Error | Fix configuration |

---

## 🎯 What It Detects

- ❌ **Missing tables** - In migrations but not in DB
- ⚠️  **Extra tables** - In DB but not in migrations
- ❌ **Column count mismatch** - Wrong number of columns
- ❌ **Type mismatches** - Column types don't match

---

## 🚀 Integration

### Before Every Deployment

```bash
# 1. Validate schema
./scripts/validate-schema.sh production

# 2. Only deploy if validation passes
if [ $? -eq 0 ]; then
    ./DEPLOY_TO_PRODUCTION.sh
else
    echo "❌ Fix schema issues first!"
    exit 1
fi
```

### In CI/CD Pipeline

```yaml
- name: Validate Schema
  run: ./scripts/validate-schema.sh production
  
- name: Deploy (only if validation passes)
  if: success()
  run: ./deploy.sh
```

---

## 🐛 Common Issues

### Connection Failed

```bash
# Check VPN
ping 192.168.1.138

# Test database connection
psql -h 127.0.0.1 -U sahil -d expense_app_production
```

### Missing Tables Found

```bash
# Run migrations on production
ssh root@192.168.1.190
pct exec 201 -- bash -c 'cd /opt/trade-show-app/backend && npm run migrate'

# Validate again
./scripts/validate-schema.sh production
```

### Column Mismatch

```bash
# Check which migration adds the column
grep -r "ALTER TABLE users ADD" backend/src/database/migrations/

# Apply that specific migration
```

---

## 📁 Reports

Generated reports:
```
schema-validation-production-YYYYMMDD_HHMMSS.txt
schema-validation-sandbox-YYYYMMDD_HHMMSS.txt
```

View latest:
```bash
cat $(ls -t schema-validation-*.txt | head -1)
```

---

## 📚 Full Documentation

👉 **See:** [docs/SCHEMA_VALIDATION.md](docs/SCHEMA_VALIDATION.md)

---

## ✅ Best Practices

1. ✅ **Always validate before production deployment**
2. ✅ **Test migrations on sandbox first**
3. ✅ **Keep migrations in sync with schema**
4. ✅ **Run weekly schema audits**
5. ❌ **Never skip validation warnings**

---

**Quick Help:** `./scripts/validate-schema.sh --help`  
**Docs:** `docs/SCHEMA_VALIDATION.md`


# Troubleshooting Guide

## Common Issues and Solutions

### npm: command not found

**Symptom:** When running `./start-frontend.sh`, you see:
```
npm: command not found
```
Or:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Node.js Not Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Cause:** Node.js and npm are not installed or not in your PATH.

**Good News:** The script now shows you exactly how to fix this!

### Node.js Version Too Old

**Symptom:** You see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Node.js Version Too Old
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current version: v16.x.x
Required version: v18 or higher
```

**Cause:** You have Node.js installed, but it's older than v18.

**Solution:** Follow the upgrade instructions shown by the script.

**Solution:**

#### macOS

**Option 1: Install via Homebrew (Recommended)**
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js (includes npm)
brew install node

# Verify installation
node -v
npm -v
```

**Option 2: Install from nodejs.org**
1. Visit https://nodejs.org/
2. Download the LTS version (v18 or higher)
3. Run the installer
4. Restart your terminal
5. Verify: `node -v` and `npm -v`

**Option 3: Install via nvm (Node Version Manager)**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.zshrc  # or source ~/.bash_profile

# Install Node.js
nvm install 18
nvm use 18

# Verify
node -v
npm -v
```

#### Windows

1. Visit https://nodejs.org/
2. Download the Windows installer (LTS version)
3. Run the installer (check "Add to PATH")
4. Restart Command Prompt or PowerShell
5. Verify: `node -v` and `npm -v`

#### Linux

**Ubuntu/Debian:**
```bash
# Update package list
sudo apt update

# Install Node.js and npm
sudo apt install nodejs npm

# Verify
node -v
npm -v
```

**For newer versions, use NodeSource:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Permission Denied

**Symptom:**
```
./start-frontend.sh: Permission denied
```

**Solution:**
```bash
chmod +x start-frontend.sh
./start-frontend.sh
```

### npm install fails

**Symptom:** Dependencies fail to install

**Solutions:**

**1. Clear npm cache:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**2. Update npm:**
```bash
npm install -g npm@latest
```

**3. Check npm registry:**
```bash
npm config get registry
# Should be: https://registry.npmjs.org/

# If not, set it:
npm config set registry https://registry.npmjs.org/
```

### Port 5173 already in use

**Symptom:**
```
Port 5173 is already in use
```

**Solution 1: Kill the process using the port**

**macOS/Linux:**
```bash
lsof -ti:5173 | xargs kill -9
```

**Windows:**
```cmd
netstat -ano | findstr :5173
taskkill /PID <PID_NUMBER> /F
```

**Solution 2: Change the port**

Edit `vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000  // Change to any available port
  }
})
```

### Module not found errors

**Symptom:**
```
Error: Cannot find module 'react'
```

**Solution:**
```bash
# Remove and reinstall
rm -rf node_modules package-lock.json
npm install

# Or install specific package
npm install react react-dom
```

### TypeScript errors

**Symptom:** TypeScript compilation errors

**Solutions:**

**1. Ensure TypeScript is installed:**
```bash
npm install -D typescript
```

**2. Clear TypeScript cache:**
```bash
rm -rf node_modules/.cache
```

**3. Restart TypeScript server (in VS Code):**
- Cmd/Ctrl + Shift + P
- Type: "TypeScript: Restart TS Server"

### Vite build errors

**Symptom:** Vite fails to start

**Solution:**
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Reinstall
npm install

# Try starting again
npm run dev
```

### Browser shows blank page

**Symptom:** Frontend loads but shows nothing

**Solutions:**

1. **Check browser console (F12):**
   - Look for JavaScript errors
   - Check Network tab for failed requests

2. **Clear browser cache:**
   - Hard reload: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

3. **Check localStorage:**
   - Open DevTools (F12)
   - Application > Local Storage
   - Clear if corrupted

4. **Verify the dev server is running:**
   - Should see "Local: http://localhost:5173" in terminal

### Data not persisting

**Symptom:** Data disappears after refresh

**Solution:**

1. **Check localStorage is enabled:**
   - Open DevTools (F12)
   - Application > Local Storage
   - Should see entries like `tradeshow_users`

2. **Check browser privacy settings:**
   - localStorage may be disabled in private/incognito mode
   - Use normal browsing mode

3. **Clear and reload:**
   ```bash
   # In browser DevTools console:
   localStorage.clear()
   location.reload()
   ```

### Script doesn't run on macOS

**Symptom:** Script won't execute

**Solutions:**

1. **Make executable:**
   ```bash
   chmod +x start-frontend.sh
   ```

2. **Run with bash explicitly:**
   ```bash
   bash start-frontend.sh
   ```

3. **Check line endings (if edited on Windows):**
   ```bash
   dos2unix start-frontend.sh
   ```

### Environment-specific issues

#### macOS Catalina+

If you see "cannot be opened because the developer cannot be verified":
```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine start-frontend.sh
```

#### Windows PowerShell execution policy

If scripts won't run:
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Still having issues?

1. **Check Node.js version:**
   ```bash
   node -v
   # Should be v18 or higher
   ```

2. **Check npm version:**
   ```bash
   npm -v
   # Should be 8.0 or higher
   ```

3. **Try minimal test:**
   ```bash
   # Create test directory
   mkdir test-app && cd test-app
   npm init -y
   npm install react
   
   # If this fails, there's a system-level npm issue
   ```

4. **Reinstall Node.js completely:**
   - Uninstall existing Node.js
   - Download fresh installer from https://nodejs.org/
   - Install and restart terminal

5. **Check system PATH:**
   ```bash
   echo $PATH  # macOS/Linux
   echo %PATH%  # Windows
   
   # Should include Node.js bin directory
   ```

### Getting Help

If none of these solutions work:

1. **Check the error message carefully**
   - Copy the full error message
   - Search for it online

2. **Check FRONTEND_TESTING.md**
   - May contain specific solutions

3. **Verify system requirements:**
   - Node.js v18+
   - npm v8+
   - Modern browser (Chrome, Firefox, Safari, Edge)

4. **Try alternative approach:**
   ```bash
   # Instead of the script, run manually:
   npm install
   npm run dev
   ```

### Quick Diagnostics

Run this to check your setup:
```bash
echo "=== System Check ==="
echo "Node.js: $(node -v 2>&1)"
echo "npm: $(npm -v 2>&1)"
echo "Current directory: $(pwd)"
echo "package.json exists: $([ -f package.json ] && echo 'Yes' || echo 'No')"
echo "node_modules exists: $([ -d node_modules ] && echo 'Yes' || echo 'No')"
```

Expected output:
```
=== System Check ===
Node.js: v18.x.x (or higher)
npm: 8.x.x (or higher)
Current directory: /path/to/trade-show-app
package.json exists: Yes
node_modules exists: Yes (after npm install)
```

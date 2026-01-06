@echo off
REM Trade Show App - Frontend Only Startup

echo =========================================
echo Trade Show App - Frontend Only
echo Version: 0.5.0-alpha (Pre-release)
echo =========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo =========================================
    echo    Node.js Not Found
    echo =========================================
    echo.
    echo Node.js is required to run this application.
    echo.
    echo Quick Installation (Windows):
    echo.
    echo 1. Visit: https://nodejs.org/
    echo 2. Download the LTS version (v18 or higher)
    echo 3. Run the installer
    echo 4. Check "Add to PATH" during installation
    echo 5. Restart this terminal
    echo 6. Run this script again
    echo.
    echo =========================================
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo =========================================
    echo    npm Not Found
    echo =========================================
    echo.
    echo npm should come with Node.js.
    echo.
    echo Please reinstall Node.js from:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Get versions
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i

REM Extract major version (remove 'v' and get first part)
set NODE_MAJOR=%NODE_VERSION:v=%
for /f "delims=." %%a in ("%NODE_MAJOR%") do set NODE_MAJOR=%%a

REM Check if Node.js version is at least 18
if %NODE_MAJOR% LSS 18 (
    echo =========================================
    echo    Node.js Version Too Old
    echo =========================================
    echo.
    echo Current version: %NODE_VERSION%
    echo Required version: v18 or higher
    echo.
    echo Upgrade Node.js:
    echo.
    echo 1. Visit: https://nodejs.org/
    echo 2. Download the latest LTS version
    echo 3. Run the installer
    echo 4. Restart this terminal
    echo 5. Verify: node -v
    echo 6. Run this script again
    echo.
    echo =========================================
    pause
    exit /b 1
)

REM Display versions with checkmarks
echo [OK] Node.js %NODE_VERSION% detected (v18+ required)
echo [OK] npm %NPM_VERSION% detected
echo.

echo Starting frontend-only testing mode...
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

echo =========================================
echo Frontend Ready for Testing!
echo =========================================
echo.
echo Note: This is frontend-only mode
echo Data is stored in browser localStorage
echo.
echo Opening at: http://localhost:5173
echo.
echo Demo Login Credentials:
echo   Admin:       admin / admin
echo   Coordinator: sarah / password
echo   Salesperson: mike / password
echo   Accountant:  lisa / password
echo.
echo Starting development server...
echo Press Ctrl+C to stop
echo.

REM Start frontend
call npm run dev

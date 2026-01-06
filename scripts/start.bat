@echo off
REM Trade Show App - Easy Startup Script for Windows

echo =========================================
echo Trade Show App - Starting...
echo =========================================
echo.

REM Check if PostgreSQL is running
echo Checking PostgreSQL...
pg_isready >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: PostgreSQL may not be running.
    echo Please ensure PostgreSQL is started before continuing.
    echo.
    pause
)

REM Install backend dependencies if needed
if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

REM Install frontend dependencies if needed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)

REM Setup backend environment if needed
if not exist "backend\.env" (
    echo Creating backend .env file...
    copy backend\env.example backend\.env
    echo Please edit backend\.env with your database credentials
    pause
)

REM Run migrations
echo Running database migrations...
cd backend
call npm run migrate
cd ..

REM Run seed data
echo Seeding database...
cd backend
call npm run seed
cd ..

echo.
echo =========================================
echo Setup Complete!
echo =========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:5000
echo.
echo Demo Login Credentials:
echo   Admin:       admin / password123
echo   Coordinator: sarah / password123
echo   Salesperson: mike / password123
echo   Accountant:  lisa / password123
echo.
echo Starting servers...
echo Press Ctrl+C to stop
echo.

REM Start both frontend and backend
call npm run start:all

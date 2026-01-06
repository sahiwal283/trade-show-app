#!/bin/bash

# Trade Show App - Easy Startup Script
# This script sets up and runs both frontend and backend

echo "========================================="
echo "Trade Show App - Starting..."
echo "========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if PostgreSQL is running
echo -e "${BLUE}Checking PostgreSQL...${NC}"
if ! pg_isready > /dev/null 2>&1; then
    echo -e "${YELLOW}PostgreSQL is not running. Attempting to start...${NC}"
    
    # Try to start PostgreSQL (macOS with Homebrew)
    if command -v brew &> /dev/null; then
        brew services start postgresql@14 > /dev/null 2>&1 || brew services start postgresql > /dev/null 2>&1
        sleep 2
    fi
    
    if ! pg_isready > /dev/null 2>&1; then
        echo -e "${YELLOW}Could not auto-start PostgreSQL. Please start it manually:${NC}"
        echo "  macOS: brew services start postgresql@14"
        echo "  Linux: sudo systemctl start postgresql"
        echo ""
        read -p "Press Enter when PostgreSQL is running, or Ctrl+C to exit..."
    fi
fi

if pg_isready > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
else
    echo -e "${RED}✗ PostgreSQL is not running. Exiting.${NC}"
    exit 1
fi

# Check if database exists
echo -e "${BLUE}Checking database...${NC}"
if psql -lqt | cut -d \| -f 1 | grep -qw expense_app; then
    echo -e "${GREEN}✓ Database 'expense_app' exists${NC}"
else
    echo -e "${YELLOW}Database 'expense_app' does not exist. Creating...${NC}"
    createdb expense_app
    echo -e "${GREEN}✓ Database created${NC}"
fi

# Install backend dependencies if needed
if [ ! -d "backend/node_modules" ]; then
    echo -e "${BLUE}Installing backend dependencies...${NC}"
    cd backend && npm install && cd ..
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
fi

# Install frontend dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
fi

# Setup backend environment if needed
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Backend .env file not found. Creating from template...${NC}"
    cp backend/env.example backend/.env
    echo -e "${GREEN}✓ Created backend/.env${NC}"
    echo -e "${YELLOW}⚠ Please edit backend/.env with your database credentials${NC}"
    echo ""
    read -p "Press Enter to continue with default settings, or Ctrl+C to exit and configure..."
fi

# Run migrations
echo -e "${BLUE}Running database migrations...${NC}"
cd backend && npm run migrate > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migrations completed${NC}"
else
    echo -e "${YELLOW}Migration may have already run or failed. Continuing...${NC}"
fi
cd ..

# Run seed data
echo -e "${BLUE}Seeding database with demo data...${NC}"
cd backend && npm run seed > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database seeded${NC}"
else
    echo -e "${YELLOW}Seed data may already exist. Continuing...${NC}"
fi
cd ..

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${BLUE}Starting application...${NC}"
echo ""
echo -e "${GREEN}Frontend:${NC} http://localhost:5173"
echo -e "${GREEN}Backend:${NC}  http://localhost:5000"
echo ""
echo -e "${YELLOW}Demo Login Credentials:${NC}"
echo "  Admin:       admin / password123"
echo "  Coordinator: sarah / password123"
echo "  Salesperson: mike / password123"
echo "  Accountant:  lisa / password123"
echo ""
echo -e "${BLUE}Starting servers...${NC}"
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both frontend and backend
npm run start:all

# Quick Start Guide

Get the Trade Show App running in minutes!

## Easiest Way to Start (Recommended)

### macOS / Linux
```bash
./start.sh
```

### Windows
```bash
start.bat
```

That's it! The script will:
1. Check and start PostgreSQL
2. Create the database if needed
3. Install all dependencies
4. Run migrations and seed data
5. Start both frontend and backend servers

## What You'll See

After running the script:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000

## Demo Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | password123 |
| Coordinator | sarah | password123 |
| Salesperson | mike | password123 |
| Accountant | lisa | password123 |

## Troubleshooting

### PostgreSQL Not Running

**macOS:**
```bash
brew services start postgresql@14
```

**Linux:**
```bash
sudo systemctl start postgresql
```

**Windows:**
- Start PostgreSQL from Services or pgAdmin

### Port Already in Use

If port 5000 or 5173 is in use:

**Backend (port 5000):**
Edit `backend/.env` and change `PORT=5000` to another port

**Frontend (port 5173):**
Edit `vite.config.ts` and add:
```typescript
server: {
  port: 3000  // or any other port
}
```

### Database Connection Failed

1. Ensure PostgreSQL is running
2. Check `backend/.env` credentials match your PostgreSQL setup
3. Default credentials:
   - DB_USER: postgres
   - DB_PASSWORD: (your postgres password)
   - DB_NAME: expense_app

### Dependencies Installation Failed

**Clear and reinstall:**
```bash
# Frontend
rm -rf node_modules package-lock.json
npm install

# Backend
rm -rf backend/node_modules backend/package-lock.json
cd backend && npm install
```

## Manual Setup (Alternative)

If the automated script doesn't work, follow these steps:

### 1. Install PostgreSQL
- macOS: `brew install postgresql@14`
- Linux: `sudo apt-get install postgresql`
- Windows: Download from postgresql.org

### 2. Create Database
```bash
psql postgres
CREATE DATABASE expense_app;
CREATE USER expense_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE expense_app TO expense_user;
\q
```

### 3. Setup Backend
```bash
cd backend
npm install
cp env.example .env
# Edit .env with your database credentials
npm run migrate
npm run seed
npm run dev
```

### 4. Setup Frontend (New Terminal)
```bash
npm install
npm run dev
```

## Testing the Application

### 1. Login
- Go to http://localhost:5173
- Login with any demo credentials

### 2. Test Core Features

**As Admin:**
- User management
- Create events
- View all expenses
- System settings

**As Coordinator:**
- Create trade show events
- Add participants
- View event expenses

**As Salesperson:**
- Submit expenses
- Upload receipt images
- View personal expenses

**As Accountant:**
- Review all expenses
- Approve/reject expenses
- Assign Zoho entities
- Approve reimbursements

### 3. Test OCR Receipt Upload
1. Login as salesperson (mike/password123)
2. Go to Expenses
3. Click "Submit Expense"
4. Upload a receipt image (JPG, PNG)
5. Wait for OCR processing
6. Verify text extraction

## API Testing

### Health Check
```bash
curl http://localhost:5000/health
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

### Get Events (with token)
```bash
curl http://localhost:5000/api/events \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Development

### Run Frontend Only
```bash
npm run dev
```

### Run Backend Only
```bash
npm run start:backend
```

### Run Both Together
```bash
npm run start:all
```

### Build for Production
```bash
# Frontend
npm run build

# Backend
cd backend && npm run build
```

## Next Steps

1. Explore different user roles
2. Create events and add participants
3. Submit expenses with receipts
4. Test approval workflows
5. View reports and analytics
6. Configure settings (admin only)

## Support

For issues or questions:
1. Check the main README.md
2. Review SETUP_GUIDE.md for detailed instructions
3. Check backend/README.md for API documentation
4. Review troubleshooting section above

## Version

Current Version: **v1.0.0**

Check the header in the application to see the version number.

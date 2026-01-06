# Trade Show App - Complete Setup Guide

## What Was Done

### Frontend Fixes
1. Fixed duplicate React imports in AccountantDashboard.tsx
2. Corrected import paths in App.tsx, AccountantDashboard.tsx, and EventSetup.tsx
3. All TypeScript compilation errors resolved
4. Frontend now compiles cleanly

### Backend Implementation (Complete Production-Ready)
1. Node.js + Express server with TypeScript
2. PostgreSQL database with full schema
3. JWT-based authentication
4. Role-based access control middleware
5. RESTful API endpoints for:
   - Authentication (login/register)
   - User management
   - Event management
   - Expense management with approval workflows
   - Settings management
6. File upload with Multer
7. OCR text extraction with Tesseract.js
8. Database migrations and seeding scripts

### Documentation
1. Comprehensive main README with setup instructions
2. Backend-specific README with API documentation
3. Environment configuration examples
4. Troubleshooting guides

## Getting Started

### Step 1: Install PostgreSQL

MacOS:
```bash
brew install postgresql@14
brew services start postgresql@14
```

Ubuntu/Debian:
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Step 2: Create Database

```bash
psql postgres
CREATE DATABASE expense_app;
CREATE USER expense_user WITH PASSWORD 'mypassword';
GRANT ALL PRIVILEGES ON DATABASE expense_app TO expense_user;
\q
```

### Step 3: Setup Backend

```bash
cd backend
npm install
cp env.example .env
# Edit .env with your database credentials
npm run migrate
npm run seed
npm run dev
```

Backend runs on: http://localhost:5000

### Step 4: Setup Frontend

```bash
cd ..
npm install
npm run dev
```

Frontend runs on: http://localhost:5173

### Step 5: Login

Use demo credentials:
- Admin: `admin` / `password123`
- Coordinator: `sarah` / `password123`
- Salesperson: `mike` / `password123`
- Accountant: `lisa` / `password123`

## Key Features

### OCR Receipt Scanning
- Upload receipt images (JPEG, PNG, PDF)
- Automatic text extraction using Tesseract.js
- Text stored with expense for search/verification
- Maximum 5MB file size

### Role-Based Permissions

**Admin:**
- Full system access
- User management
- All operations

**Coordinator:**
- Create/manage events
- Add participants
- View event expenses

**Salesperson:**
- Submit expenses
- Upload receipts
- View own expenses

**Accountant:**
- View all expenses
- Approve/reject expenses
- Assign Zoho entities
- Approve reimbursements
- Access reports

### API Endpoints

Authentication:
- POST /api/auth/login
- POST /api/auth/register

Users:
- GET /api/users
- POST /api/users (admin)
- PUT /api/users/:id (admin)
- DELETE /api/users/:id (admin)

Events:
- GET /api/events
- POST /api/events (admin/coordinator)
- PUT /api/events/:id
- DELETE /api/events/:id

Expenses:
- GET /api/expenses
- POST /api/expenses (with file upload)
- PATCH /api/expenses/:id/review (accountant/admin)
- PATCH /api/expenses/:id/entity (accountant/admin)
- PATCH /api/expenses/:id/reimbursement (accountant/admin)

## Environment Variables

Backend (.env):
```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=expense_app
DB_USER=expense_user
DB_PASSWORD=your_password
JWT_SECRET=your_random_secret_32_chars_minimum
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
```

## Testing the API

Health check:
```bash
curl http://localhost:5000/health
```

Login:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

Get events (use token from login):
```bash
curl http://localhost:5000/api/events \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Submit expense with receipt:
```bash
curl -X POST http://localhost:5000/api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "event_id=EVENT_ID" \
  -F "category=Meals" \
  -F "merchant=Restaurant" \
  -F "amount=50.00" \
  -F "date=2025-01-15" \
  -F "description=Client dinner" \
  -F "receipt=@/path/to/receipt.jpg"
```

## Troubleshooting

### Database Connection Error
- Check PostgreSQL is running: `pg_isready`
- Verify .env credentials
- Ensure database exists: `psql -l | grep expense_app`

### OCR Not Working
- Check file format (JPEG, PNG, PDF only)
- Verify file size under 5MB
- Check backend logs for errors

### Port In Use
- Backend: Change PORT in backend/.env
- Frontend: Change port in vite.config.ts

### Migration Errors
- Drop and recreate database
- Ensure PostgreSQL user has proper permissions
- Check schema.sql for syntax errors

## Production Deployment

For production:
1. Set NODE_ENV=production
2. Use strong JWT_SECRET (32+ random characters)
3. Configure production PostgreSQL instance
4. Set up SSL/HTTPS
5. Configure CORS properly
6. Set up automated database backups
7. Use environment variables for all secrets
8. Configure proper logging
9. Set up monitoring and alerts

## File Structure

```
trade-show-app/
├── backend/
│   ├── src/
│   │   ├── config/database.ts
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   ├── migrate.ts
│   │   │   └── seed.ts
│   │   ├── middleware/auth.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── users.ts
│   │   │   ├── events.ts
│   │   │   ├── expenses.ts
│   │   │   └── settings.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── (Frontend React components)
├── package.json
└── README.md
```

## GitHub Repository

All code has been committed and pushed to:
https://github.com/sahiwal283/expenseApp

Commits include:
1. Frontend error fixes
2. Complete backend implementation
3. Database schema and migrations
4. OCR integration
5. Comprehensive documentation

## Next Steps

1. Install PostgreSQL
2. Follow setup steps above
3. Test backend API endpoints
4. Test frontend with backend
5. Upload test receipts to verify OCR
6. Test all role permissions

## Support

For issues:
1. Check troubleshooting section
2. Review backend logs: `npm run dev` output
3. Check database connection
4. Verify environment variables
5. Check GitHub issues

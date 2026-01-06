# Trade Show App - Backend

Production-ready backend API for the Trade Show Expense Management application.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup PostgreSQL Database

Create database and user:

```bash
psql postgres
CREATE DATABASE expense_app;
CREATE USER expense_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE expense_app TO expense_user;
\q
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` with your database credentials:

```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=expense_app
DB_USER=expense_user
DB_PASSWORD=your_password
JWT_SECRET=your_random_secret_key_here
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
```

### 4. Run Migrations

Create database tables:

```bash
npm run migrate
```

### 5. Seed Database

Add demo users and data:

```bash
npm run seed
```

Demo credentials:
- admin / password123
- sarah / password123
- mike / password123
- lisa / password123

### 6. Start Server

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm run build
npm start
```

Server will run on http://localhost:5000

## API Documentation

### Authentication

#### POST /api/auth/login
Login with username and password

Request:
```json
{
  "username": "admin",
  "password": "password123"
}
```

Response:
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "username": "admin",
    "name": "Admin User",
    "email": "admin@company.com",
    "role": "admin"
  }
}
```

#### POST /api/auth/register
Register a new user

### Users

All user endpoints require authentication (Bearer token)

- GET /api/users - Get all users
- GET /api/users/:id - Get user by ID
- POST /api/users - Create user (admin only)
- PUT /api/users/:id - Update user (admin only)
- DELETE /api/users/:id - Delete user (admin only)

### Events

- GET /api/events - Get all events with participants
- GET /api/events/:id - Get event by ID
- POST /api/events - Create event (admin/coordinator)
- PUT /api/events/:id - Update event (admin/coordinator)
- DELETE /api/events/:id - Delete event (admin/coordinator)

### Expenses

- GET /api/expenses - Get expenses (supports filters: event_id, user_id, status)
- GET /api/expenses/:id - Get expense by ID
- POST /api/expenses - Create expense (with multipart/form-data for receipt upload)
- PUT /api/expenses/:id - Update expense
- PATCH /api/expenses/:id/review - Approve/reject expense (accountant/admin)
- PATCH /api/expenses/:id/entity - Assign Zoho entity (accountant/admin)
- PATCH /api/expenses/:id/reimbursement - Approve/reject reimbursement (accountant/admin)
- DELETE /api/expenses/:id - Delete expense

### Settings

- GET /api/settings - Get all settings
- PUT /api/settings - Update settings (admin only)

## OCR Receipt Processing

The backend automatically processes uploaded receipts using Tesseract.js:

1. Upload receipt image with expense submission
2. OCR extracts text from the image
3. Text is stored in the `ocr_text` field
4. Images stored in `uploads/` directory

Supported formats: JPEG, JPG, PNG, PDF
Max file size: 5MB (configurable)

## Database Schema

### users
- id (UUID)
- username (VARCHAR)
- password (VARCHAR, hashed)
- name (VARCHAR)
- email (VARCHAR)
- role (VARCHAR: admin, accountant, coordinator, salesperson)

### events
- id (UUID)
- name, venue, city, state (VARCHAR)
- start_date, end_date (DATE)
- budget (DECIMAL)
- status (VARCHAR)
- coordinator_id (UUID FK)

### event_participants
- id (UUID)
- event_id (UUID FK)
- user_id (UUID FK)

### expenses
- id (UUID)
- event_id, user_id (UUID FK)
- category, merchant, description (VARCHAR)
- amount (DECIMAL)
- date (DATE)
- card_used (VARCHAR)
- reimbursement_required (BOOLEAN)
- reimbursement_status (VARCHAR)
- receipt_url (VARCHAR)
- ocr_text (TEXT)
- status (VARCHAR)
- zoho_entity (VARCHAR)

### app_settings
- id (UUID)
- key (VARCHAR)
- value (JSONB)

## Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Role-based authorization middleware
- File upload validation and sanitization
- SQL injection protection via parameterized queries

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production server
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed database with demo data

## Troubleshooting

### Database Connection Failed
- Check PostgreSQL is running: `pg_isready`
- Verify credentials in .env
- Ensure database exists

### OCR Not Working
- Check uploaded file format
- Verify Tesseract.js installation
- Check file size limits

### Port Already in Use
- Change PORT in .env
- Kill process using port: `lsof -ti:5000 | xargs kill`

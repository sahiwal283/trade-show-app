import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { createSession, deleteSession } from '../middleware/sessionTracker';
import { AuthRequest, getToken, tryVerifyPlatformJwt } from '../middleware/auth';
import { logAuth } from '../utils/auditLogger';
import { userRepository } from '../database/repositories';

const router = Router();

const APP_SLUG = process.env.APP_SLUG || 'trade-show';

/**
 * GET /api/auth/platform/session
 * Bootstrap endpoint for internal platform SSO: validate platform JWT, resolve to local user by username.
 * - No token or invalid → { authenticated: false } (frontend shows login).
 * - Valid platform token, slug not in assigned_apps → 403 not_assigned_to_app.
 * - Valid platform token, no local user for username → { requiresLogin: true, detail: 'no_local_user', message } (frontend shows login for manual linking).
 * - Valid platform token, local user found → { user: { id, username, name, email, role } }.
 */
router.get('/platform/session', async (req, res) => {
  if (!process.env.PLATFORM_JWT_SECRET) {
    return res.json({ supported: false });
  }
  const token = getToken(req);
  if (!token) {
    return res.json({ authenticated: false });
  }
  const platform = tryVerifyPlatformJwt(token);
  if (!platform) {
    return res.json({ authenticated: false });
  }
  if (!platform.assigned_apps.includes(APP_SLUG)) {
    return res.status(403).json({ detail: 'not_assigned_to_app' });
  }
  const localUser = await userRepository.findByUsernameSafe(platform.username);
  if (!localUser) {
    return res.json({
      requiresLogin: true,
      detail: 'no_local_user',
      message: 'No local account linked. Please sign in with your app credentials to link your account.',
    });
  }
  res.json({
    user: {
      id: localUser.id,
      username: localUser.username,
      name: localUser.name,
      email: localUser.email,
      role: localUser.role,
    },
  });
});

router.post('/login', async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[Auth:Login] Request ${requestId} - Login attempt started`, {
    username: req.body.username ? 'provided' : 'missing',
    password: req.body.password ? 'provided' : 'missing',
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    origin: req.get('origin'),
    method: req.method,
    url: req.url
  });

  try {
    const rawUser = req.body.username;
    const rawPass = req.body.password;
    const username =
      typeof rawUser === 'string' ? rawUser.trim() : '';
    const password =
      typeof rawPass === 'string' ? rawPass.trim() : '';

    if (!username || !password) {
      console.log(`[Auth:Login] Request ${requestId} - Missing credentials`, {
        hasUsername: !!username,
        hasPassword: !!password
      });
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Match by username OR email (case-insensitive). Mobile password managers often autofill
    // email into the login field; desktop may save the username. Same generic error if no match.
    console.log(`[Auth:Login] Request ${requestId} - Querying database for user (username or email)`);
    const result = await query(
      `SELECT id, username, password, name, email, role FROM users
       WHERE LOWER(TRIM(username)) = LOWER($1)
          OR LOWER(TRIM(email)) = LOWER($1)
       LIMIT 1`,
      [username]
    );

    console.log(`[Auth:Login] Request ${requestId} - Database query result:`, {
      userFound: result.rows.length > 0,
      userId: result.rows[0]?.id
    });

    if (result.rows.length === 0) {
      console.log(`[Auth:Login] Request ${requestId} - User not found: ${username}`);
      await logAuth('login_failed', { username }, req.ip, 'User not found').catch(err => 
        console.error(`[Auth:Login] Failed to log auth failure:`, err)
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log(`[Auth:Login] Request ${requestId} - Comparing password for user: ${user.id}`);
    const validPassword = await bcrypt.compare(password, user.password);

    console.log(`[Auth:Login] Request ${requestId} - Password comparison result:`, {
      valid: validPassword,
      userId: user.id
    });

    if (!validPassword) {
      // Log failed login attempt
      console.log(`[Auth:Login] Request ${requestId} - Invalid password for user: ${username}`);
      await logAuth('login_failed', { username }, req.ip, 'Invalid password').catch(err => 
        console.error(`[Auth:Login] Failed to log auth failure:`, err)
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Prevent login if account is pending role assignment
    if (user.role === 'pending') {
      return res.status(403).json({ 
        error: 'Account pending approval',
        message: 'Your account is awaiting administrator approval. Please contact an administrator to activate your account.'
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production',
      { expiresIn: '20m' } // 20 minutes - aligns with 15min inactivity + 5min buffer
    );

    // Create session record for tracking
    try {
      await createSession(user.id, token, req as AuthRequest, 1200); // 20 minutes in seconds
    } catch (sessionError) {
      console.error('[Auth] Failed to create session record:', sessionError);
      // Don't fail login if session creation fails
    }

    // Log successful login
    await logAuth('login_success', { 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      role: user.role 
    }, req.ip).catch(err => 
      console.error(`[Auth:Login] Failed to log auth success:`, err)
    );

    console.log(`[Auth:Login] Request ${requestId} - Login successful for user: ${user.username}`, {
      userId: user.id,
      role: user.role,
      tokenGenerated: !!token
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error(`[Auth:Login] Request ${requestId} - Login error:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    });
    
    // Ensure error response is sent
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        requestId: requestId,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } else {
      console.error(`[Auth:Login] Request ${requestId} - Cannot send error response - headers already sent`);
    }
  }
});

// Password validation helper
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return { valid: errors.length === 0, errors };
}

// Check for duplicate username or email
router.post('/check-availability', async (req, res) => {
  try {
    const { username, email } = req.body;
    
    const usernameCheck = username ? await query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    ) : { rows: [] };
    
    const emailCheck = email ? await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    ) : { rows: [] };
    
    res.json({
      usernameAvailable: usernameCheck.rows.length === 0,
      emailAvailable: emailCheck.rows.length === 0
    });
  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration endpoint - NO ROLE REQUIRED
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, email } = req.body;

    // Validate required fields
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    // Check for duplicates
    const duplicateCheck = await query(
      'SELECT username, email FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (duplicateCheck.rows.length > 0) {
      const duplicate = duplicateCheck.rows[0];
      if (duplicate.username === username) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      if (duplicate.email === email) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get client IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    // Insert new user with 'pending' role (awaiting admin assignment)
    const result = await query(
      `INSERT INTO users (username, password, name, email, role, registration_ip, registration_date) 
       VALUES ($1, $2, $3, $4, 'pending', $5, CURRENT_TIMESTAMP) 
       RETURNING id, username, name, email, role, created_at`,
      [username, hashedPassword, name, email, clientIp]
    );

    const user = result.rows[0];

    // Log the new registration
    console.log(`[REGISTRATION] New user registered: ${username} (${email}) from IP: ${clientIp}`);
    
    // Log registration to audit log
    await logAuth('login_success', {
      id: user.id,
      username: user.username,
      email: user.email,
      role: 'pending'
    }, req.ip);

    // Return success WITHOUT auto-login (user needs admin to assign role first)
    res.status(201).json({
      success: true,
      message: 'Registration successful! An administrator will review your account and assign your role. You will be able to log in once your account is activated.',
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        status: 'pending_approval'
      }
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
router.post('/logout', async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        await deleteSession(token);
        console.log('[Auth] Session deleted on logout');
      } catch (sessionError) {
        console.error('[Auth] Failed to delete session on logout:', sessionError);
        // Don't fail logout if session deletion fails
      }
    }

    // Log logout event
    if (req.user) {
      await logAuth('logout', {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      }, req.ip);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify current token (even if expired, we'll still check it's valid)
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production',
        { ignoreExpiration: true } // Allow expired tokens for refresh
      ) as any;

      // Get fresh user data from database
      const result = await query(
        'SELECT id, username, role FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = result.rows[0];

      // Issue new token
      const newToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production',
        { expiresIn: '20m' }
      );

      // Delete old session and create new one
      try {
        await deleteSession(token);
        await createSession(user.id, newToken, req as AuthRequest, 1200);
      } catch (sessionError) {
        console.error('[Auth] Failed to update session on refresh:', sessionError);
      }

      // Log token refresh
      await logAuth('token_refresh', {
        id: user.id,
        username: user.username,
        role: user.role
      }, req.ip);

      console.log(`[Auth] Token refreshed for user: ${user.username}`);

      res.json({ token: newToken });
    } catch (jwtError) {
      console.error('[Auth] Token refresh failed - invalid token:', jwtError);
      return res.status(403).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('[Auth] Token refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

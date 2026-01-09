/**
 * User Routes
 * Handles user management operations (CRUD)
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { userRepository } from '../database/repositories';

const router = Router();

router.use(authenticateToken);

// Get all users
router.get('/', async (req: AuthRequest, res) => {
  try {
    const users = await userRepository.findAllSafe();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = await userRepository.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password before sending
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user (admin and developer)
router.post('/', authorize('admin', 'developer'), async (req: AuthRequest, res) => {
  try {
    const { username, password, name, email, role } = req.body;

    if (!username || !password || !name || !email || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if email already exists
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await userRepository.create({
      username,
      name,
      email,
      password: hashedPassword,
      role
    });

    res.status(201).json(user);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user (admin and developer)
router.put('/:id', authorize('admin', 'developer'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;

    if (password) {
      // If password is provided, hash it and update
      const hashedPassword = await bcrypt.hash(password, 10);
      await userRepository.updatePassword(id, hashedPassword);
    }

    // Update other fields
    const user = await userRepository.update(id, { name, email, role });

    res.json(user);
  } catch (error: any) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (admin and developer)
router.delete('/:id', authorize('admin', 'developer'), async (req: AuthRequest, res) => {
  try {
    const { id} = req.params;

    // Check if user exists and get email (we use email, not username in User model)
    const user = await userRepository.findById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Cannot delete system admin
    if (user.email === 'admin@example.com') {
      return res.status(403).json({ error: 'Cannot delete the system admin user' });
    }

    await userRepository.delete(id);

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

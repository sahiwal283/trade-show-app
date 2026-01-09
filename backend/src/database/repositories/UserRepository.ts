/**
 * User Repository
 * 
 * Handles all database operations for users.
 */

import { BaseRepository } from './BaseRepository';
import { NotFoundError } from '../../utils/errors';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface UserWithoutPassword extends Omit<User, 'password'> {
  username: string;
}

export class UserRepository extends BaseRepository<User> {
  protected tableName = 'users';

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.executeQuery<User>(
      `SELECT * FROM ${this.tableName} WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email (without password)
   */
  async findByEmailSafe(email: string): Promise<UserWithoutPassword | null> {
    const result = await this.executeQuery<UserWithoutPassword>(
      `SELECT id, username, name, email, role, created_at, updated_at 
       FROM ${this.tableName} 
       WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find all users by role
   */
  async findByRole(role: string): Promise<UserWithoutPassword[]> {
    const result = await this.executeQuery<UserWithoutPassword>(
      `SELECT id, username, name, email, role, created_at, updated_at 
       FROM ${this.tableName} 
       WHERE role = $1 
       ORDER BY name ASC`,
      [role]
    );
    return result.rows;
  }

  /**
   * Find all users (without passwords)
   */
  async findAllSafe(): Promise<UserWithoutPassword[]> {
    const result = await this.executeQuery<UserWithoutPassword>(
      `SELECT id, username, name, email, role, created_at, updated_at 
       FROM ${this.tableName} 
       ORDER BY name ASC`
    );
    return result.rows;
  }

  /**
   * Create new user
   */
  async create(data: {
    username: string;
    name: string;
    email: string;
    password: string;
    role: string;
  }): Promise<UserWithoutPassword> {
    const result = await this.executeQuery<User>(
      `INSERT INTO ${this.tableName} (username, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, name, email, role, created_at, updated_at`,
      [data.username, data.name, data.email, data.password, data.role]
    );
    return result.rows[0];
  }

  /**
   * Update user
   */
  async update(id: string, data: {
    name?: string;
    email?: string;
    role?: string;
  }): Promise<UserWithoutPassword> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.email) {
      fields.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.role) {
      fields.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await this.executeQuery<User>(
      `UPDATE ${this.tableName} 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramIndex}
       RETURNING id, username, name, email, role, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User', id);
    }

    return result.rows[0];
  }

  /**
   * Update user password
   */
  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET password = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [hashedPassword, id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('User', id);
    }
  }

  /**
   * Count users by role
   */
  async countByRole(role: string): Promise<number> {
    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE role = $1`,
      [role]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    let query = `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE email = $1`;
    const params: any[] = [email];

    if (excludeUserId) {
      query += ' AND id != $2';
      params.push(excludeUserId);
    }

    query += ') as exists';

    const result = await this.executeQuery<{ exists: boolean }>(query, params);
    return result.rows[0].exists;
  }
}

// Export singleton instance
export const userRepository = new UserRepository();



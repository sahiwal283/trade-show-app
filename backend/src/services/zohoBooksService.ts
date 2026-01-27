/**
 * @deprecated This service has been replaced by zohoIntegrationClient.ts
 * which communicates with the shared Zoho Integration Service.
 * 
 * This file is kept for reference/rollback purposes only.
 * Do not use in new code - use zohoIntegrationClient instead.
 * 
 * Migration Date: January 27, 2026
 * New Service: http://192.168.1.205:8000
 * 
 * ============================================================
 * LEGACY: Zoho Books API Integration Service
 * 
 * This service handles all interactions with the Zoho Books API, including:
 * - OAuth token management and refresh
 * - Expense creation with receipt attachments
 * - Error handling and retry logic
 * - Duplicate prevention
 * 
 * @see https://www.zoho.com/books/api/v3/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// ========== CONFIGURATION ==========

interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  apiBaseUrl: string;
  accountsBaseUrl: string;
  expenseAccountName: string;
  paidThroughAccountName: string;
}

interface ZohoTokens {
  accessToken: string;
  expiresAt: number; // Unix timestamp
}

// ========== ZOHO BOOKS SERVICE ==========

class ZohoBooksService {
  private config: ZohoConfig;
  private tokens: ZohoTokens | null = null;
  private apiClient: AxiosInstance;
  private submittedExpenses: Set<string> = new Set(); // Track submitted expense IDs

  constructor() {
    // Load configuration from environment variables
    this.config = {
      clientId: process.env.ZOHO_CLIENT_ID || '',
      clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
      refreshToken: process.env.ZOHO_REFRESH_TOKEN || '',
      organizationId: process.env.ZOHO_ORGANIZATION_ID || '',
      apiBaseUrl: process.env.ZOHO_API_BASE_URL || 'https://www.zohoapis.com/books/v3',
      accountsBaseUrl: process.env.ZOHO_ACCOUNTS_BASE_URL || 'https://accounts.zoho.com/oauth/v2',
      expenseAccountName: process.env.ZOHO_EXPENSE_ACCOUNT_NAME || 'Expense Account',
      paidThroughAccountName: process.env.ZOHO_PAID_THROUGH_ACCOUNT || 'Petty Cash',
    };

    // Validate required configuration
    this.validateConfig();

    // Create axios instance for API calls
    this.apiClient = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to inject access token
    this.apiClient.interceptors.request.use(
      async (config) => {
        const token = await this.getValidAccessToken();
        config.headers.Authorization = `Zoho-oauthtoken ${token}`;
        config.params = {
          ...config.params,
          organization_id: this.config.organizationId,
        };
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  // ========== CONFIGURATION VALIDATION ==========

  private validateConfig(): void {
    const required = [
      'clientId',
      'clientSecret',
      'refreshToken',
      'organizationId',
    ];

    const missing = required.filter((key) => !this.config[key as keyof ZohoConfig]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required Zoho Books configuration: ${missing.join(', ')}. ` +
        `Please set the following environment variables: ${missing.map(k => `ZOHO_${k.toUpperCase()}`).join(', ')}`
      );
    }
  }

  public isConfigured(): boolean {
    try {
      this.validateConfig();
      return true;
    } catch {
      return false;
    }
  }

  // ========== OAUTH TOKEN MANAGEMENT ==========

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getValidAccessToken(): Promise<string> {
    // If we have a valid token, use it
    if (this.tokens && Date.now() < this.tokens.expiresAt) {
      return this.tokens.accessToken;
    }

    // Otherwise, refresh the token
    return await this.refreshAccessToken();
  }

  /**
   * Refresh the OAuth access token using the refresh token
   */
  private async refreshAccessToken(): Promise<string> {
    try {
      console.log('[Zoho] Refreshing access token...');

      const response = await axios.post(
        `${this.config.accountsBaseUrl}/token`,
        null,
        {
          params: {
            refresh_token: this.config.refreshToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            grant_type: 'refresh_token',
          },
        }
      );

      const { access_token, expires_in } = response.data;

      // Store token with expiry (expires_in is in seconds, subtract 5 minutes for safety)
      this.tokens = {
        accessToken: access_token,
        expiresAt: Date.now() + (expires_in - 300) * 1000,
      };

      console.log('[Zoho] Access token refreshed successfully');
      return access_token;
    } catch (error) {
      console.error('[Zoho] Failed to refresh access token:', error);
      throw new Error(`Failed to refresh Zoho OAuth token: ${this.getErrorMessage(error)}`);
    }
  }

  // ========== EXPENSE MANAGEMENT ==========

  /**
   * Create an expense in Zoho Books with receipt attachment
   */
  public async createExpense(expenseData: {
    expenseId: string; // Our internal expense ID
    date: string;
    amount: number;
    category: string;
    merchant: string;
    description?: string;
    userName: string;
    eventName?: string;
    receiptPath?: string;
    reimbursementRequired: boolean;
  }): Promise<{ success: boolean; zohoExpenseId?: string; error?: string }> {
    try {
      // Duplicate prevention check
      if (this.submittedExpenses.has(expenseData.expenseId)) {
        console.log(`[Zoho] Expense ${expenseData.expenseId} already submitted to Zoho Books`);
        return {
          success: true,
          error: 'Already submitted (duplicate prevented)',
        };
      }

      console.log(`[Zoho] Creating expense for ${expenseData.merchant} - $${expenseData.amount}`);

      // Step 1: Create the expense
      // Note: customer_name and project_name removed because they must exist in Zoho Books first
      // User and event info is included in the description instead
      
      // Ensure date is in YYYY-MM-DD format for Zoho
      let formattedDate: string;
      const dateValue: any = expenseData.date;
      
      if (typeof dateValue === 'object' && dateValue !== null) {
        // Handle Date object
        const d = new Date(dateValue);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
      } else if (typeof dateValue === 'string') {
        if (dateValue.includes('T')) {
          // ISO string - extract date part
          formattedDate = dateValue.split('T')[0];
        } else {
          // Already formatted
          formattedDate = dateValue;
        }
      } else {
        // Fallback - convert to string and try to parse
        formattedDate = new Date(dateValue).toISOString().split('T')[0];
      }
      
      console.log(`[Zoho] Expense date: ${dateValue} → Formatted: ${formattedDate}`);
      
      const expensePayload: any = {
        date: formattedDate, // Zoho API expects 'date' field (not 'expense_date')
        amount: expenseData.amount,
        vendor_name: expenseData.merchant,
        description: this.buildDescription(expenseData),
        is_billable: false, // Set to false since we don't have projects configured in Zoho
        is_inclusive_tax: false,
      };

      // Add event name to reference field (merchant is already in description and vendor_name)
      // Zoho has a 50 character limit on reference_number
      if (expenseData.eventName) {
        expensePayload.reference_number = expenseData.eventName.length > 50 
          ? expenseData.eventName.substring(0, 47) + '...' 
          : expenseData.eventName;
      }

      // Use account IDs if provided (more reliable), otherwise fall back to names
      const expenseAccountId = process.env.ZOHO_EXPENSE_ACCOUNT_ID;
      const paidThroughAccountId = process.env.ZOHO_PAID_THROUGH_ACCOUNT_ID;

      if (expenseAccountId) {
        expensePayload.account_id = expenseAccountId;
      } else {
        expensePayload.account_name = this.config.expenseAccountName;
      }

      if (paidThroughAccountId) {
        expensePayload.paid_through_account_id = paidThroughAccountId;
      } else {
        expensePayload.paid_through_account_name = this.config.paidThroughAccountName;
      }

      // Only include customer/project if they already exist in Zoho Books
      // For now, we skip them to avoid 404 errors
      // TODO: Future enhancement - create customers/projects via API if they don't exist

      const createResponse = await this.apiClient.post('/expenses', expensePayload);

      // Log the full API response to understand how Zoho is interpreting our data
      console.log(`[Zoho] API Response:`, JSON.stringify(createResponse.data, null, 2));

      if (createResponse.data.code !== 0) {
        throw new Error(`Zoho API error: ${createResponse.data.message}`);
      }

      const zohoExpenseId = createResponse.data.expense.expense_id;
      const zohoExpenseDate = createResponse.data.expense.date || createResponse.data.expense.expense_date;
      console.log(`[Zoho] Expense created with ID: ${zohoExpenseId}`);
      console.log(`[Zoho] ⚠️  DATE CHECK: We sent: ${formattedDate}, Zoho stored: ${zohoExpenseDate}`);

      // Step 2: Upload receipt if available
      if (expenseData.receiptPath && fs.existsSync(expenseData.receiptPath)) {
        await this.attachReceipt(zohoExpenseId, expenseData.receiptPath);
      }

      // Mark as submitted
      this.submittedExpenses.add(expenseData.expenseId);

      return {
        success: true,
        zohoExpenseId,
      };
    } catch (error) {
      console.error('[Zoho] Failed to create expense:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Attach a receipt to an existing Zoho expense
   */
  private async attachReceipt(zohoExpenseId: string, receiptPath: string): Promise<void> {
    try {
      console.log(`[Zoho] Attaching receipt to expense ${zohoExpenseId}`);

      // Get a fresh access token
      const accessToken = await this.getValidAccessToken();

      // Create form data with file
      const formData = new FormData();
      formData.append('receipt', fs.createReadStream(receiptPath), {
        filename: path.basename(receiptPath),
      });

      // Upload receipt
      const response = await axios.post(
        `${this.config.apiBaseUrl}/expenses/${zohoExpenseId}/receipt`,
        formData,
        {
          params: {
            organization_id: this.config.organizationId,
          },
          headers: {
            ...formData.getHeaders(),
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
          timeout: 30000,
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`Failed to attach receipt: ${response.data.message}`);
      }

      console.log(`[Zoho] Receipt attached successfully`);
    } catch (error) {
      console.error('[Zoho] Failed to attach receipt:', error);
      // Don't throw - expense was created, receipt attachment is secondary
      console.warn('[Zoho] Continuing despite receipt attachment failure');
    }
  }

  // ========== HELPER METHODS ==========

  /**
   * Build a descriptive expense description
   */
  private buildDescription(expenseData: {
    category: string;
    description?: string;
    eventName?: string;
    userName: string;
    merchant: string;
  }): string {
    const parts = [
      `User: ${expenseData.userName}`,
      `Merchant: ${expenseData.merchant}`,
      `Category: ${expenseData.category}`,
      expenseData.eventName ? `Event: ${expenseData.eventName}` : null,
      expenseData.description || null,
    ].filter(Boolean);

    return parts.join(' | ');
  }

  /**
   * Extract error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.data) {
        const data = axiosError.response.data as any;
        return data.message || data.error || JSON.stringify(data);
      }
      return axiosError.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Check if Zoho Books integration is enabled and configured
   */
  public async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      if (!this.isConfigured()) {
        return {
          healthy: false,
          message: 'Zoho Books not configured (missing environment variables)',
        };
      }

      // Try to get a valid token
      await this.getValidAccessToken();

      // Try to fetch organization info
      const response = await this.apiClient.get('/organizations');

      if (response.data.code === 0) {
        return {
          healthy: true,
          message: `Connected to Zoho Books (Org: ${this.config.organizationId})`,
        };
      }

      return {
        healthy: false,
        message: `Zoho API returned error: ${response.data.message}`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${this.getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Clear the duplicate prevention cache (useful for testing)
   */
  public clearSubmittedCache(): void {
    this.submittedExpenses.clear();
    console.log('[Zoho] Cleared submitted expenses cache');
  }
}

// Export singleton instance
export const zohoBooksService = new ZohoBooksService();
export default zohoBooksService;


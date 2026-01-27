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
 * LEGACY: Multi-Account Zoho Books Service
 * 
 * Manages multiple Zoho Books accounts (one per entity) with support for:
 * - Real Zoho API integration
 * - Mock/placeholder accounts for testing
 * - Seamless switching between mock and real accounts
 * 
 * Usage:
 * - Sandbox: Use mock accounts for entities without real Zoho setups
 * - Production: Replace mock configs with real credentials (no code changes)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { ZohoAccountConfig, getZohoAccountForEntity, getEnabledZohoAccounts } from '../config/zohoAccounts';

interface ZohoTokens {
  accessToken: string;
  expiresAt: number;
}

interface ExpenseData {
  expenseId: string;
  date: string | Date; // Can be string or Date object from database
  amount: number;
  category: string;
  merchant: string;
  description?: string;
  userName: string;
  eventName?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  receiptPath?: string;
  reimbursementRequired: boolean;
}

interface SubmissionResult {
  success: boolean;
  zohoExpenseId?: string;
  error?: string;
  mock?: boolean;
}

/**
 * Single Zoho Account Handler (Real or Mock)
 */
class ZohoAccountHandler {
  private config: ZohoAccountConfig;
  private tokens: ZohoTokens | null = null;
  private apiClient: AxiosInstance | null = null;
  private submittedExpenses: Set<string> = new Set();
  private mockExpenseCounter: number = 1;

  constructor(config: ZohoAccountConfig) {
    this.config = config;

    if (!this.config.mock) {
      // Real API client
      this.apiClient = axios.create({
        baseURL: this.config.apiBaseUrl,
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      this.apiClient.interceptors.request.use(
        async (config) => {
          const token = await this.getValidAccessToken();
          console.log(`[Zoho:${this.config.entityName}:DEBUG] Access token type:`, typeof token);
          console.log(`[Zoho:${this.config.entityName}:DEBUG] Access token value:`, token ? `${token.substring(0, 20)}...${token.substring(token.length - 10)}` : 'UNDEFINED');
          console.log(`[Zoho:${this.config.entityName}:DEBUG] Organization ID: ${this.config.organizationId}`);
          if (!token) {
            throw new Error('Access token is undefined - token refresh may have failed');
          }
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
  }

  // ========== TOKEN MANAGEMENT (Real Accounts Only) ==========

  private async getValidAccessToken(): Promise<string> {
    if (this.config.mock) {
      return 'mock_access_token';
    }

    if (this.tokens && Date.now() < this.tokens.expiresAt) {
      return this.tokens.accessToken;
    }

    return await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    try {
      console.log(`[Zoho:${this.config.entityName}] Refreshing access token...`);
      console.log(`[Zoho:${this.config.entityName}:DEBUG] Refresh token: ${this.config.refreshToken?.substring(0, 20)}...`);

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

      console.log(`[Zoho:${this.config.entityName}:DEBUG] Refresh response:`, response.data);
      
      const { access_token, expires_in } = response.data;
      console.log(`[Zoho:${this.config.entityName}:DEBUG] Extracted access_token: ${access_token ? access_token.substring(0, 20) + '...' : 'UNDEFINED'}`);
      console.log(`[Zoho:${this.config.entityName}:DEBUG] Extracted expires_in: ${expires_in}`);
      
      this.tokens = {
        accessToken: access_token,
        expiresAt: Date.now() + (expires_in - 300) * 1000,
      };

      console.log(`[Zoho:${this.config.entityName}] Access token refreshed successfully`);
      console.log(`[Zoho:${this.config.entityName}:DEBUG] Returning token: ${access_token ? access_token.substring(0, 20) + '...' : 'UNDEFINED'}`);
      return access_token;
    } catch (error) {
      console.error(`[Zoho:${this.config.entityName}] Failed to refresh token:`, error);
      throw new Error(`Failed to refresh OAuth token: ${this.getErrorMessage(error)}`);
    }
  }

  // ========== EXPENSE SUBMISSION ==========

  public async createExpense(expenseData: ExpenseData): Promise<SubmissionResult> {
    // Duplicate prevention
    if (this.submittedExpenses.has(expenseData.expenseId)) {
      console.log(`[Zoho:${this.config.entityName}] Expense ${expenseData.expenseId} already submitted`);
      return { success: true, error: 'Already submitted (duplicate prevented)' };
    }

    if (this.config.mock) {
      return await this.createMockExpense(expenseData);
    } else {
      return await this.createRealExpense(expenseData);
    }
  }

  // ========== MOCK MODE ==========

  private async createMockExpense(expenseData: ExpenseData): Promise<SubmissionResult> {
    try {
      console.log(`[Zoho:${this.config.entityName}:MOCK] Creating mock expense for ${expenseData.merchant} - $${expenseData.amount}`);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Generate realistic mock Zoho expense ID
      const mockZohoId = `MOCK-${this.config.entityName.toUpperCase()}-${Date.now()}-${this.mockExpenseCounter++}`;

      // Simulate receipt attachment
      if (expenseData.receiptPath) {
        console.log(`[Zoho:${this.config.entityName}:MOCK] Mock receipt attachment simulated`);
      }

      // Mark as submitted
      this.submittedExpenses.add(expenseData.expenseId);

      console.log(`[Zoho:${this.config.entityName}:MOCK] Mock expense created with ID: ${mockZohoId}`);
      console.log(`[Zoho:${this.config.entityName}:MOCK] Mock organization: ${this.config.organizationName} (${this.config.organizationId})`);

      return {
        success: true,
        zohoExpenseId: mockZohoId,
        mock: true,
      };
    } catch (error) {
      console.error(`[Zoho:${this.config.entityName}:MOCK] Mock expense creation failed:`, error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        mock: true,
      };
    }
  }

  // ========== REAL API MODE ==========

  private async createRealExpense(expenseData: ExpenseData): Promise<SubmissionResult> {
    try {
      console.log(`[Zoho:${this.config.entityName}:REAL] Creating expense for ${expenseData.merchant} - $${expenseData.amount}`);

      if (!this.apiClient) {
        throw new Error('API client not initialized');
      }

      // Create expense
      // Note: customer_name and project_name removed because they must exist in Zoho Books first
      // User and event info is included in the description instead
      
      // DATE FORMATTING INVESTIGATION:
      // Issue: Zoho Books showing current date instead of expense date
      // Tried: YYYY-MM-DD format (standard) - still shows wrong date
      // Research: Zoho Books syncs in organization's timezone (help.databox.com/zoho-books)
      // Next: Try ISO 8601 with timezone to prevent timezone conversion
      
      // Ensure date is in proper format for Zoho
      let formattedDate: string;
      const dateValue: any = expenseData.date;
      
      // Toggle for testing different date formats (set via env var)
      const USE_ISO_DATE_FORMAT = process.env.ZOHO_USE_ISO_DATE === 'true';
      
      if (typeof dateValue === 'object' && dateValue !== null) {
        // Handle Date object
        const d = new Date(dateValue);
        
        if (USE_ISO_DATE_FORMAT) {
          // ISO 8601 format with timezone: 2025-10-07T00:00:00Z
          // This explicitly sets UTC midnight to prevent timezone conversion
          formattedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00Z`;
        } else {
          // Standard YYYY-MM-DD format (current approach)
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          formattedDate = `${year}-${month}-${day}`;
        }
      } else if (typeof dateValue === 'string') {
        if (USE_ISO_DATE_FORMAT) {
          // Convert to ISO 8601 with timezone
          if (dateValue.includes('T')) {
            // Already ISO format, ensure it has timezone
            formattedDate = dateValue.endsWith('Z') ? dateValue : `${dateValue}Z`;
          } else {
            // YYYY-MM-DD format, add time and timezone
            formattedDate = `${dateValue}T00:00:00Z`;
          }
        } else {
          // Standard format
          if (dateValue.includes('T')) {
            // ISO string - extract date part
            formattedDate = dateValue.split('T')[0];
          } else {
            // Already formatted
            formattedDate = dateValue;
          }
        }
      } else {
        // Fallback - convert to string and try to parse
        if (USE_ISO_DATE_FORMAT) {
          formattedDate = new Date(dateValue).toISOString(); // Full ISO with timezone
        } else {
          formattedDate = new Date(dateValue).toISOString().split('T')[0];
        }
      }
      
      const entityLabel = this.config.mock ? `${this.config.entityName}:MOCK` : `${this.config.entityName}:REAL`;
      const dateFormat = USE_ISO_DATE_FORMAT ? 'ISO-8601+TZ' : 'YYYY-MM-DD';
      console.log(`[Zoho:${entityLabel}] Expense date: ${dateValue} → Formatted (${dateFormat}): ${formattedDate}`);
      
      const expensePayload: any = {
        date: formattedDate, // Zoho API expects 'date' field (not 'expense_date')
        amount: expenseData.amount,
        vendor_name: expenseData.merchant,
        description: this.buildDescription(expenseData),
        is_billable: false, // Set to false since we don't have projects configured in Zoho
        is_inclusive_tax: false,
      };
      
      console.log(`[Zoho:${entityLabel}] Payload date: ${expensePayload.date}`);
      console.log(`[Zoho:${entityLabel}] Full payload:`, JSON.stringify(expensePayload, null, 2));

      // Add event name to reference field (merchant is already in description and vendor_name)
      // Zoho has a 50 character limit on reference_number
      if (expenseData.eventName) {
        expensePayload.reference_number = expenseData.eventName.length > 50 
          ? expenseData.eventName.substring(0, 47) + '...' 
          : expenseData.eventName;
      }

      // Use account IDs if provided in config (more reliable), otherwise fall back to names
      const expenseAccountId = this.config.expenseAccountId;
      const paidThroughAccountId = this.config.paidThroughAccountId;
      
      console.log(`[Zoho:${entityLabel}] Entity-specific Account IDs - Expense: ${expenseAccountId || 'NOT SET'}, Paid Through: ${paidThroughAccountId || 'NOT SET'}`);

      if (expenseAccountId) {
        expensePayload.account_id = expenseAccountId;
        console.log(`[Zoho:${entityLabel}] Using account_id: ${expenseAccountId}`);
      } else {
        expensePayload.account_name = this.config.expenseAccountName;
        console.log(`[Zoho:${entityLabel}] Using account_name: ${this.config.expenseAccountName}`);
      }

      if (paidThroughAccountId) {
        expensePayload.paid_through_account_id = paidThroughAccountId;
        console.log(`[Zoho:${entityLabel}] Using paid_through_account_id: ${paidThroughAccountId}`);
      } else {
        expensePayload.paid_through_account_name = this.config.paidThroughAccountName;
        console.log(`[Zoho:${entityLabel}] Using paid_through_account_name: ${this.config.paidThroughAccountName}`);
      }

      // Only include customer/project if they already exist in Zoho Books
      // For now, we skip them to avoid 404 errors
      // TODO: Future enhancement - create customers/projects via API if they don't exist

      const createResponse = await this.apiClient.post('/expenses', expensePayload);

      // Log the full API response to understand how Zoho is interpreting our data
      console.log(`[Zoho:${this.config.entityName}:REAL] API Response:`, JSON.stringify(createResponse.data, null, 2));

      if (createResponse.data.code !== 0) {
        throw new Error(`Zoho API error: ${createResponse.data.message}`);
      }

      const zohoExpenseId = createResponse.data.expense.expense_id;
      const zohoExpenseDate = createResponse.data.expense.date || createResponse.data.expense.expense_date;
      console.log(`[Zoho:${this.config.entityName}:REAL] Expense created with ID: ${zohoExpenseId}`);
      console.log(`[Zoho:${this.config.entityName}:REAL] ⚠️  DATE CHECK: We sent: ${formattedDate}, Zoho stored: ${zohoExpenseDate}`);

      // Attach receipt if available
      if (expenseData.receiptPath) {
        if (fs.existsSync(expenseData.receiptPath)) {
          console.log(`[Zoho:${this.config.entityName}:REAL] 📎 Receipt file found: ${path.basename(expenseData.receiptPath)}`);
          await this.attachReceipt(zohoExpenseId, expenseData.receiptPath);
        } else {
          console.warn(`[Zoho:${this.config.entityName}:REAL] ⚠️  Receipt file not found: ${expenseData.receiptPath}`);
        }
      } else {
        console.log(`[Zoho:${this.config.entityName}:REAL] No receipt provided for expense ${expenseData.expenseId}`);
      }

      // Mark as submitted
      this.submittedExpenses.add(expenseData.expenseId);

      return {
        success: true,
        zohoExpenseId,
        mock: false,
      };
    } catch (error) {
      console.error(`[Zoho:${this.config.entityName}:REAL] Failed to create expense:`, error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        mock: false,
      };
    }
  }

  private async attachReceipt(zohoExpenseId: string, receiptPath: string): Promise<void> {
    try {
      const fileName = path.basename(receiptPath);
      const fileStats = fs.statSync(receiptPath);
      const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
      
      console.log(`[Zoho:${this.config.entityName}:REAL] 📎 Attaching receipt to expense ${zohoExpenseId}`);
      console.log(`[Zoho:${this.config.entityName}:REAL]    File: ${fileName} (${fileSizeMB} MB)`);

      const accessToken = await this.getValidAccessToken();
      const formData = new FormData();
      formData.append('receipt', fs.createReadStream(receiptPath), {
        filename: fileName,
      });

      const uploadStartTime = Date.now();
      const response = await axios.post(
        `${this.config.apiBaseUrl}/expenses/${zohoExpenseId}/receipt`,
        formData,
        {
          params: { organization_id: this.config.organizationId },
          headers: {
            ...formData.getHeaders(),
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
          timeout: 30000,
        }
      );

      const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(2);

      if (response.data.code !== 0) {
        throw new Error(`Failed to attach receipt: ${response.data.message}`);
      }

      console.log(`[Zoho:${this.config.entityName}:REAL] ✅ Receipt attached successfully in ${uploadDuration}s`);
      console.log(`[Zoho:${this.config.entityName}:REAL]    Zoho Response:`, JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      console.error(`[Zoho:${this.config.entityName}:REAL] ❌ Failed to attach receipt:`, error.message);
      if (error.response) {
        console.error(`[Zoho:${this.config.entityName}:REAL]    Status: ${error.response.status}`);
        console.error(`[Zoho:${this.config.entityName}:REAL]    Response:`, JSON.stringify(error.response.data, null, 2));
      }
      console.warn(`[Zoho:${this.config.entityName}:REAL]    ⚠️  Continuing despite receipt attachment failure - expense will exist without receipt`);
    }
  }

  // ========== HEALTH CHECK ==========

  public async healthCheck(): Promise<{ healthy: boolean; message: string; mock: boolean }> {
    try {
      if (this.config.mock) {
        return {
          healthy: true,
          message: `Mock account configured for ${this.config.organizationName} (${this.config.organizationId})`,
          mock: true,
        };
      }

      if (!this.apiClient) {
        return {
          healthy: false,
          message: 'API client not initialized',
          mock: false,
        };
      }

      await this.getValidAccessToken();
      const response = await this.apiClient.get('/organizations');

      if (response.data.code === 0) {
        return {
          healthy: true,
          message: `Connected to ${this.config.organizationName} (${this.config.organizationId})`,
          mock: false,
        };
      }

      return {
        healthy: false,
        message: `Zoho API error: ${response.data.message}`,
        mock: false,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${this.getErrorMessage(error)}`,
        mock: false,
      };
    }
  }

  // ========== HELPER METHODS ==========

  private buildDescription(expenseData: ExpenseData): string {
    // Format event name with dates if available
    let eventInfo = null;
    if (expenseData.eventName) {
      if (expenseData.eventStartDate && expenseData.eventEndDate) {
        // Format dates as MM/DD/YY
        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          const year = date.getFullYear().toString().slice(-2);
          return `${month}/${day}/${year}`;
        };
        const startFormatted = formatDate(expenseData.eventStartDate);
        const endFormatted = formatDate(expenseData.eventEndDate);
        eventInfo = `${expenseData.eventName} (${startFormatted} - ${endFormatted})`;
      } else {
        eventInfo = `${expenseData.eventName}`;
      }
    }

    const parts = [
      `User: ${expenseData.userName}`,
      `Merchant: ${expenseData.merchant}`,
      `Category: ${expenseData.category}`,
      eventInfo,
      expenseData.description || null,
    ].filter(Boolean);
    return parts.join(' | ');
  }

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

  public clearSubmittedCache(): void {
    this.submittedExpenses.clear();
  }

  /**
   * Check if this is a mock account
   */
  public isMock(): boolean {
    return this.config.mock;
  }

  /**
   * Fetch Chart of Accounts from Zoho Books API
   */
  public async fetchChartOfAccounts(): Promise<any[]> {
    if (this.config.mock) {
      throw new Error('Cannot fetch real accounts from mock handler');
    }

    if (!this.apiClient) {
      throw new Error('API client not initialized');
    }

    try {
      const response = await this.apiClient.get('/chartofaccounts');
      
      if (response.data.code !== 0) {
        throw new Error(`Zoho API error: ${response.data.message}`);
      }

      return response.data.chartofaccounts || [];
    } catch (error) {
      console.error('[Zoho] Failed to fetch chart of accounts:', error);
      throw error;
    }
  }
}

/**
 * Multi-Account Zoho Books Service Manager
 */
class ZohoMultiAccountService {
  private accountHandlers: Map<string, ZohoAccountHandler> = new Map();

  constructor() {
    this.initializeAccounts();
  }

  private initializeAccounts(): void {
    const accounts = getEnabledZohoAccounts();
    
    console.log(`[Zoho:MultiAccount] Initializing ${accounts.length} Zoho account(s)...`);
    
    for (const accountConfig of accounts) {
      const handler = new ZohoAccountHandler(accountConfig);
      this.accountHandlers.set(accountConfig.entityName.toLowerCase(), handler);
      
      const mode = accountConfig.mock ? 'MOCK' : 'REAL';
      console.log(`[Zoho:MultiAccount] ✓ ${accountConfig.entityName.toUpperCase()} - ${mode} - ${accountConfig.organizationName}`);
    }
    
    if (accounts.length === 0) {
      console.log('[Zoho:MultiAccount] No Zoho accounts configured');
    }
  }

  /**
   * Submit expense to appropriate Zoho account based on entity
   */
  public async createExpense(entityName: string, expenseData: ExpenseData): Promise<SubmissionResult> {
    const handler = this.accountHandlers.get(entityName.toLowerCase());

    if (!handler) {
      console.warn(`[Zoho:MultiAccount] No Zoho account configured for entity: ${entityName}`);
      return {
        success: false,
        error: `No Zoho account configured for entity: ${entityName}`,
      };
    }

    return await handler.createExpense(expenseData);
  }

  /**
   * Check if entity has Zoho integration configured
   */
  public isConfiguredForEntity(entityName: string): boolean {
    return this.accountHandlers.has(entityName.toLowerCase());
  }

  /**
   * Get health status for all accounts
   */
  public async getHealthStatus(): Promise<Map<string, any>> {
    const status = new Map();

    for (const [entityName, handler] of this.accountHandlers) {
      const health = await handler.healthCheck();
      status.set(entityName, health);
    }

    return status;
  }

  /**
   * Get health status for specific entity
   */
  public async getHealthForEntity(entityName: string): Promise<any> {
    const handler = this.accountHandlers.get(entityName.toLowerCase());
    
    if (!handler) {
      return {
        configured: false,
        healthy: false,
        message: `No Zoho account configured for entity: ${entityName}`,
      };
    }

    const health = await handler.healthCheck();
    return {
      configured: true,
      ...health,
    };
  }

  /**
   * Clear submission cache for all accounts
   */
  public clearAllCaches(): void {
    for (const handler of this.accountHandlers.values()) {
      handler.clearSubmittedCache();
    }
    console.log('[Zoho:MultiAccount] Cleared submission caches for all accounts');
  }

  /**
   * Get available Zoho Books account names from the API
   * Helps identify correct account names for configuration
   */
  public async getZohoAccountNames(): Promise<any> {
    // Use the 'haute' account to fetch available accounts
    const hauteHandler = this.accountHandlers.get('haute');
    
    if (!hauteHandler || hauteHandler.isMock()) {
      throw new Error('Real Zoho account not configured. Cannot fetch account names.');
    }

    try {
      const accounts = await hauteHandler.fetchChartOfAccounts();
      
      // Group accounts by type
      const grouped = {
        expense: accounts.filter((a: any) => 
          a.account_type?.toLowerCase() === 'expense'
        ).map((a: any) => ({ id: a.account_id, name: a.account_name })),
        
        cash: accounts.filter((a: any) => 
          a.account_type?.toLowerCase() === 'cash'
        ).map((a: any) => ({ id: a.account_id, name: a.account_name })),
        
        bank: accounts.filter((a: any) => 
          a.account_type?.toLowerCase() === 'bank'
        ).map((a: any) => ({ id: a.account_id, name: a.account_name })),
        
        all: accounts.map((a: any) => ({
          id: a.account_id,
          name: a.account_name,
          type: a.account_type,
          balance: a.balance || 0,
        })),
      };

      return {
        configured: {
          expense_account: process.env.ZOHO_EXPENSE_ACCOUNT_NAME || 'Not configured',
          paid_through_account: process.env.ZOHO_PAID_THROUGH_ACCOUNT || 'Not configured',
        },
        available: grouped,
        note: 'Use exact account names from "available" lists in your environment variables',
      };
    } catch (error) {
      console.error('[Zoho:MultiAccount] Failed to fetch account names:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const zohoMultiAccountService = new ZohoMultiAccountService();
export default zohoMultiAccountService;


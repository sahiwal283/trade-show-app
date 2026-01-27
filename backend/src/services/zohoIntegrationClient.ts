/**
 * Zoho Integration Client
 * 
 * Thin HTTP client that communicates with the shared Zoho Integration Service.
 * Replaces the embedded zohoMultiAccountService with centralized Zoho management.
 * 
 * Service: http://192.168.1.205:8000
 * Version: 1.0.0
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// ========== CONFIGURATION ==========

const ZOHO_SERVICE_URL = process.env.ZOHO_SERVICE_URL || 'http://192.168.1.205:8000';
const ZOHO_SERVICE_TOKEN = process.env.ZOHO_SERVICE_TOKEN || '';

// Entity name to brand mapping
const ENTITY_TO_BRAND: Record<string, string> = {
  'haute brands': 'haute_brands',
  'haute': 'haute_brands',
  'boomin brands': 'boomin_brands',
  'boomin': 'boomin_brands',
};

// ========== TYPES ==========

export interface ExpenseData {
  expenseId: string;
  date: string | Date;
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

export interface SubmissionResult {
  success: boolean;
  zohoExpenseId?: string;
  error?: string;
  mock?: boolean;
}

interface ZohoServiceResponse {
  data?: any;
  request_id?: string;
}

interface ZohoServiceError {
  detail?: {
    error?: {
      source?: string;
      code?: string;
      internal_code?: string;
      message?: string;
      request_id?: string;
    };
  };
}

// ========== CLIENT CLASS ==========

class ZohoIntegrationClient {
  private httpClient: AxiosInstance;
  private configuredBrands: Set<string> = new Set();

  constructor() {
    this.httpClient = axios.create({
      baseURL: ZOHO_SERVICE_URL,
      timeout: 60000, // 60 seconds for file uploads
    });

    // Log configuration on startup
    console.log(`[ZohoClient] Initialized with service URL: ${ZOHO_SERVICE_URL}`);
    console.log(`[ZohoClient] Token configured: ${ZOHO_SERVICE_TOKEN ? 'Yes' : 'No'}`);

    // Check which brands are configured (on startup)
    this.checkConfiguredBrands();
  }

  /**
   * Check which brands are configured in the shared service
   */
  private async checkConfiguredBrands(): Promise<void> {
    try {
      // Try to list organizations for each known brand
      for (const brand of Object.values(ENTITY_TO_BRAND)) {
        try {
          await this.httpClient.get('/zoho/organizations/list', {
            headers: this.getHeaders(brand),
          });
          this.configuredBrands.add(brand);
          console.log(`[ZohoClient] ✓ Brand "${brand}" is configured`);
        } catch (error) {
          const axiosError = error as AxiosError<ZohoServiceError>;
          if (axiosError.response?.status === 400 && 
              axiosError.response?.data?.detail?.error?.code === 'BRAND_NOT_FOUND') {
            console.log(`[ZohoClient] ✗ Brand "${brand}" is not configured`);
          } else if (axiosError.response?.status === 400 &&
                     axiosError.response?.data?.detail?.error?.code === 'PRODUCT_NOT_ENABLED') {
            // Brand exists but Books not enabled - still count as configured
            this.configuredBrands.add(brand);
            console.log(`[ZohoClient] ⚠ Brand "${brand}" exists but Books may not be enabled`);
          }
        }
      }
    } catch (error) {
      console.error('[ZohoClient] Failed to check configured brands:', error);
    }
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(brand: string): Record<string, string> {
    return {
      'X-Brand': brand,
      'X-Internal-Token': ZOHO_SERVICE_TOKEN,
    };
  }

  /**
   * Convert entity name to brand name
   */
  private entityToBrand(entityName: string): string | null {
    const normalized = entityName.toLowerCase().trim();
    return ENTITY_TO_BRAND[normalized] || null;
  }

  /**
   * Format date for Zoho API
   */
  private formatDate(date: string | Date): string {
    if (typeof date === 'string') {
      if (date.includes('T')) {
        return date.split('T')[0];
      }
      return date;
    }
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Check if entity has Zoho integration configured
   */
  public isConfiguredForEntity(entityName: string): boolean {
    const brand = this.entityToBrand(entityName);
    if (!brand) {
      console.log(`[ZohoClient] Unknown entity: ${entityName}`);
      return false;
    }
    return this.configuredBrands.has(brand);
  }

  /**
   * Create expense in Zoho Books via shared service
   */
  public async createExpense(entityName: string, expenseData: ExpenseData): Promise<SubmissionResult> {
    const brand = this.entityToBrand(entityName);
    
    if (!brand) {
      return {
        success: false,
        error: `Unknown entity: ${entityName}. Cannot map to Zoho brand.`,
      };
    }

    console.log(`[ZohoClient] Creating expense for ${brand}: ${expenseData.merchant} - $${expenseData.amount}`);

    try {
      // Build description with context
      let fullDescription = expenseData.description || '';
      if (expenseData.userName) {
        fullDescription = `Submitted by: ${expenseData.userName}${fullDescription ? ` | ${fullDescription}` : ''}`;
      }
      if (expenseData.eventName) {
        fullDescription += ` | Event: ${expenseData.eventName}`;
        if (expenseData.eventStartDate) {
          fullDescription += ` (${expenseData.eventStartDate}`;
          if (expenseData.eventEndDate) {
            fullDescription += ` - ${expenseData.eventEndDate}`;
          }
          fullDescription += ')';
        }
      }
      if (expenseData.reimbursementRequired) {
        fullDescription += ' | REIMBURSEMENT REQUIRED';
      }

      // Build reference number from event name (max 50 chars per Zoho limit)
      let referenceNumber = expenseData.eventName || expenseData.expenseId;
      if (referenceNumber && referenceNumber.length > 50) {
        referenceNumber = referenceNumber.substring(0, 47) + '...';
      }

      // Create expense via shared service
      // Note: account_id and paid_through_account_id will be added from shared service's extra_config
      const response = await this.httpClient.post<ZohoServiceResponse>(
        '/zoho/expenses/create_books',
        {
          date: this.formatDate(expenseData.date),
          amount: expenseData.amount,
          vendor_name: expenseData.merchant,
          description: fullDescription,
          reference_number: referenceNumber,
          is_billable: false,
          is_inclusive_tax: false,
        },
        {
          headers: {
            ...this.getHeaders(brand),
            'Content-Type': 'application/json',
          },
        }
      );

      const zohoExpenseId = response.data?.data?.expense?.expense_id;
      
      if (!zohoExpenseId) {
        console.error('[ZohoClient] No expense_id in response:', response.data);
        return {
          success: false,
          error: 'No expense_id returned from Zoho',
        };
      }

      console.log(`[ZohoClient] Expense created: ${zohoExpenseId}`);

      // Attach receipt if provided
      if (expenseData.receiptPath) {
        try {
          await this.attachReceipt(brand, zohoExpenseId, expenseData.receiptPath);
          console.log(`[ZohoClient] Receipt attached to expense ${zohoExpenseId}`);
        } catch (receiptError) {
          console.error(`[ZohoClient] Failed to attach receipt (expense still created):`, receiptError);
          // Don't fail the whole operation if receipt attachment fails
        }
      }

      return {
        success: true,
        zohoExpenseId,
      };

    } catch (error) {
      const axiosError = error as AxiosError<ZohoServiceError>;
      const errorMessage = axiosError.response?.data?.detail?.error?.message 
        || axiosError.message 
        || 'Unknown error';
      
      console.error(`[ZohoClient] Failed to create expense:`, {
        status: axiosError.response?.status,
        error: axiosError.response?.data?.detail?.error,
        message: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Attach receipt to expense
   */
  private async attachReceipt(brand: string, expenseId: string, receiptPath: string): Promise<void> {
    if (!fs.existsSync(receiptPath)) {
      console.warn(`[ZohoClient] Receipt file not found: ${receiptPath}`);
      return;
    }

    const formData = new FormData();
    const fileName = path.basename(receiptPath);
    const fileStream = fs.createReadStream(receiptPath);
    
    formData.append('receipt', fileStream, fileName);

    await this.httpClient.post(
      `/zoho/expenses/attach_receipt/${expenseId}`,
      formData,
      {
        headers: {
          ...this.getHeaders(brand),
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
  }

  /**
   * Get health status for all configured brands
   */
  public async getHealthStatus(): Promise<Map<string, any>> {
    const status = new Map<string, any>();

    for (const brand of this.configuredBrands) {
      try {
        const response = await this.httpClient.get('/health', {
          headers: this.getHeaders(brand),
        });
        status.set(brand, {
          healthy: true,
          configured: true,
          service: 'shared-zoho-service',
          ...response.data,
        });
      } catch (error) {
        status.set(brand, {
          healthy: false,
          configured: true,
          service: 'shared-zoho-service',
          error: (error as Error).message,
        });
      }
    }

    return status;
  }

  /**
   * Get health status for specific entity
   */
  public async getHealthForEntity(entityName: string): Promise<any> {
    const brand = this.entityToBrand(entityName);
    
    if (!brand) {
      return {
        configured: false,
        healthy: false,
        message: `Unknown entity: ${entityName}`,
      };
    }

    if (!this.configuredBrands.has(brand)) {
      return {
        configured: false,
        healthy: false,
        message: `Entity "${entityName}" (brand: ${brand}) is not configured in shared Zoho service`,
      };
    }

    try {
      const response = await this.httpClient.get('/health', {
        headers: this.getHeaders(brand),
      });
      return {
        configured: true,
        healthy: true,
        service: 'shared-zoho-service',
        brand,
        ...response.data,
      };
    } catch (error) {
      return {
        configured: true,
        healthy: false,
        service: 'shared-zoho-service',
        brand,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get chart of accounts from Zoho
   */
  public async getChartOfAccounts(entityName: string): Promise<any> {
    const brand = this.entityToBrand(entityName);
    
    if (!brand) {
      throw new Error(`Unknown entity: ${entityName}`);
    }

    const response = await this.httpClient.get<ZohoServiceResponse>(
      '/zoho/chartofaccounts/list',
      {
        headers: this.getHeaders(brand),
      }
    );

    return response.data?.data?.chartofaccounts || [];
  }

  /**
   * Get available Zoho Books account names (grouped by type)
   * Maintains API compatibility with previous zohoMultiAccountService
   */
  public async getZohoAccountNames(): Promise<any> {
    // Use haute_brands as the default for fetching account names
    const brand = 'haute_brands';
    
    if (!this.configuredBrands.has(brand)) {
      throw new Error('No Zoho account configured. Cannot fetch account names.');
    }

    try {
      const response = await this.httpClient.get<ZohoServiceResponse>(
        '/zoho/chartofaccounts/list',
        {
          headers: this.getHeaders(brand),
        }
      );

      const accounts = response.data?.data?.chartofaccounts || [];
      
      // Group accounts by type (matching old API format)
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
        service: 'shared-zoho-service',
        available: grouped,
        note: 'Account configuration is managed by the shared Zoho integration service',
      };
    } catch (error) {
      console.error('[ZohoClient] Failed to fetch account names:', error);
      throw error;
    }
  }

  /**
   * Refresh the list of configured brands
   */
  public async refreshConfiguredBrands(): Promise<void> {
    this.configuredBrands.clear();
    await this.checkConfiguredBrands();
  }

  /**
   * Get list of supported entity names
   */
  public getSupportedEntities(): string[] {
    return Object.keys(ENTITY_TO_BRAND);
  }

  /**
   * Get list of configured brands
   */
  public getConfiguredBrands(): string[] {
    return Array.from(this.configuredBrands);
  }
}

// Export singleton instance
export const zohoIntegrationClient = new ZohoIntegrationClient();
export default zohoIntegrationClient;

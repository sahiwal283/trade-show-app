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
import { query } from '../config/database';

// ========== CONFIGURATION ==========

const ZOHO_SERVICE_URL = process.env.ZOHO_SERVICE_URL || 'http://192.168.1.205:8000';
const ZOHO_SERVICE_TOKEN = process.env.ZOHO_SERVICE_TOKEN || '';

// Entity name to brand mapping
const ENTITY_TO_BRAND: Record<string, string> = {
  'haute brands': 'haute_brands',
  'haute': 'haute_brands',
  'boomin brands': 'boomin_brands',
  'boomin': 'boomin_brands',
  'nirvana kulture': 'nirvana_kulture',
  'nirvana': 'nirvana_kulture',
};

// Default Zoho account IDs per brand (fallback if not configured in settings)
const DEFAULT_BRAND_ACCOUNT_IDS: Record<string, { expenseAccountId: string; paidThroughAccountId: string }> = {
  'haute_brands': {
    expenseAccountId: '5254962000000091094',
    paidThroughAccountId: '5254962000000129043',
  },
  'boomin_brands': {
    expenseAccountId: '4849689000007752119',
    paidThroughAccountId: '5254962000000129043',
  },
  'nirvana_kulture': {
    expenseAccountId: '', // To be configured
    paidThroughAccountId: '', // To be configured
  },
};

// ========== SETTINGS TYPES ==========

interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;
  zohoPaymentAccountId?: string | null;
}

interface CategoryOption {
  name: string;
  zohoExpenseAccountIds?: {
    haute_brands?: string | null;
    boomin_brands?: string | null;
    nirvana_kulture?: string | null;
  } | null;
}

interface ZohoSettings {
  cardOptions: CardOption[];
  categoryOptions: CategoryOption[];
}

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
  cardUsed?: string; // Card name for payment account lookup
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
  private settingsCache: ZohoSettings | null = null;
  private settingsCacheTime: number = 0;
  private readonly SETTINGS_CACHE_TTL = 60000; // 1 minute cache

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
   * Load Zoho account settings from database
   */
  private async loadSettings(): Promise<ZohoSettings> {
    // Return cached settings if still valid
    if (this.settingsCache && Date.now() - this.settingsCacheTime < this.SETTINGS_CACHE_TTL) {
      return this.settingsCache;
    }

    try {
      // Load cardOptions
      const cardResult = await query(
        "SELECT value FROM app_settings WHERE key = 'cardOptions'"
      );
      let cardOptions: CardOption[] = [];
      if (cardResult.rows.length > 0) {
        // Handle both string (text column) and object (jsonb column) formats
        const rawValue = cardResult.rows[0].value;
        const rawCards = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        // Handle both old format (no zohoPaymentAccountId) and new format
        cardOptions = rawCards.map((card: any) => ({
          name: card.name,
          lastFour: card.lastFour,
          entity: card.entity || null,
          zohoPaymentAccountId: card.zohoPaymentAccountId || null,
        }));
      }

      // Load categoryOptions
      const categoryResult = await query(
        "SELECT value FROM app_settings WHERE key = 'categoryOptions'"
      );
      let categoryOptions: CategoryOption[] = [];
      if (categoryResult.rows.length > 0) {
        // Handle both string (text column) and object (jsonb column) formats
        const rawValue = categoryResult.rows[0].value;
        const rawCategories = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        // Handle old format (string[]), old single-ID format, and new multi-brand format
        categoryOptions = rawCategories.map((cat: any) => {
          if (typeof cat === 'string') {
            return { name: cat, zohoExpenseAccountIds: null };
          }
          // Handle new multi-brand format or migrate old single-ID format
          let zohoExpenseAccountIds = null;
          if (cat.zohoExpenseAccountIds) {
            zohoExpenseAccountIds = cat.zohoExpenseAccountIds;
          } else if (cat.zohoExpenseAccountId) {
            // Migrate old single-ID to Haute Brands (backward compatibility)
            zohoExpenseAccountIds = { haute_brands: cat.zohoExpenseAccountId };
          }
          return {
            name: cat.name,
            zohoExpenseAccountIds,
          };
        });
      }

      this.settingsCache = { cardOptions, categoryOptions };
      this.settingsCacheTime = Date.now();
      
      console.log(`[ZohoClient] Loaded settings: ${cardOptions.length} cards, ${categoryOptions.length} categories`);
      
      return this.settingsCache;
    } catch (error) {
      console.error('[ZohoClient] Failed to load settings:', error);
      return { cardOptions: [], categoryOptions: [] };
    }
  }

  /**
   * Find payment account ID from card name
   */
  private findPaymentAccountId(cardUsed: string | undefined, settings: ZohoSettings, brand: string): string {
    console.log(`[ZohoClient] Looking up payment account for card: "${cardUsed}", brand: ${brand}`);
    console.log(`[ZohoClient] Available cards: ${settings.cardOptions.map(c => `${c.name} (zoho: ${c.zohoPaymentAccountId || 'none'})`).join(', ')}`);
    
    if (cardUsed && settings.cardOptions.length > 0) {
      // Try to match card by name (card format: "Name (...1234)")
      const cardName = cardUsed.split(' (...')[0].trim();
      console.log(`[ZohoClient] Extracted card name: "${cardName}"`);
      
      const matchedCard = settings.cardOptions.find(
        card => card.name.toLowerCase() === cardName.toLowerCase() ||
                cardUsed.toLowerCase().includes(card.name.toLowerCase())
      );
      
      if (matchedCard) {
        console.log(`[ZohoClient] Matched card: ${matchedCard.name}, zohoPaymentAccountId: ${matchedCard.zohoPaymentAccountId || 'NOT SET'}`);
        if (matchedCard.zohoPaymentAccountId) {
          return matchedCard.zohoPaymentAccountId;
        }
      } else {
        console.log(`[ZohoClient] No card matched for "${cardName}"`);
      }
    }
    
    // Fallback to brand default
    const defaultAccounts = DEFAULT_BRAND_ACCOUNT_IDS[brand];
    console.log(`[ZohoClient] Using default payment account ID for ${brand}: ${defaultAccounts?.paidThroughAccountId || 'NONE'}`);
    return defaultAccounts?.paidThroughAccountId || '';
  }

  /**
   * Find expense account ID from category name for a specific brand
   */
  private findExpenseAccountId(category: string, settings: ZohoSettings, brand: string): string {
    if (category && settings.categoryOptions.length > 0) {
      const matchedCategory = settings.categoryOptions.find(
        cat => cat.name.toLowerCase() === category.toLowerCase()
      );
      
      // Get brand-specific account ID
      const brandKey = brand as 'haute_brands' | 'boomin_brands' | 'nirvana_kulture';
      const accountId = matchedCategory?.zohoExpenseAccountIds?.[brandKey];
      
      if (accountId) {
        console.log(`[ZohoClient] Found expense account ID for category "${category}" (${brand}): ${accountId}`);
        return accountId;
      }
    }
    
    // Fallback to brand default
    const defaultAccounts = DEFAULT_BRAND_ACCOUNT_IDS[brand];
    console.log(`[ZohoClient] Using default expense account ID for ${brand}`);
    return defaultAccounts?.expenseAccountId || '';
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

      // Load settings and look up account IDs
      const settings = await this.loadSettings();
      const expenseAccountId = this.findExpenseAccountId(expenseData.category, settings, brand);
      const paidThroughAccountId = this.findPaymentAccountId(expenseData.cardUsed, settings, brand);

      if (!expenseAccountId || !paidThroughAccountId) {
        console.error(`[ZohoClient] Missing account IDs for brand ${brand}: expense=${expenseAccountId}, payment=${paidThroughAccountId}`);
        return {
          success: false,
          error: `Missing Zoho account IDs. Please configure account IDs in Admin Settings.`,
        };
      }

      console.log(`[ZohoClient] Using account IDs - Expense: ${expenseAccountId}, Payment: ${paidThroughAccountId}`);

      // Create expense via shared service
      // App sends account_id and paid_through_account_id based on category/card settings
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
          account_id: expenseAccountId,
          paid_through_account_id: paidThroughAccountId,
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

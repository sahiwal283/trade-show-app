/**
 * API Client - Backward Compatible Version
 * @version 0.8.0
 */

import { TokenManager, apiClient } from './apiClient';

const USE_SERVER = (import.meta.env.VITE_USE_SERVER || 'true') === 'true';

export { TokenManager, apiClient };

export const api = {
  USE_SERVER,
  
  login: async (username: string, password: string) => {
    const data = await apiClient.post('/auth/login', { username, password });
    if (data?.token) TokenManager.setToken(data.token);
    return data;
  },

  logout: () => {
    TokenManager.removeToken();
  },

  // Users
  getUsers: () => apiClient.get('/users'),
  createUser: (payload: Record<string, any>) => apiClient.post('/users', payload),
  updateUser: (id: string, payload: Record<string, any>) => apiClient.put(`/users/${id}`, payload),
  deleteUser: (id: string) => apiClient.delete(`/users/${id}`),

  // Roles
  getRoles: () => apiClient.get('/roles'),
  createRole: (payload: Record<string, any>) => apiClient.post('/roles', payload),
  updateRole: (id: string, payload: Record<string, any>) => apiClient.put(`/roles/${id}`, payload),
  deleteRole: (id: string) => apiClient.delete(`/roles/${id}`),

  // Events
  getEvents: () => apiClient.get('/events'),
  createEvent: (payload: Record<string, any>) => apiClient.post('/events', payload),
  updateEvent: (id: string, payload: Record<string, any>) => apiClient.put(`/events/${id}`, payload),
  deleteEvent: (id: string) => apiClient.delete(`/events/${id}`),

  // Expenses
  getExpenses: (params?: Record<string, string | number | boolean>) => 
    apiClient.get('/expenses', { params }),
  
  createExpense: async (payload: Record<string, any>, receipt?: File) => {
    if (receipt) {
      return apiClient.upload('/expenses', payload, receipt, 'receipt');
    }
    return apiClient.post('/expenses', payload);
  },

  updateExpense: async (id: string, payload: Record<string, any>, receipt?: File) => {
    if (receipt) {
      return apiClient.upload(`/expenses/${id}`, payload, receipt, 'receipt', 'PUT');
    }
    return apiClient.put(`/expenses/${id}`, payload);
  },

  // Update expense receipt (dedicated endpoint for receipt-only updates)
  updateExpenseReceipt: async (expenseId: string, file: File) => {
    return apiClient.upload(`/expenses/${expenseId}/receipt`, {}, file, 'receipt', 'PUT');
  },
  
  // Update expense status (pending/approved/rejected/needs further review)
  updateExpenseStatus: (id: string, payload: { status: 'pending' | 'approved' | 'rejected' | 'needs further review' }) =>
    apiClient.patch(`/expenses/${id}/status`, payload),
  
  // Legacy review endpoint (kept for backwards compatibility)
  reviewExpense: (id: string, payload: { status: 'approved' | 'rejected'; comments?: string }) =>
    apiClient.patch(`/expenses/${id}/review`, payload),
  
  assignEntity: (id: string, payload: { zoho_entity: string }) =>
    apiClient.patch(`/expenses/${id}/entity`, payload),
  
  pushToZoho: (id: string) =>
    apiClient.post(`/expenses/${id}/push-to-zoho`, {}),
  
  setExpenseReimbursement: (id: string, payload: { reimbursement_status: 'pending review' | 'approved' | 'rejected' | 'paid' }) =>
    apiClient.patch(`/expenses/${id}/reimbursement`, payload),
  
  deleteExpense: (id: string) => apiClient.delete(`/expenses/${id}`),
  
  // Download expense PDF (cross-browser compatible with enhanced debugging)
  downloadExpensePDF: async (expenseId: string) => {
    console.log('[downloadExpensePDF] Starting PDF download for expense:', expenseId);
    
    const token = TokenManager.getToken();
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }

    const baseURL = apiClient.getBaseURL();
    const currentProtocol = window.location.protocol;
    const currentOrigin = window.location.origin;
    
    // Build secure URL - relative URLs automatically use page protocol (avoids mixed content)
    let pdfUrl = `${baseURL}/expenses/${expenseId}/pdf`;
    
    // Log URL information for debugging
    console.log('[downloadExpensePDF] URL info:', {
      baseURL,
      pdfUrl,
      currentProtocol,
      currentOrigin,
      isRelative: !pdfUrl.startsWith('http'),
    });
    
    // Fix mixed content: if page is HTTPS but API URL is HTTP, upgrade to HTTPS
    if (currentProtocol === 'https:' && pdfUrl.startsWith('http://')) {
      pdfUrl = pdfUrl.replace('http://', 'https://');
      console.warn('[downloadExpensePDF] Upgraded HTTP to HTTPS to avoid mixed content warning');
    }

    // Detect browser for Arc-specific handling
    const userAgent = navigator.userAgent.toLowerCase();
    const isArc = userAgent.includes('arc') || userAgent.includes('the browser company');
    const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
    console.log('[downloadExpensePDF] Browser detection:', { isArc, isChrome, userAgent: userAgent.substring(0, 50) });

    try {
      console.log('[downloadExpensePDF] Fetching PDF from:', pdfUrl);
      const response = await fetch(pdfUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        // Use same-origin credentials to ensure secure request handling
        credentials: 'same-origin',
      });

      console.log('[downloadExpensePDF] Response status:', response.status, response.statusText);
      console.log('[downloadExpensePDF] Response headers:', {
        'content-type': response.headers.get('content-type'),
        'content-disposition': response.headers.get('content-disposition'),
        'content-length': response.headers.get('content-length'),
        'x-content-type-options': response.headers.get('x-content-type-options'),
        'x-download-options': response.headers.get('x-download-options'),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to download expense PDF';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        console.error('[downloadExpensePDF] HTTP error:', response.status, errorMessage);
        throw new Error(errorMessage);
      }

      // Verify Content-Type is PDF
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        console.error('[downloadExpensePDF] Invalid Content-Type:', contentType);
        console.warn('[downloadExpensePDF] Expected application/pdf but got:', contentType);
        // Don't throw - some servers may not set Content-Type correctly
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `expense-${expenseId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      console.log('[downloadExpensePDF] Filename:', filename);

      // Convert response to blob with explicit PDF type
      console.log('[downloadExpensePDF] Converting response to blob...');
      const blob = await response.blob();
      console.log('[downloadExpensePDF] Blob created:', {
        size: blob.size,
        type: blob.type,
      });
      
      // Verify blob is not empty
      if (blob.size === 0) {
        throw new Error('Downloaded PDF is empty. Please try again.');
      }
      
      // Check if blob starts with PDF header (first 4 bytes should be %PDF)
      // Read first 4 bytes as ArrayBuffer to check PDF header
      const blobSlice = blob.slice(0, 4);
      const arrayBuffer = await blobSlice.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const pdfHeader = String.fromCharCode(...uint8Array);
      
      console.log('[downloadExpensePDF] PDF header check:', {
        header: pdfHeader,
        bytes: Array.from(uint8Array).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
      });
      
      if (!pdfHeader.startsWith('%PDF')) {
        console.error('[downloadExpensePDF] Invalid PDF header. First 4 bytes:', pdfHeader);
        // Try to read as text to see what we got (might be an error message)
        try {
          const textBlob = await blob.text();
          console.error('[downloadExpensePDF] Response text (first 200 chars):', textBlob.substring(0, 200));
          // Check if it's a JSON error
          try {
            const errorData = JSON.parse(textBlob);
            throw new Error(errorData.error || errorData.message || 'Downloaded file is not a valid PDF');
          } catch {
            throw new Error('Downloaded file is not a valid PDF. Please check server logs.');
          }
        } catch (textError) {
          throw new Error('Downloaded file is not a valid PDF. Please check server logs.');
        }
      }
      
      console.log('[downloadExpensePDF] PDF header validated successfully');
      
      // Ensure blob has correct MIME type
      const pdfBlob = blob.type === 'application/pdf' 
        ? blob 
        : new Blob([blob], { type: 'application/pdf' });
      
      console.log('[downloadExpensePDF] PDF blob ready:', {
        size: pdfBlob.size,
        type: pdfBlob.type,
      });
      
      // Cross-browser compatible download method
      const blobUrl = window.URL.createObjectURL(pdfBlob);
      console.log('[downloadExpensePDF] Blob URL created:', blobUrl.substring(0, 50) + '...');
      
      let link: HTMLAnchorElement | null = null;
      let downloadSuccess = false;
      
      try {
        // Create download link with all necessary attributes for cross-browser compatibility
        link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        link.setAttribute('rel', 'noopener noreferrer');
        
        // Arc browser may need additional attributes
        if (isArc) {
          link.setAttribute('target', '_self'); // Keep in same window
          console.log('[downloadExpensePDF] Arc browser detected - using Arc-specific settings');
        }
        
        // Some browsers (including Arc) may require the link to be in the DOM before clicking
        document.body.appendChild(link);
        console.log('[downloadExpensePDF] Link appended to DOM');
        
        // Small delay to ensure DOM is ready (especially for Arc)
        await new Promise(resolve => setTimeout(resolve, isArc ? 100 : 50));
        
        // Trigger download - use multiple methods for maximum compatibility
        console.log('[downloadExpensePDF] Triggering download...');
        
        // Method 1: Direct click (works in most browsers)
        if (typeof link.click === 'function') {
          link.click();
          console.log('[downloadExpensePDF] Used link.click() method');
        } else {
          // Method 2: MouseEvent (fallback for older browsers)
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1,
          });
          link.dispatchEvent(clickEvent);
          console.log('[downloadExpensePDF] Used MouseEvent dispatch method');
        }
        
        downloadSuccess = true;
        console.log('[downloadExpensePDF] Download triggered successfully');
        
        // Increased delay for Arc browser and other browsers that need more time
        const cleanupDelay = isArc ? 2000 : 1000; // 2 seconds for Arc, 1 second for others
        setTimeout(() => {
          try {
            if (link && document.body.contains(link)) {
              document.body.removeChild(link);
              console.log('[downloadExpensePDF] Link removed from DOM');
            }
            window.URL.revokeObjectURL(blobUrl);
            console.log('[downloadExpensePDF] Blob URL revoked');
          } catch (cleanupError) {
            // Non-critical cleanup error - download may have already started
            console.warn('[downloadExpensePDF] Cleanup error (non-critical):', cleanupError);
          }
        }, cleanupDelay);
        
      } catch (error) {
        console.error('[downloadExpensePDF] Error during download trigger:', error);
        // Cleanup on error
        if (link && document.body.contains(link)) {
          try {
            document.body.removeChild(link);
          } catch (removeError) {
            console.warn('[downloadExpensePDF] Error removing link:', removeError);
          }
        }
        window.URL.revokeObjectURL(blobUrl);
        
        // Provide helpful error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[downloadExpensePDF] Download failed:', errorMessage);
        throw new Error(`Failed to download PDF: ${errorMessage}. Please check your browser settings or try a different browser.`);
      }
      
      if (!downloadSuccess) {
        throw new Error('Download trigger failed. Please check browser console for details.');
      }
      
    } catch (error) {
      console.error('[downloadExpensePDF] Fatal error:', error);
      throw error;
    }
  },

  // Settings
  getSettings: () => apiClient.get('/settings'),
  updateSettings: (payload: Record<string, any>) => apiClient.put('/settings', payload),

  // OCR
  processReceiptWithOCR: async (formData: FormData) => {
    const token = TokenManager.getToken();
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }

    const response = await fetch(`${apiClient.getBaseURL()}/ocr/v2/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR] Processing failed:', errorText);
      throw new Error('OCR processing failed');
    }

    return await response.json();
  },

  // Helper to get base URL
  getBaseURL: () => apiClient.getBaseURL(),

  // Authentication & Registration
  register: (data: { name: string; email: string; username: string; password: string }) =>
    apiClient.post('/auth/register', data),
  checkAvailability: (data: { username?: string; email?: string }) =>
    apiClient.post('/auth/check-availability', data),

  // Quick Actions / Pending Tasks
  quickActions: {
    getTasks: () => apiClient.get('/quick-actions'),
  },

  // Telegram Integration
  telegram: {
    startLink: () => apiClient.post('/telegram/link/start', {}),
    getLinkStatus: () => apiClient.get('/telegram/link/status'),
    disconnect: () => apiClient.delete('/telegram/link'),
    registerWebhook: (webhookBaseUrl?: string) =>
      apiClient.post('/telegram/webhook/register', webhookBaseUrl ? { webhookBaseUrl } : {}),
  },

  // Developer Dashboard
  devDashboard: {
    getVersion: () => apiClient.get('/dev-dashboard/version'),
    getMetrics: (timeRange?: string) => apiClient.get('/dev-dashboard/metrics', { params: { timeRange } }),
    getAuditLogs: (params?: Record<string, any>) => apiClient.get('/dev-dashboard/audit-logs', { params }),
    getSessions: () => apiClient.get('/dev-dashboard/sessions'),
    getApiAnalytics: (timeRange?: string) => apiClient.get('/dev-dashboard/api-analytics', { params: { timeRange } }),
    getAlerts: (status?: string, severity?: string) => apiClient.get('/dev-dashboard/alerts', { params: { status, severity } }),
    acknowledgeAlert: (id: string) => apiClient.post(`/dev-dashboard/alerts/${id}/acknowledge`),
    resolveAlert: (id: string) => apiClient.post(`/dev-dashboard/alerts/${id}/resolve`),
    getPageAnalytics: (timeRange?: string) => apiClient.get('/dev-dashboard/page-analytics', { params: { timeRange } }),
    getSummary: () => apiClient.get('/dev-dashboard/summary'),
    getOcrMetrics: () => apiClient.get('/dev-dashboard/ocr-metrics'),
  },

  // Checklist
  checklist: {
    getChecklist: (eventId: string) => apiClient.get(`/checklist/${eventId}`),
    updateChecklist: (checklistId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/${checklistId}`, payload),
    uploadBoothMap: async (checklistId: number, file: File) => {
      const formData = new FormData();
      formData.append('boothMap', file);
      
      // Use fetch directly because apiClient.post() sets Content-Type: application/json
      const token = TokenManager.getToken();
      const response = await fetch(`${apiClient.getBaseURL()}/checklist/${checklistId}/booth-map`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Don't set Content-Type - let browser set it with boundary for FormData
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to upload booth map');
      }
      
      return await response.json();
    },
    deleteBoothMap: (checklistId: number) => 
      apiClient.delete(`/checklist/${checklistId}/booth-map`),
    
    // Flights
    createFlight: (checklistId: number, payload: Record<string, any>) => 
      apiClient.post(`/checklist/${checklistId}/flights`, payload),
    updateFlight: (flightId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/flights/${flightId}`, payload),
    deleteFlight: (flightId: number) => 
      apiClient.delete(`/checklist/flights/${flightId}`),
    
    // Hotels
    createHotel: (checklistId: number, payload: Record<string, any>) => 
      apiClient.post(`/checklist/${checklistId}/hotels`, payload),
    updateHotel: (hotelId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/hotels/${hotelId}`, payload),
    deleteHotel: (hotelId: number) => 
      apiClient.delete(`/checklist/hotels/${hotelId}`),
    
    // Car Rentals
    createCarRental: (checklistId: number, payload: Record<string, any>) => 
      apiClient.post(`/checklist/${checklistId}/car-rentals`, payload),
    updateCarRental: (carRentalId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/car-rentals/${carRentalId}`, payload),
    deleteCarRental: (carRentalId: number) => 
      apiClient.delete(`/checklist/car-rentals/${carRentalId}`),
    
    // Booth Shipping
    createBoothShipping: (checklistId: number, payload: Record<string, any>) => 
      apiClient.post(`/checklist/${checklistId}/booth-shipping`, payload),
    updateBoothShipping: (shippingId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/booth-shipping/${shippingId}`, payload),
    deleteBoothShipping: (shippingId: number) => 
      apiClient.delete(`/checklist/booth-shipping/${shippingId}`),
    
    // Custom Items
    getCustomItems: (checklistId: number) => 
      apiClient.get(`/checklist/${checklistId}/custom-items`),
    createCustomItem: (checklistId: number, payload: Record<string, any>) => 
      apiClient.post(`/checklist/${checklistId}/custom-items`, payload),
    updateCustomItem: (itemId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/custom-items/${itemId}`, payload),
    deleteCustomItem: (itemId: number) => 
      apiClient.delete(`/checklist/custom-items/${itemId}`),
    
    // Templates
    getTemplates: () => 
      apiClient.get('/checklist/templates'),
    createTemplate: (payload: Record<string, any>) => 
      apiClient.post('/checklist/templates', payload),
    updateTemplate: (templateId: number, payload: Record<string, any>) => 
      apiClient.put(`/checklist/templates/${templateId}`, payload),
    deleteTemplate: (templateId: number) => 
      apiClient.delete(`/checklist/templates/${templateId}`),
    applyTemplates: (checklistId: number) => 
      apiClient.post(`/checklist/${checklistId}/apply-templates`, {}),
  },
};

/**
 * DevDashboard Service
 * Business logic for developer dashboard endpoints
 */

import { pool } from '../config/database';
import axios from 'axios';
import * as os from 'os';
import backendPkg from '../../package.json';
import { FRONTEND_VERSION } from '../config/version';
import { auditLogRepository, apiRequestRepository } from '../database/repositories';
import {
  checkErrorRateAlert,
  checkSlowResponseAlert,
  checkStaleSessionsAlert,
  checkEndpointFailureAlert,
  checkTrafficSpikeAlert,
  checkAuthFailuresAlert,
  parseTimeRange,
  getSystemMemoryMetrics,
  getSystemCPUMetrics,
  formatSessionDuration,
  checkOCRServiceHealth,
  calculateOCRCosts
} from './DevDashboardService.helpers';
import { resolveExpenseBackend } from './expenseStore';
import {
  expenseSummaryTotals,
  expenseTrendsAndCategories,
  expenseReceiptCounts,
  intervalStart,
} from './DevDashboardService.expenseStats';

export class DevDashboardService {
  /**
   * Get version information
   */
  static async getVersionInfo() {
    const backendVersion = backendPkg.version;
    const frontendVersion = FRONTEND_VERSION;
    
    // Get database info
    const dbResult = await pool.query('SELECT version()');
    const dbVersion = dbResult.rows[0].version;
    
    // Get database uptime
    const uptimeResult = await pool.query(`
      SELECT EXTRACT(EPOCH FROM (NOW() - pg_postmaster_start_time())) as uptime
    `);
    const dbUptime = Math.floor(uptimeResult.rows[0].uptime);
    
    // Get process uptime (backend server uptime)
    const processUptime = Math.floor(process.uptime());
    
    return {
      frontend: {
        version: frontendVersion
      },
      backend: {
        version: backendVersion,
        nodeVersion: process.version
      },
      database: dbVersion.match(/\d+\.\d+/)?.[0] || 'PostgreSQL',
      uptime: processUptime,
      dbUptime: dbUptime,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Get dashboard summary
   */
  static async getSummary() {
    // Get counts
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const eventsResult = await pool.query('SELECT COUNT(*) as count FROM events');

    // Expense aggregates come from whichever store owns them. Under
    // EXPENSE_BACKEND=midas the local table is frozen at the migration cutover,
    // so querying it here would report pre-cutover numbers as if they were current.
    const expenseTotals = await expenseSummaryTotals();
    const expensesResult = { rows: [{ count: String(expenseTotals.total) }] };
    const pendingExpensesResult = { rows: [{ count: String(expenseTotals.pending) }] };
    const totalAmountResult = { rows: [{ total: String(expenseTotals.amount) }] };
    const zohoPushedResult = { rows: [{ count: String(expenseTotals.zohoPushed) }] };

    // Get active sessions count (valid, non-expired sessions)
    const activeSessionsResult = await pool.query(
      `SELECT COUNT(*) as count FROM user_sessions WHERE expires_at > NOW()`
    );
    
    // Get recent activity (last 24 hours) from api_requests
    const stats = await apiRequestRepository.getStats('24h');
    const recentActionsCount = stats.totalRequests;
    
    // Calculate system health (simple metric based on pending expenses)
    const totalExpenses = parseInt(expensesResult.rows[0].count);
    const pendingCount = parseInt(pendingExpensesResult.rows[0].count);
    const healthScore = totalExpenses > 0 
      ? Math.round((1 - (pendingCount / totalExpenses)) * 100)
      : 100;
    
    // Calculate active alerts count
    const alertCount = await this.calculateActiveAlerts();
    
    return {
      // Frontend expects these specific field names
      total_users: parseInt(usersResult.rows[0].count),
      active_sessions: parseInt(activeSessionsResult.rows[0].count),
      recent_actions: recentActionsCount,
      active_alerts: alertCount,
      critical_alerts: 0,
      active_events: parseInt(eventsResult.rows[0].count),
      pending_expenses: pendingCount,
      total_expenses: totalExpenses,
      approved_expenses: totalExpenses - pendingCount,
      total_amount: parseFloat(totalAmountResult.rows[0].total),
      pushed_to_zoho: parseInt(zohoPushedResult.rows[0].count),
      health_score: healthScore,
      health_status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical',
      uptime: 'N/A',
      // Also include nested structure for compatibility
      users: {
        total: parseInt(usersResult.rows[0].count),
        active: parseInt(usersResult.rows[0].count)
      },
      expenses: {
        total: totalExpenses,
        pending: pendingCount,
        approved: totalExpenses - pendingCount,
        totalAmount: parseFloat(totalAmountResult.rows[0].total),
        pushedToZoho: parseInt(zohoPushedResult.rows[0].count)
      },
      events: {
        total: parseInt(eventsResult.rows[0].count),
        active: parseInt(eventsResult.rows[0].count)
      },
      activity: {
        last24h: recentActionsCount
      },
      health: {
        score: healthScore,
        status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical'
      }
    };
  }

  /**
   * Calculate active alerts count
   */
  private static async calculateActiveAlerts(): Promise<number> {
    let alertCount = 0;
    
    // Check error rate
    const errorRateResult = await pool.query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM api_requests
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    const totalRequests = parseInt(errorRateResult.rows[0].total_requests) || 0;
    const errorCount = parseInt(errorRateResult.rows[0].error_count) || 0;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests * 100) : 0;
    if (errorRate > 10 && totalRequests > 20) alertCount++;
    
    // Check for slow endpoints
    const slowEndpointsResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM (
        SELECT endpoint, AVG(response_time_ms) as avg_time
        FROM api_requests
        WHERE created_at > NOW() - INTERVAL '1 hour'
          AND endpoint NOT LIKE '/api/dev-dashboard%'
        GROUP BY endpoint
        HAVING AVG(response_time_ms) > 2000 AND COUNT(*) >= 5
      ) slow_endpoints
    `);
    if (parseInt(slowEndpointsResult.rows[0].count) > 0) alertCount++;
    
    return alertCount;
  }

  /**
   * Get system metrics
   */
  static async getMetrics(timeRange: string = '24h') {
    // Parse time range
    const interval = parseTimeRange(timeRange);
    
    // Expense trends and category breakdown, from whichever store owns expenses.
    let expenseTrendsResult: { rows: any[] };
    let categoryResult: { rows: any[] };

    if (resolveExpenseBackend() === 'midas') {
      const { trends, categories } = await expenseTrendsAndCategories(intervalStart(interval));
      expenseTrendsResult = { rows: trends };
      categoryResult = { rows: categories };
    } else {
      expenseTrendsResult = await pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(amount) as total
        FROM expenses
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      categoryResult = await pool.query(`
        SELECT
          category,
          COUNT(*) as count,
          SUM(amount) as total
        FROM expenses
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY category
        ORDER BY total DESC
      `);
    }
    
    // Get user activity
    const userActivityResult = await pool.query(`
      SELECT 
        u.username,
        u.role,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.amount), 0) as total_amount
      FROM users u
      LEFT JOIN expenses e ON u.id = e.user_id AND e.created_at > NOW() - INTERVAL '${interval}'
      GROUP BY u.id, u.username, u.role
      ORDER BY expense_count DESC
    `);
    
    // System metrics
    const memoryMetrics = getSystemMemoryMetrics();
    const cpuMetrics = getSystemCPUMetrics();
    
    // Database stats
    const dbSizeResult = await pool.query(`
      SELECT 
        pg_database_size(current_database()) as size_bytes,
        pg_size_pretty(pg_database_size(current_database())) as size_pretty
    `);
    
    const connectionResult = await pool.query(`
      SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
    `);
    
    // Get table sizes
    const tableSizesResult = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);
    
    // Get historical metrics
    let historicalMetrics = [];
    try {
      const historicalResult = await pool.query(`
        SELECT 
          'memory_usage' as metric_type,
          AVG(${memoryMetrics.usagePercent}) as avg_value,
          MAX(${memoryMetrics.usagePercent}) as max_value,
          MIN(${memoryMetrics.usagePercent}) as min_value,
          '%' as metric_unit,
          1 as sample_count
        UNION ALL
        SELECT 
          'cpu_load' as metric_type,
          ${cpuMetrics.loadAverage[0]} as avg_value,
          ${cpuMetrics.loadAverage[0]} as max_value,
          ${cpuMetrics.loadAverage[0]} as min_value,
          '' as metric_unit,
          1 as sample_count
        UNION ALL
        SELECT 
          'db_connections' as metric_type,
          ${parseInt(connectionResult.rows[0].count)} as avg_value,
          ${parseInt(connectionResult.rows[0].count)} as max_value,
          ${parseInt(connectionResult.rows[0].count)} as min_value,
          'connections' as metric_unit,
          1 as sample_count
      `);
      historicalMetrics = historicalResult.rows;
    } catch (err) {
      console.warn('Could not fetch historical metrics:', err);
    }
    
    return {
      system: {
        memory: memoryMetrics,
        cpu: cpuMetrics,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime()
      },
      database: {
        databaseSize: parseInt(dbSizeResult.rows[0].size_bytes),
        databaseSizePretty: dbSizeResult.rows[0].size_pretty,
        activeConnections: parseInt(connectionResult.rows[0].count),
        totalConnections: 100,
        tableSizes: tableSizesResult.rows
      },
      historical: historicalMetrics,
      expenses: {
        trends: expenseTrendsResult.rows,
        categoryBreakdown: categoryResult.rows
      },
      users: {
        activity: userActivityResult.rows
      },
      timeRange: timeRange
    };
  }

  /**
   * Get audit logs
   */
  static async getAuditLogs(limit: number = 50, action?: string, search?: string) {
    // Try to get audit logs using repository
    try {
      const logs = await auditLogRepository.findWithFilters({
        action: action && action !== 'all' ? action : undefined,
        limit: limit || 50
      });
      
      // If search is provided, filter results locally (repository doesn't support search yet)
      const filteredLogs = search 
        ? logs.filter(log => 
            (log.user_name && log.user_name.toLowerCase().includes(search.toLowerCase())) ||
            (log.action && log.action.toLowerCase().includes(search.toLowerCase())) ||
            (log.entity_type && log.entity_type.toLowerCase().includes(search.toLowerCase()))
          )
        : logs;
      
      return {
        logs: filteredLogs,
        total: filteredLogs.length
      };
    } catch (error) {
      // If audit_logs table doesn't exist or query fails, fall back to simulated logs
      console.warn('[DevDashboard] Audit logs not available, using fallback');

      // The fallback derives activity from the local expenses table. Under
      // EXPENSE_BACKEND=midas that table stopped receiving writes at the
      // migration cutover, so it would present pre-cutover rows as recent
      // activity. Report nothing rather than something false.
      if (resolveExpenseBackend() === 'midas') {
        console.warn(
          '[DevDashboard] Expense-derived fallback unavailable under EXPENSE_BACKEND=midas; expense activity lives in Midas'
        );
        return { logs: [], total: 0 };
      }

      // Fallback: simulate audit logs from expense activity
      let query = `
        SELECT 
          e.id,
          e.created_at,
          u.username as user_name,
          u.email as user_email,
          u.role as user_role,
          CASE 
            WHEN e.status = 'pending' THEN 'expense_created'
            WHEN e.status = 'approved' THEN 'expense_approved'
            WHEN e.status = 'rejected' THEN 'expense_rejected'
            ELSE 'expense_updated'
          END as action,
          'expense' as entity_type,
          e.id as entity_id,
          'success' as status,
          NULL as ip_address
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        WHERE 1=1
      `;
      
      const params: string[] = [];
      
      if (action && action !== 'all') {
        params.push(action);
        query += ` AND CASE 
          WHEN e.status = 'pending' THEN 'expense_created'
          WHEN e.status = 'approved' THEN 'expense_approved'
          WHEN e.status = 'rejected' THEN 'expense_rejected'
          ELSE 'expense_updated'
        END = $${params.length}`;
      }
      
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (e.merchant ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
      }
      
      params.push(limit.toString());
      query += ` ORDER BY e.created_at DESC LIMIT $${params.length}`;
      
      const result = await pool.query(query, params);
      
      return {
        logs: result.rows,
        total: result.rowCount,
        notice: 'Using simulated audit logs. Run migration 004_create_audit_log.sql for full audit logging. (Note: Table is named audit_logs in production)'
      };
    }
  }

  /**
   * Get active user sessions
   */
  static async getSessions() {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.user_id,
        s.ip_address,
        s.user_agent,
        s.created_at as session_start,
        s.last_activity,
        s.expires_at,
        u.username,
        u.email,
        u.role
      FROM user_sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.expires_at > NOW()
      ORDER BY s.last_activity DESC
    `);
    
    const now = new Date();
    const sessions = result.rows.map(row => {
      const lastActivity = new Date(row.last_activity);
      const timeSinceActivity = now.getTime() - lastActivity.getTime();
      
      // Determine status based on last activity
      let status = 'active';
      if (timeSinceActivity > 300000) { // > 5 minutes
        status = 'idle';
      }
      if (timeSinceActivity > 3600000) { // > 1 hour
        status = 'inactive';
      }
      
      return {
        id: row.id,
        user_id: row.user_id,
        user_name: row.username,
        user_email: row.email || 'N/A',
        user_role: row.role,
        ip_address: row.ip_address || 'N/A',
        user_agent: row.user_agent || 'N/A',
        session_start: row.session_start,
        last_activity: row.last_activity,
        expires_at: row.expires_at,
        status,
        duration_minutes: Math.floor((now.getTime() - new Date(row.session_start).getTime()) / 60000)
      };
    });
    
    return { sessions, total: sessions.length };
  }

  /**
   * Get API analytics
   */
  static async getAPIAnalytics(timeRange: string = '24h') {
    const interval = parseTimeRange(timeRange);
    
    // Get actual API request statistics from api_requests table
    const endpointStats = await pool.query(`
      SELECT 
        method,
        endpoint,
        COUNT(*) as call_count,
        AVG(response_time_ms) as avg_response_time,
        MAX(response_time_ms) as max_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM api_requests
      WHERE created_at > NOW() - INTERVAL '${interval}'
        AND endpoint NOT LIKE '/api/dev-dashboard%'
      GROUP BY method, endpoint
      ORDER BY call_count DESC
      LIMIT 20
    `);
    
    // Get overall statistics
    const overallStats = await pool.query(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(response_time_ms) as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as total_errors
      FROM api_requests
      WHERE created_at > NOW() - INTERVAL '${interval}'
        AND endpoint NOT LIKE '/api/dev-dashboard%'
    `);
    
    const totalRequests = parseInt(overallStats.rows[0].total_requests) || 0;
    const avgResponseTime = Math.round(parseFloat(overallStats.rows[0].avg_response_time) || 0);
    const totalErrors = parseInt(overallStats.rows[0].total_errors) || 0;
    const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00';
    const successRate = totalRequests > 0 ? (100 - parseFloat(errorRate)).toFixed(2) : '100.00';
    
    // Get slowest endpoints
    const slowestEndpoints = await pool.query(`
      SELECT 
        method,
        endpoint,
        AVG(response_time_ms) as avg_response_time,
        COUNT(*) as call_count
      FROM api_requests
      WHERE created_at > NOW() - INTERVAL '${interval}'
        AND endpoint NOT LIKE '/api/dev-dashboard%'
      GROUP BY method, endpoint
      HAVING COUNT(*) >= 5
      ORDER BY avg_response_time DESC
      LIMIT 5
    `);
    
    return {
      total_requests: totalRequests,
      avg_response_time: avgResponseTime,
      error_rate: parseFloat(errorRate),
      success_rate: parseFloat(successRate),
      endpointStats: endpointStats.rows.map(row => ({
        endpoint: row.endpoint,
        method: row.method,
        call_count: parseInt(row.call_count),
        avg_response_time: Math.round(parseFloat(row.avg_response_time)),
        max_response_time: Math.round(parseFloat(row.max_response_time)),
        error_count: parseInt(row.error_count)
      })),
      slowestEndpoints: slowestEndpoints.rows.map(row => ({
        endpoint: row.endpoint,
        method: row.method,
        avg_response_time: Math.round(parseFloat(row.avg_response_time)),
        call_count: parseInt(row.call_count)
      }))
    };
  }

  /**
   * Get system alerts
   */
  static async getAlerts(status: string = 'active', severity?: string) {
    const alerts: any[] = [];
    const now = new Date();
    
    // Run all alert checks in parallel
    const alertChecks = await Promise.all([
      checkErrorRateAlert(now),
      checkSlowResponseAlert(now),
      checkStaleSessionsAlert(now),
      checkEndpointFailureAlert(now),
      checkTrafficSpikeAlert(now),
      checkAuthFailuresAlert(now)
    ]);
    
    // Filter out null results and add to alerts array
    alertChecks.forEach(alert => {
      if (alert) alerts.push(alert);
    });
    
    // All systems operational
    if (alerts.length === 0) {
      alerts.push({
        id: 'alert-healthy',
        severity: 'success',
        status: 'active',
        title: 'All Systems Operational',
        description: 'API performance is healthy, error rates are low, and no anomalies detected. All services are running smoothly.',
        message: 'All systems operational',
        timestamp: now.toISOString(),
        acknowledged: false
      });
    }
    
    // Format all alert timestamps
    const formattedAlerts = alerts.map(alert => ({
      ...alert,
      created_at: alert.timestamp
    }));
    
    return { alerts: formattedAlerts };
  }

  /**
   * Get page analytics
   */
  static async getPageAnalytics(timeRange: string = '24h') {
    const interval = parseTimeRange(timeRange);
    
    // Get actual API request data grouped by endpoint
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_requests,
        AVG(response_time_ms) as avg_response_time
      FROM api_requests
      WHERE created_at > NOW() - INTERVAL '${interval}'
        AND endpoint NOT LIKE '/api/dev-dashboard%'
        AND user_id IS NOT NULL
    `);
    
    const uniqueUsers = parseInt(result.rows[0].unique_users) || 0;
    const totalRequests = parseInt(result.rows[0].total_requests) || 0;
    const avgResponseTime = Math.round(parseFloat(result.rows[0].avg_response_time) || 0);
    
    // Get page-specific stats (group API endpoints into logical pages)
    const pageStatsResult = await pool.query(`
      SELECT 
        CASE 
          WHEN endpoint LIKE '/api/expenses%' THEN 'Expenses'
          WHEN endpoint LIKE '/api/quick-actions%' THEN 'Dashboard'
          WHEN endpoint LIKE '/api/settings%' THEN 'Settings'
          WHEN endpoint LIKE '/api/events%' THEN 'Events'
          WHEN endpoint LIKE '/api/users%' OR endpoint LIKE '/api/roles%' THEN 'Users'
          ELSE 'Other'
        END as page,
        CASE 
          WHEN endpoint LIKE '/api/expenses%' THEN '/expenses'
          WHEN endpoint LIKE '/api/quick-actions%' THEN '/dashboard'
          WHEN endpoint LIKE '/api/settings%' THEN '/settings'
          WHEN endpoint LIKE '/api/events%' THEN '/events'
          WHEN endpoint LIKE '/api/users%' OR endpoint LIKE '/api/roles%' THEN '/users'
          ELSE '/other'
        END as path,
        COUNT(*) as view_count,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(response_time_ms) as avg_duration
      FROM api_requests
      WHERE created_at > NOW() - INTERVAL '${interval}'
        AND endpoint NOT LIKE '/api/dev-dashboard%'
        AND user_id IS NOT NULL
      GROUP BY page, path
      ORDER BY view_count DESC
    `);
    
    // Calculate session duration
    const sessionDurationResult = await pool.query(`
      SELECT 
        AVG(duration_seconds) as avg_duration
      FROM (
        SELECT 
          user_id,
          EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) as duration_seconds
        FROM api_requests
        WHERE created_at > NOW() - INTERVAL '${interval}'
          AND user_id IS NOT NULL
        GROUP BY user_id
        HAVING COUNT(*) > 1
      ) session_durations
    `);
    
    const avgSessionSeconds = parseFloat(sessionDurationResult.rows[0]?.avg_duration) || 0;
    const avgSessionDuration = formatSessionDuration(avgSessionSeconds);
    
    // Calculate bounce rate
    const bounceRateResult = await pool.query(`
      SELECT 
        COUNT(CASE WHEN request_count = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as bounce_rate
      FROM (
        SELECT user_id, COUNT(*) as request_count
        FROM api_requests
        WHERE created_at > NOW() - INTERVAL '${interval}'
          AND user_id IS NOT NULL
        GROUP BY user_id
      ) user_requests
    `);
    
    const bounceRate = parseFloat(bounceRateResult.rows[0]?.bounce_rate) || 0;
    
    return {
      total_page_views: totalRequests,
      unique_visitors: uniqueUsers,
      avg_session_duration: avgSessionDuration,
      bounce_rate: `${bounceRate.toFixed(1)}%`,
      pageStats: pageStatsResult.rows.map(row => ({
        page_title: row.page,
        page_path: row.path,
        view_count: parseInt(row.view_count),
        unique_users: parseInt(row.unique_users),
        avg_duration: Math.round(parseFloat(row.avg_duration) || 0).toString()
      }))
    };
  }

  /**
   * Get OCR metrics
   */
  static async getOCRMetrics() {
    const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://192.168.1.195:8000';
    
    // Get ALL receipts with images
    const allReceiptsResult = { rows: [await expenseReceiptCounts()] };
    
    const allTotalReceipts = parseInt(allReceiptsResult.rows[0].total_receipts_processed) || 0;
    const allReceiptsThisMonth = parseInt(allReceiptsResult.rows[0].receipts_this_month) || 0;
    const allReceiptsToday = parseInt(allReceiptsResult.rows[0].receipts_today) || 0;
    
    // Get Google Vision specific receipts from api_requests table
    const googleReceiptsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_receipts_processed,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as receipts_this_month,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as receipts_today
      FROM api_requests
      WHERE endpoint LIKE '%/ocr/v2/process%'
        AND method = 'POST'
        AND status_code >= 200 
        AND status_code < 300
        AND metadata->>'ocrProvider' = 'google_vision'
    `);
    
    const googleTotalReceipts = parseInt(googleReceiptsResult.rows[0].total_receipts_processed) || 0;
    const googleReceiptsThisMonth = parseInt(googleReceiptsResult.rows[0].receipts_this_month) || 0;
    const googleReceiptsToday = parseInt(googleReceiptsResult.rows[0].receipts_today) || 0;
    
    // Fetch OCR service health and provider info
    const ocrServiceInfo = await checkOCRServiceHealth(OCR_SERVICE_URL);
    
    // Calculate estimated costs
    const costInfo = calculateOCRCosts(googleReceiptsThisMonth);
    
    return {
      service: {
        url: OCR_SERVICE_URL,
        status: ocrServiceInfo ? 'healthy' : 'unavailable',
        primary: ocrServiceInfo?.providers.primary || 'unknown',
        fallback: ocrServiceInfo?.providers.fallback || 'unknown',
        availability: ocrServiceInfo?.providers.availability || {},
        languages: ocrServiceInfo?.providers.languages || [],
        confidenceThreshold: ocrServiceInfo?.providers.confidenceThreshold || 0.6
      },
      usage: {
        all: {
          total: allTotalReceipts,
          thisMonth: allReceiptsThisMonth,
          today: allReceiptsToday
        },
        googleVision: {
          total: googleTotalReceipts,
          thisMonth: googleReceiptsThisMonth,
          today: googleReceiptsToday
        },
        freeThreshold: costInfo.freeThreshold,
        remainingFree: costInfo.remainingFree
      },
      costs: {
        estimatedThisMonth: costInfo.estimatedThisMonth,
        currency: costInfo.currency,
        pricingModel: costInfo.pricingModel,
        projectedMonthly: costInfo.projectedMonthly
      },
      performance: {
        provider: ocrServiceInfo?.providers.primary || 'unknown',
        fallback: ocrServiceInfo?.providers.fallback || 'unknown',
        expectedSpeed: ocrServiceInfo?.providers.primary === 'google_vision' ? '2-5 seconds' : '10-15 seconds',
        availability: ocrServiceInfo?.providers.availability || {}
      }
    };
  }
}


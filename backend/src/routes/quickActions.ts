import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { userRepository } from '../database/repositories';
import {
  getUnpushedZohoExpenses,
  getReimbursementCount,
  getEventsNearBudgetLimit,
  getUserPendingExpensesCount,
  getUserMissingReceiptsCount,
  getPendingApprovalCount
} from '../services/QuickActionsService';

const router = Router();

// Get pending tasks/quick actions based on user role
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tasks: any[] = [];

    // ADMIN & DEVELOPER TASKS
    if (userRole === 'admin' || userRole === 'developer') {
      // 1. Users pending role assignment
      const pendingUsers = await userRepository.findByRole('pending');
      
      if (pendingUsers.length > 0) {
        tasks.push({
          id: 'pending-users',
          type: 'admin',
          priority: 'high',
          title: `${pendingUsers.length} New User${pendingUsers.length > 1 ? 's' : ''} Awaiting Role Assignment`,
          description: `${pendingUsers.length} user${pendingUsers.length > 1 ? 's have' : ' has'} registered and need${pendingUsers.length === 1 ? 's' : ''} a role assigned`,
          count: pendingUsers.length,
          action: 'Go to User Management',
          link: '/settings', // User management is on settings page
          icon: 'UserPlus',
          users: pendingUsers
        });
      }

      // 2. Expenses pending approval
      const pendingExpensesCount = await getPendingApprovalCount();
      if (pendingExpensesCount > 0) {
        tasks.push({
          id: 'pending-expenses',
          type: 'admin',
          priority: 'medium',
          title: `${pendingExpensesCount} Expense${pendingExpensesCount > 1 ? 's' : ''} Pending Approval`,
          description: `Review and approve pending expense submissions`,
          count: pendingExpensesCount,
          action: 'Review Expenses',
          link: '/expenses', // v1.3.0+: Approvals merged into unified Expenses page
          icon: 'FileText'
        });
      }

      // 3. Approved expenses not pushed to Zoho
      const unpushedData = await getUnpushedZohoExpenses();
      
      if (unpushedData.count > 0) {
        const { count: unpushedCount, eventIds, primaryEventId } = unpushedData;
        
        tasks.push({
          id: 'unpushed-zoho',
          type: 'unpushed_zoho',
          priority: 'medium',
          title: `${unpushedCount} Expense${unpushedCount > 1 ? 's' : ''} Not Synced to Zoho`,
          description: `Push approved expenses to Zoho Books`,
          count: unpushedCount,
          action: 'Push to Zoho',
          link: '/expenses', // v1.3.0+: Push to Zoho now on unified Expenses page
          icon: 'Upload',
          eventIds,
          primaryEventId // Event with most unsynced expenses
        });
      }
    }

    // ACCOUNTANT TASKS
    if (userRole === 'accountant') {
      // 1. Expenses pending approval
      const pendingExpensesCount = await getPendingApprovalCount();
      if (pendingExpensesCount > 0) {
        tasks.push({
          id: 'pending-expenses',
          type: 'accountant',
          priority: 'high',
          title: `${pendingExpensesCount} Expense${pendingExpensesCount > 1 ? 's' : ''} Pending Approval`,
          description: `Review and approve pending expense submissions`,
          count: pendingExpensesCount,
          action: 'Review Expenses',
          link: '/expenses', // v1.3.0+: Approvals merged into unified Expenses page
          icon: 'FileText'
        });
      }

      // 2. Reimbursements to process
      const reimbursementCount = await getReimbursementCount();
      if (reimbursementCount > 0) {
        tasks.push({
          id: 'pending-reimbursements',
          type: 'accountant',
          priority: 'medium',
          title: `${reimbursementCount} Reimbursement${reimbursementCount > 1 ? 's' : ''} to Process`,
          description: `Process pending reimbursements`,
          count: reimbursementCount,
          action: 'View Reports',
          link: '/reports',
          icon: 'DollarSign'
        });
      }
    }

    // COORDINATOR TASKS
    if (userRole === 'coordinator') {
      // Events requiring budget review
      const eventsNearBudget = await getEventsNearBudgetLimit(userId);
      
      if (eventsNearBudget.length > 0) {
        tasks.push({
          id: 'budget-warnings',
          type: 'coordinator',
          priority: 'high',
          title: `${eventsNearBudget.length} Event${eventsNearBudget.length > 1 ? 's' : ''} Near Budget Limit`,
          description: `Events have reached 80% or more of their budget`,
          count: eventsNearBudget.length,
          action: 'View Events',
          link: '/events',
          icon: 'AlertTriangle',
          events: eventsNearBudget
        });
      }
    }

    // SALESPERSON TASKS
    if (userRole === 'salesperson') {
      // Pending expense submissions (user's own)
      const userPendingCount = await getUserPendingExpensesCount(userId);
      if (userPendingCount > 0) {
        tasks.push({
          id: 'user-pending-expenses',
          type: 'salesperson',
          priority: 'low',
          title: `${userPendingCount} of Your Expense${userPendingCount > 1 ? 's' : ''} Pending Review`,
          description: `Waiting for accountant approval`,
          count: userPendingCount,
          action: 'View Expenses',
          link: '/expenses',
          icon: 'Clock'
        });
      }

      // Missing receipts
      const missingReceiptsCount = await getUserMissingReceiptsCount(userId);
      if (missingReceiptsCount > 0) {
        tasks.push({
          id: 'missing-receipts',
          type: 'salesperson',
          priority: 'medium',
          title: `${missingReceiptsCount} Expense${missingReceiptsCount > 1 ? 's' : ''} Missing Receipts`,
          description: `Upload receipts for proper documentation`,
          count: missingReceiptsCount,
          action: 'Upload Receipts',
          link: '/expenses',
          icon: 'Upload'
        });
      }
    }

    // Return tasks sorted by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]);

    res.json({ tasks });
  } catch (error) {
    console.error('Quick actions error:', error);
    res.status(500).json({ error: 'Failed to fetch pending tasks' });
  }
});

export default router;


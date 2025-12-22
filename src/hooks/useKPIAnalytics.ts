import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export type TimePeriod = 'today' | 'week' | 'month' | 'all';

export type RoleKPIs = {
  // Common metrics
  tasksCompleted: number;
  tasksCreated: number;
  totalTasksAssigned: number;
  avgCompletionTimeHours: number;
  statusChanges: number;
  
  // Estimation specific
  rfqsReceived: number;
  quotationsSent: number;
  quotationsApproved: number;
  quotationsRejected: number;
  avgQuotationTimeHours: number;
  supplierQuotesCollected: number;
  
  // Designer specific
  mockupsCompleted: number;
  mockupsSentToClient: number;
  mockupsApproved: number;
  mockupsRevised: number;
  productionFilesCreated: number;
  avgMockupTimeHours: number;
  
  // Operations specific
  productionTasksCompleted: number;
  productionTasksInProgress: number;
  deliveriesMade: number;
  avgProductionTimeHours: number;
  
  // Client Service specific
  newCallsHandled: number;
  followUpsMade: number;
  quotationsRequested: number;
};

export type UserKPIData = {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  avatarUrl?: string;
  kpis: RoleKPIs;
  badges: Badge[];
  streak: number;
  efficiencyScore: number;
};

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: string;
  progress?: number;
  target?: number;
};

// Badge definitions
export const BADGE_DEFINITIONS: Badge[] = [
  { id: 'quick_starter', name: 'Quick Starter', description: 'Complete 5 tasks in a single day', icon: '⚡', target: 5 },
  { id: 'quotation_master', name: 'Quotation Master', description: 'Send 10 quotations in a day', icon: '📊', target: 10 },
  { id: 'mockup_wizard', name: 'Mockup Wizard', description: 'Complete 5 mockups in a day', icon: '🎨', target: 5 },
  { id: 'production_hero', name: 'Production Hero', description: 'Complete 10 production tasks in a week', icon: '🏭', target: 10 },
  { id: 'streak_5', name: '5-Day Streak', description: 'Active for 5 consecutive days', icon: '🔥', target: 5 },
  { id: 'streak_10', name: '10-Day Streak', description: 'Active for 10 consecutive days', icon: '🔥🔥', target: 10 },
  { id: 'streak_30', name: 'Monthly Champion', description: 'Active for 30 consecutive days', icon: '👑', target: 30 },
  { id: 'perfect_approval', name: 'Perfect Approval', description: '100% approval rate on quotations (min 5)', icon: '✅', target: 100 },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Average task completion under 2 hours', icon: '🚀', target: 2 },
  { id: 'client_champion', name: 'Client Champion', description: 'Handle 20 client calls in a week', icon: '📞', target: 20 },
  { id: 'follow_up_king', name: 'Follow-Up King', description: 'Make 15 follow-ups in a day', icon: '📱', target: 15 },
  { id: 'team_player', name: 'Team Player', description: 'Collaborate on 10 cross-team tasks', icon: '🤝', target: 10 },
];

export const useKPIAnalytics = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDateRange = useCallback((period: TimePeriod) => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'week':
        return { from: startOfWeek(now), to: endOfWeek(now) };
      case 'month':
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'all':
        return { from: new Date('2000-01-01'), to: endOfDay(now) };
    }
  }, []);

  const fetchUserKPIs = useCallback(async (userId: string, period: TimePeriod): Promise<UserKPIData | null> => {
    try {
      setLoading(true);
      const { from, to } = getDateRange(period);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      // Fetch user profile and role
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, user_roles(*)')
        .eq('id', userId)
        .single();

      if (!profile) return null;

      const userRole = profile.user_roles?.[0]?.role || 'unknown';

      // Fetch ALL tasks assigned to or created by user (no date filter for base data)
      const { data: allUserTasks } = await supabase
        .from('tasks')
        .select('*')
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .is('deleted_at', null);

      // Fetch ALL audit logs for this user (this is the real activity data!)
      let auditLogsQuery = supabase
        .from('task_audit_log')
        .select('*')
        .eq('changed_by', userId)
        .order('created_at', { ascending: false });
      
      // Apply date filter for period-specific views
      if (period !== 'all') {
        auditLogsQuery = auditLogsQuery.gte('created_at', fromISO).lte('created_at', toISO);
      }
      
      const { data: auditLogs } = await auditLogsQuery;

      // Fetch supplier quotes created by this user's tasks
      let supplierQuotesQuery = supabase
        .from('supplier_quotes')
        .select('*');

      if (period !== 'all') {
        supplierQuotesQuery = supplierQuotesQuery.gte('created_at', fromISO).lte('created_at', toISO);
      }
      
      const { data: allSupplierQuotes } = await supplierQuotesQuery;

      // Filter supplier quotes to only those for tasks assigned to this user
      const taskIds = new Set((allUserTasks || []).filter(t => t.assigned_to === userId).map(t => t.id));
      const userSupplierQuotes = (allSupplierQuotes || []).filter(q => taskIds.has(q.task_id));

      // Fetch user achievements
      const { data: achievements } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId);

      // Fetch user streak
      const { data: streakData } = await supabase
        .from('user_activity_streaks')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Filter tasks by period for metrics
      const periodTasks = period === 'all' 
        ? (allUserTasks || [])
        : (allUserTasks || []).filter(t => {
            const createdAt = new Date(t.created_at || '');
            return createdAt >= from && createdAt <= to;
          });

      const completedInPeriod = period === 'all'
        ? (allUserTasks || []).filter(t => t.status === 'done' || t.completed_at)
        : (allUserTasks || []).filter(t => {
            if (!t.completed_at) return false;
            const completedAt = new Date(t.completed_at);
            return completedAt >= from && completedAt <= to;
          });

      // Calculate KPIs using all available data
      const kpis = calculateKPIs(
        periodTasks.filter(t => t.assigned_to === userId || t.created_by === userId),
        completedInPeriod.filter(t => t.assigned_to === userId),
        auditLogs || [],
        userSupplierQuotes,
        userRole,
        (allUserTasks || []).filter(t => t.assigned_to === userId),
        userId
      );

      // Calculate earned badges
      const badges = calculateBadges(kpis, achievements || [], streakData);

      return {
        userId,
        userName: profile.full_name || profile.email,
        userEmail: profile.email,
        userRole,
        avatarUrl: profile.avatar_url,
        kpis,
        badges,
        streak: streakData?.current_streak || 0,
        efficiencyScore: streakData?.efficiency_score || 0,
      };
    } catch (err) {
      console.error('Error fetching user KPIs:', err);
      setError('Failed to fetch KPIs');
      return null;
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  const fetchAllUsersKPIs = useCallback(async (period: TimePeriod): Promise<UserKPIData[]> => {
    try {
      setLoading(true);
      
      const { data: users } = await supabase
        .from('profiles')
        .select('id');

      if (!users) return [];

      const allKPIs = await Promise.all(
        users.map(u => fetchUserKPIs(u.id, period))
      );

      return allKPIs.filter((k): k is UserKPIData => k !== null);
    } catch (err) {
      console.error('Error fetching all users KPIs:', err);
      setError('Failed to fetch team KPIs');
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchUserKPIs]);

  const fetchRoleKPIs = useCallback(async (role: 'admin' | 'estimation' | 'designer' | 'operations' | 'technical_head' | 'client_service', period: TimePeriod): Promise<UserKPIData[]> => {
    try {
      setLoading(true);
      
      const { data: roleUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', role);

      if (!roleUsers) return [];

      const roleKPIs = await Promise.all(
        roleUsers.map(u => fetchUserKPIs(u.user_id, period))
      );

      return roleKPIs.filter((k): k is UserKPIData => k !== null);
    } catch (err) {
      console.error('Error fetching role KPIs:', err);
      setError('Failed to fetch role KPIs');
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchUserKPIs]);

  return {
    loading,
    error,
    fetchUserKPIs,
    fetchAllUsersKPIs,
    fetchRoleKPIs,
    getDateRange,
  };
};

function calculateKPIs(
  periodTasks: any[],
  completedTasks: any[],
  auditLogs: any[],
  supplierQuotes: any[],
  userRole: string,
  allAssignedTasks: any[],
  userId: string
): RoleKPIs {
  // Count tasks created by this user in period
  const tasksCreatedByUser = periodTasks.filter(t => t.created_by === userId).length;
  
  // Total tasks ever assigned
  const totalTasksAssigned = allAssignedTasks.length;
  
  // Completed tasks
  const tasksCompleted = completedTasks.length;
  
  // Status changes from audit log (accurate count!)
  const statusChanges = auditLogs.filter(l => l.action === 'status_changed').length;

  // Calculate average completion time
  let totalCompletionTime = 0;
  let completionCount = 0;
  completedTasks.forEach(t => {
    if (t.created_at && t.completed_at) {
      const created = new Date(t.created_at).getTime();
      const completed = new Date(t.completed_at).getTime();
      const hours = (completed - created) / (1000 * 60 * 60);
      if (hours > 0 && hours < 10000) { // Sanity check
        totalCompletionTime += hours;
        completionCount++;
      }
    }
  });
  const avgCompletionTimeHours = completionCount > 0 ? Math.round(totalCompletionTime / completionCount * 10) / 10 : 0;

  // ========== ESTIMATION METRICS ==========
  const quotationTasks = allAssignedTasks.filter(t => t.type === 'quotation');
  const rfqsReceived = quotationTasks.length; // Total RFQs assigned
  
  // Quotations sent = status changes TO quotation_bill, admin_approval, production, done
  const quotationsSent = auditLogs.filter(l => 
    l.action === 'status_changed' && 
    l.new_values?.status && 
    ['quotation_bill', 'admin_approval', 'with_client', 'client_approval'].includes(l.new_values.status)
  ).length || quotationTasks.filter(t => 
    ['quotation_bill', 'admin_approval', 'with_client', 'client_approval', 'production', 'done'].includes(t.status)
  ).length;
  
  const quotationsApproved = quotationTasks.filter(t => 
    ['approved', 'production', 'done', 'mockup', 'with_client'].includes(t.status)
  ).length;
  
  const quotationsRejected = quotationTasks.filter(t => t.status === 'rejected').length;
  const supplierQuotesCollected = supplierQuotes.length;

  // ========== DESIGNER METRICS ==========
  const mockupTasks = allAssignedTasks.filter(t => 
    t.sent_to_designer_mockup === true || t.status === 'mockup'
  );
  
  // Mockups completed (designer marked as done)
  const mockupsCompleted = allAssignedTasks.filter(t => 
    t.mockup_completed_by_designer === true || t.completed_by_designer_id === userId
  ).length;
  
  // Mockups sent to client
  const mockupsSentToClient = auditLogs.filter(l => 
    l.action === 'status_changed' && l.new_values?.status === 'with_client'
  ).length || allAssignedTasks.filter(t => t.status === 'with_client').length;
  
  // Mockups approved (moved to production)
  const mockupsApproved = allAssignedTasks.filter(t => 
    t.came_from_designer_done === true || 
    (t.mockup_completed_by_designer === true && ['production', 'done'].includes(t.status))
  ).length;
  
  // Revisions - tasks sent back to designer
  const mockupsRevised = auditLogs.filter(l => 
    l.action === 'status_changed' && 
    (l.new_values?.sent_back_to_designer === true || l.new_values?.status === 'mockup')
  ).length;
  
  // Production files created
  const productionFilesCreated = allAssignedTasks.filter(t => 
    t.came_from_designer_done === true
  ).length;

  // ========== OPERATIONS METRICS ==========
  const productionTasks = allAssignedTasks.filter(t => 
    t.status === 'production' || t.came_from_designer_done === true
  );
  
  const productionTasksCompleted = allAssignedTasks.filter(t => 
    t.status === 'done' && (t.came_from_designer_done === true || productionTasks.some(pt => pt.id === t.id))
  ).length;
  
  const productionTasksInProgress = productionTasks.filter(t => t.status === 'production').length;
  
  // Deliveries made
  const deliveriesMade = auditLogs.filter(l => 
    l.action === 'status_changed' && l.new_values?.status === 'delivery'
  ).length;

  // ========== CLIENT SERVICE METRICS ==========
  // New calls handled
  const newCallsHandled = auditLogs.filter(l => 
    (l.action === 'created' && l.new_values?.status === 'new_calls') ||
    (l.action === 'status_changed' && l.new_values?.status === 'new_calls')
  ).length + allAssignedTasks.filter(t => t.status === 'new_calls').length;
  
  // Follow-ups made
  const followUpsMade = auditLogs.filter(l => 
    l.action === 'status_changed' && l.new_values?.status === 'follow_up'
  ).length;
  
  // Quotations requested (moved to quotation status)
  const quotationsRequested = auditLogs.filter(l => 
    l.action === 'status_changed' && l.new_values?.status === 'quotation'
  ).length;

  // Calculate average times for specific task types
  let quotationTime = 0, quotationTimeCount = 0;
  let mockupTime = 0, mockupTimeCount = 0;
  let productionTime = 0, productionTimeCount = 0;

  allAssignedTasks.forEach(t => {
    if (t.created_at && t.status_changed_at) {
      const hours = (new Date(t.status_changed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
      if (hours > 0 && hours < 10000) {
        if (t.type === 'quotation') {
          quotationTime += hours;
          quotationTimeCount++;
        }
        if (t.sent_to_designer_mockup) {
          mockupTime += hours;
          mockupTimeCount++;
        }
        if (t.came_from_designer_done) {
          productionTime += hours;
          productionTimeCount++;
        }
      }
    }
  });

  return {
    tasksCompleted,
    tasksCreated: tasksCreatedByUser,
    totalTasksAssigned,
    avgCompletionTimeHours,
    statusChanges,
    rfqsReceived,
    quotationsSent,
    quotationsApproved,
    quotationsRejected,
    avgQuotationTimeHours: quotationTimeCount > 0 ? Math.round(quotationTime / quotationTimeCount * 10) / 10 : 0,
    supplierQuotesCollected,
    mockupsCompleted,
    mockupsSentToClient,
    mockupsApproved,
    mockupsRevised,
    productionFilesCreated,
    avgMockupTimeHours: mockupTimeCount > 0 ? Math.round(mockupTime / mockupTimeCount * 10) / 10 : 0,
    productionTasksCompleted,
    productionTasksInProgress,
    deliveriesMade,
    avgProductionTimeHours: productionTimeCount > 0 ? Math.round(productionTime / productionTimeCount * 10) / 10 : 0,
    newCallsHandled,
    followUpsMade,
    quotationsRequested,
  };
}

function calculateBadges(kpis: RoleKPIs, achievements: any[], streakData: any): Badge[] {
  const earnedBadges: Badge[] = [];
  const earnedIds = new Set(achievements.map(a => a.achievement_type));

  // Check each badge criteria
  BADGE_DEFINITIONS.forEach(badge => {
    let earned = earnedIds.has(badge.id);
    let progress = 0;

    switch (badge.id) {
      case 'quick_starter':
        progress = kpis.tasksCompleted;
        if (!earned && progress >= (badge.target || 5)) earned = true;
        break;
      case 'quotation_master':
        progress = kpis.quotationsSent;
        if (!earned && progress >= (badge.target || 10)) earned = true;
        break;
      case 'mockup_wizard':
        progress = kpis.mockupsCompleted;
        if (!earned && progress >= (badge.target || 5)) earned = true;
        break;
      case 'production_hero':
        progress = kpis.productionTasksCompleted;
        if (!earned && progress >= (badge.target || 10)) earned = true;
        break;
      case 'streak_5':
        progress = streakData?.current_streak || 0;
        if (!earned && progress >= 5) earned = true;
        break;
      case 'streak_10':
        progress = streakData?.current_streak || 0;
        if (!earned && progress >= 10) earned = true;
        break;
      case 'streak_30':
        progress = streakData?.current_streak || 0;
        if (!earned && progress >= 30) earned = true;
        break;
      case 'perfect_approval':
        const total = kpis.quotationsApproved + kpis.quotationsRejected;
        progress = total > 0 ? Math.round((kpis.quotationsApproved / total) * 100) : 0;
        if (!earned && progress === 100 && total >= 5) earned = true;
        break;
      case 'speed_demon':
        progress = kpis.avgCompletionTimeHours > 0 ? kpis.avgCompletionTimeHours : 0;
        if (!earned && progress > 0 && progress <= 2 && kpis.tasksCompleted >= 5) earned = true;
        break;
      case 'client_champion':
        progress = kpis.newCallsHandled;
        if (!earned && progress >= 20) earned = true;
        break;
      case 'follow_up_king':
        progress = kpis.followUpsMade;
        if (!earned && progress >= 15) earned = true;
        break;
    }

    if (earned) {
      const achievement = achievements.find(a => a.achievement_type === badge.id);
      earnedBadges.push({
        ...badge,
        earnedAt: achievement?.earned_at,
        progress,
      });
    } else {
      earnedBadges.push({
        ...badge,
        progress,
      });
    }
  });

  return earnedBadges;
}

export default useKPIAnalytics;

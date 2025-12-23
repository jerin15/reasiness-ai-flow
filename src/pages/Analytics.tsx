import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  ArrowLeft,
  Download,
  Search,
  Calendar,
  Users,
  FileText,
  Paintbrush,
  Truck,
  Phone,
  Crown,
  TrendingUp,
  Flame,
  Target,
  CheckCircle,
  Clock,
  Send,
  XCircle,
  MessageSquare,
  Award,
  Star,
  Sparkles,
  Loader2,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { fetchAllRows } from "@/lib/fetchAllRows";

type TimePeriod = 'today' | 'week' | 'month' | 'all' | 'custom';
type Role = 'all' | 'admin' | 'estimation' | 'designer' | 'operations' | 'client_service' | 'technical_head';

interface UserKPIData {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  avatarUrl?: string;
  kpis: {
    tasksCompleted: number;
    tasksCreated: number;
    totalTasksAssigned: number;
    statusChanges: number;
    avgCompletionTimeHours: number;
    rfqsReceived: number;
    quotationsSent: number;
    quotationsApproved: number;
    quotationsRejected: number;
    supplierQuotesCollected: number;
    mockupsCompleted: number;
    mockupsSentToClient: number;
    mockupsApproved: number;
    mockupsRevised: number;
    productionFilesCreated: number;
    productionTasksCompleted: number;
    productionTasksInProgress: number;
    deliveriesMade: number;
    newCallsHandled: number;
    followUpsMade: number;
    quotationsRequested: number;
  };
  badges: Badge[];
  streak: number;
  efficiencyScore: number;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: string;
  progress: number;
  target: number;
}

const BADGE_DEFINITIONS: Badge[] = [
  { id: 'quick_starter', name: 'Quick Starter', description: 'Complete 5 tasks in a day', icon: '⚡', progress: 0, target: 5 },
  { id: 'quotation_master', name: 'Quotation Master', description: 'Send 10 quotations in a day', icon: '📊', progress: 0, target: 10 },
  { id: 'mockup_wizard', name: 'Mockup Wizard', description: 'Complete 5 mockups in a day', icon: '🎨', progress: 0, target: 5 },
  { id: 'production_hero', name: 'Production Hero', description: 'Complete 10 production tasks', icon: '🏭', progress: 0, target: 10 },
  { id: 'streak_5', name: '5-Day Streak', description: 'Active for 5 consecutive days', icon: '🔥', progress: 0, target: 5 },
  { id: 'streak_10', name: '10-Day Streak', description: 'Active for 10 consecutive days', icon: '🔥🔥', progress: 0, target: 10 },
  { id: 'client_champion', name: 'Client Champion', description: 'Handle 20 client calls', icon: '📞', progress: 0, target: 20 },
  { id: 'follow_up_king', name: 'Follow-Up King', description: 'Make 15 follow-ups', icon: '📱', progress: 0, target: 15 },
];

const Analytics = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [activeRole, setActiveRole] = useState<Role>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState<UserKPIData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Custom date range
  const [customFromDate, setCustomFromDate] = useState<Date | undefined>(undefined);
  const [customToDate, setCustomToDate] = useState<Date | undefined>(undefined);
  const [showFromCalendar, setShowFromCalendar] = useState(false);
  const [showToCalendar, setShowToCalendar] = useState(false);

  // AI Insights
  const [aiInsights, setAiInsights] = useState<string>("");
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchAllKPIs();
    }
  }, [period, customFromDate, customToDate]);

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*, user_roles(*)")
        .eq("id", session.user.id)
        .single();

      const role = profile?.user_roles?.[0]?.role;
      if (role !== "admin" && role !== "technical_head") {
        toast.error("Access denied. Admin only.");
        navigate("/");
        return;
      }
      
      await fetchAllKPIs();
    } catch (error) {
      console.error("Error checking access:", error);
      navigate("/");
    }
  };

  const getDateRange = (p: TimePeriod) => {
    const now = new Date();
    switch (p) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'week':
        return { from: startOfWeek(now), to: endOfWeek(now) };
      case 'month':
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'custom':
        return { 
          from: customFromDate ? startOfDay(customFromDate) : startOfDay(now), 
          to: customToDate ? endOfDay(customToDate) : endOfDay(now) 
        };
      case 'all':
      default:
        return { from: new Date('2000-01-01'), to: endOfDay(now) };
    }
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'custom': 
        if (customFromDate && customToDate) {
          return `${format(customFromDate, 'MMM dd')} - ${format(customToDate, 'MMM dd, yyyy')}`;
        }
        return 'Custom Range';
      case 'all': return 'All Time';
      default: return 'Unknown';
    }
  };

  const fetchAiInsights = async (kpiData: UserKPIData[]) => {
    try {
      setAiInsightsLoading(true);
      setAiInsightsError(null);

      // Prepare simplified KPI data for AI
      const simplifiedData = kpiData.map(u => ({
        name: u.userName,
        role: u.userRole,
        tasksCompleted: u.kpis.tasksCompleted,
        rfqsReceived: u.kpis.rfqsReceived,
        quotationsSent: u.kpis.quotationsSent,
        mockupsCompleted: u.kpis.mockupsCompleted,
        productionTasksCompleted: u.kpis.productionTasksCompleted,
        avgCompletionTimeHours: u.kpis.avgCompletionTimeHours,
        streak: u.streak,
        efficiencyScore: u.efficiencyScore,
      }));

      const response = await supabase.functions.invoke('ai-kpi-insights', {
        body: { 
          kpiData: simplifiedData,
          periodLabel: getPeriodLabel(),
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to get AI insights');
      }

      setAiInsights(response.data?.insights || 'No insights available.');
    } catch (error: unknown) {
      console.error('Error fetching AI insights:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate insights';
      setAiInsightsError(errorMessage);
    } finally {
      setAiInsightsLoading(false);
    }
  };

  const fetchAllKPIs = async () => {
    try {
      setLoading(true);
      const { from, to } = getDateRange(period);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();
      const isAllTime = period === 'all';

      // Fetch all users with roles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*, user_roles(*)');

      if (profileError) throw profileError;

      // Fetch ALL tasks including soft-deleted ones (for accurate historical counting)
      const allTasksIncludingDeleted = await fetchAllRows<any>((fromRow, toRow) =>
        supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: true })
          .range(fromRow, toRow)
      );

      // Also fetch only active tasks for current state metrics
      const activeTasks = await fetchAllRows<any>((fromRow, toRow) =>
        supabase
          .from('tasks')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .range(fromRow, toRow)
      );

      // Fetch audit logs (paginated; required for all-time accuracy)
      const auditLogs = await fetchAllRows<any>(async (fromRow, toRow) => {
        let q = supabase
          .from('task_audit_log')
          .select('*')
          .order('created_at', { ascending: true });
        if (!isAllTime) {
          q = q.gte('created_at', fromISO).lte('created_at', toISO);
        }
        return q.range(fromRow, toRow);
      });

      // Fetch task history (paginated)
      const taskHistory = await fetchAllRows<any>(async (fromRow, toRow) => {
        let q = supabase
          .from('task_history')
          .select('*')
          .order('created_at', { ascending: true });
        if (!isAllTime) {
          q = q.gte('created_at', fromISO).lte('created_at', toISO);
        }
        return q.range(fromRow, toRow);
      });

      // Fetch supplier quotes (paginated)
      const supplierQuotes = await fetchAllRows<any>(async (fromRow, toRow) => {
        let q = supabase
          .from('supplier_quotes')
          .select('*')
          .order('created_at', { ascending: true });
        if (!isAllTime) {
          q = q.gte('created_at', fromISO).lte('created_at', toISO);
        }
        return q.range(fromRow, toRow);
      });

      // Fetch user achievements
      const { data: achievements, error: achieveError } = await supabase
        .from('user_achievements')
        .select('*');

      if (achieveError) console.error('Achievements fetch error:', achieveError);

      // Fetch user streaks
      const { data: streaks, error: streakError } = await supabase
        .from('user_activity_streaks')
        .select('*');

      if (streakError) console.error('Streaks fetch error:', streakError);

      // Process each user
      const usersKPIs: UserKPIData[] = (profiles || []).map(profile => {
        const userId = profile.id;
        const userRole = profile.user_roles?.[0]?.role || 'unknown';
        
        // ALL tasks ever assigned to or created by this user (including deleted)
        const allUserTasksEver = (allTasksIncludingDeleted || []).filter(t => 
          t.assigned_to === userId || t.created_by === userId
        );

        // Tasks assigned TO this user specifically (including deleted)
        const allTasksAssignedEver = (allTasksIncludingDeleted || []).filter(t => t.assigned_to === userId);

        // Active tasks (not deleted)
        const activeUserTasks = (activeTasks || []).filter(t => 
          t.assigned_to === userId || t.created_by === userId
        );

        // Filter by period if needed
        const periodTasksAll = isAllTime ? allUserTasksEver : allUserTasksEver.filter(t => {
          const createdAt = new Date(t.created_at || '');
          return createdAt >= from && createdAt <= to;
        });

        // User's audit logs - THIS IS THE SOURCE OF TRUTH FOR ACTIONS
        const userAuditLogs = (auditLogs || []).filter(l => l.changed_by === userId);

        // User's task history - ALSO SOURCE OF TRUTH
        const userTaskHistory = (taskHistory || []).filter(h => h.changed_by === userId);

        // User's supplier quotes
        const userSupplierQuotes = (supplierQuotes || []).filter((q: any) => {
          const task = allTasksIncludingDeleted?.find(t => t.id === q.task_id);
          return task?.assigned_to === userId;
        });

        // Calculate KPIs with all historical data
        const kpis = calculateKPIs(
          periodTasksAll,
          allTasksAssignedEver,
          userAuditLogs,
          userTaskHistory,
          userSupplierQuotes,
          userRole,
          userId,
          isAllTime,
          from,
          to
        );

        // User achievements
        const userAchievements = (achievements || []).filter(a => a.user_id === userId);

        // User streak
        const userStreak = (streaks || []).find(s => s.user_id === userId);

        // Calculate badges
        const badges = calculateBadges(kpis, userAchievements, userStreak);

        return {
          userId,
          userName: profile.full_name || profile.email,
          userEmail: profile.email,
          userRole,
          avatarUrl: profile.avatar_url,
          kpis,
          badges,
          streak: userStreak?.current_streak || 0,
          efficiencyScore: userStreak?.efficiency_score || 0,
        };
      });

      setAllUsers(usersKPIs);
      
      // Fetch AI insights after KPI data is loaded
      if (usersKPIs.length > 0) {
        fetchAiInsights(usersKPIs);
      }
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const calculateKPIs = (
    periodTasks: any[],
    allAssignedTasks: any[],
    auditLogs: any[],
    taskHistory: any[],
    supplierQuotes: any[],
    userRole: string,
    userId: string,
    isAllTime: boolean,
    fromDate: Date,
    toDate: Date
  ) => {
    const isInRange = (dateStr?: string | null) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= fromDate && d <= toDate;
    };

    const assignedTasksInPeriod = isAllTime
      ? allAssignedTasks
      : allAssignedTasks.filter(t => isInRange(t.created_at));

    // ========== TASKS COMPLETED (time-filtered) ==========
    const statusChangesToDone = auditLogs.filter(l =>
      l.action === 'status_changed' && l.new_values?.status === 'done'
    ).length;

    const historyStatusesToDone = taskHistory.filter(h => h.new_status === 'done').length;

    const tasksCompletedFromTasks = isAllTime
      ? allAssignedTasks.filter(t => t.status === 'done').length
      : allAssignedTasks.filter(t => t.status === 'done' && isInRange(t.completed_at || t.status_changed_at || t.updated_at)).length;

    const tasksCompleted = Math.max(statusChangesToDone, historyStatusesToDone, tasksCompletedFromTasks);

    const tasksCreated = periodTasks.filter(t => t.created_by === userId).length;
    const statusChanges = auditLogs.filter(l => l.action === 'status_changed').length;
    const totalTasksAssigned = assignedTasksInPeriod.length;

    // Avg completion time (only tasks completed in the selected period)
    let totalTime = 0, timeCount = 0;
    const tasksForAvg = isAllTime
      ? allAssignedTasks
      : allAssignedTasks.filter(t => isInRange(t.completed_at || t.status_changed_at || t.updated_at));

    tasksForAvg.forEach(t => {
      if (t.created_at && t.completed_at) {
        const hours = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
        if (hours > 0 && hours < 10000) {
          totalTime += hours;
          timeCount++;
        }
      }
    });

    const avgCompletionTimeHours = timeCount > 0 ? Math.round((totalTime / timeCount) * 10) / 10 : 0;

    // ========== ESTIMATION METRICS (time-filtered) ==========
    // RFQs Received = quotation tasks created for (assigned to) the estimator within period
    const rfqsReceived = assignedTasksInPeriod.filter(t => t.type === 'quotation').length;

    // Quotations Sent = quotation tasks the estimator moved to DONE within period
    const quotationsSentFromAudit = auditLogs.filter(l =>
      l.action === 'status_changed' &&
      l.new_values?.status === 'done' &&
      ((l.new_values?.type === 'quotation') || (l.old_values?.type === 'quotation'))
    ).length;

    const quotationsSentFromTasks = assignedTasksInPeriod.filter(t =>
      t.type === 'quotation' && t.status === 'done'
    ).length;

    const quotationsSent = Math.max(quotationsSentFromAudit, quotationsSentFromTasks);

    const quotationsApproved = assignedTasksInPeriod.filter(t =>
      t.type === 'quotation' && ['approved', 'production', 'done', 'mockup', 'with_client'].includes(t.status)
    ).length;

    const quotationsRejected = assignedTasksInPeriod.filter(t =>
      t.type === 'quotation' && t.status === 'rejected'
    ).length;

    const supplierQuotesCollected = supplierQuotes.length;

    // ========== DESIGNER METRICS (time-filtered) ==========
    // Mockups done = designer moved mockup/design workflow tasks to DONE within period
    const mockupsCompletedFromAudit = auditLogs.filter(l =>
      l.action === 'status_changed' &&
      l.new_values?.status === 'done' &&
      (
        l.new_values?.type === 'design' ||
        l.old_values?.type === 'design' ||
        l.new_values?.sent_to_designer_mockup === true ||
        l.old_values?.sent_to_designer_mockup === true
      )
    ).length;

    const mockupsCompletedFromTasks = assignedTasksInPeriod.filter(t =>
      (t.type === 'design' || t.sent_to_designer_mockup === true) &&
      t.status === 'done' &&
      (t.completed_by_designer_id === userId || t.assigned_to === userId)
    ).length;

    const mockupsCompleted = Math.max(mockupsCompletedFromAudit, mockupsCompletedFromTasks);

    const mockupsSentToClient = auditLogs.filter(l =>
      l.action === 'status_changed' &&
      l.new_values?.status === 'with_client' &&
      (
        l.new_values?.type === 'design' ||
        l.old_values?.type === 'design' ||
        l.new_values?.sent_to_designer_mockup === true ||
        l.old_values?.sent_to_designer_mockup === true
      )
    ).length;

    const mockupsApproved = assignedTasksInPeriod.filter(t =>
      t.came_from_designer_done === true ||
      (t.mockup_completed_by_designer === true && ['production', 'done'].includes(t.status))
    ).length;

    const mockupsRevised = auditLogs.filter(l =>
      l.action === 'status_changed' && (l.new_values?.sent_back_to_designer === true)
    ).length;

    const productionFilesCreated = assignedTasksInPeriod.filter(t => t.came_from_designer_done === true).length;

    // ========== OPERATIONS METRICS (time-filtered) ==========
    const productionTasksCompleted = auditLogs.filter(l =>
      l.action === 'status_changed' && l.new_values?.status === 'done'
    ).length;

    const productionTasksInProgress = assignedTasksInPeriod.filter(t => t.status === 'production').length;

    const deliveriesMade = auditLogs.filter(l =>
      l.action === 'status_changed' && l.new_values?.status === 'delivery'
    ).length;

    // ========== CLIENT SERVICE METRICS (time-filtered) ==========
    const newCallsHandled = auditLogs.filter(l =>
      (l.action === 'created' && l.new_values?.status === 'new_calls') ||
      (l.action === 'status_changed' && l.new_values?.status === 'new_calls')
    ).length;

    const followUpsMade = auditLogs.filter(l =>
      l.action === 'status_changed' && l.new_values?.status === 'follow_up'
    ).length;

    const quotationsRequested = auditLogs.filter(l =>
      l.action === 'status_changed' && l.new_values?.status === 'quotation'
    ).length;

    return {
      tasksCompleted,
      tasksCreated,
      totalTasksAssigned,
      statusChanges,
      avgCompletionTimeHours,
      rfqsReceived,
      quotationsSent,
      quotationsApproved,
      quotationsRejected,
      supplierQuotesCollected,
      mockupsCompleted,
      mockupsSentToClient,
      mockupsApproved,
      mockupsRevised,
      productionFilesCreated,
      productionTasksCompleted,
      productionTasksInProgress,
      deliveriesMade,
      newCallsHandled,
      followUpsMade,
      quotationsRequested,
    };
  };

  const calculateBadges = (kpis: any, achievements: any[], streakData: any): Badge[] => {
    const earnedIds = new Set(achievements.map(a => a.achievement_type));

    return BADGE_DEFINITIONS.map(badge => {
      let progress = 0;
      let earned = earnedIds.has(badge.id);

      switch (badge.id) {
        case 'quick_starter':
          progress = kpis.tasksCompleted;
          if (progress >= badge.target) earned = true;
          break;
        case 'quotation_master':
          progress = kpis.quotationsSent;
          if (progress >= badge.target) earned = true;
          break;
        case 'mockup_wizard':
          progress = kpis.mockupsCompleted;
          if (progress >= badge.target) earned = true;
          break;
        case 'production_hero':
          progress = kpis.productionTasksCompleted;
          if (progress >= badge.target) earned = true;
          break;
        case 'streak_5':
        case 'streak_10':
          progress = streakData?.current_streak || 0;
          if (progress >= badge.target) earned = true;
          break;
        case 'client_champion':
          progress = kpis.newCallsHandled;
          if (progress >= badge.target) earned = true;
          break;
        case 'follow_up_king':
          progress = kpis.followUpsMade;
          if (progress >= badge.target) earned = true;
          break;
      }

      return {
        ...badge,
        progress,
        earnedAt: earned ? achievements.find(a => a.achievement_type === badge.id)?.earned_at : undefined,
      };
    });
  };

  const filteredUsers = allUsers.filter(u => {
    const matchesSearch = !searchQuery || 
      u.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.userEmail.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = activeRole === 'all' || u.userRole === activeRole;
    return matchesSearch && matchesRole;
  });

  const usersByRole = {
    estimation: filteredUsers.filter(u => u.userRole === 'estimation'),
    designer: filteredUsers.filter(u => u.userRole === 'designer'),
    operations: filteredUsers.filter(u => u.userRole === 'operations'),
    client_service: filteredUsers.filter(u => u.userRole === 'client_service'),
    admin: filteredUsers.filter(u => u.userRole === 'admin' || u.userRole === 'technical_head'),
  };

  // Totals
  const totalTasksCompleted = filteredUsers.reduce((sum, u) => sum + u.kpis.tasksCompleted, 0);
  const totalStatusChanges = filteredUsers.reduce((sum, u) => sum + u.kpis.statusChanges, 0);
  const avgEfficiency = filteredUsers.length > 0 
    ? Math.round(filteredUsers.reduce((sum, u) => sum + u.efficiencyScore, 0) / filteredUsers.length)
    : 0;
  const totalBadgesEarned = filteredUsers.reduce(
    (sum, u) => sum + u.badges.filter(b => b.earnedAt).length, 0
  );

  const dateRange = getDateRange(period);

  const exportReport = () => {
    try {
      const headers = ["Name", "Email", "Role", "Tasks Completed", "Status Changes", "Avg Time (h)", "Efficiency", "Streak", "Badges"];
      const csvRows = [
        headers.join(","),
        ...filteredUsers.map(user => [
          `"${user.userName}"`,
          `"${user.userEmail}"`,
          user.userRole,
          user.kpis.tasksCompleted,
          user.kpis.statusChanges,
          user.kpis.avgCompletionTimeHours,
          user.efficiencyScore,
          user.streak,
          user.badges.filter(b => b.earnedAt).length,
        ].join(","))
      ];

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kpi-report-${period}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Report exported successfully");
    } catch (error) {
      toast.error("Failed to export report");
    }
  };

  const selectedUser = allUsers.find(u => u.userId === selectedUserId);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'estimation': return FileText;
      case 'designer': return Paintbrush;
      case 'operations': return Truck;
      case 'client_service': return Phone;
      default: return Crown;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'estimation': return 'from-blue-500 to-cyan-500';
      case 'designer': return 'from-purple-500 to-pink-500';
      case 'operations': return 'from-orange-500 to-red-500';
      case 'client_service': return 'from-green-500 to-emerald-500';
      default: return 'from-yellow-500 to-amber-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">📊 KPI Analytics Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Team performance metrics, achievements & reports
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
                <SelectTrigger className="w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {period === 'custom' && (
                <div className="flex items-center gap-2">
                  <Popover open={showFromCalendar} onOpenChange={setShowFromCalendar}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-[130px] justify-start text-left font-normal">
                        <Calendar className="mr-2 h-4 w-4" />
                        {customFromDate ? format(customFromDate, 'MMM dd, yyyy') : 'From'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customFromDate}
                        onSelect={(date) => {
                          setCustomFromDate(date);
                          setShowFromCalendar(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">to</span>
                  <Popover open={showToCalendar} onOpenChange={setShowToCalendar}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-[130px] justify-start text-left font-normal">
                        <Calendar className="mr-2 h-4 w-4" />
                        {customToDate ? format(customToDate, 'MMM dd, yyyy') : 'To'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customToDate}
                        onSelect={(date) => {
                          setCustomToDate(date);
                          setShowToCalendar(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <Button onClick={exportReport} size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Date range + Search */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {getPeriodLabel()} ({format(dateRange.from, 'MMM dd, yyyy')} - {format(dateRange.to, 'MMM dd, yyyy')})
          </div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[200px]"
            />
          </div>
        </div>

        {/* AI Insights Panel */}
        <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border-violet-200/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" />
                <CardTitle className="text-lg">AI-Powered Insights</CardTitle>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => fetchAiInsights(allUsers)}
                disabled={aiInsightsLoading}
              >
                {aiInsightsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <CardDescription>
              Real-time analysis of your team's performance for {getPeriodLabel()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiInsightsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing team performance...</span>
              </div>
            ) : aiInsightsError ? (
              <div className="flex items-center gap-2 text-destructive py-4">
                <AlertTriangle className="h-4 w-4" />
                <span>{aiInsightsError}</span>
                <Button variant="outline" size="sm" onClick={() => fetchAiInsights(allUsers)}>
                  Retry
                </Button>
              </div>
            ) : aiInsights ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm font-sans bg-transparent p-0 m-0 border-0">
                  {aiInsights}
                </pre>
              </div>
            ) : (
              <p className="text-muted-foreground py-4">No insights available yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-200/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Team Members</p>
                  <p className="text-3xl font-bold text-blue-600">{filteredUsers.length}</p>
                </div>
                <Users className="h-10 w-10 text-blue-500/40" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-200/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tasks Done</p>
                  <p className="text-3xl font-bold text-green-600">{totalTasksCompleted}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-green-500/40" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-purple-200/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Efficiency</p>
                  <p className="text-3xl font-bold text-purple-600">{avgEfficiency}%</p>
                </div>
                <Target className="h-10 w-10 text-purple-500/40" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/5 border-orange-200/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Badges Earned</p>
                  <p className="text-3xl font-bold text-orange-600">{totalBadgesEarned}</p>
                </div>
                <Flame className="h-10 w-10 text-orange-500/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Role Tabs */}
        <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as Role)} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              All Teams
            </TabsTrigger>
            {(['estimation', 'designer', 'operations', 'client_service'] as const).map(role => {
              const Icon = getRoleIcon(role);
              const count = usersByRole[role]?.length || 0;
              return (
                <TabsTrigger key={role} value={role} className="flex items-center gap-2 capitalize">
                  <Icon className="h-4 w-4" />
                  {role.replace('_', ' ')}
                  <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Role Sections */}
          <TabsContent value="all" className="space-y-6">
            {(['estimation', 'designer', 'operations', 'client_service'] as const).map(role => {
              const users = usersByRole[role];
              if (users.length === 0) return null;
              return <RoleSection key={role} role={role} users={users} getRoleColor={getRoleColor} onSelectUser={setSelectedUserId} />;
            })}
          </TabsContent>

          {(['estimation', 'designer', 'operations', 'client_service'] as const).map(role => (
            <TabsContent key={role} value={role} className="space-y-4">
              <RoleSection role={role} users={usersByRole[role]} getRoleColor={getRoleColor} onSelectUser={setSelectedUserId} />
            </TabsContent>
          ))}
        </Tabs>

        {/* Team Members Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>Click on a team member to view detailed performance report</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUsers.map(user => (
                <div
                  key={user.userId}
                  onClick={() => setSelectedUserId(user.userId)}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Avatar>
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback>
                      {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.userName}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {user.userRole.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {user.kpis.tasksCompleted} tasks
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {user.streak > 0 && <span className="text-sm" title={`${user.streak} day streak`}>🔥</span>}
                    {user.badges.filter(b => b.earnedAt).slice(0, 2).map(badge => (
                      <span key={badge.id} className="text-sm" title={badge.name}>{badge.icon}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Individual Performance Dialog */}
      <Dialog open={!!selectedUserId} onOpenChange={() => setSelectedUserId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Performance Report</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <IndividualPerformanceView user={selectedUser} period={period} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Role Section Component
const RoleSection = ({ 
  role, 
  users, 
  getRoleColor, 
  onSelectUser 
}: { 
  role: string; 
  users: UserKPIData[]; 
  getRoleColor: (r: string) => string;
  onSelectUser: (id: string) => void;
}) => {
  const aggregated = users.reduce((acc, user) => {
    Object.keys(user.kpis).forEach(key => {
      const k = key as keyof typeof user.kpis;
      acc[k] = (acc[k] || 0) + user.kpis[k];
    });
    return acc;
  }, {} as Record<string, number>);

  const roleLabels: Record<string, { title: string; desc: string }> = {
    estimation: { title: '📊 Estimation Team', desc: 'Quotations, RFQs, and supplier management' },
    designer: { title: '🎨 Design Team', desc: 'Mockups, production files, and client approvals' },
    operations: { title: '🏭 Operations Team', desc: 'Production tasks and deliveries' },
    client_service: { title: '📞 Client Service', desc: 'Calls, follow-ups, and client requests' },
  };

  const label = roleLabels[role] || { title: role, desc: '' };

  const sortedUsers = [...users].sort((a, b) => b.kpis.tasksCompleted - a.kpis.tasksCompleted);

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg bg-gradient-to-r ${getRoleColor(role)} text-white`}>
        <h3 className="text-xl font-bold">{label.title}</h3>
        <p className="text-white/80 text-sm">{label.desc}</p>
        <p className="text-white/60 text-xs mt-1">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Role-specific KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {role === 'estimation' && (
          <>
            <KPICard title="RFQs Received" value={aggregated.rfqsReceived || 0} icon={<FileText className="h-4 w-4 text-blue-500" />} />
            <KPICard title="Quotations Sent" value={aggregated.quotationsSent || 0} icon={<Send className="h-4 w-4 text-green-500" />} />
            <KPICard title="Approved" value={aggregated.quotationsApproved || 0} icon={<CheckCircle className="h-4 w-4 text-emerald-500" />} />
            <KPICard title="Rejected" value={aggregated.quotationsRejected || 0} icon={<XCircle className="h-4 w-4 text-red-500" />} />
            <KPICard title="Supplier Quotes" value={aggregated.supplierQuotesCollected || 0} icon={<Users className="h-4 w-4 text-purple-500" />} />
            <KPICard title="Status Changes" value={aggregated.statusChanges || 0} icon={<TrendingUp className="h-4 w-4 text-orange-500" />} />
          </>
        )}
        {role === 'designer' && (
          <>
            <KPICard title="Mockups Done" value={aggregated.mockupsCompleted || 0} icon={<Paintbrush className="h-4 w-4 text-purple-500" />} />
            <KPICard title="Sent to Client" value={aggregated.mockupsSentToClient || 0} icon={<Send className="h-4 w-4 text-blue-500" />} />
            <KPICard title="Approved" value={aggregated.mockupsApproved || 0} icon={<CheckCircle className="h-4 w-4 text-green-500" />} />
            <KPICard title="Revisions" value={aggregated.mockupsRevised || 0} icon={<XCircle className="h-4 w-4 text-orange-500" />} />
            <KPICard title="Production Files" value={aggregated.productionFilesCreated || 0} icon={<FileText className="h-4 w-4 text-cyan-500" />} />
            <KPICard title="Status Changes" value={aggregated.statusChanges || 0} icon={<TrendingUp className="h-4 w-4 text-yellow-500" />} />
          </>
        )}
        {role === 'operations' && (
          <>
            <KPICard title="Production Done" value={aggregated.productionTasksCompleted || 0} icon={<CheckCircle className="h-4 w-4 text-green-500" />} />
            <KPICard title="Deliveries" value={aggregated.deliveriesMade || 0} icon={<Truck className="h-4 w-4 text-blue-500" />} />
            <KPICard title="Tasks Created" value={aggregated.tasksCreated || 0} icon={<FileText className="h-4 w-4 text-purple-500" />} />
            <KPICard title="Status Changes" value={aggregated.statusChanges || 0} icon={<TrendingUp className="h-4 w-4 text-orange-500" />} />
          </>
        )}
        {role === 'client_service' && (
          <>
            <KPICard title="New Calls" value={aggregated.newCallsHandled || 0} icon={<Phone className="h-4 w-4 text-green-500" />} />
            <KPICard title="Follow-ups" value={aggregated.followUpsMade || 0} icon={<MessageSquare className="h-4 w-4 text-blue-500" />} />
            <KPICard title="Quotations Req." value={aggregated.quotationsRequested || 0} icon={<FileText className="h-4 w-4 text-purple-500" />} />
            <KPICard title="Completed" value={aggregated.tasksCompleted || 0} icon={<CheckCircle className="h-4 w-4 text-emerald-500" />} />
          </>
        )}
      </div>

      {/* Top performers */}
      {sortedUsers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedUsers.slice(0, 5).map((user, index) => (
                <div 
                  key={user.userId} 
                  onClick={() => onSelectUser(user.userId)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback>
                      {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.userName}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{user.kpis.tasksCompleted} tasks completed</span>
                      {user.streak > 0 && (
                        <Badge variant="outline" className="text-xs">🔥 {user.streak} day streak</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {user.badges.filter(b => b.earnedAt).slice(0, 3).map(badge => (
                      <span key={badge.id} className="text-lg" title={badge.name}>{badge.icon}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// KPI Card Component
const KPICard = ({ title, value, icon }: { title: string; value: number | string; icon: React.ReactNode }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="pt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </CardContent>
  </Card>
);

// Individual Performance View
const IndividualPerformanceView = ({ user, period }: { user: UserKPIData; period: TimePeriod }) => {
  const { kpis, badges } = user;
  const earnedBadges = badges.filter(b => b.earnedAt);
  const inProgressBadges = badges.filter(b => !b.earnedAt && b.progress > 0);

  const getRoleKPIs = () => {
    switch (user.userRole) {
      case 'estimation':
        return [
          { label: 'RFQs Received', value: kpis.rfqsReceived, icon: <FileText className="h-4 w-4 text-blue-500" /> },
          { label: 'Quotations Sent', value: kpis.quotationsSent, icon: <Send className="h-4 w-4 text-green-500" /> },
          { label: 'Approved', value: kpis.quotationsApproved, icon: <CheckCircle className="h-4 w-4 text-emerald-500" /> },
          { label: 'Supplier Quotes', value: kpis.supplierQuotesCollected, icon: <FileText className="h-4 w-4 text-purple-500" /> },
        ];
      case 'designer':
        return [
          { label: 'Mockups Done', value: kpis.mockupsCompleted, icon: <Paintbrush className="h-4 w-4 text-purple-500" /> },
          { label: 'Sent to Client', value: kpis.mockupsSentToClient, icon: <Send className="h-4 w-4 text-blue-500" /> },
          { label: 'Approved', value: kpis.mockupsApproved, icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
          { label: 'Revisions', value: kpis.mockupsRevised, icon: <TrendingUp className="h-4 w-4 text-orange-500" /> },
        ];
      case 'operations':
        return [
          { label: 'Production Done', value: kpis.productionTasksCompleted, icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
          { label: 'Deliveries', value: kpis.deliveriesMade, icon: <Truck className="h-4 w-4 text-blue-500" /> },
          { label: 'Status Changes', value: kpis.statusChanges, icon: <TrendingUp className="h-4 w-4 text-purple-500" /> },
        ];
      case 'client_service':
        return [
          { label: 'New Calls', value: kpis.newCallsHandled, icon: <Phone className="h-4 w-4 text-green-500" /> },
          { label: 'Follow-ups', value: kpis.followUpsMade, icon: <TrendingUp className="h-4 w-4 text-blue-500" /> },
          { label: 'Quotations Req.', value: kpis.quotationsRequested, icon: <FileText className="h-4 w-4 text-purple-500" /> },
        ];
      default:
        return [
          { label: 'Tasks Completed', value: kpis.tasksCompleted, icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
          { label: 'Tasks Created', value: kpis.tasksCreated, icon: <FileText className="h-4 w-4 text-blue-500" /> },
          { label: 'Status Changes', value: kpis.statusChanges, icon: <TrendingUp className="h-4 w-4 text-purple-500" /> },
        ];
    }
  };

  const totalTasks = kpis.tasksCompleted + kpis.tasksCreated;
  const efficiencyRate = totalTasks > 0 ? Math.round((kpis.tasksCompleted / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 border-2 border-primary">
          <AvatarImage src={user.avatarUrl} />
          <AvatarFallback className="text-xl">
            {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-2xl font-bold">{user.userName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="capitalize">{user.userRole.replace('_', ' ')}</Badge>
            {user.streak > 0 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-500" />{user.streak} day streak
              </Badge>
            )}
            <Badge variant="outline" className="flex items-center gap-1">
              <Star className="h-3 w-3 text-yellow-500" />{earnedBadges.length} badges
            </Badge>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Efficiency</p>
                <p className="text-2xl font-bold">{efficiencyRate}%</p>
              </div>
              <Target className="h-8 w-8 text-primary/60" />
            </div>
            <Progress value={efficiencyRate} className="mt-2 h-1" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{kpis.tasksCompleted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Activity</p>
                <p className="text-2xl font-bold text-blue-600">{kpis.statusChanges}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold text-orange-600">{kpis.avgCompletionTimeHours}h</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role KPIs */}
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{user.userRole.replace('_', ' ')} Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {getRoleKPIs().map((kpi, i) => (
              <div key={i} className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  {kpi.icon}
                  <span className="text-sm text-muted-foreground">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      <div className="grid md:grid-cols-2 gap-4">
        {earnedBadges.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">🏆 Earned Badges ({earnedBadges.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {earnedBadges.map(badge => (
                  <div
                    key={badge.id}
                    className="flex flex-col items-center p-3 rounded-lg bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border border-yellow-200 dark:border-yellow-800"
                  >
                    <div className="text-3xl mb-2">{badge.icon}</div>
                    <p className="font-semibold text-sm text-center">{badge.name}</p>
                    <p className="text-xs text-muted-foreground text-center mt-1">{badge.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {inProgressBadges.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">🎯 In Progress ({inProgressBadges.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {inProgressBadges.map(badge => {
                  const progressPercent = Math.min((badge.progress / badge.target) * 100, 100);
                  return (
                    <div key={badge.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl opacity-50">{badge.icon}</span>
                          <div>
                            <p className="font-medium text-sm">{badge.name}</p>
                            <p className="text-xs text-muted-foreground">{badge.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-mono">{badge.progress}/{badge.target}</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Analytics;

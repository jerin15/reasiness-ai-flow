import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, TrendingUp, Calendar } from "lucide-react";
import { formatDistanceStrict } from "date-fns";

interface StageMetrics {
  stage: string;
  stageName: string;
  avgHours: number;
  taskCount: number;
  minHours: number;
  maxHours: number;
}

interface TaskTransition {
  taskId: string;
  taskTitle: string;
  currentStage: string;
  currentStageDuration: number;
  lastAction: string;
  lastActionTime: string;
  totalTimeInPipeline: number;
  stageHistory: Array<{
    stage: string;
    enteredAt: string;
    duration: number;
  }>;
}

export function EstimationPipelineAnalytics() {
  const [loading, setLoading] = useState(true);
  const [dailyMetrics, setDailyMetrics] = useState<StageMetrics[]>([]);
  const [weeklyMetrics, setWeeklyMetrics] = useState<StageMetrics[]>([]);
  const [overallMetrics, setOverallMetrics] = useState<StageMetrics[]>([]);
  const [dailyActivities, setDailyActivities] = useState<TaskTransition[]>([]);
  const [weeklyActivities, setWeeklyActivities] = useState<TaskTransition[]>([]);
  const [monthlyActivities, setMonthlyActivities] = useState<TaskTransition[]>([]);

  const stages = [
    { value: 'rfq_received', label: 'RFQ Received', order: 1 },
    { value: 'supplier_quotes', label: 'Supplier Quotes', order: 2 },
    { value: 'client_approval', label: 'Client Approval', order: 3 },
    { value: 'admin_cost_approval', label: 'Admin Cost Approval', order: 4 },
    { value: 'quotation_bill', label: 'Quotation Bill', order: 5 }
  ];

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch all task audit logs for status changes
      const { data: auditLogs, error } = await supabase
        .from('task_audit_log')
        .select('*, tasks(title, type)')
        .eq('action', 'status_changed')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter for estimation-related tasks (quotation type)
      const estimationLogs = auditLogs?.filter(log => 
        log.tasks?.type === 'quotation'
      ) || [];

      // Calculate metrics
      const daily = calculateStageMetrics(estimationLogs, 1);
      const weekly = calculateStageMetrics(estimationLogs, 7);
      const overall = calculateStageMetrics(estimationLogs, null);
      
      // Fetch activities for different time periods
      const dailyAct = await extractEstimationActivities(1);
      const weeklyAct = await extractEstimationActivities(7);
      const monthlyAct = await extractEstimationActivities(30);

      setDailyMetrics(daily);
      setWeeklyMetrics(weekly);
      setOverallMetrics(overall);
      setDailyActivities(dailyAct);
      setWeeklyActivities(weeklyAct);
      setMonthlyActivities(monthlyAct);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStageMetrics = (logs: any[], daysBack: number | null): StageMetrics[] => {
    const now = new Date();
    const cutoffDate = daysBack ? new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000) : null;

    // Group logs by task_id
    const taskLogs = logs.reduce((acc, log) => {
      if (cutoffDate && new Date(log.created_at) < cutoffDate) return acc;
      
      if (!acc[log.task_id]) acc[log.task_id] = [];
      acc[log.task_id].push(log);
      return acc;
    }, {} as Record<string, any[]>);

    // Calculate time spent in each stage
    const stageData: Record<string, number[]> = {};
    
    stages.forEach(stage => {
      stageData[stage.value] = [];
    });

    Object.values(taskLogs).forEach((taskLog: any[]) => {
      taskLog.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (let i = 0; i < taskLog.length - 1; i++) {
        const currentLog = taskLog[i];
        const nextLog = taskLog[i + 1];
        
        const currentStatus = currentLog.new_values?.status;
        const stageIndex = stages.findIndex(s => s.value === currentStatus);
        
        if (stageIndex !== -1) {
          const timeSpent = (new Date(nextLog.created_at).getTime() - new Date(currentLog.created_at).getTime()) / (1000 * 60 * 60);
          stageData[currentStatus].push(timeSpent);
        }
      }
    });

    // Calculate metrics for each stage
    return stages.map(stage => {
      const times = stageData[stage.value];
      const avgHours = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const minHours = times.length > 0 ? Math.min(...times) : 0;
      const maxHours = times.length > 0 ? Math.max(...times) : 0;

      return {
        stage: stage.value,
        stageName: stage.label,
        avgHours,
        taskCount: times.length,
        minHours,
        maxHours
      };
    });
  };

  const extractEstimationActivities = async (daysBack: number): Promise<TaskTransition[]> => {
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      // Minimum date: November 10, 2024
      const minDate = new Date('2024-11-10T00:00:00Z');
      const startDate = cutoffDate < minDate ? minDate : cutoffDate;

      // Get audit logs for estimation activities since the cutoff date
      const { data: auditLogs, error: auditError } = await supabase
        .from('task_audit_log')
        .select('*, tasks!inner(title, type)')
        .eq('action', 'status_changed')
        .eq('tasks.type', 'quotation')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (auditError) throw auditError;
      if (!auditLogs) return [];

      // Filter for estimation stage changes only
      const estimationActivities = auditLogs.filter(log => {
        const fromStage = (log.old_values as any)?.status;
        const toStage = (log.new_values as any)?.status;
        return (
          fromStage && 
          toStage && 
          fromStage !== toStage &&
          (stages.some(s => s.value === fromStage) || stages.some(s => s.value === toStage))
        );
      });

      // Group by task to build complete picture
      const taskActivitiesMap = new Map<string, TaskTransition>();

      for (const log of estimationActivities) {
        const taskId = log.task_id;
        const fromStage = (log.old_values as any)?.status;
        const toStage = (log.new_values as any)?.status;
        
        if (!taskActivitiesMap.has(taskId)) {
          // Get all logs for this task to calculate durations
          const { data: taskLogs } = await supabase
            .from('task_audit_log')
            .select('*')
            .eq('task_id', taskId)
            .eq('action', 'status_changed')
            .order('created_at', { ascending: true });

          const allTaskLogs = taskLogs || [];
          const stageHistory: Array<{ stage: string; enteredAt: string; duration: number }> = [];
          
          // Build stage history
          for (let i = 0; i < allTaskLogs.length; i++) {
            const currentLog = allTaskLogs[i];
            const stage = (currentLog.new_values as any)?.status;
            
            if (stage && stages.some(s => s.value === stage)) {
              const enteredAt = new Date(currentLog.created_at);
              const nextLog = allTaskLogs[i + 1];
              const exitTime = nextLog ? new Date(nextLog.created_at) : now;
              const duration = (exitTime.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
              
              stageHistory.push({
                stage: stages.find(s => s.value === stage)?.label || stage,
                enteredAt: currentLog.created_at,
                duration: Math.max(0, duration)
              });
            }
          }

          const taskTitle = (log.tasks as any)?.title || 'Unknown Task';
          const currentStageLabel = stages.find(s => s.value === toStage)?.label || toStage;
          const fromStageLabel = stages.find(s => s.value === fromStage)?.label || fromStage;
          
          // Calculate time in current stage
          const currentStageDuration = stageHistory.length > 0 
            ? stageHistory[stageHistory.length - 1].duration 
            : 0;
          
          // Total time in pipeline
          const firstLog = allTaskLogs[0];
          const totalTimeInPipeline = firstLog 
            ? (now.getTime() - new Date(firstLog.created_at).getTime()) / (1000 * 60 * 60)
            : 0;

          taskActivitiesMap.set(taskId, {
            taskId,
            taskTitle,
            currentStage: currentStageLabel,
            currentStageDuration,
            lastAction: `Moved from ${fromStageLabel} to ${currentStageLabel}`,
            lastActionTime: log.created_at,
            totalTimeInPipeline,
            stageHistory
          });
        }
      }

      return Array.from(taskActivitiesMap.values())
        .sort((a, b) => new Date(b.lastActionTime).getTime() - new Date(a.lastActionTime).getTime());
      
    } catch (error) {
      console.error('Error fetching estimation activities:', error);
      return [];
    }
  };

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}d ${remainingHours}h`;
  };

  const MetricsCards = ({ metrics }: { metrics: StageMetrics[] }) => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.stage}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{metric.stageName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formatHours(metric.avgHours)}</span>
                <span className="text-xs text-muted-foreground">avg time</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {metric.taskCount} task{metric.taskCount !== 1 ? 's' : ''} moved
              </div>
              {metric.taskCount > 0 && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Min: {formatHours(metric.minHours)} • Max: {formatHours(metric.maxHours)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Estimation Pipeline Analytics</h2>
        <p className="text-muted-foreground">
          Track time spent in each estimation stage: RFQ → Supplier Quotes → Client Approval → Admin Cost Approval → Quotation Bill
        </p>
      </div>

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily" className="gap-2">
            <Calendar className="h-4 w-4" />
            Today
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            This Week
          </TabsTrigger>
          <TabsTrigger value="overall" className="gap-2">
            <Clock className="h-4 w-4" />
            All Time
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <MetricsCards metrics={dailyMetrics} />
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          <MetricsCards metrics={weeklyMetrics} />
        </TabsContent>

        <TabsContent value="overall" className="space-y-4">
          <MetricsCards metrics={overallMetrics} />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Estimation Team Activity</CardTitle>
          <CardDescription>Estimation activities from November 10, 2024 onwards</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="daily" className="space-y-4">
            <TabsList>
              <TabsTrigger value="daily">Today</TabsTrigger>
              <TabsTrigger value="weekly">This Week</TabsTrigger>
              <TabsTrigger value="monthly">This Month</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="space-y-4">
              {dailyActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No estimation activities today</p>
              ) : (
                dailyActivities.map((activity) => (
                  <div key={activity.taskId} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <p className="font-medium">{activity.taskTitle}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                            {activity.currentStage}
                          </span>
                          <span>•</span>
                          <span>{activity.lastAction}</span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-sm font-semibold text-primary">
                          {formatHours(activity.currentStageDuration)}
                        </p>
                        <p className="text-xs text-muted-foreground">in stage</p>
                      </div>
                    </div>
                    
                    {activity.stageHistory.length > 0 && (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Stage Journey:</p>
                        <div className="flex flex-wrap gap-2">
                          {activity.stageHistory.map((stage, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className="text-xs px-2 py-1 rounded bg-muted">
                                {stage.stage}: {formatHours(stage.duration)}
                              </span>
                              {idx < activity.stageHistory.length - 1 && (
                                <span className="text-muted-foreground">→</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          Total time in pipeline: <span className="font-semibold">{formatHours(activity.totalTimeInPipeline)}</span>
                        </p>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceStrict(new Date(activity.lastActionTime), new Date(), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="weekly" className="space-y-4">
              {weeklyActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No estimation activities this week</p>
              ) : (
                weeklyActivities.map((activity) => (
                  <div key={activity.taskId} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <p className="font-medium">{activity.taskTitle}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                            {activity.currentStage}
                          </span>
                          <span>•</span>
                          <span>{activity.lastAction}</span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-sm font-semibold text-primary">
                          {formatHours(activity.currentStageDuration)}
                        </p>
                        <p className="text-xs text-muted-foreground">in stage</p>
                      </div>
                    </div>
                    
                    {activity.stageHistory.length > 0 && (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Stage Journey:</p>
                        <div className="flex flex-wrap gap-2">
                          {activity.stageHistory.map((stage, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className="text-xs px-2 py-1 rounded bg-muted">
                                {stage.stage}: {formatHours(stage.duration)}
                              </span>
                              {idx < activity.stageHistory.length - 1 && (
                                <span className="text-muted-foreground">→</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          Total time in pipeline: <span className="font-semibold">{formatHours(activity.totalTimeInPipeline)}</span>
                        </p>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceStrict(new Date(activity.lastActionTime), new Date(), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="monthly" className="space-y-4">
              {monthlyActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No estimation activities this month</p>
              ) : (
                monthlyActivities.map((activity) => (
                  <div key={activity.taskId} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <p className="font-medium">{activity.taskTitle}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                            {activity.currentStage}
                          </span>
                          <span>•</span>
                          <span>{activity.lastAction}</span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-sm font-semibold text-primary">
                          {formatHours(activity.currentStageDuration)}
                        </p>
                        <p className="text-xs text-muted-foreground">in stage</p>
                      </div>
                    </div>
                    
                    {activity.stageHistory.length > 0 && (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Stage Journey:</p>
                        <div className="flex flex-wrap gap-2">
                          {activity.stageHistory.map((stage, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className="text-xs px-2 py-1 rounded bg-muted">
                                {stage.stage}: {formatHours(stage.duration)}
                              </span>
                              {idx < activity.stageHistory.length - 1 && (
                                <span className="text-muted-foreground">→</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          Total time in pipeline: <span className="font-semibold">{formatHours(activity.totalTimeInPipeline)}</span>
                        </p>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceStrict(new Date(activity.lastActionTime), new Date(), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

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
  const [recentActivities, setRecentActivities] = useState<TaskTransition[]>([]);

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
      const activities = await extractEstimationActivities(15);

      setDailyMetrics(daily);
      setWeeklyMetrics(weekly);
      setOverallMetrics(overall);
      setRecentActivities(activities);
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

  const extractEstimationActivities = async (limit: number): Promise<TaskTransition[]> => {
    try {
      // Get all quotation tasks currently in the estimation pipeline
      const stageValues = stages.map(s => s.value);
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, status, created_at')
        .eq('type', 'quotation')
        .in('status', stageValues as any)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (tasksError) throw tasksError;
      if (!tasks) return [];

      // Get audit logs for these tasks
      const taskIds = tasks.map(t => t.id);
      const { data: auditLogs, error: auditError } = await supabase
        .from('task_audit_log')
        .select('*')
        .in('task_id', taskIds)
        .eq('action', 'status_changed')
        .order('created_at', { ascending: true });

      if (auditError) throw auditError;

      // Process each task
      return tasks.map(task => {
        const taskLogs = (auditLogs || []).filter(log => log.task_id === task.id);
        const currentStage = task.status;
        const now = new Date();
        
        // Find when task entered current stage
        let enteredCurrentStage = new Date(task.created_at);
        let lastAction = 'Task created in RFQ';
        
        for (let i = taskLogs.length - 1; i >= 0; i--) {
          const log = taskLogs[i];
          const newStatus = (log.new_values as any)?.status;
          if (newStatus === currentStage) {
            enteredCurrentStage = new Date(log.created_at);
            const fromStage = (log.old_values as any)?.status;
            lastAction = `Moved from ${stages.find(s => s.value === fromStage)?.label || fromStage} to ${stages.find(s => s.value === currentStage)?.label}`;
            break;
          }
        }
        
        // Calculate current stage duration
        const currentStageDuration = (now.getTime() - enteredCurrentStage.getTime()) / (1000 * 60 * 60);
        
        // Build stage history
        const stageHistory: Array<{ stage: string; enteredAt: string; duration: number }> = [];
        let previousTime = new Date(task.created_at);
        
        taskLogs.forEach((log, index) => {
          const stage = (log.new_values as any)?.status;
          if (stage && stages.some(s => s.value === stage)) {
            const enteredAt = new Date(log.created_at);
            const nextTime = index < taskLogs.length - 1 
              ? new Date(taskLogs[index + 1].created_at)
              : now;
            const duration = (nextTime.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
            
            stageHistory.push({
              stage: stages.find(s => s.value === stage)?.label || stage,
              enteredAt: log.created_at,
              duration
            });
            
            previousTime = enteredAt;
          }
        });
        
        // Total time in pipeline
        const totalTimeInPipeline = (now.getTime() - new Date(task.created_at).getTime()) / (1000 * 60 * 60);
        
        // Get most recent action
        const lastLog = taskLogs[taskLogs.length - 1];
        const lastActionTime = lastLog ? lastLog.created_at : task.created_at;
        
        return {
          taskId: task.id,
          taskTitle: task.title,
          currentStage: stages.find(s => s.value === currentStage)?.label || currentStage,
          currentStageDuration,
          lastAction,
          lastActionTime,
          totalTimeInPipeline,
          stageHistory
        };
      }).sort((a, b) => new Date(b.lastActionTime).getTime() - new Date(a.lastActionTime).getTime());
      
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
          <CardDescription>Current tasks in estimation pipeline and their progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active tasks in estimation pipeline</p>
            ) : (
              recentActivities.map((activity) => (
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
                      <p className="text-xs text-muted-foreground">in current stage</p>
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
                    Last updated {formatDistanceStrict(new Date(activity.lastActionTime), new Date(), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  taskTitle: string;
  fromStage: string;
  toStage: string;
  hoursSpent: number;
  transitionDate: string;
}

export function EstimationPipelineAnalytics() {
  const [loading, setLoading] = useState(true);
  const [dailyMetrics, setDailyMetrics] = useState<StageMetrics[]>([]);
  const [weeklyMetrics, setWeeklyMetrics] = useState<StageMetrics[]>([]);
  const [overallMetrics, setOverallMetrics] = useState<StageMetrics[]>([]);
  const [recentTransitions, setRecentTransitions] = useState<TaskTransition[]>([]);

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
      const transitions = extractRecentTransitions(estimationLogs, 10);

      setDailyMetrics(daily);
      setWeeklyMetrics(weekly);
      setOverallMetrics(overall);
      setRecentTransitions(transitions);
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

  const extractRecentTransitions = (logs: any[], limit: number): TaskTransition[] => {
    const transitions: TaskTransition[] = [];
    
    // Group by task to calculate time spent
    const taskLogs = logs.reduce((acc, log) => {
      if (!acc[log.task_id]) acc[log.task_id] = [];
      acc[log.task_id].push(log);
      return acc;
    }, {} as Record<string, any[]>);

    // Process each task's logs
    Object.values(taskLogs).forEach((taskLog: any[]) => {
      // Sort chronologically
      taskLog.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      // Process each status change
      taskLog.forEach((log, index) => {
        const fromStage = log.old_values?.status;
        const toStage = log.new_values?.status;
        
        // Only include valid estimation stage transitions
        if (
          fromStage && 
          toStage && 
          fromStage !== toStage &&
          stages.some(s => s.value === fromStage) && 
          stages.some(s => s.value === toStage)
        ) {
          // Find when the task entered the fromStage (look for previous log)
          let enteredFromStageTime = new Date(log.created_at);
          for (let i = index - 1; i >= 0; i--) {
            if (taskLog[i].new_values?.status === fromStage) {
              enteredFromStageTime = new Date(taskLog[i].created_at);
              break;
            }
          }
          
          // Calculate hours spent in fromStage before transitioning
          const hoursSpent = (new Date(log.created_at).getTime() - enteredFromStageTime.getTime()) / (1000 * 60 * 60);
          
          transitions.push({
            taskTitle: log.tasks?.title || 'Unknown Task',
            fromStage: stages.find(s => s.value === fromStage)?.label || fromStage,
            toStage: stages.find(s => s.value === toStage)?.label || toStage,
            hoursSpent: Math.max(0, hoursSpent),
            transitionDate: log.created_at
          });
        }
      });
    });

    return transitions
      .sort((a, b) => new Date(b.transitionDate).getTime() - new Date(a.transitionDate).getTime())
      .slice(0, limit);
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
          <CardTitle>Recent Stage Transitions</CardTitle>
          <CardDescription>Last 10 tasks moved between estimation stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentTransitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent transitions found</p>
            ) : (
              recentTransitions.map((transition, idx) => (
                <div key={idx} className="flex items-start justify-between border-b pb-3 last:border-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{transition.taskTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {transition.fromStage} → {transition.toStage}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatHours(transition.hoursSpent)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceStrict(new Date(transition.transitionDate), new Date(), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

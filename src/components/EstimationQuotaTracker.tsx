import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Target, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

interface QuotaStats {
  completed: number;
  quota: number;
  inProgress: number;
  avgCompletionTime: number;
}

export const EstimationQuotaTracker = () => {
  const [stats, setStats] = useState<QuotaStats>({
    completed: 0,
    quota: 3,
    inProgress: 0,
    avgCompletionTime: 0
  });
  const [isEstimation, setIsEstimation] = useState(false);

  useEffect(() => {
    checkUserAndFetchStats();
    
    // Refresh every 5 minutes
    const interval = setInterval(checkUserAndFetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkUserAndFetchStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is estimation
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (userRole?.role !== 'estimation') {
        setIsEstimation(false);
        return;
      }

      setIsEstimation(true);

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get quotations moved to done status today (based on status_changed_at)
      const { data: completedTasks } = await supabase
        .from('tasks')
        .select('completed_at, status_changed_at, created_at')
        .eq('assigned_to', user.id)
        .eq('type', 'quotation')
        .eq('status', 'done')
        .gte('status_changed_at', today.toISOString())
        .lt('status_changed_at', tomorrow.toISOString());

      // Get in-progress quotations
      const { count: inProgressCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .eq('type', 'quotation')
        .in('status', ['todo', 'supplier_quotes', 'client_approval', 'admin_approval'])
        .is('deleted_at', null);

      // Calculate average completion time
      let avgTime = 0;
      if (completedTasks && completedTasks.length > 0) {
        const times = completedTasks.map(task => {
          const start = new Date(task.status_changed_at || task.completed_at);
          const end = new Date(task.completed_at);
          return (end.getTime() - start.getTime()) / (1000 * 60 * 60); // hours
        });
        avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      }

      setStats({
        completed: completedTasks?.length || 0,
        quota: 3,
        inProgress: inProgressCount || 0,
        avgCompletionTime: avgTime
      });
    } catch (error) {
      console.error('Error fetching quota stats:', error);
    }
  };

  if (!isEstimation) return null;

  const percentage = Math.min((stats.completed / stats.quota) * 100, 100);
  const remaining = Math.max(0, stats.quota - stats.completed);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Today's Quota Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold">
              {stats.completed} / {stats.quota}
            </span>
            <span className={`text-sm font-medium ${percentage >= 100 ? 'text-green-600' : 'text-muted-foreground'}`}>
              {percentage.toFixed(0)}%
            </span>
          </div>
          <Progress value={percentage} className="h-3" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <div className="text-xl font-bold text-green-600">{stats.completed}</div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">In Progress</span>
            </div>
            <div className="text-xl font-bold text-orange-600">{stats.inProgress}</div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Avg Time</span>
            </div>
            <div className="text-xl font-bold text-blue-600">
              {stats.avgCompletionTime > 0 ? `${stats.avgCompletionTime.toFixed(1)}h` : '--'}
            </div>
          </div>
        </div>

        {remaining > 0 ? (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
            <p className="text-sm font-medium">
              🎯 Complete {remaining} more quotation{remaining > 1 ? 's' : ''} to meet today's quota
            </p>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <p className="text-sm font-medium">
              🎉 Great work! You've met today's quota!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

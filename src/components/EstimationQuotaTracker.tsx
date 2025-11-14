import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Target, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';

interface DailyStats {
  date: string;
  count: number;
}

type ViewMode = 'day' | 'week';

export const EstimationQuotaTracker = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [todayCount, setTodayCount] = useState(0);
  const [weeklyStats, setWeeklyStats] = useState<DailyStats[]>([]);
  const [isEstimation, setIsEstimation] = useState(false);

  useEffect(() => {
    checkUserAndFetchStats();
    
    // Refresh every 5 minutes
    const interval = setInterval(checkUserAndFetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedDate, viewMode]);

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

      if (viewMode === 'day') {
        // Get quotations for selected day
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const { count } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('type', 'quotation')
          .eq('status', 'done')
          .gte('status_changed_at', dayStart.toISOString())
          .lte('status_changed_at', dayEnd.toISOString());

        setTodayCount(count || 0);
      } else {
        // Get quotations for the week
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 }); // Sunday

        const { data: weekTasks } = await supabase
          .from('tasks')
          .select('status_changed_at')
          .eq('assigned_to', user.id)
          .eq('type', 'quotation')
          .eq('status', 'done')
          .gte('status_changed_at', weekStart.toISOString())
          .lte('status_changed_at', weekEnd.toISOString());

        // Group by day
        const dailyMap: Record<string, number> = {};
        for (let i = 0; i < 7; i++) {
          const day = addDays(weekStart, i);
          dailyMap[format(day, 'yyyy-MM-dd')] = 0;
        }

        weekTasks?.forEach(task => {
          const taskDate = format(new Date(task.status_changed_at), 'yyyy-MM-dd');
          if (dailyMap[taskDate] !== undefined) {
            dailyMap[taskDate]++;
          }
        });

        const stats: DailyStats[] = Object.entries(dailyMap).map(([date, count]) => ({
          date,
          count
        }));

        setWeeklyStats(stats);
      }
    } catch (error) {
      console.error('Error fetching quota stats:', error);
    }
  };

  if (!isEstimation) return null;

  const handlePrevious = () => {
    if (viewMode === 'day') {
      setSelectedDate(prev => addDays(prev, -1));
    } else {
      setSelectedDate(prev => subWeeks(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'day') {
      setSelectedDate(prev => addDays(prev, 1));
    } else {
      setSelectedDate(prev => addWeeks(prev, 1));
    }
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Quotation Tracker
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'day' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('day')}
            >
              Day
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('week')}
            >
              Week
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handlePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {viewMode === 'day' 
                ? format(selectedDate, 'MMMM dd, yyyy')
                : `Week of ${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM dd')}`
              }
            </span>
            <Button variant="link" size="sm" onClick={handleToday} className="h-auto p-0">
              Go to Today
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {viewMode === 'day' ? (
          <div className="text-center">
            <div className="text-5xl font-bold text-primary">{todayCount}</div>
            <p className="text-muted-foreground mt-2">
              Quotation{todayCount !== 1 ? 's' : ''} completed
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {weeklyStats.map((stat) => {
              const statDate = new Date(stat.date);
              const isToday = isSameDay(statDate, new Date());
              return (
                <div 
                  key={stat.date} 
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isToday ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <span className="font-medium">
                    {format(statDate, 'EEE, MMM dd')}
                    {isToday && <span className="text-xs text-primary ml-2">(Today)</span>}
                  </span>
                  <span className={`text-2xl font-bold ${stat.count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                    {stat.count}
                  </span>
                </div>
              );
            })}
            <div className="pt-3 border-t mt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Weekly Total:</span>
                <span className="text-3xl font-bold text-primary">
                  {weeklyStats.reduce((sum, stat) => sum + stat.count, 0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

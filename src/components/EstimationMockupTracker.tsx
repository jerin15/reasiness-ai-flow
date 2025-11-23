import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Clock, Paintbrush } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface MockupTask {
  id: string;
  title: string;
  client_name: string | null;
  sent_to_designer_mockup: boolean;
  mockup_completed_by_designer: boolean;
  status: string;
  updated_at: string;
  created_at: string;
}

export const EstimationMockupTracker = () => {
  const [mockupTasks, setMockupTasks] = useState<MockupTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMockupTasks();
    
    // Subscribe to changes
    const channel = supabase
      .channel('estimation-mockup-tracker')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: 'sent_to_designer_mockup=eq.true'
        },
        () => {
          fetchMockupTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMockupTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, client_name, sent_to_designer_mockup, mockup_completed_by_designer, status, updated_at, created_at')
        .eq('sent_to_designer_mockup', true)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setMockupTasks(data || []);
    } catch (error) {
      console.error('Error fetching mockup tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = mockupTasks.length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Paintbrush className="h-5 w-5 text-primary" />
            <CardTitle>Mockup Tracker</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-base">Pending Mockup Requests</CardTitle>
              <CardDescription className="text-xs">Tasks awaiting designer mockup</CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm font-semibold">
            {pendingCount} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {mockupTasks.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No pending mockup requests</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mockupTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="font-medium text-sm truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.client_name && (
                      <span className="text-xs text-muted-foreground">{task.client_name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-1 text-xs whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  Pending
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

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
        .eq('created_by', user.id)
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

  const pendingCount = mockupTasks.filter(t => !t.mockup_completed_by_designer).length;
  const completedCount = mockupTasks.filter(t => t.mockup_completed_by_designer).length;

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Tasks Sent to Designer for Mockup</CardTitle>
              <CardDescription>Track all mockup requests you've sent</CardDescription>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mockupTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Paintbrush className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No tasks sent to designer yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-center">Mockup Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockupTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {task.title}
                    </TableCell>
                    <TableCell>
                      {task.client_name || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {task.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-center">
                      {task.mockup_completed_by_designer ? (
                        <Badge variant="default" className="gap-1 bg-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

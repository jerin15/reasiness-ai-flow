import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Clock, Paintbrush, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface MockupTask {
  id: string;
  title: string;
  client_name: string | null;
  sent_to_designer_mockup: boolean;
  mockup_completed_by_designer: boolean;
  status: string;
  updated_at: string;
  created_at: string;
  admin_remarks: string | null;
}

export const EstimationMockupTracker = () => {
  const [mockupTasks, setMockupTasks] = useState<MockupTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<MockupTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMockupTasks();
    fetchCompletedTasks();
    
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
          fetchCompletedTasks();
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
        .select('id, title, client_name, sent_to_designer_mockup, mockup_completed_by_designer, status, updated_at, created_at, admin_remarks')
        .eq('sent_to_designer_mockup', true)
        .eq('mockup_completed_by_designer', false)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching mockup tasks:', error);
        throw error;
      }
      
      setMockupTasks(data || []);
    } catch (error) {
      console.error('Error fetching mockup tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompletedTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, client_name, sent_to_designer_mockup, mockup_completed_by_designer, status, updated_at, created_at, admin_remarks')
        .eq('sent_to_designer_mockup', true)
        .eq('mockup_completed_by_designer', true)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching completed mockup tasks:', error);
        throw error;
      }
      
      setCompletedTasks(data || []);
    } catch (error) {
      console.error('Error fetching completed mockup tasks:', error);
    }
  };

  // Note: Cloning now happens automatically when designer marks complete
  // This section just shows the completed mockups that already have clones created
  // The "Pull Back" button is no longer needed since clones are auto-created

  const pendingCount = mockupTasks.length;
  const completedCount = completedTasks.length;

  const handleCancelMockup = async (taskId: string, taskTitle: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the task to find previous status
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('previous_status, created_by')
        .eq('id', taskId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching task:', fetchError);
        toast.error(`Failed to fetch task: ${fetchError.message}`);
        return;
      }

      // Update task to remove from mockup pipeline - assign back to current estimator
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          sent_to_designer_mockup: false,
          mockup_completed_by_designer: false,
          status: task?.previous_status || 'todo',
          assigned_to: user.id, // Always assign back to current estimator
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (updateError) {
        console.error('Error canceling mockup:', updateError);
        toast.error(`Failed to cancel: ${updateError.message}`);
        return;
      }

      toast.success(`Removed "${taskTitle}" from mockup panel`);
      fetchMockupTasks();
    } catch (error) {
      console.error('Error canceling mockup:', error);
      toast.error('Failed to cancel mockup request');
    }
  };

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
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Mockup Tracker</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-3.5 w-3.5" />
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed ({completedCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {mockupTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No pending mockup requests</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mockupTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors group">
                    <div className="flex-1 min-w-0 mr-2">
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
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1 text-xs whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleCancelMockup(task.id, task.title)}
                        title="Cancel mockup request"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {completedTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No completed mockups</p>
                <p className="text-xs mt-1">Completed mockups auto-create tasks in your TODO</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
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
                      <Badge variant="default" className="gap-1 text-xs whitespace-nowrap">
                        <CheckCircle2 className="h-3 w-3" />
                        Done
                      </Badge>
                    </div>
                    
                    {task.admin_remarks && (
                      <div className="text-xs bg-muted/50 p-2 rounded border-l-2 border-primary">
                        <span className="font-medium">Designer remarks:</span> {task.admin_remarks}
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <span>Task auto-created in your TODO pipeline</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

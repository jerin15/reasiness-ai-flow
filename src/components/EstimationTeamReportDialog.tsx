import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface EstimationTeamReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TaskSummary {
  user_id: string;
  user_name: string;
  user_email: string;
  completed_quotations: number;
  pending_quotations: number;
  completed_invoices: number;
  pending_invoices: number;
  total_pending: number;
}

interface TaskDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  client_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string;
  user_name: string;
}

export function EstimationTeamReportDialog({ open, onOpenChange }: EstimationTeamReportDialogProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TaskSummary[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskDetail[]>([]);
  const [pendingTasks, setPendingTasks] = useState<TaskDetail[]>([]);

  useEffect(() => {
    if (open) {
      fetchEstimationReport();
    }
  }, [open]);

  const fetchEstimationReport = async () => {
    setLoading(true);
    try {
      // Get all estimation team members
      const { data: estimationUsers, error: usersError } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, full_name, email)')
        .eq('role', 'estimation');

      if (usersError) throw usersError;

      const summaryData: TaskSummary[] = [];
      const allCompletedTasks: TaskDetail[] = [];
      const allPendingTasks: TaskDetail[] = [];

      // For each estimation user, get their task statistics
      for (const userRole of estimationUsers || []) {
        const userId = userRole.user_id;
        const profile = userRole.profiles as any;

        // Get completed tasks
        const { data: completed, error: completedError } = await supabase
          .from('tasks')
          .select('*')
          .eq('assigned_to', userId)
          .eq('status', 'done')
          .is('deleted_at', null)
          .in('type', ['quotation', 'invoice']);

        if (completedError) throw completedError;

        // Get pending tasks
        const { data: pending, error: pendingError } = await supabase
          .from('tasks')
          .select('*')
          .eq('assigned_to', userId)
          .neq('status', 'done')
          .is('deleted_at', null)
          .in('type', ['quotation', 'invoice', 'general']);

        if (pendingError) throw pendingError;

        const completedQuotations = completed?.filter(t => t.type === 'quotation') || [];
        const completedInvoices = completed?.filter(t => t.type === 'invoice') || [];
        const pendingQuotations = pending?.filter(t => t.type === 'quotation') || [];
        const pendingInvoices = pending?.filter(t => t.type === 'invoice') || [];

        summaryData.push({
          user_id: userId,
          user_name: profile.full_name,
          user_email: profile.email,
          completed_quotations: completedQuotations.length,
          pending_quotations: pendingQuotations.length,
          completed_invoices: completedInvoices.length,
          pending_invoices: pendingInvoices.length,
          total_pending: pending?.length || 0,
        });

        // Add to completed tasks list
        completed?.forEach(task => {
          allCompletedTasks.push({
            ...task,
            user_name: profile.full_name,
          });
        });

        // Add to pending tasks list
        pending?.forEach(task => {
          allPendingTasks.push({
            ...task,
            user_name: profile.full_name,
          });
        });
      }

      setSummary(summaryData);
      setCompletedTasks(allCompletedTasks);
      setPendingTasks(allPendingTasks);
    } catch (error) {
      console.error('Error fetching estimation report:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'quotation':
        return <FileText className="h-4 w-4" />;
      case 'invoice':
        return <FileText className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Estimation Team Report
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="completed">Completed Tasks</TabsTrigger>
              <TabsTrigger value="pending">Pending Tasks</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Member</TableHead>
                      <TableHead className="text-center">Completed Quotations</TableHead>
                      <TableHead className="text-center">Pending Quotations</TableHead>
                      <TableHead className="text-center">Completed Invoices</TableHead>
                      <TableHead className="text-center">Pending Invoices</TableHead>
                      <TableHead className="text-center">Total Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((member) => (
                      <TableRow key={member.user_id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{member.user_name}</div>
                            <div className="text-sm text-muted-foreground">{member.user_email}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-green-50">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {member.completed_quotations}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-yellow-50">
                            <Clock className="h-3 w-3 mr-1" />
                            {member.pending_quotations}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-green-50">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {member.completed_invoices}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-yellow-50">
                            <Clock className="h-3 w-3 mr-1" />
                            {member.pending_invoices}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={member.total_pending > 5 ? "destructive" : "secondary"}>
                            {member.total_pending}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Completed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getTypeIcon(task.type)}
                            <span className="capitalize">{task.type}</span>
                          </div>
                        </TableCell>
                        <TableCell>{task.client_name || '-'}</TableCell>
                        <TableCell>{task.user_name}</TableCell>
                        <TableCell>
                          <Badge variant={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.completed_at ? format(new Date(task.completed_at), 'PPp') : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getTypeIcon(task.type)}
                            <span className="capitalize">{task.type}</span>
                          </div>
                        </TableCell>
                        <TableCell>{task.client_name || '-'}</TableCell>
                        <TableCell>{task.user_name}</TableCell>
                        <TableCell>
                          <Badge variant={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.due_date ? format(new Date(task.due_date), 'PPp') : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {task.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

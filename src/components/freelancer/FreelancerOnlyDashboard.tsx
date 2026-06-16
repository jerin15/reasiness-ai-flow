import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, LogOut, Wallet, CheckCircle2, Clock, Plus, Pencil, Trash2, Banknote } from "lucide-react";
import { format } from "date-fns";
import { AddTaskDialog } from "@/components/AddTaskDialog";
import { EditTaskDialog } from "@/components/EditTaskDialog";
import { FreelancerBillingDialog } from "@/components/freelancer/FreelancerBillingDialog";
import { toast } from "sonner";

type Task = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  billable_amount: number | null;
};

type Payment = {
  id: string;
  task_ids: string[];
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

interface Props {
  userId: string;
  userName: string;
  userAvatar?: string;
  onSignOut: () => void;
  isAdmin?: boolean;
}

export const FreelancerOnlyDashboard = ({ userId, userName, userAvatar, onSignOut, isAdmin = false }: Props) => {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);

  const openEdit = async (taskId: string) => {
    const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).single();
    if (error || !data) {
      toast.error("Failed to load task");
      return;
    }
    setEditingTask(data);
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm("Delete this task? This is a soft delete and can be recovered.")) return;
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) {
      toast.error("Failed to delete task");
      return;
    }
    toast.success("Task deleted");
    fetchData();
  };

  const fetchData = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [tRes, pRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, completed_at, billable_amount")
          .eq("assigned_to", userId)
          .eq("is_billable", true)
          .is("deleted_at", null)
          .order("completed_at", { ascending: false, nullsFirst: false }),
        supabase
          .from("freelancer_payments")
          .select("id, task_ids, amount, paid_at, method, reference, notes")
          .eq("freelancer_id", userId)
          .is("deleted_at", null)
          .order("paid_at", { ascending: false }),
      ]);
      if (tRes.error) console.error("freelancer tasks fetch:", tRes.error);
      if (pRes.error) console.error("freelancer payments fetch:", pRes.error);
      setTasks((tRes.data || []) as Task[]);
      setPayments((pRes.data || []) as Payment[]);
    } catch (e: any) {
      console.error("FreelancerOnlyDashboard fetch failed:", e);
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  const paidTaskIds = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.task_ids?.forEach((id) => set.add(id)));
    return set;
  }, [payments]);

  const totals = useMemo(() => {
    const billable = tasks.reduce((s, t) => s + Number(t.billable_amount || 0), 0);
    const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const pending = tasks
      .filter((t) => !paidTaskIds.has(t.id))
      .reduce((s, t) => s + Number(t.billable_amount || 0), 0);
    return { billable, paid, pending, balance: billable - paid };
  }, [tasks, payments, paidTaskIds]);

  const fmt = (n: number) =>
    `AED ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-gradient-to-r from-[hsl(200,85%,22%)] to-[hsl(160,70%,28%)] text-white">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-white/30">
              <AvatarImage src={userAvatar} />
              <AvatarFallback>{userName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold leading-tight">{userName}</div>
              <div className="text-xs opacity-90 flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Freelancer
              </div>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={onSignOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {error ? (
          <div className="p-6 text-center text-sm text-destructive border border-destructive/30 rounded-md bg-destructive/5">
            {error}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Total Billable</div>
                  <div className="text-xl font-bold">{fmt(totals.billable)}</div>
                  <div className="text-xs text-muted-foreground">{tasks.length} tasks</div>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/30 border-green-200">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="text-xl font-bold text-green-700 dark:text-green-400">{fmt(totals.paid)}</div>
                  <div className="text-xs text-muted-foreground">{payments.length} payments</div>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Pending</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{fmt(totals.pending)}</div>
                  <div className="text-xs text-muted-foreground">
                    {tasks.filter((t) => !paidTaskIds.has(t.id)).length} tasks
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Balance Owed</div>
                  <div className="text-xl font-bold">{fmt(totals.balance)}</div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="tasks">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="tasks">{isAdmin ? "Tasks" : "My Tasks"} ({tasks.length})</TabsTrigger>
                  <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
                </TabsList>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowBilling(true)}>
                      <Banknote className="h-4 w-4 mr-1" /> Manage Billing
                    </Button>
                    <Button size="sm" onClick={() => setShowAdd(true)}>
                      <Plus className="h-4 w-4 mr-1" /> New Task
                    </Button>
                  </div>
                )}
              </div>

              <TabsContent value="tasks">
                <Card>
                  <CardContent className="p-0">
                    {tasks.length === 0 ? (
                      <div className="p-10 text-center text-sm text-muted-foreground">
                        No billable tasks yet.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {tasks.map((t) => {
                          const paid = paidTaskIds.has(t.id);
                          return (
                            <div key={t.id} className="p-4 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{t.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {t.status}
                                  {t.completed_at &&
                                    ` · completed ${format(new Date(t.completed_at), "MMM d, yyyy")}`}
                                </div>
                              </div>
                              <div className="text-sm font-semibold w-24 text-right">
                                {fmt(Number(t.billable_amount || 0))}
                              </div>
                              <Badge
                                variant={paid ? "default" : "outline"}
                                className={paid ? "bg-green-600" : "border-amber-500 text-amber-700"}
                              >
                                {paid ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 mr-1" /> Pending
                                  </>
                                )}
                              </Badge>
                              {isAdmin && (
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => openEdit(t.id)} aria-label="Edit">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => deleteTask(t.id)} aria-label="Delete">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments">
                <Card>
                  <CardContent className="p-0">
                    {payments.length === 0 ? (
                      <div className="p-10 text-center text-sm text-muted-foreground">
                        No payments recorded yet.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {payments.map((p) => (
                          <div key={p.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold">{fmt(Number(p.amount))}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(p.paid_at), "MMM d, yyyy")}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {p.method && `${p.method}`}
                              {p.reference && ` · ref: ${p.reference}`}
                              {` · ${p.task_ids?.length || 0} tasks`}
                            </div>
                            {p.notes && <div className="text-xs mt-1">{p.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      {isAdmin && showAdd && (
        <AddTaskDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          onTaskAdded={() => { setShowAdd(false); fetchData(); }}
          defaultAssignedTo={userId}
        />
      )}
      {isAdmin && editingTask && (
        <EditTaskDialog
          open={!!editingTask}
          onOpenChange={(o) => !o && setEditingTask(null)}
          task={editingTask}
          onTaskUpdated={() => { setEditingTask(null); fetchData(); }}
          onTaskDeleted={() => { setEditingTask(null); fetchData(); }}
          isAdmin
        />
      )}
      {isAdmin && showBilling && (
        <FreelancerBillingDialog
          open={showBilling}
          onOpenChange={(o) => { setShowBilling(o); if (!o) fetchData(); }}
          freelancerId={userId}
          freelancerName={userName}
          isAdmin
        />
      )}
    </div>
  );
};
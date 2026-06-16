import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Wallet, CheckCircle2, Clock, X } from "lucide-react";
import { format } from "date-fns";

type Task = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  is_billable: boolean;
  billable_amount: number | null;
  billable_currency: string | null;
};

type Payment = {
  id: string;
  freelancer_id: string;
  task_ids: string[];
  amount: number;
  currency: string;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freelancerId: string;
  freelancerName: string;
  isAdmin: boolean;
}

export const FreelancerBillingDialog = ({ open, onOpenChange, freelancerId, freelancerName, isAdmin }: Props) => {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);

  // Add Payment form
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: t, error: tErr }, { data: p, error: pErr }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, completed_at, is_billable, billable_amount, billable_currency")
          .eq("assigned_to", freelancerId)
          .eq("is_billable", true)
          .is("deleted_at", null)
          .order("completed_at", { ascending: false, nullsFirst: false }),
        supabase
          .from("freelancer_payments")
          .select("*")
          .eq("freelancer_id", freelancerId)
          .is("deleted_at", null)
          .order("paid_at", { ascending: false }),
      ]);
      if (tErr) throw tErr;
      if (pErr) throw pErr;
      setTasks((t || []) as Task[]);
      setPayments((p || []) as Payment[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && freelancerId) fetchData();
  }, [open, freelancerId]);

  const paidTaskIds = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.task_ids?.forEach((id) => set.add(id)));
    return set;
  }, [payments]);

  const totals = useMemo(() => {
    const billable = tasks.reduce((s, t) => s + Number(t.billable_amount || 0), 0);
    const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const pendingTasks = tasks.filter((t) => !paidTaskIds.has(t.id));
    const pendingAmt = pendingTasks.reduce((s, t) => s + Number(t.billable_amount || 0), 0);
    return { billable, paid, pendingAmt, pendingCount: pendingTasks.length, totalTasks: tasks.length };
  }, [tasks, payments, paidTaskIds]);

  const pendingTasks = tasks.filter((t) => !paidTaskIds.has(t.id));

  const updateTaskAmount = async (taskId: string, newAmount: number | null) => {
    const { error } = await supabase
      .from("tasks")
      .update({ billable_amount: newAmount })
      .eq("id", taskId);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    fetchData();
  };

  const unflagTask = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ is_billable: false, billable_amount: null })
      .eq("id", taskId);
    if (error) return toast.error(error.message);
    toast.success("Removed from billing");
    fetchData();
  };

  const openAddPayment = () => {
    setSelectedTaskIds(pendingTasks.map((t) => t.id));
    const sum = pendingTasks.reduce((s, t) => s + Number(t.billable_amount || 0), 0);
    setAmount(sum ? sum.toFixed(2) : "");
    setMethod("");
    setReference("");
    setNotes("");
    setShowAddPayment(true);
  };

  useEffect(() => {
    // recompute suggested amount when selection changes
    const sum = tasks
      .filter((t) => selectedTaskIds.includes(t.id))
      .reduce((s, t) => s + Number(t.billable_amount || 0), 0);
    if (showAddPayment) setAmount(sum ? sum.toFixed(2) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskIds]);

  const savePayment = async () => {
    const num = Number(amount);
    if (!num || num <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("freelancer_payments").insert({
        freelancer_id: freelancerId,
        task_ids: selectedTaskIds,
        amount: num,
        currency: "AED",
        method: method || null,
        reference: reference || null,
        notes: notes || null,
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Payment recorded");
      setShowAddPayment(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  const deletePayment = async (id: string) => {
    if (!confirm("Delete this payment record?")) return;
    const { error } = await supabase
      .from("freelancer_payments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    fetchData();
  };

  const fmt = (n: number) => `AED ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Freelancer Billing — {freelancerName}
          </DialogTitle>
          <DialogDescription>
            {isAdmin ? "Track billable tasks and payments." : "Your billable tasks and payment history."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Total Billable</div>
                <div className="text-lg font-bold">{fmt(totals.billable)}</div>
                <div className="text-xs text-muted-foreground">{totals.totalTasks} tasks</div>
              </CardContent></Card>
              <Card className="bg-green-50 dark:bg-green-950/30 border-green-200"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Paid</div>
                <div className="text-lg font-bold text-green-700 dark:text-green-400">{fmt(totals.paid)}</div>
                <div className="text-xs text-muted-foreground">{payments.length} payments</div>
              </CardContent></Card>
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Pending</div>
                <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{fmt(totals.pendingAmt)}</div>
                <div className="text-xs text-muted-foreground">{totals.pendingCount} tasks</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="text-lg font-bold">{fmt(totals.billable - totals.paid)}</div>
                <div className="text-xs text-muted-foreground">Owed</div>
              </CardContent></Card>
            </div>

            <Tabs defaultValue="tasks">
              <TabsList>
                <TabsTrigger value="tasks">Billable Tasks ({tasks.length})</TabsTrigger>
                <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="tasks" className="space-y-2">
                {isAdmin && pendingTasks.length > 0 && (
                  <Button size="sm" onClick={openAddPayment}>
                    <Plus className="h-4 w-4 mr-1" /> Record Payment for Pending
                  </Button>
                )}
                <ScrollArea className="h-[40vh] border rounded-md">
                  {tasks.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No billable tasks yet. {isAdmin && "Mark a task as billable from its details to add it here."}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {tasks.map((t) => {
                        const paid = paidTaskIds.has(t.id);
                        return (
                          <div key={t.id} className="p-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{t.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {t.status}
                                {t.completed_at && ` · completed ${format(new Date(t.completed_at), "MMM d, yyyy")}`}
                              </div>
                            </div>
                            {isAdmin ? (
                              <Input
                                type="number"
                                step="0.01"
                                className="w-28 h-8"
                                defaultValue={t.billable_amount ?? ""}
                                onBlur={(e) => {
                                  const v = e.target.value === "" ? null : Number(e.target.value);
                                  if (v !== Number(t.billable_amount)) updateTaskAmount(t.id, v);
                                }}
                              />
                            ) : (
                              <div className="w-28 text-right text-sm font-medium">
                                {fmt(Number(t.billable_amount || 0))}
                              </div>
                            )}
                            <Badge variant={paid ? "default" : "outline"} className={paid ? "bg-green-600" : "border-amber-500 text-amber-700"}>
                              {paid ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Paid</> : <><Clock className="h-3 w-3 mr-1" /> Pending</>}
                            </Badge>
                            {isAdmin && (
                              <Button size="icon" variant="ghost" onClick={() => unflagTask(t.id)} title="Remove from billing">
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="payments" className="space-y-2">
                {isAdmin && (
                  <Button size="sm" onClick={openAddPayment}>
                    <Plus className="h-4 w-4 mr-1" /> Add Payment
                  </Button>
                )}
                <ScrollArea className="h-[40vh] border rounded-md">
                  {payments.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">No payments recorded yet.</div>
                  ) : (
                    <div className="divide-y">
                      {payments.map((p) => (
                        <div key={p.id} className="p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{fmt(Number(p.amount))}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(p.paid_at), "MMM d, yyyy")}
                              {p.method && ` · ${p.method}`}
                              {p.reference && ` · ref: ${p.reference}`}
                              {` · ${p.task_ids?.length || 0} tasks`}
                            </div>
                            {p.notes && <div className="text-xs mt-1">{p.notes}</div>}
                          </div>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" onClick={() => deletePayment(p.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Add Payment sub-dialog */}
        <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Mark tasks as paid and log the payment details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tasks covered ({selectedTaskIds.length} selected)</Label>
                <ScrollArea className="h-40 border rounded-md mt-1">
                  <div className="p-2 space-y-1">
                    {pendingTasks.length === 0 && <div className="text-xs text-muted-foreground p-2">No pending tasks</div>}
                    {pendingTasks.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-accent cursor-pointer">
                        <Checkbox
                          checked={selectedTaskIds.includes(t.id)}
                          onCheckedChange={(c) =>
                            setSelectedTaskIds((prev) =>
                              c ? [...prev, t.id] : prev.filter((x) => x !== t.id)
                            )
                          }
                        />
                        <span className="flex-1 truncate">{t.title}</span>
                        <span className="text-xs text-muted-foreground">{fmt(Number(t.billable_amount || 0))}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (AED)</Label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <Label>Method</Label>
                  <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash / Bank / etc." />
                </div>
              </div>
              <div>
                <Label>Reference</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ref (optional)" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddPayment(false)}>Cancel</Button>
                <Button onClick={savePayment} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save Payment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
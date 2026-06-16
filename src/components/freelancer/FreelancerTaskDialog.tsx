import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  freelancerId: string;
  freelancerName: string;
  onCreated: () => void;
}

export const FreelancerTaskDialog = ({ open, onOpenChange, freelancerId, freelancerName, onCreated }: Props) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle(""); setDescription(""); setDueDate(""); setAmount("");
  };

  const save = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      assigned_to: freelancerId,
      assigned_by: user?.id,
      created_by: user?.id,
      status: "todo",
      priority: "medium",
      type: "general",
      is_billable: true,
      billable_amount: amt,
      billable_currency: "AED",
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Task assigned to ${freelancerName}`);
    reset();
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task for {freelancerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional details" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Amount (AED) *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
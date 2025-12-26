import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, User } from "lucide-react";

type OpsUser = { id: string; full_name: string | null; email: string };

interface CreateOperationsWhiteboardTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateOperationsWhiteboardTaskDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateOperationsWhiteboardTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [opsUsers, setOpsUsers] = useState<OpsUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => title.trim().length > 0 && !submitting, [title, submitting]);

  useEffect(() => {
    if (!open) return;

    // Reset form on open
    setTitle("");
    setDescription("");
    setClientName("");
    setSupplierName("");
    setAssigneeId("");

    const load = async () => {
      setLoadingUsers(true);
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id, profiles(id, full_name, email)")
          .eq("role", "operations");

        if (error) throw error;

        const users = (data || [])
          .map((d: any) => d.profiles)
          .filter(Boolean) as OpsUser[];

        setOpsUsers(users);
      } catch (e) {
        console.error(e);
        toast.error("Couldn't load operations users");
      } finally {
        setLoadingUsers(false);
      }
    };

    load();
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    try {
      setSubmitting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in again");
        return;
      }

      // Build description with client/supplier info
      let fullDescription = description.trim() || "";
      if (clientName.trim() || supplierName.trim()) {
        const parts = [];
        if (clientName.trim()) parts.push(`Client: ${clientName.trim()}`);
        if (supplierName.trim()) parts.push(`Supplier: ${supplierName.trim()}`);
        fullDescription = parts.join("\n") + (fullDescription ? "\n\n" + fullDescription : "");
      }

      const { error } = await supabase
        .from("operations_whiteboard" as any)
        .insert({
          title: title.trim(),
          description: fullDescription || null,
          assigned_to: assigneeId || null,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success("Operations task created");
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create operations task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Operations Task</DialogTitle>
          <DialogDescription>
            Create a task for the operations team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input 
              id="title"
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Pick up supplier materials" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client">Client Name</Label>
              <Input 
                id="client"
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)} 
                placeholder="Client name" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier Name</Label>
              <Input 
                id="supplier"
                value={supplierName} 
                onChange={(e) => setSupplierName(e.target.value)} 
                placeholder="Supplier name" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea 
              id="description"
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              rows={3} 
              placeholder="Add any notes, addresses, or instructions..." 
            />
          </div>

          <div className="space-y-2">
            <Label>Assign to (optional)</Label>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={loadingUsers}
              >
                <option value="">Unassigned</option>
                {opsUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>
            {loadingUsers && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading operations users...
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

type DesignerSendBackButtonProps = {
  taskId: string;
  taskTitle: string;
  assignedBy: string | null;
  createdBy: string;
  onSuccess?: () => void;
};

export const DesignerSendBackButton = ({
  taskId,
  taskTitle,
  assignedBy,
  createdBy,
  onSuccess
}: DesignerSendBackButtonProps) => {
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendBack = async () => {
    if (!remarks.trim()) {
      toast.error("Please provide completion notes");
      return;
    }

    setIsSubmitting(true);
    console.log("🔵 Designer marking complete - assigned_by:", assignedBy, "created_by:", createdBy);

    try {
      // Use assigned_by (estimator who sent it) or fall back to created_by
      const estimatorId = assignedBy || createdBy;

      if (!estimatorId) {
        console.error("❌ No estimator ID found");
        toast.error("Cannot determine original estimator");
        setIsSubmitting(false);
        return;
      }

      console.log("🎯 Creating clone for estimator:", estimatorId);

      // Get current user ID to track which designer completed the mockup
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        setIsSubmitting(false);
        return;
      }

      // Step 1: Fetch the full original task details for cloning
      const { data: originalTask, error: fetchError } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (fetchError || !originalTask) {
        console.error("❌ Error fetching original task:", fetchError);
        toast.error("Failed to fetch task details");
        setIsSubmitting(false);
        return;
      }

      // Step 2: Create a cloned task for the estimator (independent workflow)
      const { data: clonedTask, error: createError } = await supabase
        .from("tasks")
        .insert({
          title: `[Post-Mockup] ${originalTask.title}`,
          description: originalTask.description,
          status: "todo",
          priority: originalTask.priority,
          due_date: originalTask.due_date,
          type: originalTask.type,
          client_name: originalTask.client_name,
          supplier_name: originalTask.supplier_name,
          created_by: estimatorId,
          assigned_to: estimatorId,
          linked_task_id: taskId, // Link to original for reference
          position: 0,
          status_changed_at: new Date().toISOString(),
          sent_to_designer_mockup: false,
          mockup_completed_by_designer: false,
          came_from_designer_done: false,
          admin_remarks: `Mockup completed by designer.\n\nDesigner's Notes:\n${remarks}`,
        })
        .select()
        .single();

      if (createError || !clonedTask) {
        console.error("❌ Error creating cloned task:", createError);
        toast.error("Failed to create task for estimator");
        setIsSubmitting(false);
        return;
      }

      console.log("✅ Created clone for estimator:", clonedTask.id);

      // Step 3: Copy all task products to the cloned task
      const { data: originalProducts } = await supabase
        .from("task_products")
        .select("*")
        .eq("task_id", taskId);

      if (originalProducts && originalProducts.length > 0) {
        const clonedProducts = originalProducts.map(product => ({
          task_id: clonedTask.id,
          product_name: product.product_name,
          description: product.description,
          quantity: product.quantity,
          unit: product.unit,
          estimated_price: product.estimated_price,
          final_price: product.final_price,
          position: product.position,
          approval_status: "pending", // Reset approval for new workflow
          designer_completed: product.designer_completed,
        }));

        const { error: productsError } = await supabase
          .from("task_products")
          .insert(clonedProducts);

        if (productsError) {
          console.error("⚠️ Error copying products (non-critical):", productsError);
        }
      }

      // Step 4: Update original task - move to with_client for designer-admin workflow
      // Clear mockup flags so it no longer appears in estimator's mockup tracker
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          mockup_completed_by_designer: false, // Clear so it doesn't show in estimator tracker
          sent_to_designer_mockup: false, // Clear so estimator can't see it anymore
          came_from_designer_done: true,
          completed_by_designer_id: user.id,
          admin_remarks: remarks,
          status: "with_client",
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          linked_task_id: clonedTask.id, // Bidirectional link
        })
        .eq("id", taskId);

      if (updateError) {
        console.error("❌ Update error:", updateError);
        throw updateError;
      }

      console.log("✅ Original task updated for designer workflow");

      // Step 5: Create notification for estimator about their new task
      const { error: notifError } = await supabase
        .from("urgent_notifications")
        .insert({
          recipient_id: estimatorId,
          sender_id: user.id,
          title: "🎨 Mockup Completed - New Task Created",
          message: `Task: ${taskTitle}\n\n✅ Designer has completed the mockup.\n\n📝 Designer's Notes:\n${remarks}\n\n📋 A new task "[Post-Mockup] ${originalTask.title}" has been created in your TODO for further processing.`,
          priority: "high",
          is_broadcast: false,
        });

      if (notifError) {
        console.error("⚠️ Notification error (non-critical):", notifError);
      }

      toast.success("Mockup complete - estimator has a new task");
      setRemarks("");
      setOpen(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("❌ Full error:", error);
      toast.error(error.message || "Failed to complete mockup");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-5 px-1.5 text-[10px] bg-blue-500 hover:bg-blue-600 text-white border-blue-600 font-medium shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Send back to estimator"
      >
        <RotateCcw className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back to Estimator</DialogTitle>
            <DialogDescription>
              Mockup completed for: <strong>{taskTitle}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Completion Notes / Remarks <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Describe what was done, any notes for the estimator..."
                rows={6}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendBack}
              disabled={!remarks.trim() || isSubmitting}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {isSubmitting ? "Sending..." : "Send to Estimator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

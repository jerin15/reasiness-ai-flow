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
    console.log("🔵 Designer sending back - assigned_by:", assignedBy, "created_by:", createdBy);

    try {
      // Use assigned_by (estimator who sent it) or fall back to created_by
      const estimatorId = assignedBy || createdBy;

      if (!estimatorId) {
        console.error("❌ No estimator ID found");
        toast.error("Cannot determine original estimator");
        setIsSubmitting(false);
        return;
      }

      console.log("🎯 Sending task back to estimator:", estimatorId);

      // Update task - set completion flags AND move to with_client for designer-admin workflow
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          mockup_completed_by_designer: true,
          came_from_designer_done: true,
          admin_remarks: remarks,
          status: 'with_client',
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId);

      if (updateError) {
        console.error("❌ Update error:", updateError);
        throw updateError;
      }

      console.log("✅ Task updated successfully");

      // Create notification for estimator
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { error: notifError } = await supabase
          .from("urgent_notifications")
          .insert({
            recipient_id: estimatorId,
            sender_id: user.id,
            title: "🎨 Mockup Completed - Ready for Review",
            message: `Task: ${taskTitle}\n\n✅ Designer has completed the mockup and sent it for review.\n\n📝 Designer's Notes:\n${remarks}\n\n⚠️ Please review and proceed accordingly.`,
            priority: "high",
            is_broadcast: false
          });

        if (notifError) {
          console.error("⚠️ Notification error (non-critical):", notifError);
        }
      }

      toast.success("Mockup marked as complete - estimator notified");
      setRemarks("");
      setOpen(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("❌ Full error:", error);
      toast.error(error.message || "Failed to send task back");
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

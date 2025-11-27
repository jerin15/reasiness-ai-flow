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

    try {
      // Use assigned_by (estimator who sent it) or fall back to created_by
      const estimatorId = assignedBy || createdBy;

      if (!estimatorId) {
        toast.error("Cannot determine original estimator");
        setIsSubmitting(false);
        return;
      }

      // Update task - send back to original estimator
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "todo",
          assigned_to: estimatorId,
          sent_to_designer_mockup: false,
          mockup_completed_by_designer: true,
          came_from_designer_done: true,
          admin_remarks: remarks,
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId);

      if (updateError) throw updateError;

      // Create notification for estimator
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase
          .from("urgent_notifications")
          .insert({
            recipient_id: estimatorId,
            sender_id: user.id,
            title: "🎨 Mockup Completed - Ready for Review",
            message: `Task: ${taskTitle}\n\n✅ Designer has completed the mockup and sent it for review.\n\n📝 Designer's Notes:\n${remarks}\n\n⚠️ Please review and proceed accordingly.`,
            priority: "high",
            is_broadcast: false
          });
      }

      toast.success("Task sent back to estimator successfully");
      setRemarks("");
      setOpen(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error sending task back:", error);
      toast.error("Failed to send task back");
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

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SendBackToEstimationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  onSuccess?: () => void;
}

export const SendBackToEstimationDialog = ({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  onSuccess
}: SendBackToEstimationDialogProps) => {
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendBack = async () => {
    if (!remarks.trim()) {
      toast.error("Please provide remarks");
      return;
    }

    setIsSubmitting(true);

    try {
      // Find an estimation user
      const { data: estimationUsers, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "estimation")
        .limit(1);

      if (roleError) {
        console.error("Error fetching estimation user:", roleError);
        toast.error("Failed to find estimation user");
        setIsSubmitting(false);
        return;
      }

      if (!estimationUsers || estimationUsers.length === 0) {
        toast.error("No estimation user found");
        setIsSubmitting(false);
        return;
      }

      const estimationUserId = estimationUsers[0].user_id;

      // Update the task - reset mockup flags and send back to estimation
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "todo",
          assigned_to: estimationUserId,
          sent_to_designer_mockup: false,
          mockup_completed_by_designer: true,
          came_from_designer_done: true,
          admin_remarks: remarks,
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId);

      if (updateError) throw updateError;

      // Create urgent notification for estimation
      const { data: userData } = await supabase.auth.getUser();
      
      const { error: notifError } = await supabase
        .from("urgent_notifications")
        .insert({
          recipient_id: estimationUserId,
          sender_id: userData.user?.id,
          title: "🎨 Mockup Completed - Ready for Review",
          message: `Task: ${taskTitle}\n\n✅ Designer has completed the mockup and sent it for review.\n\n📝 Designer's Notes:\n${remarks}\n\n⚠️ Please review and proceed accordingly.`,
          priority: "high",
          is_broadcast: false
        });

      if (notifError) throw notifError;

      toast.success("Task sent back to estimation successfully");
      setRemarks("");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error sending task back to estimation:", error);
      toast.error(error.message || "Failed to send task back to estimation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Back to Estimation</DialogTitle>
          <DialogDescription>
            Sending mockup task back to estimation: <strong>{taskTitle}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Completion Notes / Remarks *
            </label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Describe what was done, any notes for estimation team..."
              rows={6}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSendBack}
            disabled={!remarks.trim() || isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send to Estimation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

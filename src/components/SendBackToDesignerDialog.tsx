import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SendBackToDesignerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  onSuccess: () => void;
};

export const SendBackToDesignerDialog = ({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  onSuccess,
}: SendBackToDesignerDialogProps) => {
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendBack = async () => {
    if (!remarks.trim()) {
      toast.error("Please enter remarks for the designer");
      return;
    }

    setIsSubmitting(true);
    try {
      // Find designer user
      const { data: designerUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "designer")
        .limit(1);

      if (!designerUsers || designerUsers.length === 0) {
        toast.error("No designer found");
        return;
      }

      const designerUserId = designerUsers[0].user_id;

      // Update task status to todo, assign to designer, mark as sent back
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "todo" as any,
          assigned_to: designerUserId,
          sent_back_to_designer: true,
          admin_remarks: remarks,
          previous_status: "done" as any,
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      if (updateError) throw updateError;

      // Get current user (admin)
      const { data: { user } } = await supabase.auth.getUser();

      // Create urgent notification for designer
      if (user) {
        const { error: notificationError } = await supabase
          .from("urgent_notifications")
          .insert({
            recipient_id: designerUserId,
            sender_id: user.id,
            title: "⚠️ Task Sent Back for Revision",
            message: `Task: ${taskTitle}\n\nAdmin Remarks:\n${remarks}\n\nPlease review and make the necessary changes.`,
            is_broadcast: false,
            is_acknowledged: false,
            priority: "high",
          });

        if (notificationError) {
          console.error("Error creating notification:", notificationError);
        }
      }

      toast.success("Task sent back to designer");
      setRemarks("");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error sending task back:", error);
      toast.error("Failed to send task back");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Task Back to Designer</DialogTitle>
          <DialogDescription>
            Task: <span className="font-medium">{taskTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Remarks <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="Enter detailed remarks about what needs to be redone..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              These remarks will be visible to the designer and included in the notification.
            </p>
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
            disabled={isSubmitting || !remarks.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isSubmitting ? "Sending..." : "Send Back to Designer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { AlertTriangle, Calendar, User, Edit, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type SimilarTask = {
  id: string;
  title: string;
  client_name: string | null;
  status: string;
  created_at: string;
  description: string | null;
  type: string | null;
  assigned_to: string | null;
  profiles?: { full_name: string | null; email: string } | null;
};

type DuplicateTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  similarTasks: SimilarTask[];
  clientName: string;
  onEditExisting: (taskId: string) => void;
  onCreateNew: () => void;
};

const statusColors: Record<string, string> = {
  todo: "bg-slate-500",
  supplier_quotes: "bg-yellow-500",
  admin_approval: "bg-orange-500",
  quotation_bill: "bg-blue-500",
  production: "bg-purple-500",
  final_invoice: "bg-green-500",
  done: "bg-emerald-600",
  mockup: "bg-pink-500",
  with_client: "bg-cyan-500",
  new_calls: "bg-indigo-500",
  follow_up: "bg-amber-500",
  quotation: "bg-teal-500",
};

const formatStatus = (status: string) => {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const DuplicateTaskDialog = ({
  open,
  onOpenChange,
  similarTasks,
  clientName,
  onEditExisting,
  onCreateNew,
}: DuplicateTaskDialogProps) => {
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const toggleExpand = (taskId: string) => {
    setExpandedTask(expandedTask === taskId ? null : taskId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Similar Tasks Found
          </DialogTitle>
          <DialogDescription>
            We found {similarTasks.length} existing task{similarTasks.length > 1 ? "s" : ""} for{" "}
            <span className="font-semibold text-foreground">"{clientName}"</span>. Would you like to
            edit an existing task or create a new one?
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[400px] pr-4">
          <div className="space-y-3">
            {similarTasks.map((task) => (
              <div
                key={task.id}
                className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm truncate">{task.title}</h4>
                      <Badge
                        variant="secondary"
                        className={`${statusColors[task.status] || "bg-gray-500"} text-white text-xs`}
                      >
                        {formatStatus(task.status)}
                      </Badge>
                      {task.type && (
                        <Badge variant="outline" className="text-xs uppercase">
                          {task.type}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                      </span>
                      {task.profiles?.full_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.profiles.full_name}
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(task.id)}
                        className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                      >
                        {expandedTask === task.id ? (
                          <>
                            <ChevronUp className="h-3 w-3" />
                            Hide description
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" />
                            Show description
                          </>
                        )}
                      </button>
                    )}

                    {expandedTask === task.id && task.description && (
                      <p className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                        {task.description.length > 300
                          ? task.description.slice(0, 300) + "..."
                          : task.description}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onEditExisting(task.id)}
                    className="shrink-0"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">
            Cancel
          </Button>
          <Button onClick={onCreateNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Create New Task Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

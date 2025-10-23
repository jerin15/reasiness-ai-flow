import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar, GripVertical, Edit2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  assigned_by: string | null;
  client_name: string | null;
  supplier_name: string | null;
  type: string;
};

type TaskCardProps = {
  task: Task;
  isDragging?: boolean;
  onEdit?: (task: Task) => void;
  isAdminView?: boolean;
};

export const TaskCard = ({ task, isDragging, onEdit, isAdminView }: TaskCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-priority-urgent text-white";
      case "high":
        return "bg-priority-high text-white";
      case "medium":
        return "bg-priority-medium text-white";
      case "low":
        return "bg-priority-low text-white";
      default:
        return "bg-muted";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "quotation":
        return "bg-purple-500 text-white hover:bg-purple-600";
      case "invoice":
        return "bg-green-500 text-white hover:bg-green-600";
      case "general":
        return "bg-gray-500 text-white hover:bg-gray-600";
      default:
        return "bg-muted";
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg"
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-medium text-sm line-clamp-2 flex-1">{task.title}</h4>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {task.description}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className={cn("text-xs capitalize", getPriorityColor(task.priority))}
              >
                {task.priority}
              </Badge>
              <Badge
                variant="secondary"
                className={cn("text-xs uppercase", getTypeColor(task.type))}
              >
                {task.type}
              </Badge>
              {task.assigned_by && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-blue-500 text-white hover:bg-blue-600"
                >
                  Assigned by {task.assigned_by}
                </Badge>
              )}
              {task.supplier_name && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-blue-500 text-white hover:bg-blue-600"
                >
                  Supplier: {task.supplier_name}
                </Badge>
              )}
              {task.due_date && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(task.due_date), "MMM d")}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

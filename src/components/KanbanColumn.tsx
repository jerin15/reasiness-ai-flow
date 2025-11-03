import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { cn } from "@/lib/utils";

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
  status_changed_at: string;
  created_by: string;
  assigned_by: string | null;
  client_name: string | null;
  my_status: string;
  supplier_name: string | null;
  type: string;
  assigned_user_role?: string | null;
  sent_to_designer_mockup?: boolean;
  mockup_completed_by_designer?: boolean;
};

type KanbanColumnProps = {
  id: string;
  title: string;
  tasks: Task[];
  onEditTask?: (task: Task) => void;
  isAdminView?: boolean;
  onTaskUpdated?: () => void;
  userRole?: string;
  userRolesMap?: Record<string, string>;
  isAdminOwnPanel?: boolean;
};

export const KanbanColumn = ({ id, title, tasks, onEditTask, isAdminView, onTaskUpdated, userRole, userRolesMap, isAdminOwnPanel }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef}
      className="flex flex-col min-w-[280px] max-w-[320px] flex-1"
    >
      <div className="bg-card border rounded-lg p-3 mb-2 shadow-sm sticky top-0 z-10">
        <h3 className="font-semibold text-sm flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs bg-muted px-2 py-1 rounded-full">
            {tasks.length}
          </span>
        </h3>
      </div>

      <div
        className={cn(
          "flex-1 bg-muted/30 rounded-lg p-3 min-h-[500px] max-h-[calc(100vh-250px)] overflow-y-auto transition-all duration-200",
          isOver && "bg-primary/10 ring-2 ring-primary scale-[1.02]"
        )}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-full">
            {tasks.map((task) => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onEdit={onEditTask} 
                isAdminView={isAdminView}
                onTaskUpdated={onTaskUpdated}
                userRole={userRole}
                isAdminOwnPanel={isAdminOwnPanel}
              />
            ))}
            {/* Empty drop zone at bottom for better drop targeting */}
            <div className="h-12" />
          </div>
        </SortableContext>
      </div>
    </div>
  );
};

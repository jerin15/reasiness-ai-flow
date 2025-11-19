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
  assigned_to: string | null;
  assigned_by: string | null;
  client_name: string | null;
  my_status: string;
  supplier_name: string | null;
  type: string;
  assigned_user_role?: string | null;
  sent_to_designer_mockup?: boolean;
  mockup_completed_by_designer?: boolean;
  came_from_designer_done?: boolean;
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
  onDeleteTask?: (taskId: string) => void;
  onSendBack?: (task: Task) => void;
};

// Get background color for column header based on title - enhanced visibility
const getColumnHeaderColor = (columnTitle: string): string => {
  const titleLower = columnTitle.toLowerCase();
  
  // RFQ / Quotation related - Blue
  if (titleLower.includes('rfq') || titleLower === 'quotation') {
    return 'bg-blue-100/80 dark:bg-blue-950/40 border-blue-300/50 dark:border-blue-700/50';
  }
  
  // General / To-Do - Purple
  if (titleLower.includes('general') || titleLower.includes('to-do')) {
    return 'bg-purple-100/80 dark:bg-purple-950/40 border-purple-300/50 dark:border-purple-700/50';
  }
  
  // Supplier / Quotes - Amber
  if (titleLower.includes('supplier') || titleLower.includes('quotes')) {
    return 'bg-amber-100/80 dark:bg-amber-950/40 border-amber-300/50 dark:border-amber-700/50';
  }
  
  // Client related - Cyan
  if (titleLower.includes('client') || titleLower.includes('with client')) {
    return 'bg-cyan-100/80 dark:bg-cyan-950/40 border-cyan-300/50 dark:border-cyan-700/50';
  }
  
  // Admin / Approval - Rose
  if (titleLower.includes('admin') || titleLower.includes('approval')) {
    return 'bg-rose-100/80 dark:bg-rose-950/40 border-rose-300/50 dark:border-rose-700/50';
  }
  
  // Production / Mockup - Orange
  if (titleLower.includes('production') || titleLower.includes('mockup')) {
    return 'bg-orange-100/80 dark:bg-orange-950/40 border-orange-300/50 dark:border-orange-700/50';
  }
  
  // Invoice / Billing - Emerald
  if (titleLower.includes('invoice') || titleLower.includes('bill')) {
    return 'bg-emerald-100/80 dark:bg-emerald-950/40 border-emerald-300/50 dark:border-emerald-700/50';
  }
  
  // New Calls - Indigo
  if (titleLower.includes('new calls') || titleLower.includes('calls')) {
    return 'bg-indigo-100/80 dark:bg-indigo-950/40 border-indigo-300/50 dark:border-indigo-700/50';
  }
  
  // Follow Up - Violet
  if (titleLower.includes('follow')) {
    return 'bg-violet-100/80 dark:bg-violet-950/40 border-violet-300/50 dark:border-violet-700/50';
  }
  
  // Done - Green
  if (titleLower.includes('done')) {
    return 'bg-green-100/80 dark:bg-green-950/40 border-green-300/50 dark:border-green-700/50';
  }
  
  // Default - Gray
  return 'bg-muted/80 border-border/50';
};

export const KanbanColumn = ({ id, title, tasks, onEditTask, isAdminView, onTaskUpdated, userRole, userRolesMap, isAdminOwnPanel, onDeleteTask, onSendBack }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef}
      className="flex flex-col min-w-[280px] max-w-[320px] flex-1"
    >
      <div className={cn(
        "rounded-lg p-3 mb-2 shadow-sm sticky top-0 z-10 transition-colors",
        getColumnHeaderColor(title)
      )}>
        <h3 className="font-semibold text-sm flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs bg-background/60 backdrop-blur-sm px-2 py-1 rounded-full">
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
                onDelete={onDeleteTask}
                isAdminView={isAdminView}
                onTaskUpdated={onTaskUpdated}
                userRole={userRole}
                isAdminOwnPanel={isAdminOwnPanel}
                onSendBack={onSendBack}
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

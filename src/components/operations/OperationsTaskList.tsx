import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Package, 
  MapPin, 
  User, 
  Filter,
  Truck,
  LayoutGrid
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OperationsTaskCard, OperationsTask } from "./OperationsTaskCard";

interface OperationsTaskListProps {
  tasks: OperationsTask[];
  currentUserId: string;
  operationsUsers: Array<{ id: string; full_name: string | null; email: string }>;
  onTaskClick: (task: OperationsTask) => void;
  loading: boolean;
}

export const OperationsTaskList = ({ 
  tasks, 
  currentUserId, 
  operationsUsers,
  onTaskClick,
  loading 
}: OperationsTaskListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'all' | 'by-person' | 'by-area'>('all');
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  // Filter tasks based on search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    
    const query = searchQuery.toLowerCase();
    return tasks.filter(task => 
      task.title.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query) ||
      task.client_name?.toLowerCase().includes(query) ||
      task.suppliers?.some(s => s.toLowerCase().includes(query)) ||
      task.delivery_address?.toLowerCase().includes(query)
    );
  }, [tasks, searchQuery]);

  // Group tasks by assigned user
  const tasksByUser = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      const userId = task.assigned_to || 'unassigned';
      if (!acc[userId]) {
        acc[userId] = [];
      }
      acc[userId].push(task);
      return acc;
    }, {} as Record<string, OperationsTask[]>);
  }, [filteredTasks]);

  // Group tasks by delivery area
  const tasksByArea = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      let area = 'No Address';
      if (task.delivery_address) {
        const parts = task.delivery_address.split(',');
        area = parts.length > 1 ? parts[parts.length - 2].trim() : parts[0].trim();
      }
      if (!acc[area]) {
        acc[area] = [];
      }
      acc[area].push(task);
      return acc;
    }, {} as Record<string, OperationsTask[]>);
  }, [filteredTasks]);

  // Get tasks to display based on view mode and selected person
  const displayTasks = useMemo(() => {
    if (selectedPerson) {
      return filteredTasks.filter(t => 
        selectedPerson === 'unassigned' ? !t.assigned_to : t.assigned_to === selectedPerson
      );
    }
    return filteredTasks;
  }, [filteredTasks, selectedPerson]);

  // My tasks count
  const myTasksCount = tasks.filter(t => t.assigned_to === currentUserId).length;

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by title, client, supplier, address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>

          {/* View Mode Tabs */}
          <Tabs value={viewMode} onValueChange={(v) => {
            setViewMode(v as typeof viewMode);
            setSelectedPerson(null);
          }}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="all" className="text-xs sm:text-sm">
                <LayoutGrid className="h-4 w-4 mr-1.5" />
                All
              </TabsTrigger>
              <TabsTrigger value="by-person" className="text-xs sm:text-sm">
                <User className="h-4 w-4 mr-1.5" />
                By Person
              </TabsTrigger>
              <TabsTrigger value="by-area" className="text-xs sm:text-sm">
                <MapPin className="h-4 w-4 mr-1.5" />
                By Area
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Person Filter (when "By Person" is selected) */}
          {viewMode === 'by-person' && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedPerson === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPerson(null)}
              >
                All ({filteredTasks.length})
              </Button>
              <Button
                variant={selectedPerson === currentUserId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPerson(currentUserId)}
              >
                My Tasks ({tasksByUser[currentUserId]?.length || 0})
              </Button>
              {operationsUsers
                .filter(u => u.id !== currentUserId)
                .map(user => (
                  <Button
                    key={user.id}
                    variant={selectedPerson === user.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedPerson(user.id)}
                  >
                    {user.full_name?.split(' ')[0] || user.email} ({tasksByUser[user.id]?.length || 0})
                  </Button>
                ))
              }
              <Button
                variant={selectedPerson === 'unassigned' ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPerson('unassigned')}
                className={tasksByUser['unassigned']?.length ? "border-amber-500 text-amber-700" : ""}
              >
                Unassigned ({tasksByUser['unassigned']?.length || 0})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workload Summary */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Team Workload
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {operationsUsers.map(user => {
              const userTaskCount = tasks.filter(t => t.assigned_to === user.id).length;
              const isMe = user.id === currentUserId;
              return (
                <div 
                  key={user.id} 
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-lg text-sm",
                    isMe ? "bg-primary text-primary-foreground" : "bg-background border"
                  )}
                >
                  <span className="font-medium truncate">
                    {isMe ? 'You' : (user.full_name?.split(' ')[0] || user.email)}
                  </span>
                  <Badge 
                    variant={isMe ? "secondary" : "outline"} 
                    className="ml-2"
                  >
                    {userTaskCount}
                  </Badge>
                </div>
              );
            })}
            {tasksByUser['unassigned']?.length > 0 && (
              <div className="flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 rounded-lg text-sm">
                <span className="font-medium text-amber-800 dark:text-amber-200">Unassigned</span>
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  {tasksByUser['unassigned'].length}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tasks Display */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
            Loading tasks...
          </CardContent>
        </Card>
      ) : displayTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            {searchQuery ? (
              <>
                <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground">No tasks match your search</p>
                <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                  Clear Search
                </Button>
              </>
            ) : (
              <>
                <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground">No active production tasks</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'by-area' ? (
        // Group by Area View
        <div className="space-y-6">
          {Object.entries(tasksByArea)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([area, areaTasks]) => (
              <div key={area} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-lg">{area}</h2>
                  <Badge variant="outline">{areaTasks.length}</Badge>
                </div>
                <div className="space-y-3">
                  {areaTasks.map((task) => (
                    <OperationsTaskCard
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      onTaskClick={onTaskClick}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        // All Tasks or Filtered View
        <div className="space-y-3">
          {displayTasks.map((task) => (
            <OperationsTaskCard
              key={task.id}
              task={task}
              currentUserId={currentUserId}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

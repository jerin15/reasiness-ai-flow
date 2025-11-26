import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ScrollArea } from "./ui/scroll-area";
import { CheckCircle, Truck, Package, MapPin, Plus, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Activity = {
  id: string;
  action: string;
  details: any;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  };
};

type OperationsActivityLogProps = {
  taskId: string;
};

export const OperationsActivityLog = ({ taskId }: OperationsActivityLogProps) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchActivities();

    // Real-time subscription
    const channel = supabase
      .channel(`ops-activity-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log',
          filter: `task_id=eq.${taskId}`
        },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('task_activity_log')
        .select('*')
        .eq('task_id', taskId)
        .eq('action', 'operations_update')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles separately
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(a => a.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        
        const activitiesWithProfiles = data.map(activity => ({
          ...activity,
          profiles: profileMap.get(activity.user_id)
        }));

        setActivities(activitiesWithProfiles as Activity[]);
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const handleAddUpdate = async () => {
    if (!newUpdate.trim()) {
      toast.error("Please enter an update");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Insert activity
      const { error: activityError } = await supabase
        .from('task_activity_log')
        .insert({
          task_id: taskId,
          user_id: user.id,
          action: 'operations_update',
          details: { 
            update: newUpdate,
            timestamp: new Date().toISOString()
          }
        });

      if (activityError) throw activityError;

      // Get all admins and operations team members for notification
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      const { data: opsTeam } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');

      const recipients = [
        ...(admins || []).map(a => a.user_id),
        ...(opsTeam || []).map(o => o.user_id)
      ].filter((id, index, self) => self.indexOf(id) === index && id !== user.id);

      // Send notification to each recipient
      for (const recipientId of recipients) {
        await supabase
          .from('urgent_notifications')
          .insert({
            sender_id: user.id,
            recipient_id: recipientId,
            title: '📦 Operations Update',
            message: `Task activity update:\n\n${newUpdate}`,
            priority: 'medium',
            is_broadcast: false
          });
      }

      toast.success("Update added and team notified");
      setNewUpdate("");
      fetchActivities();
    } catch (error: any) {
      console.error('Error adding update:', error);
      toast.error(error.message || "Failed to add update");
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (update: string) => {
    const lower = update.toLowerCase();
    if (lower.includes('collect') || lower.includes('picked')) return <Package className="h-5 w-5 text-blue-500" />;
    if (lower.includes('deliver') || lower.includes('delivered')) return <MapPin className="h-5 w-5 text-green-500" />;
    if (lower.includes('sent') || lower.includes('transit')) return <Truck className="h-5 w-5 text-orange-500" />;
    if (lower.includes('complete') || lower.includes('done')) return <CheckCircle className="h-5 w-5 text-green-600" />;
    return <Clock className="h-5 w-5 text-gray-500" />;
  };

  return (
    <div className="space-y-4">
      {/* Add Update - Mobile Optimized */}
      <div className="space-y-3 p-3 sm:p-4 bg-muted/30 rounded-lg touch-manipulation">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="h-5 w-5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
          <h4 className="font-semibold text-base sm:text-sm">Add Progress Update</h4>
        </div>
        <Textarea
          value={newUpdate}
          onChange={(e) => setNewUpdate(e.target.value)}
          placeholder="e.g., Collected from Supplier A&#10;Sent to Supplier B for printing&#10;Delivered to client"
          rows={3}
          className="resize-none text-base leading-relaxed min-h-[80px]"
        />
        <Button 
          onClick={handleAddUpdate} 
          disabled={loading}
          className="w-full h-12 sm:h-11 text-base sm:text-sm font-medium active:scale-[0.98] transition-transform"
          size="lg"
        >
          {loading ? "Adding..." : "Add Update & Notify Team"}
        </Button>
      </div>

      {/* Activity Timeline - Mobile Optimized */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm text-muted-foreground px-1">
          Activity History ({activities.length})
        </h4>
        
        <ScrollArea className="h-[280px] sm:h-[300px]">
          <div className="space-y-3 pr-1 sm:pr-2">
            {activities.length === 0 ? (
              <div className="text-center py-10 sm:py-8 text-muted-foreground text-sm">
                No updates yet. Add the first one!
              </div>
            ) : (
              activities.map((activity, index) => (
                <div 
                  key={activity.id} 
                  className="relative flex gap-3 p-3 sm:p-3 bg-card rounded-lg border hover:border-primary/50 transition-colors touch-manipulation"
                >
                  {/* Timeline connector */}
                  {index < activities.length - 1 && (
                    <div className="absolute left-[26px] top-[54px] bottom-[-12px] w-0.5 bg-border" />
                  )}
                  
                  {/* Avatar with Icon */}
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-12 w-12 sm:h-11 sm:w-11 border-2 border-background">
                      <AvatarImage src={activity.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-sm font-medium">
                        {activity.profiles?.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border">
                      {getActivityIcon(activity.details?.update || '')}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm sm:text-sm">
                        {activity.profiles?.full_name || 'Unknown'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Operations
                      </Badge>
                    </div>
                    
                    <p className="text-[15px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {activity.details?.update}
                    </p>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

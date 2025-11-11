import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, PlayCircle, PauseCircle, HelpCircle, CheckCircle, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getQuickActionDisplay } from '@/lib/taskActivityHelpers';

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string;
  role: string;
}

interface MemberActivity {
  id: string;
  action: string;
  details: any;
  created_at: string;
  task_id: string;
  tasks: {
    title: string;
    status: string;
  };
}

interface MemberActivityData {
  member: TeamMember;
  activities: MemberActivity[];
  stats: {
    workingOnIt: number;
    waiting: number;
    needHelp: number;
    almostDone: number;
    notesAdded: number;
  };
}

export const TeamMemberActivityList = () => {
  const [memberActivities, setMemberActivities] = useState<MemberActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMembers, setOpenMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTeamMemberActivities();

    // Real-time subscription
    const channel = supabase
      .channel('team-member-activities')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log'
        },
        () => {
          fetchTeamMemberActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTeamMemberActivities = async () => {
    try {
      // Fetch all team members
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          avatar_url,
          email,
          user_roles!inner(role)
        `)
        .neq('user_roles.role', 'admin');

      if (profilesError) throw profilesError;

      const members = profiles?.map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        avatar_url: p.avatar_url,
        email: p.email,
        role: (p.user_roles as any)?.[0]?.role || 'user'
      })) || [];

      // Fetch activities for each member (last 24 hours)
      const memberData: MemberActivityData[] = [];

      for (const member of members) {
        const { data: activities } = await supabase
          .from('task_activity_log')
          .select(`
            id,
            action,
            details,
            created_at,
            task_id,
            tasks!task_activity_log_task_id_fkey(title, status)
          `)
          .eq('user_id', member.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(20);

        // Calculate stats
        const stats = {
          workingOnIt: 0,
          waiting: 0,
          needHelp: 0,
          almostDone: 0,
          notesAdded: 0,
        };

        activities?.forEach((activity: any) => {
          const quickAction = activity.details?.quick_action;
          switch (quickAction) {
            case 'working_on_it':
              stats.workingOnIt++;
              break;
            case 'waiting_for_client':
              stats.waiting++;
              break;
            case 'help_requested':
              stats.needHelp++;
              break;
            case 'almost_done':
              stats.almostDone++;
              break;
          }
          if (activity.action === 'commented') {
            stats.notesAdded++;
          }
        });

        memberData.push({
          member,
          activities: (activities as any) || [],
          stats,
        });
      }

      // Sort by most active (total actions)
      memberData.sort((a, b) => b.activities.length - a.activities.length);

      setMemberActivities(memberData);
    } catch (error) {
      console.error('Error fetching team member activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (memberId: string) => {
    const newOpen = new Set(openMembers);
    if (newOpen.has(memberId)) {
      newOpen.delete(memberId);
    } else {
      newOpen.add(memberId);
    }
    setOpenMembers(newOpen);
  };

  const getActionIcon = (quickAction: string) => {
    switch (quickAction) {
      case 'working_on_it':
        return <PlayCircle className="h-3 w-3 text-green-500" />;
      case 'waiting_for_client':
        return <PauseCircle className="h-3 w-3 text-yellow-500" />;
      case 'help_requested':
        return <HelpCircle className="h-3 w-3 text-red-500" />;
      case 'almost_done':
        return <CheckCircle className="h-3 w-3 text-blue-500" />;
      default:
        return <MessageSquare className="h-3 w-3 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {memberActivities.map((memberData) => {
        const isOpen = openMembers.has(memberData.member.id);
        const totalActions = memberData.activities.filter(a => a.details?.quick_action).length;

        return (
          <Collapsible
            key={memberData.member.id}
            open={isOpen}
            onOpenChange={() => toggleMember(memberData.member.id)}
          >
            <Card className="overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <CardContent className="p-4 hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isOpen ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={memberData.member.avatar_url || undefined} />
                        <AvatarFallback>
                          {memberData.member.full_name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>

                      <div className="text-left">
                        <div className="font-medium">{memberData.member.full_name}</div>
                        <div className="text-sm text-muted-foreground capitalize">
                          {memberData.member.role}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Stats badges */}
                      <div className="flex gap-2 flex-wrap justify-end">
                        {memberData.stats.needHelp > 0 && (
                          <Badge className="bg-red-500 text-white">
                            🔴 {memberData.stats.needHelp} Help
                          </Badge>
                        )}
                        {memberData.stats.workingOnIt > 0 && (
                          <Badge className="bg-green-500 text-white">
                            🟢 {memberData.stats.workingOnIt} Working
                          </Badge>
                        )}
                        {memberData.stats.waiting > 0 && (
                          <Badge className="bg-yellow-500 text-white">
                            🟡 {memberData.stats.waiting} Waiting
                          </Badge>
                        )}
                        {memberData.stats.almostDone > 0 && (
                          <Badge className="bg-blue-500 text-white">
                            🔵 {memberData.stats.almostDone} Almost
                          </Badge>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {totalActions} action{totalActions !== 1 ? 's' : ''} (24h)
                      </div>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t bg-muted/30">
                  <div className="p-4 space-y-3">
                    {memberData.activities.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-4">
                        No recent activity
                      </div>
                    ) : (
                      memberData.activities.map((activity) => {
                        const quickAction = activity.details?.quick_action;
                        if (!quickAction) return null;

                        const display = getQuickActionDisplay(quickAction);

                        return (
                          <div
                            key={activity.id}
                            className="flex items-start gap-3 p-3 bg-background rounded-lg"
                          >
                            <div className="mt-1">
                              {getActionIcon(quickAction)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={`${display.color} text-xs`}>
                                  {display.icon} {display.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(activity.created_at), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                              <div className="text-sm font-medium truncate">
                                {activity.tasks?.title || 'Unknown Task'}
                              </div>
                              {activity.details?.note && (
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  Note: {activity.details.note}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {memberActivities.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No team members found
        </div>
      )}
    </div>
  );
};

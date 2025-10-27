import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Users } from "lucide-react";
import { Badge } from "./ui/badge";

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  user_roles?: { role: string }[];
};

type TeamChatListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMember: (memberId: string, memberName: string) => void;
  currentUserId: string;
};

export const TeamChatListDialog = ({
  open,
  onOpenChange,
  onSelectMember,
  currentUserId,
}: TeamChatListDialogProps) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchTeamMembers();
      fetchUnreadCounts();

      // Subscribe to ALL message events for instant unread count updates
      const channel = supabase
        .channel('new-messages-unread-counts', {
          config: {
            broadcast: { self: true }
          }
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${currentUserId}`,
          },
          (payload) => {
            console.log('📨 Message event:', payload.eventType, '- Updating unread counts');
            // Instant update without delay
            fetchUnreadCounts();
          }
        )
        .subscribe((status) => {
          console.log('📡 Team chat list subscription:', status);
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, currentUserId]);

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, user_roles(*)')
        .neq('id', currentUserId)
        .order('full_name');

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('recipient_id', currentUserId)
        .eq('is_read', false);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((msg) => {
        counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
      });
      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  };

  const handleSelectMember = (member: TeamMember) => {
    const name = member.full_name || member.email;
    onSelectMember(member.id, name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Chat
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <p className="text-muted-foreground">Loading team members...</p>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="flex justify-center py-8">
              <p className="text-muted-foreground">No team members found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <Button
                  key={member.id}
                  variant="ghost"
                  className="w-full justify-start h-auto py-3"
                  onClick={() => handleSelectMember(member)}
                >
                  <div className="flex items-center gap-3 w-full">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 text-left">
                      <p className="font-medium">{member.full_name || member.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.user_roles?.[0]?.role || 'operations'}
                      </p>
                    </div>
                     {unreadCounts[member.id] > 0 && (
                       <Badge variant="destructive" className="ml-auto">
                         {unreadCounts[member.id] > 9 ? '9+' : unreadCounts[member.id]}
                       </Badge>
                     )}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

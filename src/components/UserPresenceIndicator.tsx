import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Users, Circle, MessageCircle, X, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';

interface UserPresence {
  user_id: string;
  status: string;
  custom_message: string | null;
  last_active: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
  };
}

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', color: 'bg-green-500' },
  { value: 'busy', label: 'Busy', color: 'bg-red-500' },
  { value: 'away', label: 'Away', color: 'bg-yellow-500' },
  { value: 'offline', label: 'Offline', color: 'bg-gray-500' },
  { value: 'in_meeting', label: 'In Meeting', color: 'bg-purple-500' },
  { value: 'at_desk', label: 'At Desk', color: 'bg-blue-500' },
];

export const UserPresenceIndicator = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [myStatus, setMyStatus] = useState('available');
  const [customMessage, setCustomMessage] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [quickMessage, setQuickMessage] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Initialize or fetch user presence
        const { data: existing } = await supabase
          .from('user_presence')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          setMyStatus(existing.status);
          setCustomMessage(existing.custom_message || '');
        } else {
          // Create initial presence
          await supabase
            .from('user_presence')
            .insert({ user_id: user.id, status: 'available' });
        }
      }
    };
    initUser();
  }, []);

  useEffect(() => {
    fetchPresences();

    // Subscribe to presence changes
    const channel = supabase
      .channel('user-presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence'
        },
        () => {
          fetchPresences();
        }
      )
      .subscribe();

    // Update last_active every 30 seconds
    const interval = setInterval(() => {
      if (currentUserId) {
        supabase
          .from('user_presence')
          .update({ last_active: new Date().toISOString() })
          .eq('user_id', currentUserId)
          .then();
      }
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [currentUserId]);

  const fetchPresences = async () => {
    try {
      // First, get all team members (users with roles)
      const { data: teamMembers, error: teamError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          avatar_url,
          user_roles!inner(role)
        `)
        .order('full_name');

      if (teamError || !teamMembers) {
        console.error('Error fetching team members:', teamError);
        return;
      }

      // Get presence data for all team members
      const userIds = teamMembers.map(m => m.id);
      const { data: presenceData } = await supabase
        .from('user_presence')
        .select('*')
        .in('user_id', userIds);

      // Merge data - show all team members, even without presence
      const now = new Date().getTime();
      const data = teamMembers.map(member => {
        const presence = presenceData?.find(p => p.user_id === member.id);
        
        if (presence) {
          const lastActive = new Date(presence.last_active).getTime();
          const isOffline = (now - lastActive) > 120000; // 2 minutes = offline
          
          return {
            user_id: member.id,
            status: isOffline && presence.status !== 'offline' ? 'offline' : presence.status,
            custom_message: presence.custom_message,
            last_active: presence.last_active,
            profiles: {
              full_name: member.full_name,
              avatar_url: member.avatar_url
            }
          };
        } else {
          // No presence entry - show as offline
          return {
            user_id: member.id,
            status: 'offline',
            custom_message: null,
            last_active: new Date().toISOString(),
            profiles: {
              full_name: member.full_name,
              avatar_url: member.avatar_url
            }
          };
        }
      });

      setPresences(data as any);
    } catch (error) {
      console.error('Error in fetchPresences:', error);
    }
  };

  const updateMyStatus = async (status: string) => {
    if (!currentUserId) return;
    
    setMyStatus(status);
    await supabase
      .from('user_presence')
      .upsert({
        user_id: currentUserId,
        status,
        custom_message: customMessage,
        last_active: new Date().toISOString()
      });
  };

  const updateCustomMessage = async () => {
    if (!currentUserId) return;
    
    await supabase
      .from('user_presence')
      .update({ custom_message: customMessage })
      .eq('user_id', currentUserId);
  };

  const sendQuickMessage = async (recipientId: string) => {
    if (!quickMessage.trim() || !currentUserId) return;
    
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUserId,
          recipient_id: recipientId,
          message: quickMessage,
          message_type: 'text'
        });

      if (error) throw error;
      
      toast.success('Message sent!');
      setQuickMessage('');
      setSendingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const getStatusColor = (status: string) => {
    return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-500';
  };

  const displayedPresences = showAll ? presences : presences.slice(0, 5);
  const onlineCount = presences.filter(p => p.status !== 'offline').length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Team Status</h3>
          <Badge variant="secondary" className="text-xs">{onlineCount} online</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          {isMinimized ? <Users className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
        </Button>
      </div>

      {!isMinimized && (
        <>
      {/* My Status */}
      <div className="p-2 bg-secondary/50 rounded-lg mb-3">
        <p className="text-xs font-medium mb-2">Your Status</p>
        <div className="flex gap-2 mb-2">
          <Select value={myStatus} onValueChange={updateMyStatus}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <Circle className={`h-2 w-2 fill-current ${option.color.replace('bg-', 'text-')}`} />
                    {option.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Custom message..."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="text-xs h-8"
          />
          <Button size="sm" className="h-8" onClick={updateCustomMessage}>Set</Button>
        </div>
      </div>

      {/* Team Presences */}
      <div className="space-y-1.5">
        {displayedPresences.map((presence) => (
          <div key={presence.user_id}>
            <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
              <div className="relative">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={presence.profiles?.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {presence.profiles?.full_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background ${getStatusColor(presence.status)}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {presence.profiles?.full_name}
                  {presence.user_id === currentUserId && ' (You)'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {STATUS_OPTIONS.find(s => s.value === presence.status)?.label || presence.status}
                  {presence.custom_message && ` • ${presence.custom_message}`}
                </p>
              </div>
              {presence.user_id !== currentUserId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={() => setSendingTo(sendingTo === presence.user_id ? null : presence.user_id)}
                >
                  <MessageCircle className="h-3 w-3" />
                </Button>
              )}
            </div>
            {sendingTo === presence.user_id && (
              <div className="mt-1 ml-9 flex gap-1">
                <Input
                  placeholder="Quick message..."
                  value={quickMessage}
                  onChange={(e) => setQuickMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      sendQuickMessage(presence.user_id);
                    }
                  }}
                  className="text-xs h-7"
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => sendQuickMessage(presence.user_id)}>
                  Send
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 w-7 p-0" 
                  onClick={() => setSendingTo(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {presences.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 h-7 text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show Less' : `Show ${presences.length - 5} More`}
        </Button>
      )}
      </>
      )}
    </div>
  );
};
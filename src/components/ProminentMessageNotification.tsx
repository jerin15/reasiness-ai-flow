import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { X, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type NewMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  message: string;
  group_id?: string;
  group_name?: string;
};

export const ProminentMessageNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [notifications, setNotifications] = useState<NewMessage[]>([]);
  
  // Create notification sound
  const [notificationSound] = useState(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const createNotificationSound = () => {
      const duration = 0.3;
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
      const channel = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        // Triple beep pattern
        const envelope = Math.max(0, 1 - (t / duration));
        const beep1 = Math.sin(2 * Math.PI * 800 * t);
        const beep2 = Math.sin(2 * Math.PI * 1000 * (t - 0.1));
        const beep3 = Math.sin(2 * Math.PI * 1200 * (t - 0.2));
        
        if (t < 0.1) {
          channel[i] = beep1 * envelope * 0.3;
        } else if (t < 0.2) {
          channel[i] = beep2 * envelope * 0.3;
        } else {
          channel[i] = beep3 * envelope * 0.3;
        }
      }
      
      return buffer;
    };
    
    return { context: audioContext, buffer: createNotificationSound() };
  });

  useEffect(() => {
    const initUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("new-messages-alert")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const message = payload.new as any;

          // Only show if message is for current user
          const isForMe =
            message.recipient_id === currentUserId ||
            (message.group_id &&
              (await checkGroupMembership(message.group_id)));

          if (isForMe && message.sender_id !== currentUserId) {
            // Fetch sender details
            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("full_name, email, avatar_url")
              .eq("id", message.sender_id)
              .single();

            let groupName = null;
            if (message.group_id) {
              const { data: group } = await supabase
                .from("chat_groups")
                .select("name")
                .eq("id", message.group_id)
                .single();
              groupName = group?.name;
            }

            const newNotification: NewMessage = {
              id: message.id,
              sender_id: message.sender_id,
              sender_name:
                senderProfile?.full_name ||
                senderProfile?.email ||
                "Unknown",
              sender_avatar: senderProfile?.avatar_url,
              message: message.message,
              group_id: message.group_id,
              group_name: groupName,
            };

            setNotifications((prev) => [...prev, newNotification]);

            // Play sound
            const source = notificationSound.context.createBufferSource();
            source.buffer = notificationSound.buffer;
            source.connect(notificationSound.context.destination);
            source.start(0);

            // Vibrate
            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }

            // Show toast
            toast.success(
              `📨 New message from ${newNotification.sender_name}${
                groupName ? ` in ${groupName}` : ""
              }`,
              {
                duration: 5000,
                style: {
                  background: "#10b981",
                  color: "white",
                  fontSize: "16px",
                  fontWeight: "bold",
                },
              }
            );

            // Auto-dismiss after 8 seconds
            setTimeout(() => {
              setNotifications((prev) =>
                prev.filter((n) => n.id !== message.id)
              );
            }, 8000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const checkGroupMembership = async (groupId: string): Promise<boolean> => {
    const { data } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", currentUserId)
      .single();

    return !!data;
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 space-y-3 max-w-md">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl shadow-2xl p-4 animate-in slide-in-from-right border-2 border-white"
        >
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-white">
              <AvatarImage src={notification.sender_avatar} />
              <AvatarFallback className="bg-white/20 text-white font-bold">
                {getInitials(notification.sender_name)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 flex-shrink-0" />
                  <p className="font-bold text-lg">
                    {notification.sender_name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-white/20"
                  onClick={() => dismissNotification(notification.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {notification.group_name && (
                <p className="text-sm text-white/90 mb-1">
                  in {notification.group_name}
                </p>
              )}
              
              <p className="text-white/95 line-clamp-2 mt-1">
                {notification.message}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

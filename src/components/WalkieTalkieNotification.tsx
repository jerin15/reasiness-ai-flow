import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WalkieTalkieDialog } from './WalkieTalkieDialog';

export const WalkieTalkieNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callerId: string;
    callerName: string;
  } | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };

    initUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Listen for incoming walkie-talkie calls
    const channel = supabase
      .channel('incoming-walkie-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'active_walkie_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const call = payload.new;
          
          // Fetch caller info
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', call.caller_id)
            .single();

          const callerName = callerProfile?.full_name || callerProfile?.email || 'Someone';

          // Play notification sound
          const audio = new Audio('/notification.mp3');
          audio.play().catch(console.error);

          // Show toast notification
          toast.info(`📻 ${callerName} is calling on walkie-talkie!`, {
            description: 'Click to answer',
            duration: 10000,
            action: {
              label: 'Answer',
              onClick: () => {
                setIncomingCall({
                  callerId: call.caller_id,
                  callerName: callerName
                });
              },
            },
          });

          // Browser notification with mobile support
          if ('Notification' in window && Notification.permission === 'granted') {
            const notificationOptions = {
              body: 'Click to answer',
              icon: '/rea-logo-icon.png',
              badge: '/rea-logo-icon.png',
              tag: call.id,
              requireInteraction: true,
              vibrate: [200, 100, 200],
              silent: false
            };
            
            try {
              if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification(`📻 Walkie-Talkie Call from ${callerName}`, notificationOptions);
                });
              } else {
                new Notification(`📻 Walkie-Talkie Call from ${callerName}`, notificationOptions);
              }
            } catch (error) {
              console.error('Error showing notification:', error);
              new Notification(`Walkie-Talkie Call from ${callerName}`, {
                body: 'Click to answer',
                icon: '/rea-logo-icon.png'
              });
            }
          } else if (Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentUserId]);

  return (
    <>
      {incomingCall && (
        <WalkieTalkieDialog
          open={!!incomingCall}
          onOpenChange={(open) => {
            if (!open) setIncomingCall(null);
          }}
          recipientId={incomingCall.callerId}
          recipientName={incomingCall.callerName}
        />
      )}
    </>
  );
};

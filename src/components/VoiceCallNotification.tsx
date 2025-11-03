import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VoiceCallDialog } from './VoiceCallDialog';
import { Phone } from 'lucide-react';

export const VoiceCallNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    from: string;
    fromName: string;
    offer: RTCSessionDescriptionInit;
  } | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Get user's name
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setCurrentUserName(profile.full_name);
        }
      }
    };
    initUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    console.log('📞 Listening for incoming calls...');

    // Listen for incoming call offers on a user-specific channel
    const channel = supabase
      .channel(`user-calls-${currentUserId}`, {
        config: { broadcast: { self: false } }
      })
      .on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
        if (payload.to === currentUserId) {
          console.log('📞 Incoming call from:', payload.fromName);
          
          // Show toast notification
          toast('Incoming Voice Call', {
            description: `${payload.fromName} is calling you`,
            icon: <Phone className="h-5 w-5" />,
            action: {
              label: 'Answer',
              onClick: async () => {
                setIncomingCall({
                  callId: payload.callId,
                  from: payload.from,
                  fromName: payload.fromName,
                  offer: payload.offer
                });
                
                // Join the call channel and send answer
                const callChannel = supabase.channel(`voice-call-${payload.callId}`);
                
                // We'll handle the actual WebRTC connection in VoiceCallDialog
                // but we need to acknowledge we're answering
                await callChannel.send({
                  type: 'broadcast',
                  event: 'call-answer',
                  payload: {
                    from: currentUserId,
                    to: payload.from,
                    callId: payload.callId,
                    // The actual answer will be sent from VoiceCallDialog
                  }
                });
              }
            },
            cancel: {
              label: 'Decline',
              onClick: async () => {
                // Send decline signal
                const callChannel = supabase.channel(`voice-call-${payload.callId}`);
                await callChannel.send({
                  type: 'broadcast',
                  event: 'call-ended',
                  payload: {
                    from: currentUserId,
                    to: payload.from,
                    callId: payload.callId
                  }
                });
              }
            },
            duration: 30000
          });

          // Play ringtone
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLXiTcIF2m98OScTgwPUKXh8LVkHQU3kdXzzn0vBSR2x+/ekEELFF+06eunVRULRp/f8r1sIAUsgsz...'); // Short ringtone
          audio.play().catch(e => console.log('Could not play ringtone:', e));

          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Incoming Call', {
              body: `${payload.fromName} is calling`,
              icon: '/rea-logo-icon.png',
              tag: payload.callId
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <>
      {incomingCall && (
        <VoiceCallDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setIncomingCall(null);
          }}
          recipientId={incomingCall.from}
          recipientName={incomingCall.fromName}
          isIncoming={true}
          callId={incomingCall.callId}
          offer={incomingCall.offer}
        />
      )}
    </>
  );
};

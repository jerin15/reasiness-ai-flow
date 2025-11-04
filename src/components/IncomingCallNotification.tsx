import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WebRTCCall } from "./WebRTCCall";
import { Button } from "./ui/button";
import { Phone, PhoneOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { toast } from "sonner";

type IncomingCall = {
  id: string;
  caller_id: string;
  call_type: "voice" | "video";
  caller_name: string;
  caller_avatar?: string;
};

export const IncomingCallNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [ringtone] = useState(
    new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    )
  );

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
      .channel("incoming-calls")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_sessions",
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const session = payload.new as any;
          
          // Fetch caller details
          const { data: callerProfile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", session.caller_id)
            .single();

          setIncomingCall({
            id: session.id,
            caller_id: session.caller_id,
            call_type: session.call_type,
            caller_name: callerProfile?.full_name || callerProfile?.email || "Unknown",
          });

          // Play ringtone
          ringtone.loop = true;
          ringtone.play().catch(console.error);

          // Show toast notification
          toast.info(`Incoming ${session.call_type} call from ${callerProfile?.full_name || "Unknown"}`, {
            duration: 30000,
          });

          // Vibrate on mobile
          if (navigator.vibrate) {
            navigator.vibrate([1000, 500, 1000, 500, 1000]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `callee_id=eq.${currentUserId}`,
        },
        (payload) => {
          const session = payload.new as any;
          if (
            session.status === "ended" ||
            session.status === "declined" ||
            session.status === "answered"
          ) {
            ringtone.pause();
            ringtone.currentTime = 0;
            if (session.status !== "answered") {
              setIncomingCall(null);
              setShowCallDialog(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      ringtone.pause();
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const answerCall = () => {
    ringtone.pause();
    ringtone.currentTime = 0;
    setShowCallDialog(true);
  };

  const declineCall = async () => {
    ringtone.pause();
    ringtone.currentTime = 0;
    
    if (incomingCall) {
      await supabase
        .from("call_sessions")
        .update({
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", incomingCall.id);
    }
    
    setIncomingCall(null);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  if (!incomingCall && !showCallDialog) return null;

  return (
    <>
      {incomingCall && !showCallDialog && (
        <div className="fixed top-4 right-4 z-50 bg-background border rounded-lg shadow-2xl p-4 animate-in slide-in-from-top">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={incomingCall.caller_avatar} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(incomingCall.caller_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-semibold">{incomingCall.caller_name}</p>
              <p className="text-sm text-muted-foreground capitalize">
                Incoming {incomingCall.call_type} call...
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={declineCall}
                variant="destructive"
                size="icon"
                className="rounded-full"
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
              <Button
                onClick={answerCall}
                variant="default"
                size="icon"
                className="rounded-full bg-green-500 hover:bg-green-600"
              >
                <Phone className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCallDialog && incomingCall && (
        <WebRTCCall
          open={showCallDialog}
          onOpenChange={(open) => {
            setShowCallDialog(open);
            if (!open) setIncomingCall(null);
          }}
          callType={incomingCall.call_type}
          partnerId={incomingCall.caller_id}
          partnerName={incomingCall.caller_name}
          partnerAvatar={incomingCall.caller_avatar}
          isIncoming={true}
          callSessionId={incomingCall.id}
        />
      )}
    </>
  );
};

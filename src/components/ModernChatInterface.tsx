import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  X,
  Smile,
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  Reply,
  Check,
  CheckCheck,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import EmojiPicker from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { WebRTCCall } from "./WebRTCCall";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  group_id: string | null;
  message: string;
  attachment_url: string | null;
  attachment_name: string | null;
  is_read: boolean;
  created_at: string;
  reply_to_message_id: string | null;
  message_type: string;
  sender_profile?: {
    full_name: string;
    email: string;
  };
  replied_message?: {
    id: string;
    message: string;
    sender_profile?: {
      full_name: string;
    };
  };
};

type ModernChatInterfaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string; // can be userId or groupId
  chatName: string;
  chatType: "direct" | "group";
  chatAvatar?: string;
};

export const ModernChatInterface = ({
  open,
  onOpenChange,
  chatId,
  chatName,
  chatType,
  chatAvatar,
}: ModernChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageNotificationSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    // WhatsApp-like notification sound (different from other notifications)
    messageNotificationSound.current = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    );
  }, []);

  useEffect(() => {
    if (open && currentUserId && chatId) {
      fetchMessages();
      markMessagesAsRead();

      // Real-time subscription
      const channel = supabase
        .channel(`modern-chat-${chatId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const newMsg = payload.new as Message;
              const isRelevant =
                chatType === "group"
                  ? newMsg.group_id === chatId
                  : (newMsg.sender_id === currentUserId &&
                      newMsg.recipient_id === chatId) ||
                    (newMsg.sender_id === chatId &&
                      newMsg.recipient_id === currentUserId);

              if (isRelevant) {
                fetchMessages();
                if (newMsg.sender_id !== currentUserId) {
                  messageNotificationSound.current?.play();
                  // Vibrate on mobile
                  if (navigator.vibrate) {
                    navigator.vibrate([200]);
                  }
                }
              }
            } else if (payload.eventType === "UPDATE") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === payload.new.id ? { ...m, ...payload.new } : m
                )
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, currentUserId, chatId, chatType]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      let query = supabase
        .from("messages")
        .select(
          `
          *,
          sender_profile:profiles!messages_sender_id_fkey(full_name, email)
        `
        )
        .order("created_at", { ascending: true });

      if (chatType === "group") {
        query = query.eq("group_id", chatId);
      } else {
        // For direct messages: get messages between current user and chat partner
        query = query
          .is("group_id", null)
          .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${chatId}),and(sender_id.eq.${chatId},recipient_id.eq.${currentUserId})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch replied messages separately to avoid foreign key issues
      const messagesWithReplies = await Promise.all(
        (data || []).map(async (msg: any) => {
          if (msg.reply_to_message_id) {
            const { data: repliedMsg } = await supabase
              .from("messages")
              .select("id, message, sender_profile:profiles!messages_sender_id_fkey(full_name)")
              .eq("id", msg.reply_to_message_id)
              .maybeSingle();
            
            return {
              ...msg,
              replied_message: repliedMsg ? {
                id: repliedMsg.id,
                message: repliedMsg.message,
                sender_profile: repliedMsg.sender_profile
              } : null
            };
          }
          return { ...msg, replied_message: null };
        })
      );
      
      setMessages(messagesWithReplies);
    } catch (error: any) {
      console.error("Error fetching messages:", error);
      toast.error("Failed to load messages");
    }
  };

  const markMessagesAsRead = async () => {
    try {
      let query = supabase
        .from("messages")
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq("is_read", false);

      if (chatType === "group") {
        query = query.eq("group_id", chatId);
      } else {
        query = query
          .eq("recipient_id", currentUserId)
          .eq("sender_id", chatId)
          .is("group_id", null);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && !selectedFile) return;

    try {
      let attachmentUrl = null;
      let attachmentName = null;

      if (selectedFile) {
        setUploading(true);
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${currentUserId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);

        attachmentUrl = publicUrl;
        attachmentName = selectedFile.name;
        setUploading(false);
      }

      const messageData: any = {
        sender_id: currentUserId,
        message: newMessage.trim(),
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        message_type: selectedFile ? "file" : "text",
        reply_to_message_id: replyingTo?.id || null,
      };

      if (chatType === "group") {
        messageData.group_id = chatId;
        messageData.recipient_id = null;
      } else {
        messageData.recipient_id = chatId;
        messageData.group_id = null;
      }

      const { error } = await supabase.from("messages").insert(messageData);

      if (error) throw error;

      setNewMessage("");
      setSelectedFile(null);
      setReplyingTo(null);
      setShowEmojiPicker(false);
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(error.message || "Failed to send message");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 86400000) {
      // Less than 24 hours
      return format(date, "HH:mm");
    } else if (diff < 604800000) {
      // Less than 7 days
      return format(date, "EEE HH:mm");
    } else {
      return format(date, "dd/MM/yy HH:mm");
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl h-[80vh] flex flex-col gap-0 bg-gradient-to-b from-background to-muted/20">
        {/* Header - WhatsApp style */}
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Avatar className="h-10 w-10">
            <AvatarImage src={chatAvatar || "/rea-logo-icon.png"} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {getInitials(chatName)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <h3 className="font-semibold text-sm">{chatName}</h3>
            <p className="text-xs text-muted-foreground">
              {chatType === "group" ? "Group chat" : "Online"}
            </p>
          </div>

          {chatType === "direct" && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowVideoCall(true)}
              >
                <Video className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowVoiceCall(true)}
              >
                <Phone className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-3">
            {messages.map((message) => {
              const isSent = message.sender_id === currentUserId;
              const senderName =
                message.sender_profile?.full_name ||
                message.sender_profile?.email ||
                "Unknown";

              return (
                <div
                  key={message.id}
                  className={`flex ${isSent ? "justify-end" : "justify-start"} group`}
                >
                  <div
                    className={`max-w-[70%] ${isSent ? "order-1" : "order-2"}`}
                  >
                    {/* Group sender name */}
                    {chatType === "group" && !isSent && (
                      <p className="text-xs text-primary font-medium mb-1 px-1">
                        {senderName}
                      </p>
                    )}

                    {/* Reply preview */}
                    {message.replied_message && (
                      <div
                        className={`text-xs p-2 rounded-t-lg border-l-4 ${
                          isSent
                            ? "bg-primary/5 border-primary/30"
                            : "bg-muted/50 border-muted-foreground/30"
                        }`}
                      >
                        <p className="font-medium text-primary">
                          {message.replied_message.sender_profile?.full_name}
                        </p>
                        <p className="text-muted-foreground truncate">
                          {message.replied_message.message}
                        </p>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      className={`rounded-lg p-3 shadow-sm ${
                        isSent
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-card rounded-tl-none"
                      }`}
                    >
                      {message.attachment_url && (
                        <div className="mb-2">
                          {message.message_type === "file" &&
                          message.attachment_url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                            <img
                              src={message.attachment_url}
                              alt={message.attachment_name || "Attachment"}
                              className="rounded max-w-full h-auto"
                            />
                          ) : (
                            <a
                              href={message.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline"
                            >
                              <Paperclip className="h-4 w-4" />
                              {message.attachment_name}
                            </a>
                          )}
                        </div>
                      )}

                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.message}
                      </p>

                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-xs ${
                          isSent ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        <span>{formatMessageTime(message.created_at)}</span>
                        {isSent &&
                          (message.is_read ? (
                            <CheckCheck className="h-3 w-3 text-blue-400" />
                          ) : (
                            <Check className="h-3 w-3" />
                          ))}
                      </div>
                    </div>

                    {/* Reply button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`opacity-0 group-hover:opacity-100 transition-opacity h-6 text-xs mt-1 ${
                        isSent ? "ml-auto" : "mr-auto"
                      }`}
                      onClick={() => setReplyingTo(message)}
                    >
                      <Reply className="h-3 w-3 mr-1" />
                      Reply
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Reply preview bar */}
        {replyingTo && (
          <div className="px-4 py-2 bg-muted/50 border-t flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs text-primary font-medium">
                Replying to{" "}
                {replyingTo.sender_profile?.full_name || "Unknown"}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {replyingTo.message}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* File preview */}
        {selectedFile && (
          <div className="px-4 py-2 bg-muted/50 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{selectedFile.name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setSelectedFile(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Input Area - WhatsApp style */}
        <div className="p-3 border-t bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 flex-shrink-0"
                >
                  <Smile className="h-5 w-5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 border-0" align="start">
                <EmojiPicker
                  onEmojiClick={(emoji) => {
                    setNewMessage((prev) => prev + emoji.emoji);
                    setShowEmojiPicker(false);
                  }}
                  width="100%"
                  height="400px"
                />
              </PopoverContent>
            </Popover>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </Button>

            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-full border-none bg-muted/50 px-4"
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            <Button
              onClick={handleSendMessage}
              disabled={(!newMessage.trim() && !selectedFile) || uploading}
              size="icon"
              className="h-9 w-9 rounded-full flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Voice Call Dialog */}
      {showVoiceCall && chatType === "direct" && (
        <WebRTCCall
          open={showVoiceCall}
          onOpenChange={setShowVoiceCall}
          callType="voice"
          partnerId={chatId}
          partnerName={chatName}
          partnerAvatar={chatAvatar}
        />
      )}

      {/* Video Call Dialog */}
      {showVideoCall && chatType === "direct" && (
        <WebRTCCall
          open={showVideoCall}
          onOpenChange={setShowVideoCall}
          callType="video"
          partnerId={chatId}
          partnerName={chatName}
          partnerAvatar={chatAvatar}
        />
      )}
    </Dialog>
  );
};

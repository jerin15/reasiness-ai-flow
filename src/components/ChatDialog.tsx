import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Paperclip, X, Smile, Radio, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { WalkieTalkieDialog } from "./WalkieTalkieDialog";
import { VoiceCallDialog } from "./VoiceCallDialog";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  attachment_url: string | null;
  attachment_name: string | null;
  is_read: boolean;
  created_at: string;
};

type ChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName: string;
};

export const ChatDialog = ({ open, onOpenChange, recipientId, recipientName }: ChatDialogProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showWalkieTalkie, setShowWalkieTalkie] = useState(false);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    // Initialize audio for notifications
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZUQ8PVqzn77BdGAg+ltryym4lBSh+y/H');
  }, []);

  useEffect(() => {
    if (open && currentUserId && recipientId) {
      // Mark messages as read immediately when dialog opens
      markMessagesAsRead();
      fetchMessages();
      
      // Subscribe to all messages in this conversation - listen to ALL events for instant sync
      const channel = supabase
        .channel(`chat-${currentUserId}-${recipientId}`, {
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
          },
          (payload) => {
            console.log('💬 Real-time message event:', payload.eventType, payload);
            
            if (payload.eventType === 'INSERT') {
              const newMsg = payload.new as Message;
              
              // Only process if this message is part of our conversation
              if (
                (newMsg.sender_id === currentUserId && newMsg.recipient_id === recipientId) ||
                (newMsg.sender_id === recipientId && newMsg.recipient_id === currentUserId)
              ) {
                setMessages((prev) => {
                  // Avoid duplicates
                  if (prev.some(m => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg].sort((a, b) => 
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                });
                
                // Only play sound and notify for received messages
                if (newMsg.sender_id === recipientId) {
                  // Play sound
                  if (audioRef.current) {
                    audioRef.current.play().catch(e => console.log('Audio play failed:', e));
                  }
                  
                  // Show notification
                  if (Notification.permission === 'granted') {
                    new Notification(`New message from ${recipientName}`, {
                      body: newMsg.message,
                      icon: '/rea-logo-icon.png'
                    });
                  }
                }
                
                scrollToBottom();
              }
            } else if (payload.eventType === 'UPDATE') {
              // Handle message updates (like read status)
              const updatedMsg = payload.new as Message;
              setMessages((prev) => prev.map(msg => 
                msg.id === updatedMsg.id ? updatedMsg : msg
              ));
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 Chat subscription status:', status);
        });

      // Request notification permission
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, currentUserId, recipientId, recipientName]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      
      // Mark ALL unread messages as read immediately and atomically
      await markMessagesAsRead();
      
      // Scroll to bottom after messages are loaded
      scrollToBottom();
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    }
  };

  const markMessagesAsRead = async () => {
    try {
      const { data: unreadMessages, error: fetchError } = await supabase
        .from('messages')
        .select('id')
        .eq('recipient_id', currentUserId)
        .eq('sender_id', recipientId)
        .eq('is_read', false);

      if (fetchError) throw fetchError;

      if (unreadMessages && unreadMessages.length > 0) {
        const messageIds = unreadMessages.map(m => m.id);
        
        const { error: updateError } = await supabase
          .from('messages')
          .update({ 
            is_read: true, 
            updated_at: new Date().toISOString() 
          })
          .in('id', messageIds);

        if (updateError) {
          console.error('Error marking messages as read:', updateError);
        } else {
          console.log(`✅ ${messageIds.length} messages marked as read instantly`);
          // Force update local state immediately
          setMessages(prev => prev.map(msg => 
            messageIds.includes(msg.id) ? { ...msg, is_read: true } : msg
          ));
        }
      }
    } catch (error) {
      console.error('Error in markMessagesAsRead:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUserId}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(fileName, file);

    if (error) throw error;
    return data.path;
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() && !selectedFile) return;

    setUploading(true);
    try {
      let attachmentUrl = null;
      let attachmentName = null;

      if (selectedFile) {
        attachmentUrl = await uploadFile(selectedFile);
        attachmentName = selectedFile.name;
      }

      const { error } = await supabase.from('messages').insert({
        sender_id: currentUserId,
        recipient_id: recipientId,
        message: newMessage.trim() || '📎 Attachment',
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
      });

      if (error) throw error;

      setNewMessage('');
      setSelectedFile(null);
      setShowEmojiPicker(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setUploading(false);
    }
  };

  const downloadAttachment = async (path: string, name: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Chat with {recipientName}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowVoiceCall(true)}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Call
            </Button>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea ref={scrollRef} className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {messages.map((msg) => {
              const isOwn = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                   <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isOwn
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                   >
                     <p className="text-sm">{msg.message}</p>
                     {msg.attachment_url && (
                       <button
                         onClick={() => downloadAttachment(msg.attachment_url!, msg.attachment_name!)}
                         className="mt-2 flex items-center gap-2 text-xs underline hover:no-underline"
                       >
                         <Paperclip className="h-3 w-3" />
                         {msg.attachment_name}
                       </button>
                     )}
                     <p className="text-xs opacity-70 mt-1">
                       {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                     </p>
                   </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <form onSubmit={handleSendMessage} className="flex gap-2 items-end pt-4 border-t">
          <div className="flex-1">
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 text-sm bg-muted p-2 rounded">
                <Paperclip className="h-4 w-4" />
                <span className="flex-1 truncate">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-destructive hover:text-destructive/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message... 😊"
              disabled={uploading}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={uploading}
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="end">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                width="100%"
                height="400px"
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowWalkieTalkie(true)}
            disabled={uploading}
            title="Start walkie-talkie call"
          >
            <Radio className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button type="submit" size="icon" disabled={uploading || (!newMessage.trim() && !selectedFile)}>
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {showWalkieTalkie && (
          <WalkieTalkieDialog
            open={showWalkieTalkie}
            onOpenChange={setShowWalkieTalkie}
            recipientId={recipientId}
            recipientName={recipientName}
          />
        )}

        {showVoiceCall && (
          <VoiceCallDialog
            open={showVoiceCall}
            onOpenChange={setShowVoiceCall}
            recipientId={recipientId}
            recipientName={recipientName}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, Users, Search, UserPlus } from "lucide-react";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { ModernChatInterface } from "./ModernChatInterface";

type Chat = {
  id: string;
  name: string;
  type: "direct" | "group";
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
};

type ModernChatListProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
};

export const ModernChatList = ({
  open,
  onOpenChange,
  currentUserId,
}: ModernChatListProps) => {
  const [directChats, setDirectChats] = useState<Chat[]>([]);
  const [groupChats, setGroupChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [activeTab, setActiveTab] = useState("direct");

  useEffect(() => {
    if (open && currentUserId) {
      fetchChats();

      // Subscribe to real-time updates
      const channel = supabase
        .channel("chat-updates")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
          },
          () => {
            fetchChats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, currentUserId]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchDirectChats(), fetchGroupChats()]);
    } catch (error) {
      console.error("Error fetching chats:", error);
      toast.error("Failed to load chats");
    } finally {
      setLoading(false);
    }
  };

  const fetchDirectChats = async () => {
    try {
      // Get all users who have chatted with current user
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .neq("id", currentUserId);

      if (error) throw error;

      const chats: Chat[] = await Promise.all(
        profiles.map(async (profile) => {
          // Get last message
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("message, created_at")
            .or(
              `and(sender_id.eq.${currentUserId},recipient_id.eq.${profile.id}),and(sender_id.eq.${profile.id},recipient_id.eq.${currentUserId})`
            )
            .is("group_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

      // Get unread count
      const { data: unreadMessages } = await supabase
        .from("messages")
        .select("id")
        .eq("sender_id", profile.id)
        .eq("recipient_id", currentUserId)
        .eq("is_read", false)
        .is("group_id", null);

      const count = unreadMessages?.length || 0;

          return {
            id: profile.id,
            name: profile.full_name,
            type: "direct" as const,
            avatar: profile.avatar_url,
            lastMessage: lastMsg?.message,
            lastMessageTime: lastMsg?.created_at,
            unreadCount: count || 0,
          };
        })
      );

      // Sort by last message time
      chats.sort((a, b) => {
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return (
          new Date(b.lastMessageTime).getTime() -
          new Date(a.lastMessageTime).getTime()
        );
      });

      setDirectChats(chats);
    } catch (error) {
      console.error("Error fetching direct chats:", error);
    }
  };

  const fetchGroupChats = async () => {
    try {
      // Get groups where user is a member
      const { data: groups, error } = await supabase
        .from("chat_groups")
        .select(
          `
          *,
          group_members!inner(user_id)
        `
        )
        .eq("group_members.user_id", currentUserId);

      if (error) throw error;

      const chats: Chat[] = await Promise.all(
        groups.map(async (group) => {
          // Get last message
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("message, created_at")
            .eq("group_id", group.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Get unread count
          const { data: unreadMessages } = await supabase
            .from("messages")
            .select("id")
            .eq("group_id", group.id)
            .neq("sender_id", currentUserId)
            .eq("is_read", false);

          const count = unreadMessages?.length || 0;

          return {
            id: group.id,
            name: group.name,
            type: "group" as const,
            avatar: group.avatar_url,
            lastMessage: lastMsg?.message,
            lastMessageTime: lastMsg?.created_at,
            unreadCount: count || 0,
          };
        })
      );

      // Sort by last message time
      chats.sort((a, b) => {
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return (
          new Date(b.lastMessageTime).getTime() -
          new Date(a.lastMessageTime).getTime()
        );
      });

      setGroupChats(chats);
    } catch (error) {
      console.error("Error fetching group chats:", error);
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

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const filteredDirectChats = directChats.filter((chat) =>
    (chat.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroupChats = groupChats.filter((chat) =>
    (chat.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderChatItem = (chat: Chat) => (
    <div
      key={chat.id}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => {
        setSelectedChat(chat);
        onOpenChange(false);
      }}
    >
      <Avatar className="h-12 w-12 flex-shrink-0">
        <AvatarImage src={chat.avatar || "/rea-logo-icon.png"} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
          {chat.type === "group" ? (
            <Users className="h-6 w-6" />
          ) : (
            getInitials(chat.name)
          )}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-sm truncate">{chat.name}</h4>
          {chat.lastMessageTime && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTime(chat.lastMessageTime)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground truncate">
            {chat.lastMessage || "No messages yet"}
          </p>
          {chat.unreadCount > 0 && (
            <Badge className="h-5 min-w-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs px-1.5">
              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Messages
              </DialogTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCreateGroup(true)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                New Group
              </Button>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col"
          >
            <TabsList className="w-full justify-start rounded-none border-b px-6">
              <TabsTrigger value="direct" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Direct ({filteredDirectChats.length})
              </TabsTrigger>
              <TabsTrigger value="groups" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Groups ({filteredGroupChats.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="direct" className="flex-1 m-0">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-1">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-muted-foreground">Loading chats...</div>
                    </div>
                  ) : filteredDirectChats.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      {searchQuery ? "No chats found" : "No direct messages yet"}
                    </div>
                  ) : (
                    filteredDirectChats.map(renderChatItem)
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="groups" className="flex-1 m-0">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-1">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-muted-foreground">Loading groups...</div>
                    </div>
                  ) : filteredGroupChats.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      {searchQuery ? "No groups found" : "No group chats yet"}
                      <p className="text-sm mt-2">
                        Create a group to start chatting with your team
                      </p>
                    </div>
                  ) : (
                    filteredGroupChats.map(renderChatItem)
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        currentUserId={currentUserId}
        onGroupCreated={() => {
          fetchChats();
          setActiveTab("groups");
        }}
      />

      {selectedChat && (
        <ModernChatInterface
          open={!!selectedChat}
          onOpenChange={(open) => {
            if (!open) setSelectedChat(null);
          }}
          chatId={selectedChat.id}
          chatName={selectedChat.name}
          chatType={selectedChat.type}
          chatAvatar={selectedChat.avatar}
        />
      )}
    </>
  );
};

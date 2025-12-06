import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, User, Mail, Key, Camera } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
}

interface ManageTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManageTeamDialog = ({ open, onOpenChange }: ManageTeamDialogProps) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Edit form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [terminateSessions, setTerminateSessions] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMembers();
    }
  }, [open]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          avatar_url
        `)
        .order('full_name');

      if (error) throw error;

      // Fetch roles separately
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      const membersWithRoles = (data || []).map(m => ({
        ...m,
        role: roleMap.get(m.id) || null
      }));

      setMembers(membersWithRoles);
    } catch (error: any) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const handleEditMember = (member: TeamMember) => {
    setSelectedMember(member);
    setNewName(member.full_name || "");
    setNewEmail(member.email);
    setNewPassword("");
    setNewAvatarUrl(member.avatar_url || "");
    setTerminateSessions(false);
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!selectedMember) return;
    
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const payload: any = {
        user_id: selectedMember.id,
      };

      // Only include changed fields
      if (newName !== selectedMember.full_name) {
        payload.full_name = newName || null;
      }
      if (newEmail !== selectedMember.email) {
        payload.new_email = newEmail;
      }
      if (newPassword) {
        payload.new_password = newPassword;
      }
      if (newAvatarUrl !== selectedMember.avatar_url) {
        payload.avatar_url = newAvatarUrl || null;
      }
      if (terminateSessions) {
        payload.terminate_sessions = true;
      }

      const response = await supabase.functions.invoke('admin-update-user', {
        body: payload
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to update user');
      }

      toast.success('Team member updated successfully');
      if (terminateSessions) {
        toast.info('All sessions for this user have been terminated');
      }
      
      setEditMode(false);
      setSelectedMember(null);
      fetchMembers();
    } catch (error: any) {
      console.error('Error updating member:', error);
      toast.error(error.message || 'Failed to update team member');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setEditMode(false);
    setSelectedMember(null);
  };

  const getRoleDisplay = (role: string | null) => {
    if (!role) return 'No Role';
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>
            {editMode ? `Edit ${selectedMember?.full_name || 'Team Member'}` : 'Manage Team Members'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : editMode && selectedMember ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b">
              <Avatar className="h-16 w-16">
                <AvatarImage src={newAvatarUrl || undefined} />
                <AvatarFallback>{(newName || selectedMember.email)[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedMember.full_name || 'Unnamed'}</p>
                <p className="text-sm text-muted-foreground">{getRoleDisplay(selectedMember.role)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4" /> Full Name
                </Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Enter email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Key className="h-4 w-4" /> New Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar" className="flex items-center gap-2">
                  <Camera className="h-4 w-4" /> Avatar URL
                </Label>
                <Input
                  id="avatar"
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                  placeholder="Enter avatar URL or leave blank"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t">
                <input
                  type="checkbox"
                  id="terminate"
                  checked={terminateSessions}
                  onChange={(e) => setTerminateSessions(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="terminate" className="text-sm text-destructive cursor-pointer">
                  Terminate all active sessions (logs out user from all devices)
                </Label>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button variant="outline" onClick={handleBack} disabled={saving}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => handleEditMember(member)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback>{(member.full_name || member.email)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.full_name || 'Unnamed'}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-muted px-2 py-1 rounded">
                    {getRoleDisplay(member.role)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

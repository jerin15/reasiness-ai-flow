import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UserPlus, Loader2, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateUserDialog = ({ open, onOpenChange }: CreateUserDialogProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [customRoles, setCustomRoles] = useState<any[]>([]);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDisplayName, setNewRoleDisplayName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [pipelineAccess, setPipelineAccess] = useState<Record<string, boolean>>({
    'todo': true,
    'admin_cost_approval': false,
    'approve_estimation': false,
    'with_client': false,
    'designer_mockup': false,
    'designer_done': false,
    'production': false,
    'done': false,
  });

  useEffect(() => {
    if (open) {
      fetchCustomRoles();
    }
  }, [open]);

  const fetchCustomRoles = async () => {
    const { data, error } = await supabase
      .from('custom_roles')
      .select('*')
      .order('display_name');

    if (!error && data) {
      setCustomRoles(data);
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName || !newRoleDisplayName) {
      toast.error("Please provide role name and display name");
      return;
    }

    // Convert role name to lowercase with underscores
    const roleNameFormatted = newRoleName.toLowerCase().replace(/\s+/g, '_');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create custom role
      const { error: roleError } = await supabase
        .from('custom_roles')
        .insert({
          role_name: roleNameFormatted,
          display_name: newRoleDisplayName,
          description: newRoleDescription,
          created_by: user?.id,
        });

      if (roleError) {
        throw new Error(roleError.message);
      }

      // Create pipeline access entries
      const pipelineEntries = Object.entries(pipelineAccess)
        .filter(([_, canAccess]) => canAccess)
        .map(([status, _]) => ({
          role_name: roleNameFormatted,
          pipeline_status: status,
          can_view: true,
          can_edit: true,
          can_move_to: true,
        }));

      if (pipelineEntries.length > 0) {
        const { error: pipelineError } = await supabase
          .from('role_pipeline_access')
          .insert(pipelineEntries);

        if (pipelineError) {
          throw new Error(pipelineError.message);
        }
      }

      toast.success(`Role "${newRoleDisplayName}" created successfully!`);
      setShowCreateRole(false);
      setNewRoleName("");
      setNewRoleDisplayName("");
      setNewRoleDescription("");
      setPipelineAccess({
        'todo': true,
        'admin_cost_approval': false,
        'approve_estimation': false,
        'with_client': false,
        'designer_mockup': false,
        'designer_done': false,
        'production': false,
        'done': false,
      });
      fetchCustomRoles();
      setRole(roleNameFormatted);
    } catch (error: any) {
      console.error("Error creating role:", error);
      toast.error(error.message || "Failed to create role");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !fullName || !role) {
      toast.error("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("You must be logged in to create users");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email,
            password,
            full_name: fullName,
            role,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create user");
      }

      const selectedRole = customRoles.find(r => r.role_name === role);
      toast.success(`User ${email} created successfully as ${selectedRole?.display_name || role}!`);
      
      // Reset form
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const pipelineLabels: Record<string, string> = {
    'todo': 'To Do',
    'admin_cost_approval': 'Admin Cost Approval',
    'approve_estimation': 'Approve Estimation',
    'with_client': 'With Client',
    'designer_mockup': 'Designer Mockup',
    'designer_done': 'Designer Done',
    'production': 'Production',
    'done': 'Done',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <DialogTitle>Create New User</DialogTitle>
          </div>
          <DialogDescription>
            Add a new team member with their email, password, and role assignment.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="create-user" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create-user">Create User</TabsTrigger>
            <TabsTrigger value="create-role">Create New Role</TabsTrigger>
          </TabsList>

          <TabsContent value="create-user">
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              User can change this password after first login
            </p>
          </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role / Department *</Label>
                <Select value={role} onValueChange={setRole} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user role" />
                  </SelectTrigger>
                  <SelectContent>
                    {customRoles.map((customRole) => (
                      <SelectItem key={customRole.role_name} value={customRole.role_name}>
                        <div className="flex items-center gap-2">
                          <span>{customRole.display_name}</span>
                          {!['admin', 'technical_head', 'estimation', 'designer', 'operations'].includes(customRole.role_name) && (
                            <Badge variant="outline" className="text-xs">Custom</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role && (
                  <p className="text-xs text-muted-foreground">
                    {customRoles.find(r => r.role_name === role)?.description || ''}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Create User
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="create-role">
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="newRoleName">Role Name (Internal) *</Label>
                <Input
                  id="newRoleName"
                  type="text"
                  placeholder="e.g., marketing_lead"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Will be converted to lowercase with underscores
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newRoleDisplayName">Display Name *</Label>
                <Input
                  id="newRoleDisplayName"
                  type="text"
                  placeholder="e.g., Marketing Lead"
                  value={newRoleDisplayName}
                  onChange={(e) => setNewRoleDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newRoleDescription">Description</Label>
                <Input
                  id="newRoleDescription"
                  type="text"
                  placeholder="Brief description of the role"
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label>Pipeline Access</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(pipelineLabels).map(([status, label]) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pipeline-${status}`}
                        checked={pipelineAccess[status]}
                        onCheckedChange={(checked) => 
                          setPipelineAccess(prev => ({ ...prev, [status]: checked as boolean }))
                        }
                      />
                      <label
                        htmlFor={`pipeline-${status}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select which pipeline stages this role can access
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateRole(false);
                    setNewRoleName("");
                    setNewRoleDisplayName("");
                    setNewRoleDescription("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="button"
                  onClick={handleCreateRole}
                  className="flex-1"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Role
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

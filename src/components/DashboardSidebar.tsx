import { Button } from "@/components/ui/button";
import { LogOut, MessageSquare, BarChart3, Users, FileText, Download, FileCheck, Plus, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusChangeNotification } from "./StatusChangeNotification";
import { WalkieTalkieNotification } from "./WalkieTalkieNotification";
import { AdminCommunicationPanel } from "./AdminCommunicationPanel";
import { UserPresenceIndicator } from "./UserPresenceIndicator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface DashboardSidebarProps {
  userRole: string;
  currentUserId: string;
  selectedUserId: string;
  teamMembers: any[];
  unreadCount: number;
  onUserChange: (userId: string) => void;
  onAnalyticsClick: () => void;
  onMyReportClick: () => void;
  onTeamReportClick: () => void;
  onEstimationReportClick: () => void;
  onAdminTaskReportClick: () => void;
  onChatClick: () => void;
  onPersonalAnalyticsClick: () => void;
  onCreateTaskClick: () => void;
  onCreateUserClick?: () => void;
  onSignOut: () => void;
  showPersonalAnalytics?: boolean;
  getSelectedUserName: () => string;
  formatRole: (role: string) => string;
}

export function DashboardSidebar({
  userRole,
  currentUserId,
  selectedUserId,
  teamMembers,
  unreadCount,
  onUserChange,
  onAnalyticsClick,
  onMyReportClick,
  onTeamReportClick,
  onEstimationReportClick,
  onAdminTaskReportClick,
  onChatClick,
  onPersonalAnalyticsClick,
  onCreateTaskClick,
  onCreateUserClick,
  onSignOut,
  showPersonalAnalytics,
  getSelectedUserName,
  formatRole,
}: DashboardSidebarProps) {
  const { open } = useSidebar();
  const isAdminOrHead = userRole === "admin" || userRole === "technical_head";
  const isAdminOrEstimation = userRole === "admin" || userRole === "estimation";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* View Selector for Admin/Technical Head */}
        {isAdminOrHead && (
          <SidebarGroup>
            <SidebarGroupLabel>View</SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              <Select value={selectedUserId} onValueChange={onUserChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      <span className="text-sm">{getSelectedUserName()}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentUserId}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">My Tasks</span>
                    </div>
                  </SelectItem>
                  {teamMembers
                    .filter((user) => user.id !== currentUserId)
                    .map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex flex-col items-start">
                          <span>{user.full_name || user.email}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatRole(user.user_roles?.[0]?.role || "operations")}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  
                  {userRole === "admin" && onCreateUserClick && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <div 
                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateUserClick();
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-2 text-primary" />
                        <span className="font-medium text-primary">Create New User</span>
                      </div>
                    </>
                  )}
                </SelectContent>
              </Select>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Quick Actions - Admin Only */}
        {isAdminOrHead && (
          <SidebarGroup>
            <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onCreateTaskClick}>
                    <Plus className="h-4 w-4" />
                    <span>Create Task</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Reports & Analytics */}
        <SidebarGroup>
          <SidebarGroupLabel>Reports & Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Analytics */}
              {isAdminOrHead && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onAnalyticsClick}>
                    <BarChart3 className="h-4 w-4" />
                    <span>Analytics</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Personal Analytics for non-admin */}
              {!isAdminOrHead && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onPersonalAnalyticsClick}>
                    <BarChart3 className="h-4 w-4" />
                    <span>{showPersonalAnalytics ? "Hide" : "Show"} Analytics</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* My Report */}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onMyReportClick}>
                  <FileText className="h-4 w-4" />
                  <span>My Report</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Team Report */}
              {isAdminOrHead && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onTeamReportClick}>
                    <FileText className="h-4 w-4" />
                    <span>Team Reports</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}


              {/* Estimation Report */}
              {isAdminOrHead && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onEstimationReportClick}>
                    <Download className="h-4 w-4" />
                    <span>Estimation Report</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Cost Sheet Approval */}
              {isAdminOrEstimation && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => window.open('https://reacostsheet.netlify.app/', '_blank')}>
                    <FileCheck className="h-4 w-4" />
                    <span>Cost Sheet Approval</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Notifications */}
        <SidebarGroup>
          <SidebarGroupLabel>Notifications</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2 px-2">
            <StatusChangeNotification />
            <WalkieTalkieNotification />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Team Status */}
        <SidebarGroup>
          <SidebarGroupLabel>Team Status</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <UserPresenceIndicator />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sign Out */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onSignOut} className="text-destructive hover:text-destructive">
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

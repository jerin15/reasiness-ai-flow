import { Button } from "@/components/ui/button";
import { LogOut, MessageSquare, BarChart3, Users, FileText, Download, FileCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusChangeNotification } from "./StatusChangeNotification";
import { WalkieTalkieNotification } from "./WalkieTalkieNotification";
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
  onSignOut,
  showPersonalAnalytics,
  getSelectedUserName,
  formatRole,
}: DashboardSidebarProps) {
  const { open } = useSidebar();
  const isAdminOrHead = userRole === "admin" || userRole === "technical_head";
  const isAdminOrEstimation = userRole === "admin" || userRole === "estimation";
  
  console.log("DashboardSidebar - userRole:", userRole);
  console.log("DashboardSidebar - isAdminOrEstimation:", isAdminOrEstimation);

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
                </SelectContent>
              </Select>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Main Actions */}
        <SidebarGroup>
          <SidebarGroupLabel>Actions</SidebarGroupLabel>
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

              {/* Member Reports */}
              {isAdminOrHead && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onAdminTaskReportClick}>
                    <FileText className="h-4 w-4" />
                    <span>Member Reports</span>
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

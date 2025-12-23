import { UserKPIData, TimePeriod } from "@/hooks/useKPIAnalytics";
import { KPICard } from "./KPICard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Paintbrush, 
  Users, 
  Truck, 
  Phone, 
  MessageSquare,
  Target,
  TrendingUp,
  Award
} from "lucide-react";

interface RoleKPISectionProps {
  role: 'estimation' | 'designer' | 'operations' | 'client_service' | 'admin';
  users: UserKPIData[];
  period: TimePeriod;
}

const roleConfig = {
  estimation: {
    title: '📊 Estimation Team',
    description: 'Quotations, RFQs, and supplier management',
    color: 'from-blue-500 to-cyan-500',
  },
  designer: {
    title: '🎨 Design Team',
    description: 'Mockups, production files, and client approvals',
    color: 'from-purple-500 to-pink-500',
  },
  operations: {
    title: '🏭 Operations Team',
    description: 'Production tasks and deliveries',
    color: 'from-orange-500 to-red-500',
  },
  client_service: {
    title: '📞 Client Service',
    description: 'Calls, follow-ups, and client requests',
    color: 'from-green-500 to-emerald-500',
  },
  admin: {
    title: '👑 Admin Overview',
    description: 'All team metrics and performance',
    color: 'from-yellow-500 to-amber-500',
  },
};

export const RoleKPISection = ({ role, users, period }: RoleKPISectionProps) => {
  const config = roleConfig[role];
  
  // Aggregate metrics for the role
  const aggregated = users.reduce(
    (acc, user) => {
      Object.keys(user.kpis).forEach(key => {
        const k = key as keyof typeof user.kpis;
        acc[k] = (acc[k] || 0) + (user.kpis[k] as number);
      });
      return acc;
    },
    {} as Record<string, number>
  );

  // Sort users by relevant KPI
  const sortedUsers = [...users].sort((a, b) => {
    switch (role) {
      case 'estimation':
        return b.kpis.quotationsSent - a.kpis.quotationsSent;
      case 'designer':
        return b.kpis.mockupsCompleted - a.kpis.mockupsCompleted;
      case 'operations':
        return b.kpis.productionTasksCompleted - a.kpis.productionTasksCompleted;
      case 'client_service':
        return b.kpis.newCallsHandled - a.kpis.newCallsHandled;
      default:
        return b.kpis.tasksCompleted - a.kpis.tasksCompleted;
    }
  });

  const renderKPICards = () => {
    switch (role) {
      case 'estimation':
        return (
          <>
            <KPICard
              title="RFQs Received"
              value={aggregated.rfqsReceived || 0}
              icon={FileText}
              iconColor="text-blue-500"
              subtitle="Total quotation requests"
            />
            <KPICard
              title="Quotations Sent"
              value={aggregated.quotationsSent || 0}
              icon={Send}
              iconColor="text-green-500"
              subtitle="Completed quotations"
            />
          </>
        );
      
      case 'designer':
        return (
          <>
            <KPICard
              title="Mockups Completed"
              value={aggregated.mockupsCompleted || 0}
              icon={Paintbrush}
              iconColor="text-purple-500"
              subtitle="Finished mockups"
            />
            <KPICard
              title="Sent to Client"
              value={aggregated.mockupsSentToClient || 0}
              icon={Send}
              iconColor="text-blue-500"
              subtitle="Awaiting approval"
            />
          </>
        );
      
      case 'operations':
        return (
          <>
            <KPICard
              title="Production Done"
              value={aggregated.productionTasksCompleted || 0}
              icon={CheckCircle}
              iconColor="text-green-500"
              subtitle="Tasks completed"
            />
            <KPICard
              title="Deliveries Made"
              value={aggregated.deliveriesMade || 0}
              icon={Truck}
              iconColor="text-blue-500"
              subtitle="Items delivered"
            />
          </>
        );
      
      case 'client_service':
        return (
          <>
            <KPICard
              title="New Calls"
              value={aggregated.newCallsHandled || 0}
              icon={Phone}
              iconColor="text-green-500"
              subtitle="Handled"
            />
            <KPICard
              title="Follow-ups"
              value={aggregated.followUpsMade || 0}
              icon={MessageSquare}
              iconColor="text-blue-500"
              subtitle="Client follow-ups"
            />
          </>
        );
      
      default:
        return (
          <>
            <KPICard
              title="Tasks Completed"
              value={aggregated.tasksCompleted || 0}
              icon={CheckCircle}
              iconColor="text-green-500"
              subtitle="All roles"
            />
            <KPICard
              title="Status Changes"
              value={aggregated.statusChanges || 0}
              icon={TrendingUp}
              iconColor="text-blue-500"
              subtitle="Activity level"
            />
          </>
        );
    }
  };

  const getPrimaryMetric = (user: UserKPIData) => {
    switch (role) {
      case 'estimation':
        return { value: user.kpis.quotationsSent, label: 'quotations' };
      case 'designer':
        return { value: user.kpis.mockupsCompleted, label: 'mockups' };
      case 'operations':
        return { value: user.kpis.productionTasksCompleted, label: 'tasks' };
      case 'client_service':
        return { value: user.kpis.newCallsHandled, label: 'calls' };
      default:
        return { value: user.kpis.tasksCompleted, label: 'tasks' };
    }
  };

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg bg-gradient-to-r ${config.color} text-white`}>
        <h3 className="text-xl font-bold">{config.title}</h3>
        <p className="text-white/80 text-sm">{config.description}</p>
        <p className="text-white/60 text-xs mt-1">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {renderKPICards()}
      </div>

      {sortedUsers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              Top Performers
            </CardTitle>
            <CardDescription>Ranked by primary KPI for this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedUsers.slice(0, 5).map((user, index) => {
                const metric = getPrimaryMetric(user);
                return (
                  <div 
                    key={user.userId} 
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback>
                        {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.userName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {metric.value} {metric.label}
                        </span>
                        {user.streak > 0 && (
                          <Badge variant="outline" className="text-xs">
                            🔥 {user.streak} day streak
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {user.badges.filter(b => b.earnedAt).slice(0, 3).map(badge => (
                        <span key={badge.id} className="text-lg" title={badge.name}>
                          {badge.icon}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RoleKPISection;

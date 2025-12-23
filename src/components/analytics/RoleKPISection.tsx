import { useState, useEffect } from "react";
import { UserKPIData, TimePeriod } from "@/hooks/useKPIAnalytics";
import { KPICard } from "./KPICard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  Send, 
  CheckCircle, 
  Clock, 
  Paintbrush, 
  Truck, 
  Phone, 
  MessageSquare,
  TrendingUp,
  Sparkles,
  Loader2
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
  const [aiInsights, setAiInsights] = useState<string>("");
  const [loadingInsights, setLoadingInsights] = useState(false);
  
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

  // Fetch AI insights when users change
  useEffect(() => {
    if (users.length > 0) {
      fetchAIInsights();
    }
  }, [users, period]);

  const fetchAIInsights = async () => {
    setLoadingInsights(true);
    try {
      // Prepare time-based data for AI analysis
      const timeData = users.map(user => ({
        name: user.userName,
        role: user.userRole,
        avgQuotationTime: user.kpis.avgQuotationTimeHours || 0,
        avgMockupTime: user.kpis.avgMockupTimeHours || 0,
        avgProductionTime: user.kpis.avgProductionTimeHours || 0,
        quotationsSent: user.kpis.quotationsSent || 0,
        rfqsReceived: user.kpis.rfqsReceived || 0,
        mockupsCompleted: user.kpis.mockupsCompleted || 0,
        tasksCompleted: user.kpis.tasksCompleted || 0,
      }));

      const { data, error } = await supabase.functions.invoke('ai-kpi-insights', {
        body: { 
          kpiData: timeData, 
          periodLabel: period,
          roleType: role 
        }
      });

      if (error) throw error;
      setAiInsights(data?.insights || "");
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      setAiInsights("");
    } finally {
      setLoadingInsights(false);
    }
  };

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

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg bg-gradient-to-r ${config.color} text-white`}>
        <h3 className="text-xl font-bold">{config.title}</h3>
        <p className="text-white/80 text-sm">{config.description}</p>
        <p className="text-white/60 text-xs mt-1">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {renderKPICards()}
      </div>

      {/* AI-Powered Time Insights */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Time & Speed Insights
          </CardTitle>
          <CardDescription>AI analysis of how fast your team works</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInsights ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking speed and times...</span>
            </div>
          ) : aiInsights ? (
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
              {aiInsights}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No insights yet. Add more data to see how fast your team works.</p>
          )}
        </CardContent>
      </Card>

      {/* Team Member Summary */}
      {users.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Team Speed
            </CardTitle>
            <CardDescription>How fast each person finishes their work</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.map((user) => {
                const avgTime = role === 'estimation' 
                  ? user.kpis.avgQuotationTimeHours 
                  : role === 'designer' 
                    ? user.kpis.avgMockupTimeHours 
                    : user.kpis.avgProductionTimeHours || 0;
                
                return (
                  <div 
                    key={user.userId} 
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback>
                        {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.userName}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={avgTime <= 4 ? "default" : avgTime <= 8 ? "secondary" : "destructive"} className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {avgTime > 0 ? `${avgTime}h avg` : 'No data yet'}
                        </Badge>
                        {role === 'estimation' && (
                          <span className="text-xs text-muted-foreground">
                            {user.kpis.quotationsSent} quotations
                          </span>
                        )}
                        {role === 'designer' && (
                          <span className="text-xs text-muted-foreground">
                            {user.kpis.mockupsCompleted} mockups
                          </span>
                        )}
                        {role === 'operations' && (
                          <span className="text-xs text-muted-foreground">
                            {user.kpis.productionTasksCompleted} tasks
                          </span>
                        )}
                        {role === 'client_service' && (
                          <span className="text-xs text-muted-foreground">
                            {user.kpis.newCallsHandled} calls
                          </span>
                        )}
                      </div>
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

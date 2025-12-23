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
  Loader2,
  Timer
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

// Helper to format hours to hours and mins
const formatTime = (hours: number) => {
  if (hours <= 0) return 'No data';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

  // Calculate team average times
  const avgQuotationTime = users.length > 0 
    ? users.reduce((sum, u) => sum + (u.kpis.avgQuotationTimeHours || 0), 0) / users.filter(u => u.kpis.avgQuotationTimeHours > 0).length || 0
    : 0;

  // Fetch AI insights when users change
  useEffect(() => {
    if (users.length > 0) {
      fetchAIInsights();
    }
  }, [users, period]);

  const fetchAIInsights = async () => {
    setLoadingInsights(true);
    try {
      // Prepare detailed time data for AI analysis
      const timeData = users.map(user => ({
        name: user.userName,
        role: user.userRole,
        avgQuotationTimeHours: user.kpis.avgQuotationTimeHours || 0,
        avgQuotationTimeFormatted: formatTime(user.kpis.avgQuotationTimeHours || 0),
        avgMockupTimeHours: user.kpis.avgMockupTimeHours || 0,
        avgMockupTimeFormatted: formatTime(user.kpis.avgMockupTimeHours || 0),
        avgProductionTimeHours: user.kpis.avgProductionTimeHours || 0,
        avgProductionTimeFormatted: formatTime(user.kpis.avgProductionTimeHours || 0),
        avgCompletionTimeHours: user.kpis.avgCompletionTimeHours || 0,
        avgCompletionTimeFormatted: formatTime(user.kpis.avgCompletionTimeHours || 0),
        quotationsSent: user.kpis.quotationsSent || 0,
        rfqsReceived: user.kpis.rfqsReceived || 0,
        mockupsCompleted: user.kpis.mockupsCompleted || 0,
        tasksCompleted: user.kpis.tasksCompleted || 0,
        productionTasksCompleted: user.kpis.productionTasksCompleted || 0,
        deliveriesMade: user.kpis.deliveriesMade || 0,
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
              title="Avg Time"
              value={formatTime(avgQuotationTime)}
              icon={Timer}
              iconColor="text-blue-500"
              subtitle="Per task"
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

      {/* AI-Powered Detailed Analysis */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Analysis
          </CardTitle>
          <CardDescription>Detailed look at everyone's work speed and output</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInsights ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analyzing team data...</span>
            </div>
          ) : aiInsights ? (
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
              {aiInsights}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No insights yet. Complete more tasks to see analysis.</p>
          )}
        </CardContent>
      </Card>

      {/* Individual Team Member Time Stats */}
      {users.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="h-5 w-5 text-orange-500" />
              Avg Time Per {role === 'estimation' ? 'Quotation' : role === 'designer' ? 'Mockup' : 'Task'}
            </CardTitle>
            <CardDescription>How long each person takes to finish their work</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.map((user) => {
                const avgTime = role === 'estimation' 
                  ? user.kpis.avgQuotationTimeHours 
                  : role === 'designer' 
                    ? user.kpis.avgMockupTimeHours 
                    : role === 'operations'
                      ? user.kpis.avgProductionTimeHours
                      : user.kpis.avgCompletionTimeHours || 0;

                const count = role === 'estimation' 
                  ? user.kpis.quotationsSent
                  : role === 'designer' 
                    ? user.kpis.mockupsCompleted
                    : role === 'operations'
                      ? user.kpis.productionTasksCompleted
                      : user.kpis.tasksCompleted;
                
                return (
                  <div 
                    key={user.userId} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback>
                        {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {count} {role === 'estimation' ? 'quotations' : role === 'designer' ? 'mockups' : 'tasks'} completed
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant={avgTime <= 2 ? "default" : avgTime <= 4 ? "secondary" : avgTime <= 8 ? "outline" : "destructive"} 
                        className="text-sm font-mono"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {formatTime(avgTime)}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">avg time</p>
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
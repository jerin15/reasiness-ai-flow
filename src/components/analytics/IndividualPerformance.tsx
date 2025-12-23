import { useState, useEffect } from "react";
import { UserKPIData, TimePeriod, useKPIAnalytics } from "@/hooks/useKPIAnalytics";
import { KPICard } from "./KPICard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle, 
  Clock, 
  FileText, 
  Send, 
  Paintbrush, 
  Truck, 
  Phone,
  TrendingUp,
  Target,
  Flame,
  Star,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface IndividualPerformanceProps {
  userId: string;
  onClose?: () => void;
}

const periodLabels: Record<TimePeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

export const IndividualPerformance = ({ userId, onClose }: IndividualPerformanceProps) => {
  const { fetchUserKPIs, loading, getDateRange } = useKPIAnalytics();
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [userData, setUserData] = useState<UserKPIData | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, period]);

  const loadData = async () => {
    const data = await fetchUserKPIs(userId, period);
    setUserData(data);
  };

  if (loading || !userData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const { kpis, badges } = userData;
  const earnedBadges = badges.filter(b => b.earnedAt || (b.progress && b.target && b.progress >= b.target));
  const dateRange = getDateRange(period);

  // Calculate efficiency metrics
  const totalTasks = kpis.tasksCompleted + kpis.tasksCreated;
  const efficiencyRate = totalTasks > 0 ? Math.round((kpis.tasksCompleted / totalTasks) * 100) : 0;

  // Get role-specific primary KPIs
  const getRoleKPIs = () => {
    switch (userData.userRole) {
      case 'estimation':
        return [
          { label: 'RFQs Received', value: kpis.rfqsReceived, icon: FileText, color: 'text-blue-500' },
          { label: 'Quotations Sent', value: kpis.quotationsSent, icon: Send, color: 'text-green-500' },
          { label: 'Approved', value: kpis.quotationsApproved, icon: CheckCircle, color: 'text-emerald-500' },
          { label: 'Supplier Quotes', value: kpis.supplierQuotesCollected, icon: FileText, color: 'text-purple-500' },
          { label: 'Avg Time', value: `${kpis.avgQuotationTimeHours}h`, icon: Clock, color: 'text-orange-500' },
        ];
      case 'designer':
        return [
          { label: 'Mockups Done', value: kpis.mockupsCompleted, icon: Paintbrush, color: 'text-purple-500' },
          { label: 'Sent to Client', value: kpis.mockupsSentToClient, icon: Send, color: 'text-blue-500' },
          { label: 'Approved', value: kpis.mockupsApproved, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Revisions', value: kpis.mockupsRevised, icon: TrendingUp, color: 'text-orange-500' },
          { label: 'Avg Time', value: `${kpis.avgMockupTimeHours}h`, icon: Clock, color: 'text-yellow-500' },
        ];
      case 'operations':
        return [
          { label: 'Production Done', value: kpis.productionTasksCompleted, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Deliveries', value: kpis.deliveriesMade, icon: Truck, color: 'text-blue-500' },
          { label: 'Avg Time', value: `${kpis.avgProductionTimeHours}h`, icon: Clock, color: 'text-orange-500' },
          { label: 'Status Changes', value: kpis.statusChanges, icon: TrendingUp, color: 'text-purple-500' },
        ];
      case 'client_service':
        return [
          { label: 'New Calls', value: kpis.newCallsHandled, icon: Phone, color: 'text-green-500' },
          { label: 'Follow-ups', value: kpis.followUpsMade, icon: TrendingUp, color: 'text-blue-500' },
          { label: 'Quotations Req.', value: kpis.quotationsRequested, icon: FileText, color: 'text-purple-500' },
          { label: 'Completed', value: kpis.tasksCompleted, icon: CheckCircle, color: 'text-emerald-500' },
        ];
      default:
        return [
          { label: 'Tasks Completed', value: kpis.tasksCompleted, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Tasks Created', value: kpis.tasksCreated, icon: FileText, color: 'text-blue-500' },
          { label: 'Status Changes', value: kpis.statusChanges, icon: TrendingUp, color: 'text-purple-500' },
          { label: 'Avg Time', value: `${kpis.avgCompletionTimeHours}h`, icon: Clock, color: 'text-orange-500' },
        ];
    }
  };

  const roleKPIs = getRoleKPIs();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary">
            <AvatarImage src={userData.avatarUrl} />
            <AvatarFallback className="text-xl">
              {userData.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl font-bold">{userData.userName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="capitalize">
                {userData.userRole.replace('_', ' ')}
              </Badge>
              {userData.streak > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-500" />
                  {userData.streak} day streak
                </Badge>
              )}
              <Badge variant="outline" className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-500" />
                {earnedBadges.length} badges
              </Badge>
            </div>
          </div>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
          <SelectTrigger className="w-[140px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Period info */}
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        {format(dateRange.from, 'MMM dd, yyyy')} - {format(dateRange.to, 'MMM dd, yyyy')}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Efficiency</p>
                <p className="text-2xl font-bold">{efficiencyRate}%</p>
              </div>
              <Target className="h-8 w-8 text-primary/60" />
            </div>
            <Progress value={efficiencyRate} className="mt-2 h-1" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{kpis.tasksCompleted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Activity</p>
                <p className="text-2xl font-bold text-blue-600">{kpis.statusChanges}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold text-orange-600">{kpis.avgCompletionTimeHours}h</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role KPIs */}
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">
            {userData.userRole.replace('_', ' ')} Performance
          </CardTitle>
          <CardDescription>
            Key performance indicators for {periodLabels[period].toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {roleKPIs.map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <div 
                  key={i}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${kpi.color}`} />
                    <span className="text-sm text-muted-foreground">{kpi.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Task Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tasks Created</span>
              <span className="font-semibold">{kpis.tasksCreated}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tasks Completed</span>
              <span className="font-semibold text-green-600">{kpis.tasksCompleted}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status Changes</span>
              <span className="font-semibold">{kpis.statusChanges}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Avg Completion Time</span>
              <span className="font-semibold">{kpis.avgCompletionTimeHours} hours</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${(userData.efficiencyScore / 100) * 352} 352`}
                    className="text-primary"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">{userData.efficiencyScore}</span>
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Efficiency Score
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IndividualPerformance;

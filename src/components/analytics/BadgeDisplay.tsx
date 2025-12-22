import { Badge as BadgeType } from "@/hooks/useKPIAnalytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface BadgeDisplayProps {
  badges: BadgeType[];
  showProgress?: boolean;
  compact?: boolean;
}

export const BadgeDisplay = ({ badges, showProgress = true, compact = false }: BadgeDisplayProps) => {
  const earnedBadges = badges.filter(b => b.earnedAt || (b.progress && b.target && b.progress >= b.target));
  const inProgressBadges = badges.filter(b => !b.earnedAt && b.progress && b.target && b.progress < b.target);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          {earnedBadges.map(badge => (
            <Tooltip key={badge.id}>
              <TooltipTrigger>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xl shadow-lg cursor-default">
                  {badge.icon}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{badge.name}</p>
                <p className="text-xs text-muted-foreground">{badge.description}</p>
                {badge.earnedAt && (
                  <p className="text-xs mt-1">Earned: {format(new Date(badge.earnedAt), 'MMM dd, yyyy')}</p>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
        {earnedBadges.length === 0 && (
          <span className="text-sm text-muted-foreground">No badges earned yet</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {earnedBadges.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              🏆 Earned Badges
              <span className="text-sm font-normal text-muted-foreground">
                ({earnedBadges.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {earnedBadges.map(badge => (
                <div
                  key={badge.id}
                  className="flex flex-col items-center p-3 rounded-lg bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border border-yellow-200 dark:border-yellow-800"
                >
                  <div className="text-3xl mb-2">{badge.icon}</div>
                  <p className="font-semibold text-sm text-center">{badge.name}</p>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    {badge.description}
                  </p>
                  {badge.earnedAt && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                      {format(new Date(badge.earnedAt), 'MMM dd')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showProgress && inProgressBadges.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              🎯 In Progress
              <span className="text-sm font-normal text-muted-foreground">
                ({inProgressBadges.length})
              </span>
            </CardTitle>
            <CardDescription>Keep going! You're close to earning these badges.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {inProgressBadges.slice(0, 6).map(badge => {
                const progressPercent = badge.target ? Math.min((badge.progress || 0) / badge.target * 100, 100) : 0;
                return (
                  <div key={badge.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl opacity-50">{badge.icon}</span>
                        <div>
                          <p className="font-medium text-sm">{badge.name}</p>
                          <p className="text-xs text-muted-foreground">{badge.description}</p>
                        </div>
                      </div>
                      <span className="text-sm font-mono">
                        {badge.progress}/{badge.target}
                      </span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
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

export default BadgeDisplay;

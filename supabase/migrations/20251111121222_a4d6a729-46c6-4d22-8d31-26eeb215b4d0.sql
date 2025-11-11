-- Phase 1-5: Complete Team Efficiency Automation System

-- Add last_activity_at to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone DEFAULT now();

-- Update existing tasks to set last_activity_at
UPDATE public.tasks 
SET last_activity_at = COALESCE(updated_at, created_at)
WHERE last_activity_at IS NULL;

-- Task Activity Log: Track all task interactions
CREATE TABLE IF NOT EXISTS public.task_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'viewed', 'edited', 'status_changed', 'commented', 'assigned'
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_task_activity_task_id ON public.task_activity_log(task_id);
CREATE INDEX idx_task_activity_user_id ON public.task_activity_log(user_id);
CREATE INDEX idx_task_activity_created_at ON public.task_activity_log(created_at DESC);

ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activity logs for their tasks"
ON public.task_activity_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = task_activity_log.task_id
    AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create activity logs"
ON public.task_activity_log FOR INSERT
WITH CHECK (user_id = auth.uid());

-- User Daily Reviews: Track daily check-ins
CREATE TABLE IF NOT EXISTS public.user_daily_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_date date NOT NULL,
  completed boolean DEFAULT false,
  tasks_reviewed integer DEFAULT 0,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, review_date)
);

CREATE INDEX idx_user_daily_reviews_user_date ON public.user_daily_reviews(user_id, review_date DESC);

ALTER TABLE public.user_daily_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own daily reviews"
ON public.user_daily_reviews FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all daily reviews"
ON public.user_daily_reviews FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Automation Rules: Configurable auto-escalation rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL UNIQUE,
  source_status task_status NOT NULL,
  threshold_hours integer NOT NULL,
  target_status task_status,
  notify_roles app_role[],
  enabled boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view automation rules"
ON public.automation_rules FOR SELECT
USING (true);

CREATE POLICY "Admins can manage automation rules"
ON public.automation_rules FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default automation rules
INSERT INTO public.automation_rules (rule_name, source_status, threshold_hours, target_status, notify_roles, enabled)
VALUES 
  ('client_follow_up', 'with_client', 168, 'with_client', ARRAY['estimation'::app_role, 'admin'::app_role], true),
  ('supplier_timeout', 'supplier_quotes', 48, 'todo', ARRAY['admin'::app_role], true),
  ('admin_escalate', 'admin_approval', 24, 'admin_approval', ARRAY['admin'::app_role], true),
  ('stale_todo', 'todo', 72, 'todo', ARRAY['admin'::app_role], true),
  ('production_delay', 'production', 120, 'production', ARRAY['operations'::app_role, 'admin'::app_role], true)
ON CONFLICT (rule_name) DO NOTHING;

-- User Activity Streaks: Gamification tracking
CREATE TABLE IF NOT EXISTS public.user_activity_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  last_activity_date date,
  total_tasks_completed integer DEFAULT 0,
  total_quick_responses integer DEFAULT 0,
  efficiency_score integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_activity_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streaks"
ON public.user_activity_streaks FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update their own streaks"
ON public.user_activity_streaks FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can update streaks"
ON public.user_activity_streaks FOR UPDATE
USING (true)
WITH CHECK (true);

-- Task Suggestions: AI-generated suggestions
CREATE TABLE IF NOT EXISTS public.task_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  suggestion_text text NOT NULL,
  suggested_status task_status,
  confidence numeric(3,2), -- 0.00 to 1.00
  accepted boolean DEFAULT false,
  dismissed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone
);

CREATE INDEX idx_task_suggestions_task_id ON public.task_suggestions(task_id);

ALTER TABLE public.task_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suggestions for their tasks"
ON public.task_suggestions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = task_suggestions.task_id
    AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can respond to suggestions"
ON public.task_suggestions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = task_suggestions.task_id
    AND (tasks.assigned_to = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

-- User Achievements: Badges and milestones
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_type text NOT NULL, -- '5_day_streak', 'lightning_fast', 'task_master', 'team_player'
  earned_at timestamp with time zone DEFAULT now(),
  metadata jsonb,
  UNIQUE(user_id, achievement_type, earned_at)
);

CREATE INDEX idx_user_achievements_user_id ON public.user_achievements(user_id);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own achievements"
ON public.user_achievements FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Weekly Reports: Performance summaries
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  tasks_completed integer DEFAULT 0,
  tasks_pending integer DEFAULT 0,
  efficiency_score integer DEFAULT 0,
  achievements_earned text[],
  longest_stuck_task_id uuid,
  metrics jsonb,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_weekly_reports_user_week ON public.weekly_reports(user_id, week_start DESC);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports"
ON public.weekly_reports FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Notification Preferences: User settings
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  do_not_disturb_start time,
  do_not_disturb_end time,
  email_notifications boolean DEFAULT true,
  show_on_leaderboard boolean DEFAULT true,
  reminder_frequency text DEFAULT 'normal', -- 'minimal', 'normal', 'frequent'
  notification_sound text DEFAULT 'default',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
ON public.notification_preferences FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Function: Update task activity timestamp
CREATE OR REPLACE FUNCTION public.update_task_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update last_activity_at on task changes
DROP TRIGGER IF EXISTS update_task_activity_trigger ON public.tasks;
CREATE TRIGGER update_task_activity_trigger
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_task_activity();

-- Function: Calculate task age in hours
CREATE OR REPLACE FUNCTION public.get_task_age_hours(task_id uuid)
RETURNS integer AS $$
  SELECT EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 3600
  FROM public.tasks
  WHERE id = task_id;
$$ LANGUAGE sql STABLE;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_daily_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_streaks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_suggestions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_reports;
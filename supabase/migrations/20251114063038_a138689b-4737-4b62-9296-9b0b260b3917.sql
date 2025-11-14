-- Create stage time limits configuration for estimation quotation workflow
CREATE TABLE IF NOT EXISTS public.estimation_stage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_status TEXT NOT NULL UNIQUE,
  time_limit_hours INTEGER NOT NULL,
  warning_threshold_hours INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default time limits for quotation workflow stages
INSERT INTO public.estimation_stage_limits (stage_status, time_limit_hours, warning_threshold_hours)
VALUES 
  ('todo', 2, 1),  -- RFQ stage: 2 hours max, warn at 1 hour
  ('supplier_quotes', 4, 3),  -- Supplier Quotes stage: 4 hours max, warn at 3 hours
  ('client_approval', 3, 2),  -- Client Approval stage: 3 hours max, warn at 2 hours
  ('admin_approval', 2, 1);  -- Admin Approval stage: 2 hours max, warn at 1 hour

-- Create table to track forced check-ins
CREATE TABLE IF NOT EXISTS public.estimation_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  check_in_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  action_taken TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.estimation_stage_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimation_check_ins ENABLE ROW LEVEL SECURITY;

-- RLS policies for estimation_stage_limits
CREATE POLICY "Everyone can view stage limits"
  ON public.estimation_stage_limits
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage stage limits"
  ON public.estimation_stage_limits
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for estimation_check_ins
CREATE POLICY "Users can view their own check-ins"
  ON public.estimation_check_ins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create check-ins"
  ON public.estimation_check_ins
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create function to get hours idle for a task
CREATE OR REPLACE FUNCTION public.get_task_hours_idle(task_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 3600
  FROM public.tasks
  WHERE id = task_id;
$$;

-- Create function to check if estimation user has stuck quotation tasks
CREATE OR REPLACE FUNCTION public.has_stuck_quotation_tasks(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    INNER JOIN public.estimation_stage_limits l ON t.status::TEXT = l.stage_status
    WHERE t.assigned_to = user_id
      AND t.type = 'quotation'
      AND t.deleted_at IS NULL
      AND t.status IN ('todo', 'supplier_quotes', 'client_approval', 'admin_approval')
      AND EXTRACT(EPOCH FROM (NOW() - t.last_activity_at)) / 3600 >= l.time_limit_hours
  );
$$;
-- Create custom pipelines table
CREATE TABLE IF NOT EXISTS public.custom_pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_pipelines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_pipelines
CREATE POLICY "Everyone can view custom pipelines"
  ON public.custom_pipelines
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage custom pipelines"
  ON public.custom_pipelines
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default pipelines
INSERT INTO public.custom_pipelines (pipeline_name, display_name, description, color, position)
VALUES 
  ('todo', 'To Do', 'Initial task creation stage', '#6b7280', 0),
  ('admin_cost_approval', 'Admin Cost Approval', 'Waiting for admin cost approval', '#f59e0b', 1),
  ('approve_estimation', 'Approve Estimation', 'Estimation approval stage', '#8b5cf6', 2),
  ('with_client', 'With Client', 'Submitted to client for review', '#3b82f6', 3),
  ('designer_mockup', 'Designer Mockup', 'Designer working on mockup', '#ec4899', 4),
  ('designer_done', 'Designer Done', 'Designer completed the work', '#10b981', 5),
  ('production', 'Production', 'In production stage', '#f97316', 6),
  ('done', 'Done', 'Task completed', '#22c55e', 7)
ON CONFLICT (pipeline_name) DO NOTHING;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_custom_pipelines_position ON public.custom_pipelines(position);
CREATE INDEX IF NOT EXISTS idx_custom_pipelines_active ON public.custom_pipelines(is_active);
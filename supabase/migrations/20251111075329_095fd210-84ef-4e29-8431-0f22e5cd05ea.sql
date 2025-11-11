-- Create custom roles table
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  can_view_all_tasks BOOLEAN NOT NULL DEFAULT false,
  can_edit_all_tasks BOOLEAN NOT NULL DEFAULT false,
  can_delete_tasks BOOLEAN NOT NULL DEFAULT false,
  can_create_tasks BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_roles
CREATE POLICY "Everyone can view custom roles"
  ON public.custom_roles
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage custom roles"
  ON public.custom_roles
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create pipeline access table
CREATE TABLE IF NOT EXISTS public.role_pipeline_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL,
  pipeline_status TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_move_to BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role_name, pipeline_status)
);

-- Enable RLS
ALTER TABLE public.role_pipeline_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for role_pipeline_access
CREATE POLICY "Everyone can view pipeline access"
  ON public.role_pipeline_access
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage pipeline access"
  ON public.role_pipeline_access
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default pipeline configurations for existing roles
INSERT INTO public.custom_roles (role_name, display_name, description, can_view_all_tasks, can_edit_all_tasks, can_delete_tasks, can_create_tasks)
VALUES 
  ('admin', 'Administrator', 'Full system access with all permissions', true, true, true, true),
  ('technical_head', 'Technical Head', 'Can manage all tasks and view analytics', true, true, true, true),
  ('estimation', 'Estimation Team', 'Handles cost estimation and quotes', false, false, false, true),
  ('designer', 'Designer', 'Creates designs and mockups', false, false, false, true),
  ('operations', 'Operations Team', 'Manages production and operations tasks', false, false, false, true)
ON CONFLICT (role_name) DO NOTHING;

-- Default pipeline access for estimation role
INSERT INTO public.role_pipeline_access (role_name, pipeline_status, can_view, can_edit, can_move_to)
VALUES 
  ('estimation', 'todo', true, true, true),
  ('estimation', 'admin_cost_approval', true, true, true),
  ('estimation', 'approve_estimation', true, false, false),
  ('estimation', 'with_client', true, false, false)
ON CONFLICT (role_name, pipeline_status) DO NOTHING;

-- Default pipeline access for designer role
INSERT INTO public.role_pipeline_access (role_name, pipeline_status, can_view, can_edit, can_move_to)
VALUES 
  ('designer', 'designer_mockup', true, true, true),
  ('designer', 'designer_done', true, true, true),
  ('designer', 'with_client', true, false, false)
ON CONFLICT (role_name, pipeline_status) DO NOTHING;

-- Default pipeline access for operations role
INSERT INTO public.role_pipeline_access (role_name, pipeline_status, can_view, can_edit, can_move_to)
VALUES 
  ('operations', 'production', true, true, true),
  ('operations', 'done', true, false, false)
ON CONFLICT (role_name, pipeline_status) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_custom_roles_role_name ON public.custom_roles(role_name);
CREATE INDEX IF NOT EXISTS idx_role_pipeline_access_role_name ON public.role_pipeline_access(role_name);
CREATE INDEX IF NOT EXISTS idx_role_pipeline_access_pipeline_status ON public.role_pipeline_access(pipeline_status);
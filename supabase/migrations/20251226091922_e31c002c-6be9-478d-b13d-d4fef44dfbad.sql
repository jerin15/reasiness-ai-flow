-- Create table for task workflow steps (sub-tasks for operations)
CREATE TABLE public.task_workflow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  step_type TEXT NOT NULL DEFAULT 'collect',
  supplier_name TEXT,
  location_address TEXT,
  location_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT valid_step_type CHECK (step_type IN ('collect', 'deliver_to_supplier', 'deliver_to_client')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped'))
);

-- Create index for faster queries
CREATE INDEX idx_task_workflow_steps_task_id ON public.task_workflow_steps(task_id);
CREATE INDEX idx_task_workflow_steps_status ON public.task_workflow_steps(status);

-- Enable RLS
ALTER TABLE public.task_workflow_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies for task_workflow_steps
CREATE POLICY "Operations and admins can view workflow steps"
ON public.task_workflow_steps
FOR SELECT
USING (
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'technical_head'::app_role)
);

CREATE POLICY "Operations and admins can create workflow steps"
ON public.task_workflow_steps
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'technical_head'::app_role)
);

CREATE POLICY "Operations and admins can update workflow steps"
ON public.task_workflow_steps
FOR UPDATE
USING (
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'technical_head'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'technical_head'::app_role)
);

CREATE POLICY "Operations and admins can delete workflow steps"
ON public.task_workflow_steps
FOR DELETE
USING (
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'technical_head'::app_role)
);

-- Enable realtime for workflow steps
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_workflow_steps;

-- Trigger to update updated_at
CREATE TRIGGER update_task_workflow_steps_updated_at
BEFORE UPDATE ON public.task_workflow_steps
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
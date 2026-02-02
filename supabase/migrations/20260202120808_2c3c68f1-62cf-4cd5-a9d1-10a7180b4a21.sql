-- Create mockup_tasks table for JAIRAJ's pipeline
CREATE TABLE public.mockup_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  priority TEXT DEFAULT 'medium',
  design_type TEXT DEFAULT 'mockup',
  due_date DATE,
  source_app TEXT,
  external_task_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  revision_notes TEXT,
  assigned_to TEXT DEFAULT 'JAIRAJ',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mockup_tasks ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write
CREATE POLICY "Allow all access to mockup_tasks" ON public.mockup_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.mockup_tasks;

-- Create updated_at trigger
CREATE TRIGGER update_mockup_tasks_updated_at
  BEFORE UPDATE ON public.mockup_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Create operations whiteboard table
CREATE TABLE public.operations_whiteboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  assigned_to UUID REFERENCES public.profiles(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operations_whiteboard ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage whiteboard"
ON public.operations_whiteboard
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Operations users can view and update (tick off) tasks
CREATE POLICY "Operations can view whiteboard"
ON public.operations_whiteboard
FOR SELECT
USING (public.has_role(auth.uid(), 'operations'));

CREATE POLICY "Operations can update whiteboard"
ON public.operations_whiteboard
FOR UPDATE
USING (public.has_role(auth.uid(), 'operations'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.operations_whiteboard;
-- Create table for tracking pending items from suppliers
CREATE TABLE public.supplier_pending_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  items_description TEXT NOT NULL,
  quantity INTEGER,
  expected_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supplier_pending_items ENABLE ROW LEVEL SECURITY;

-- Policies for admins and operations
CREATE POLICY "Admins and operations can view supplier items"
  ON public.supplier_pending_items
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'operations'::app_role) OR
    has_role(auth.uid(), 'technical_head'::app_role)
  );

CREATE POLICY "Admins and operations can create supplier items"
  ON public.supplier_pending_items
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND (
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'operations'::app_role) OR
      has_role(auth.uid(), 'technical_head'::app_role)
    )
  );

CREATE POLICY "Admins and operations can update supplier items"
  ON public.supplier_pending_items
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'operations'::app_role) OR
    has_role(auth.uid(), 'technical_head'::app_role)
  );

CREATE POLICY "Admins and operations can delete supplier items"
  ON public.supplier_pending_items
  FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'operations'::app_role) OR
    has_role(auth.uid(), 'technical_head'::app_role)
  );

-- Create trigger for updated_at
CREATE TRIGGER update_supplier_pending_items_updated_at
  BEFORE UPDATE ON public.supplier_pending_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
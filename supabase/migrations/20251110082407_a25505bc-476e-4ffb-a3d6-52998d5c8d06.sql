-- Create task_products table to track individual products within a task
CREATE TABLE IF NOT EXISTS public.task_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC,
  unit TEXT,
  estimated_price NUMERIC,
  final_price NUMERIC,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  approval_notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.task_products ENABLE ROW LEVEL SECURITY;

-- Create policies for task_products
CREATE POLICY "Users can view products of their tasks"
  ON public.task_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND (
        tasks.created_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'technical_head'::app_role)
      )
    )
  );

CREATE POLICY "Users can create products for their tasks"
  ON public.task_products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND (
        tasks.created_by = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'estimation'::app_role)
      )
    )
  );

CREATE POLICY "Admins and task owners can update products"
  ON public.task_products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND (
        tasks.created_by = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'technical_head'::app_role)
      )
    )
  );

CREATE POLICY "Admins and task owners can delete products"
  ON public.task_products
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND (
        tasks.created_by = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

-- Create trigger to update updated_at
CREATE TRIGGER update_task_products_updated_at
  BEFORE UPDATE ON public.task_products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create index for faster queries
CREATE INDEX idx_task_products_task_id ON public.task_products(task_id);
CREATE INDEX idx_task_products_approval_status ON public.task_products(approval_status);

-- Add comment to table
COMMENT ON TABLE public.task_products IS 'Tracks individual products within a task for granular approval management';
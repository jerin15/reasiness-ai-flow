-- Create table for operations route pins
CREATE TABLE public.operations_route_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  pin_order INTEGER NOT NULL DEFAULT 0,
  route_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operations_route_pins ENABLE ROW LEVEL SECURITY;

-- Operations users can manage their own pins
CREATE POLICY "Operations users can view their own pins"
ON public.operations_route_pins
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Operations users can create their own pins"
ON public.operations_route_pins
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Operations users can update their own pins"
ON public.operations_route_pins
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Operations users can delete their own pins"
ON public.operations_route_pins
FOR DELETE
USING (auth.uid() = user_id);

-- Admins and technical heads can view all pins
CREATE POLICY "Admins can view all pins"
ON public.operations_route_pins
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'technical_head')
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.operations_route_pins;
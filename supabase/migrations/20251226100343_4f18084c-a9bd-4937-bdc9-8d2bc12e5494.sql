-- Fix admin policy to allow INSERT via WITH CHECK
DROP POLICY IF EXISTS "Admins can manage whiteboard" ON public.operations_whiteboard;
CREATE POLICY "Admins can manage whiteboard"
ON public.operations_whiteboard
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure operations update policy has WITH CHECK (safe)
DROP POLICY IF EXISTS "Operations can update whiteboard" ON public.operations_whiteboard;
CREATE POLICY "Operations can update whiteboard"
ON public.operations_whiteboard
FOR UPDATE
USING (public.has_role(auth.uid(), 'operations'))
WITH CHECK (public.has_role(auth.uid(), 'operations'));
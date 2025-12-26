-- Add column to track who last updated the task
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS last_updated_by uuid REFERENCES public.profiles(id);

-- Create trigger function to auto-set last_updated_by
CREATE OR REPLACE FUNCTION public.set_last_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_updated_by = auth.uid();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_last_updated_by ON public.tasks;
CREATE TRIGGER trigger_set_last_updated_by
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_last_updated_by();
CREATE OR REPLACE FUNCTION public.enforce_pipeline_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  designer_only CONSTANT text[] := ARRAY['mockup','with_client'];
  estimator_only CONSTANT text[] := ARRAY['supplier_quotes','client_approval','admin_approval','quotation_bill','final_invoice'];
  assignee_role text;
BEGIN
  -- Only act on real status changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Bypass when no auth context (service role / webhooks / cron)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup current assignee role (the role the task currently belongs to)
  SELECT role::text INTO assignee_role
  FROM public.user_roles
  WHERE user_id = OLD.assigned_to
  LIMIT 1;

  -- Designer task being pushed into estimator-only column without reassignment
  IF assignee_role = 'designer'
     AND NEW.status::text = ANY(estimator_only)
     AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Cannot move a designer task into the Estimator pipeline (%) without reassigning it to an estimator. Reassign first.', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Estimator task being pushed into designer-only column without reassignment
  IF assignee_role = 'estimation'
     AND NEW.status::text = ANY(designer_only)
     AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Cannot move an estimator task into the Designer pipeline (%) without reassigning it to a designer. Reassign first.', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pipeline_integrity_trg ON public.tasks;
CREATE TRIGGER enforce_pipeline_integrity_trg
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pipeline_integrity();
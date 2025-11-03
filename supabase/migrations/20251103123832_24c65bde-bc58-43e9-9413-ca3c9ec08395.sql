-- Fix the audit log trigger to handle service role updates
CREATE OR REPLACE FUNCTION public.log_task_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  user_role TEXT;
  action_type TEXT;
  current_user_id UUID;
BEGIN
  -- Get current user ID, handle null case for service role
  current_user_id := auth.uid();
  
  -- Get user's role if user is authenticated
  IF current_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO user_role
    FROM public.user_roles
    WHERE user_id = current_user_id
    LIMIT 1;
  END IF;

  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      action_type := 'status_changed';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      action_type := 'assigned';
    ELSE
      action_type := 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'deleted';
  END IF;

  -- Log the change - for DELETE, only log if it's a soft delete (deleted_at is set)
  IF TG_OP = 'DELETE' THEN
    -- Don't try to insert into audit log on hard delete
    RETURN OLD;
  ELSE
    -- Only insert audit log if we have a user ID
    IF current_user_id IS NOT NULL THEN
      INSERT INTO public.task_audit_log (task_id, action, changed_by, old_values, new_values, role)
      VALUES (
        NEW.id, 
        action_type, 
        current_user_id, 
        CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::JSONB ELSE NULL END,
        row_to_json(NEW)::JSONB,
        COALESCE(user_role, 'unknown')
      );
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;
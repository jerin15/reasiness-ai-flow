-- Fix RLS violation on task deletion by disabling triggers that create linked tasks during soft delete
-- The issue: When soft deleting (setting deleted_at), triggers try to INSERT new linked tasks
-- which violate INSERT RLS policies because they set created_by to a different user

-- Drop the problematic triggers that create linked tasks on UPDATE
-- These are causing "new row violates row-level security" errors when admins soft-delete tasks

DROP TRIGGER IF EXISTS sync_production_tasks_trigger ON public.tasks;
DROP TRIGGER IF EXISTS sync_production_to_operations_trigger ON public.tasks;
DROP TRIGGER IF EXISTS sync_production_trigger ON public.tasks;
DROP TRIGGER IF EXISTS sync_quotation_to_estimation_trigger ON public.tasks;

-- Recreate the triggers with WHEN conditions to ONLY fire on actual status changes, not on soft deletes
-- This prevents them from trying to create linked tasks when deleted_at is being set

CREATE TRIGGER sync_quotation_to_estimation_trigger
AFTER UPDATE ON public.tasks
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION sync_quotation_to_estimation();

CREATE TRIGGER sync_production_to_operations_trigger
AFTER UPDATE ON public.tasks
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION sync_production_to_operations();
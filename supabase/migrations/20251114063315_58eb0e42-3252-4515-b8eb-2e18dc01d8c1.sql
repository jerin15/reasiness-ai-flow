-- Create function to get stuck quotation tasks
CREATE OR REPLACE FUNCTION public.get_stuck_quotation_tasks()
RETURNS TABLE (
  id UUID,
  title TEXT,
  status TEXT,
  assigned_to UUID,
  hours_idle NUMERIC,
  time_limit INTEGER,
  assigned_user_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.id,
    t.title,
    t.status::TEXT,
    t.assigned_to,
    EXTRACT(EPOCH FROM (NOW() - t.last_activity_at)) / 3600 AS hours_idle,
    l.time_limit_hours AS time_limit,
    COALESCE(p.full_name, 'Unknown') AS assigned_user_name
  FROM tasks t
  INNER JOIN estimation_stage_limits l ON t.status::TEXT = l.stage_status
  LEFT JOIN profiles p ON p.id = t.assigned_to
  WHERE t.type = 'quotation'
    AND t.deleted_at IS NULL
    AND t.status IN ('todo', 'supplier_quotes', 'client_approval', 'admin_approval')
    AND EXTRACT(EPOCH FROM (NOW() - t.last_activity_at)) / 3600 >= l.time_limit_hours
  ORDER BY hours_idle DESC;
$$;

-- Create function to get least busy estimation member
CREATE OR REPLACE FUNCTION public.get_least_busy_estimation_member()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  active_task_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ur.user_id,
    p.full_name,
    COUNT(t.id) AS active_task_count
  FROM user_roles ur
  INNER JOIN profiles p ON p.id = ur.user_id
  LEFT JOIN tasks t ON t.assigned_to = ur.user_id 
    AND t.type = 'quotation'
    AND t.status IN ('todo', 'supplier_quotes', 'client_approval', 'admin_approval')
    AND t.deleted_at IS NULL
  WHERE ur.role = 'estimation'
  GROUP BY ur.user_id, p.full_name
  ORDER BY active_task_count ASC, ur.user_id
  LIMIT 1;
$$;
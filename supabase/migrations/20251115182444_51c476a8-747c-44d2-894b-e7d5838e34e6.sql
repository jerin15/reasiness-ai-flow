-- Fix RLS policies to require authentication and proper access control

-- 1. FIX PROFILES TABLE - Require authentication to view profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2. FIX URGENT_NOTIFICATIONS - Already restricted to recipients/broadcast
-- Current policy is good, no change needed

-- 3. FIX USER_PRESENCE - Require authentication
DROP POLICY IF EXISTS "Anyone can view presence" ON public.user_presence;
CREATE POLICY "Authenticated users can view presence"
  ON public.user_presence
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. FIX AUTOMATION_RULES - Already restricted, but ensure SELECT requires auth
DROP POLICY IF EXISTS "Everyone can view automation rules" ON public.automation_rules;
CREATE POLICY "Authenticated users can view automation rules"
  ON public.automation_rules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 5. FIX CUSTOM_PIPELINES - Require authentication
DROP POLICY IF EXISTS "Everyone can view custom pipelines" ON public.custom_pipelines;
CREATE POLICY "Authenticated users can view custom pipelines"
  ON public.custom_pipelines
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 6. FIX CUSTOM_ROLES - Require authentication
DROP POLICY IF EXISTS "Everyone can view custom roles" ON public.custom_roles;
CREATE POLICY "Authenticated users can view custom roles"
  ON public.custom_roles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 7. FIX ROLE_PIPELINE_ACCESS - Require authentication
DROP POLICY IF EXISTS "Everyone can view pipeline access" ON public.role_pipeline_access;
CREATE POLICY "Authenticated users can view pipeline access"
  ON public.role_pipeline_access
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 8. FIX ESTIMATION_STAGE_LIMITS - Require authentication
DROP POLICY IF EXISTS "Everyone can view stage limits" ON public.estimation_stage_limits;
CREATE POLICY "Authenticated users can view stage limits"
  ON public.estimation_stage_limits
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 9. FIX USER_ROLES - Only show own roles or if admin
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles or all if admin"
  ON public.user_roles
  FOR SELECT
  USING (
    (user_id = auth.uid()) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'technical_head'::app_role)
  );

-- 10. FIX GROUP_MEMBERS - Only show groups you're member of or if admin
DROP POLICY IF EXISTS "Anyone can view group members" ON public.group_members;
CREATE POLICY "Users can view their group memberships"
  ON public.group_members
  FOR SELECT
  USING (
    is_group_member(auth.uid(), group_id) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- 11. FIX FUNCTION SEARCH_PATH - Update security definer functions
CREATE OR REPLACE FUNCTION public.update_chat_group_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_presence_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_status_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = NOW();
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_task_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.task_history (task_id, action, old_status, new_status, changed_by)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, auth.uid());
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.task_history (task_id, action, new_status, changed_by)
    VALUES (NEW.id, 'created', NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
BEGIN
  CASE 
    WHEN NEW.email IN ('reena@reaadvertising.com', 'anand@reaadvertising.com') THEN
      user_role := 'admin';
    WHEN NEW.email = 'accounts@reaadvertising.com' THEN
      user_role := 'estimation';
    WHEN NEW.email = 'reaadvt.designs2@gmail.com' THEN
      user_role := 'designer';
    WHEN NEW.email IN ('jigeesh.rea@gmail.com', 'melvin@reaadvertising.com') THEN
      user_role := 'operations';
    WHEN NEW.email = 'dakshhmehta2002@gmail.com' THEN
      user_role := 'client_service';
    ELSE
      user_role := 'operations';
  END CASE;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;
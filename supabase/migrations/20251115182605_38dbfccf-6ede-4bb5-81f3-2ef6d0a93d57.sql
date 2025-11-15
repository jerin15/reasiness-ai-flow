-- Revert user_roles and group_members to allow authenticated users to view all
-- This is needed for the app to display team members with roles and group participants

-- FIX USER_ROLES - Allow all authenticated users to view roles (needed to display team)
DROP POLICY IF EXISTS "Users can view their own roles or all if admin" ON public.user_roles;
CREATE POLICY "Authenticated users can view all user roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- FIX GROUP_MEMBERS - Allow all authenticated users to view group memberships
DROP POLICY IF EXISTS "Users can view their group memberships" ON public.group_members;
CREATE POLICY "Authenticated users can view group members"
  ON public.group_members
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
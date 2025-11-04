-- Drop all existing problematic policies
DROP POLICY IF EXISTS "Users can view messages they sent" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages sent to them" ON public.messages;
DROP POLICY IF EXISTS "Users can view group messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

DROP POLICY IF EXISTS "Users can view members of groups they belong to" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;

DROP POLICY IF EXISTS "Users can view groups they are members of" ON public.chat_groups;
DROP POLICY IF EXISTS "Group admins can update their groups" ON public.chat_groups;
DROP POLICY IF EXISTS "Any authenticated user can create groups" ON public.chat_groups;

-- Create security definer function to check group membership
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
  )
$$;

-- Create security definer function to check if user is group admin
CREATE OR REPLACE FUNCTION public.is_group_admin(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
      AND role = 'admin'
  )
$$;

-- Simple RLS policies for group_members (no recursion)
CREATE POLICY "Anyone can view group members"
  ON public.group_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join groups"
  ON public.group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IN (
    SELECT user_id FROM public.group_members WHERE group_id = group_members.group_id AND role = 'admin'
  ));

CREATE POLICY "Users can leave groups or admins can remove"
  ON public.group_members FOR DELETE
  USING (
    auth.uid() = user_id OR 
    public.is_group_admin(auth.uid(), group_id)
  );

CREATE POLICY "Admins can update members"
  ON public.group_members FOR UPDATE
  USING (public.is_group_admin(auth.uid(), group_id));

-- Simple RLS policies for chat_groups
CREATE POLICY "Users can view groups they belong to"
  ON public.chat_groups FOR SELECT
  USING (
    created_by = auth.uid() OR
    public.is_group_member(auth.uid(), id)
  );

CREATE POLICY "Authenticated users can create groups"
  ON public.chat_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update"
  ON public.chat_groups FOR UPDATE
  USING (public.is_group_admin(auth.uid(), id));

CREATE POLICY "Group admins can delete"
  ON public.chat_groups FOR DELETE
  USING (public.is_group_admin(auth.uid(), id));

-- Simple RLS policies for messages (no recursion)
CREATE POLICY "Users can view their direct messages"
  ON public.messages FOR SELECT
  USING (
    group_id IS NULL AND (
      sender_id = auth.uid() OR 
      recipient_id = auth.uid()
    )
  );

CREATE POLICY "Users can view group messages"
  ON public.messages FOR SELECT
  USING (
    group_id IS NOT NULL AND
    public.is_group_member(auth.uid(), group_id)
  );

CREATE POLICY "Users can send direct messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    group_id IS NULL
  );

CREATE POLICY "Users can send group messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    group_id IS NOT NULL AND
    public.is_group_member(auth.uid(), group_id)
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (sender_id = auth.uid());
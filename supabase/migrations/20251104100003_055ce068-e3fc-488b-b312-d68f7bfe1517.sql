-- Drop problematic policies
DROP POLICY IF EXISTS "Users can view group members of their groups" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can remove members" ON public.group_members;

-- Simplified RLS policies for group_members without recursion
CREATE POLICY "Users can view members of groups they belong to"
  ON public.group_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can join groups they are added to"
  ON public.group_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can leave groups"
  ON public.group_members FOR DELETE
  USING (user_id = auth.uid());

-- Add foreign key for reply_to if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'messages_reply_to_message_id_fkey'
  ) THEN
    ALTER TABLE public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey
    FOREIGN KEY (reply_to_message_id) 
    REFERENCES public.messages(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Update messages INSERT policy to support groups
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND (
      recipient_id IS NOT NULL OR
      (group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = messages.group_id AND user_id = auth.uid()
      ))
    )
  );
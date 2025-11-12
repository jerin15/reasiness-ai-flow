-- Update auto_assign_role function to include Daksh's email
CREATE OR REPLACE FUNCTION public.auto_assign_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
BEGIN
  -- Assign role based on email
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
      user_role := 'operations'; -- Default role
  END CASE;

  -- Insert role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
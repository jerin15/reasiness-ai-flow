-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'estimation', 'designer', 'operations');

-- Create enum for task status
CREATE TYPE public.task_status AS ENUM ('todo', 'supplier_quotes', 'admin_approval', 'quotation_bill', 'production', 'final_invoice', 'mockup_pending', 'production_pending', 'with_client', 'approval', 'delivery', 'done');

-- Create enum for task priority
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  previous_status public.task_status,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create supplier_quotes table for estimation team
CREATE TABLE public.supplier_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  supplier_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  price_aed NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create task_history table for audit trail
CREATE TABLE public.task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  old_status public.task_status,
  new_status public.task_status,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

-- Create function to check if user has role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to auto-assign role based on email
CREATE OR REPLACE FUNCTION public.auto_assign_role()
RETURNS TRIGGER
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

-- Create trigger to auto-create profile and assign role on signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_role();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER supplier_quotes_updated_at
  BEFORE UPDATE ON public.supplier_quotes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create function to log task changes
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

CREATE TRIGGER task_change_logger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_change();

-- Create function to auto-delete completed tasks after 7 days
CREATE OR REPLACE FUNCTION public.mark_old_completed_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks
  SET deleted_at = NOW()
  WHERE status = 'done'
    AND completed_at IS NOT NULL
    AND completed_at < NOW() - INTERVAL '7 days'
    AND deleted_at IS NULL;
END;
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      created_by = auth.uid() 
      OR assigned_to = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Users can create tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      created_by = auth.uid() 
      OR assigned_to = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Admins can delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for supplier_quotes
CREATE POLICY "Users can view supplier quotes"
  ON public.supplier_quotes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = supplier_quotes.task_id
        AND (
          tasks.created_by = auth.uid()
          OR tasks.assigned_to = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

CREATE POLICY "Estimation and admins can manage supplier quotes"
  ON public.supplier_quotes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'estimation')
    OR public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for task_history
CREATE POLICY "Users can view task history"
  ON public.task_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_history.task_id
        AND (
          tasks.created_by = auth.uid()
          OR tasks.assigned_to = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

-- Enable realtime for tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_quotes;
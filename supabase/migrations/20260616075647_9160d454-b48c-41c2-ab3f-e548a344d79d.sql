
-- Freelancer billing fields on tasks (nullable, default off — zero impact on existing flows)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billable_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS billable_currency text NOT NULL DEFAULT 'AED';

-- Freelancer flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_freelancer boolean NOT NULL DEFAULT false;

-- Flag Melvin as a freelancer
UPDATE public.profiles SET is_freelancer = true WHERE email = 'melvin@reaadvertising.com';

-- Payments table
CREATE TABLE IF NOT EXISTS public.freelancer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_ids uuid[] NOT NULL DEFAULT '{}',
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'AED',
  paid_at timestamptz NOT NULL DEFAULT now(),
  method text,
  reference text,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_payments TO authenticated;
GRANT ALL ON public.freelancer_payments TO service_role;

ALTER TABLE public.freelancer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage freelancer payments"
  ON public.freelancer_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Freelancer can view own payments"
  ON public.freelancer_payments FOR SELECT TO authenticated
  USING (freelancer_id = auth.uid());

CREATE TRIGGER trg_freelancer_payments_updated_at
  BEFORE UPDATE ON public.freelancer_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_freelancer_payments_freelancer ON public.freelancer_payments(freelancer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_billable ON public.tasks(assigned_to) WHERE is_billable = true AND deleted_at IS NULL;

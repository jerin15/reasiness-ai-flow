-- Allow new workflow step type
ALTER TABLE public.task_workflow_steps
  DROP CONSTRAINT IF EXISTS valid_step_type;

ALTER TABLE public.task_workflow_steps
  ADD CONSTRAINT valid_step_type
  CHECK (
    step_type = ANY (
      ARRAY[
        'collect'::text,
        'deliver_to_supplier'::text,
        'deliver_to_client'::text,
        'supplier_to_supplier'::text
      ]
    )
  );

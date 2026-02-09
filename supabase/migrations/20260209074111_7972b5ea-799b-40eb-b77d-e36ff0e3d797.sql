
-- Add base_role column to custom_roles to map custom roles to built-in app_role enum values for RLS
ALTER TABLE public.custom_roles ADD COLUMN IF NOT EXISTS base_role text DEFAULT 'client_service';

-- Set base_role for existing built-in roles
UPDATE public.custom_roles SET base_role = 'admin' WHERE role_name = 'admin';
UPDATE public.custom_roles SET base_role = 'designer' WHERE role_name = 'designer';
UPDATE public.custom_roles SET base_role = 'estimation' WHERE role_name = 'estimation';
UPDATE public.custom_roles SET base_role = 'operations' WHERE role_name = 'operations';
UPDATE public.custom_roles SET base_role = 'technical_head' WHERE role_name = 'technical_head';
UPDATE public.custom_roles SET base_role = 'client_service' WHERE role_name = 'client_service_executive';

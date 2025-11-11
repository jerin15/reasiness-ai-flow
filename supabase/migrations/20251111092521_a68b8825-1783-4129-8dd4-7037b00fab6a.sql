-- Add device tracking columns to task_audit_log table
ALTER TABLE public.task_audit_log 
ADD COLUMN IF NOT EXISTS device_type TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS browser_name TEXT,
ADD COLUMN IF NOT EXISTS os_name TEXT;

-- Add comment to document the new columns
COMMENT ON COLUMN public.task_audit_log.device_type IS 'Type of device: mobile, tablet, or desktop';
COMMENT ON COLUMN public.task_audit_log.user_agent IS 'Full user agent string from the browser';
COMMENT ON COLUMN public.task_audit_log.ip_address IS 'IP address of the user making the change';
COMMENT ON COLUMN public.task_audit_log.browser_name IS 'Extracted browser name and version';
COMMENT ON COLUMN public.task_audit_log.os_name IS 'Extracted operating system name';

-- Create an index on device_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_task_audit_log_device_type ON public.task_audit_log(device_type);
CREATE INDEX IF NOT EXISTS idx_task_audit_log_ip_address ON public.task_audit_log(ip_address);
// Enhanced audit logging with device tracking
import { supabase } from '@/integrations/supabase/client';
import { getDeviceInfo, getClientIP } from './deviceInfo';

interface AuditLogEntry {
  task_id: string;
  action: string;
  old_values?: any;
  new_values?: any;
  role?: string;
}

export const logTaskAction = async (entry: AuditLogEntry) => {
  try {
    // Get device information
    const deviceInfo = getDeviceInfo();
    
    // Get IP address (non-blocking)
    const ip_address = await getClientIP().catch(() => null);
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No user found for audit log');
      return;
    }
    
    // Get user role if not provided
    let userRole = entry.role;
    if (!userRole) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      userRole = roleData?.role || 'unknown';
    }
    
    // Insert audit log with device info
    const { error } = await supabase
      .from('task_audit_log')
      .insert({
        task_id: entry.task_id,
        action: entry.action,
        changed_by: user.id,
        old_values: entry.old_values,
        new_values: entry.new_values,
        role: userRole,
        device_type: deviceInfo.device_type,
        user_agent: deviceInfo.user_agent,
        browser_name: deviceInfo.browser_name,
        os_name: deviceInfo.os_name,
        ip_address: ip_address,
      });
    
    if (error) {
      console.error('Error logging audit entry:', error);
    }
  } catch (error) {
    console.error('Failed to log task action:', error);
  }
};

// Helper to enrich audit log entries with device information after they're created by triggers
import { supabase } from '@/integrations/supabase/client';
import { getDeviceInfo, getClientIP } from './deviceInfo';

export const enrichLatestAuditLog = async (taskId: string) => {
  try {
    // Get device information
    const deviceInfo = getDeviceInfo();
    
    // Get IP address (non-blocking)
    const ip_address = await getClientIP().catch(() => null);
    
    // Get the most recent audit log entry for this task (created by the trigger)
    const { data: latestLog, error: fetchError } = await supabase
      .from('task_audit_log')
      .select('id, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (fetchError || !latestLog) {
      console.error('Could not find latest audit log entry:', fetchError);
      return;
    }
    
    // Update the audit log entry with device info
    const { error: updateError } = await supabase
      .from('task_audit_log')
      .update({
        device_type: deviceInfo.device_type,
        user_agent: deviceInfo.user_agent,
        browser_name: deviceInfo.browser_name,
        os_name: deviceInfo.os_name,
        ip_address: ip_address,
      })
      .eq('id', latestLog.id);
    
    if (updateError) {
      console.error('Error enriching audit log:', updateError);
    }
  } catch (error) {
    console.error('Failed to enrich audit log:', error);
  }
};

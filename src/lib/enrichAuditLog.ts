// Helper to enrich audit log entries with device information after they're created by triggers
// This function is fire-and-forget - it should never block UI operations
import { supabase } from '@/integrations/supabase/client';
import { getDeviceInfo, getClientIP } from './deviceInfo';

// Fire-and-forget version - does not block UI
export const enrichLatestAuditLog = (taskId: string) => {
  // Run asynchronously without blocking
  setTimeout(async () => {
    try {
      // Get device information (sync - fast)
      const deviceInfo = getDeviceInfo();
      
      // Fetch audit log and IP in parallel
      const [logResult, ip_address] = await Promise.all([
        supabase
          .from('task_audit_log')
          .select('id')
          .eq('task_id', taskId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        getClientIP().catch(() => null)
      ]);
      
      if (logResult.error || !logResult.data) {
        return; // Silently fail - this is non-critical
      }
      
      // Update the audit log entry with device info (fire-and-forget)
      supabase
        .from('task_audit_log')
        .update({
          device_type: deviceInfo.device_type,
          user_agent: deviceInfo.user_agent,
          browser_name: deviceInfo.browser_name,
          os_name: deviceInfo.os_name,
          ip_address: ip_address,
        })
        .eq('id', logResult.data.id)
        .then(() => {});
    } catch {
      // Silently fail - audit enrichment should never block user actions
    }
  }, 0);
};

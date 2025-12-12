import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSyncQueue, removeSyncQueueItem, clearSyncQueue } from '@/lib/offlineStorage';
import { toast } from 'sonner';

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncOfflineChanges = async () => {
    if (!navigator.onLine || isSyncing) return;
    
    setIsSyncing(true);
    console.log('🔄 Starting offline sync...');
    
    // Set a timeout to prevent infinite syncing state
    const syncTimeout = setTimeout(() => {
      console.warn('⚠️ Sync timeout - resetting sync state');
      setIsSyncing(false);
    }, 10000); // 10 second timeout
    
    try {
      const queue = await getSyncQueue();
      
      if (!queue || queue.length === 0) {
        console.log('✅ No offline changes to sync');
        return;
      }

      console.log(`📤 Syncing ${queue.length} offline changes...`);
      toast.info(`Syncing ${queue.length} offline changes...`);

      let successCount = 0;
      let failCount = 0;

      for (const item of queue) {
        try {
          switch (item.operation) {
            case 'insert':
              await (supabase as any).from(item.table).insert(item.data);
              break;
            case 'update':
              const { id, ...updateData } = item.data;
              await (supabase as any).from(item.table).update(updateData).eq('id', id);
              break;
            case 'delete':
              // Legacy hard delete - convert to soft delete for safety
              await (supabase as any).from(item.table).update({ 
                deleted_at: new Date().toISOString() 
              }).eq('id', item.data.id);
              break;
            case 'soft_delete':
              // Proper soft delete with audit trail
              await (supabase as any).from(item.table).update({ 
                deleted_at: item.data.deleted_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              }).eq('id', item.data.id);
              break;
          }
          
          if (item.id) {
            await removeSyncQueueItem(item.id);
          }
          successCount++;
        } catch (error) {
          console.error('❌ Failed to sync item:', item, error);
          failCount++;
        }
      }

      if (failCount === 0) {
        await clearSyncQueue();
        toast.success(`✅ All ${successCount} changes synced successfully!`);
      } else {
        toast.warning(`⚠️ Synced ${successCount} changes, ${failCount} failed`);
      }
      
      console.log(`✅ Sync complete: ${successCount} success, ${failCount} failed`);
    } catch (error) {
      console.error('❌ Sync failed:', error);
      // Don't show error toast on initial load - just log it
      if (isSyncing) {
        toast.error('Failed to sync offline changes');
      }
    } finally {
      clearTimeout(syncTimeout);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Connection restored');
      setIsOnline(true);
      toast.success('Connection restored! Syncing changes...');
      syncOfflineChanges();
    };

    const handleOffline = () => {
      console.log('📴 Connection lost - switching to offline mode');
      setIsOnline(false);
      toast.warning('No internet connection. Working offline...');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync on mount if online - but don't block the UI
    if (navigator.onLine) {
      // Use setTimeout to make it non-blocking
      setTimeout(() => {
        syncOfflineChanges().catch(err => {
          console.error('Initial sync failed:', err);
          setIsSyncing(false);
        });
      }, 100);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isSyncing, syncOfflineChanges };
};

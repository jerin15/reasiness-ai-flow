import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineDB extends DBSchema {
  tasks: {
    key: string;
    value: any;
  };
  syncQueue: {
    key: number;
    value: {
      id?: number;
      operation: 'insert' | 'update' | 'delete';
      table: string;
      data: any;
      timestamp: number;
    };
  };
}

let db: IDBPDatabase<OfflineDB> | null = null;

export const initOfflineDB = async () => {
  if (db) return db;
  
  try {
    db = await openDB<OfflineDB>('reahub-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
    
    return db;
  } catch (error) {
    console.error('Failed to initialize offline DB:', error);
    // If IndexedDB fails, return null to allow app to continue without offline support
    return null;
  }
};

// Store tasks locally
export const saveTasksLocally = async (tasks: any[]) => {
  try {
    const database = await initOfflineDB();
    if (!database) return; // Skip if DB initialization failed
    
    const tx = database.transaction('tasks', 'readwrite');
    await Promise.all(tasks.map(task => tx.store.put(task)));
    await tx.done;
  } catch (error) {
    console.error('Error saving tasks locally:', error);
  }
};

export const getLocalTasks = async () => {
  try {
    const database = await initOfflineDB();
    if (!database) return [];
    return await database.getAll('tasks');
  } catch (error) {
    console.error('Error getting local tasks:', error);
    return [];
  }
};

export const saveTaskLocally = async (task: any) => {
  try {
    const database = await initOfflineDB();
    if (!database) return;
    await database.put('tasks', task);
  } catch (error) {
    console.error('Error saving task locally:', error);
  }
};

export const deleteTaskLocally = async (taskId: string) => {
  try {
    const database = await initOfflineDB();
    if (!database) return;
    await database.delete('tasks', taskId);
  } catch (error) {
    console.error('Error deleting task locally:', error);
  }
};

// Sync queue operations
export const addToSyncQueue = async (operation: 'insert' | 'update' | 'delete', table: string, data: any) => {
  try {
    const database = await initOfflineDB();
    if (!database) return;
    await database.add('syncQueue', {
      operation,
      table,
      data,
      timestamp: Date.now()
    });
    console.log('📦 Added to sync queue:', { operation, table });
  } catch (error) {
    console.error('Error adding to sync queue:', error);
  }
};

export const getSyncQueue = async () => {
  try {
    const database = await initOfflineDB();
    if (!database) return [];
    return await database.getAll('syncQueue');
  } catch (error) {
    console.error('Error getting sync queue:', error);
    return [];
  }
};

export const clearSyncQueue = async () => {
  try {
    const database = await initOfflineDB();
    if (!database) return;
    const tx = database.transaction('syncQueue', 'readwrite');
    await tx.store.clear();
    await tx.done;
    console.log('✅ Sync queue cleared');
  } catch (error) {
    console.error('Error clearing sync queue:', error);
  }
};

export const removeSyncQueueItem = async (id: number) => {
  try {
    const database = await initOfflineDB();
    if (!database) return;
    await database.delete('syncQueue', id);
  } catch (error) {
    console.error('Error removing sync queue item:', error);
  }
};

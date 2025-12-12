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
      operation: 'insert' | 'update' | 'delete' | 'soft_delete';
      table: string;
      data: any;
      timestamp: number;
    };
  };
}

let db: IDBPDatabase<OfflineDB> | null = null;

export const initOfflineDB = async () => {
  if (db) return db;
  
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
};

// Store tasks locally
export const saveTasksLocally = async (tasks: any[]) => {
  const database = await initOfflineDB();
  const tx = database.transaction('tasks', 'readwrite');
  
  await Promise.all(tasks.map(task => tx.store.put(task)));
  await tx.done;
};

export const getLocalTasks = async () => {
  const database = await initOfflineDB();
  return await database.getAll('tasks');
};

export const saveTaskLocally = async (task: any) => {
  const database = await initOfflineDB();
  await database.put('tasks', task);
};

export const deleteTaskLocally = async (taskId: string) => {
  const database = await initOfflineDB();
  await database.delete('tasks', taskId);
};

// Sync queue operations
export const addToSyncQueue = async (operation: 'insert' | 'update' | 'delete' | 'soft_delete', table: string, data: any) => {
  const database = await initOfflineDB();
  await database.add('syncQueue', {
    operation,
    table,
    data,
    timestamp: Date.now()
  });
  console.log('📦 Added to sync queue:', { operation, table });
};

export const getSyncQueue = async () => {
  const database = await initOfflineDB();
  return await database.getAll('syncQueue');
};

export const clearSyncQueue = async () => {
  const database = await initOfflineDB();
  const tx = database.transaction('syncQueue', 'readwrite');
  await tx.store.clear();
  await tx.done;
  console.log('✅ Sync queue cleared');
};

export const removeSyncQueueItem = async (id: number) => {
  const database = await initOfflineDB();
  await database.delete('syncQueue', id);
};

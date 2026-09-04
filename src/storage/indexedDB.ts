/**
 * Labeling-vue3 IndexedDB 存储层（原生 API + Promise 封装）。
 * 不依赖 Dexie / localforage 等库。
 */
import {
  LABELING_VUE3_DB_NAME,
  LABELING_VUE3_DB_VERSION,
  STORE_PROJECTS,
  STORE_IMAGES,
  STORE_ANNOTATIONS,
  STORE_LABELS,
  STORE_FOLDER_HANDLES,
  type StoreName,
} from '../types/storage';

export {
  LABELING_VUE3_DB_NAME,
  LABELING_VUE3_DB_VERSION,
  STORE_PROJECTS,
  STORE_IMAGES,
  STORE_ANNOTATIONS,
  STORE_LABELS,
  STORE_FOLDER_HANDLES,
} from '../types/storage';

export type { StoreName } from '../types/storage';

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function upgradeDatabase(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
    db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
  }

  if (!db.objectStoreNames.contains(STORE_IMAGES)) {
    const images = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
    images.createIndex('byProjectId', 'projectId', { unique: false });
    images.createIndex('byProjectId_index', ['projectId', 'index'], {
      unique: false,
    });
  }

  if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
    const annotations = db.createObjectStore(STORE_ANNOTATIONS, {
      keyPath: 'id',
    });
    annotations.createIndex('byProjectId', 'projectId', { unique: false });
    annotations.createIndex('byImageId', 'imageId', { unique: false });
    annotations.createIndex('byProjectId_imageId', ['projectId', 'imageId'], {
      unique: false,
    });
  }

  if (!db.objectStoreNames.contains(STORE_LABELS)) {
    const labels = db.createObjectStore(STORE_LABELS, { keyPath: 'id' });
    labels.createIndex('byProjectId', 'projectId', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_FOLDER_HANDLES)) {
    db.createObjectStore(STORE_FOLDER_HANDLES, { keyPath: 'projectId' });
  }
}

/** 打开（或创建）LabelingVue3DB */
export function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('IndexedDB is not available in this environment')
    );
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(LABELING_VUE3_DB_NAME, LABELING_VUE3_DB_VERSION);

      request.onupgradeneeded = () => {
        upgradeDatabase(request.result);
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Failed to open LabelingVue3DB'));
      };

      request.onblocked = () => {
        console.warn('[LabelingVue3DB] open blocked by another connection');
      };
    });
  }

  return dbPromise;
}

/** 关闭缓存的数据库连接（测试 / 重置用） */
export async function closeDatabase(): Promise<void> {
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    db.close();
  } finally {
    dbPromise = null;
  }
}

/** 删除整个数据库（危险：仅测试或卸载用） */
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  if (typeof indexedDB === 'undefined') return;
  const request = indexedDB.deleteDatabase(LABELING_VUE3_DB_NAME);
  await requestToPromise(request);
}

/** 写入或覆盖一条记录 */
export async function put<T extends object>(
  storeName: StoreName,
  value: T
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await transactionDone(tx);
}

/** 批量 put（同一事务） */
export async function putMany<T extends object>(
  storeName: StoreName,
  values: T[]
): Promise<void> {
  if (values.length === 0) return;
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const value of values) {
    store.put(value);
  }
  await transactionDone(tx);
}

/** 按主键读取 */
export async function get<T>(
  storeName: StoreName,
  key: IDBValidKey
): Promise<T | undefined> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const result = await requestToPromise(tx.objectStore(storeName).get(key));
  await transactionDone(tx);
  return result as T | undefined;
}

/** 按主键删除 */
export async function deleteRecord(
  storeName: StoreName,
  key: IDBValidKey
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await transactionDone(tx);
}

/** 批量删除主键 */
export async function deleteMany(
  storeName: StoreName,
  keys: IDBValidKey[]
): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const key of keys) {
    store.delete(key);
  }
  await transactionDone(tx);
}

/** 清空某个 objectStore */
export async function clear(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  await transactionDone(tx);
}

/**
 * 读取全部记录；若提供 indexName，则按索引查询。
 * query 可为单值或 IDBKeyRange。
 */
export async function getAll<T>(
  storeName: StoreName,
  indexName?: string,
  query?: IDBValidKey | IDBKeyRange
): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const source = indexName ? store.index(indexName) : store;
  const result = await requestToPromise(
    query === undefined ? source.getAll() : source.getAll(query)
  );
  await transactionDone(tx);
  return result as T[];
}

/** 统计条数 */
export async function count(
  storeName: StoreName,
  indexName?: string,
  query?: IDBValidKey | IDBKeyRange
): Promise<number> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const source = indexName ? store.index(indexName) : store;
  const result = await requestToPromise(
    query === undefined ? source.count() : source.count(query)
  );
  await transactionDone(tx);
  return result;
}

/** delete 别名：避免与关键字冲突，同时满足 API 文档中的 delete() */
export const deleteKey = deleteRecord;

/** 聚合 API（含 delete 方法名） */
export const idb = {
  openDatabase,
  put,
  putMany,
  get,
  delete: deleteRecord,
  clear,
  getAll,
  count,
  closeDatabase,
  deleteDatabase,
} as const;

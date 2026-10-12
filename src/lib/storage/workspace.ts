const DATABASE_NAME = "jobagent-workspace";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const SNAPSHOT_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    const timeout = window.setTimeout(() => reject(new Error("打开本地数据库超时")), 3000);

    const finish = <T,>(callback: (value: T) => void, value: T) => {
      window.clearTimeout(timeout);
      callback(value);
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => finish(resolve, request.result);
    request.onerror = () => finish(reject, request.error ?? new Error("无法打开本地数据库"));
    request.onblocked = () => finish(reject, new Error("本地数据库正在被其他页面占用"));
  });
}

export async function readWorkspaceSnapshot(): Promise<unknown | null> {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("无法读取本地数据"));
    });
  } finally {
    database.close();
  }
}

export async function writeWorkspaceSnapshot(snapshot: unknown): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("无法保存本地数据"));
    });
  } finally {
    database.close();
  }
}

export async function clearWorkspaceSnapshot(): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("无法清除本地数据"));
    });
  } finally {
    database.close();
  }
}

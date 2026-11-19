"use client";

type StoredAttachment = { id: string; userId: string; dataUrl: string; savedAt: string };

const databaseName = "nutrition-water-files";
const storeName = "attachments";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local file storage"));
  });
}

export async function saveLocalAttachment(id: string, userId: string, dataUrl: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put({ id, userId, dataUrl, savedAt: new Date().toISOString() } satisfies StoredAttachment);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save attachment"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Attachment save was cancelled"));
    });
  } finally { database.close(); }
}

export async function readLocalAttachment(id: string, userId: string) {
  const database = await openDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(id);
      request.onsuccess = () => {
        const value = request.result as StoredAttachment | undefined;
        resolve(value?.userId === userId ? value.dataUrl : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read attachment"));
    });
  } finally { database.close(); }
}

export async function deleteLocalAttachment(id: string, userId: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const objectStore = transaction.objectStore(storeName);
      const request = objectStore.get(id);
      request.onsuccess = () => {
        const value = request.result as StoredAttachment | undefined;
        if (value?.userId === userId) objectStore.delete(id);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete attachment"));
    });
  } finally { database.close(); }
}

export async function exportLocalAttachments(userId: string) {
  const database = await openDatabase();
  try {
    return await new Promise<StoredAttachment[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result as StoredAttachment[]).filter((item) => item.userId === userId));
      request.onerror = () => reject(request.error ?? new Error("Could not export attachments"));
    });
  } finally { database.close(); }
}

export async function deleteAllLocalAttachments(userId: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const objectStore = transaction.objectStore(storeName);
      const request = objectStore.getAll();
      request.onsuccess = () => {
        for (const item of request.result as StoredAttachment[]) if (item.userId === userId) objectStore.delete(item.id);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear local attachments"));
    });
  } finally { database.close(); }
}

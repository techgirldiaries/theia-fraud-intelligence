/**
 * IndexedDB wrapper for persistent file storage in Theia.
 * Provides a simple async API for storing, retrieving, and managing datasets.
 */

export interface StoredDataset {
  id: string;
  fileName: string;
  content: Blob;
  uploadedAt: Date;
  size: number;
  mimeType?: string;
}

export interface StorageInfo {
  used: number;
  quota: number;
  percentUsed: number;
}

const DB_NAME = "fraud-intelligence";
const STORE_NAME = "datasets";
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

/**
 * Opens or retrieves the IndexedDB database.
 * Initializes the database schema on first use.
 */
async function getDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("IndexedDB opened successfully");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create datasets store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-date", "uploadedAt", { unique: false });
        store.createIndex("by-name", "fileName", { unique: false });
        console.log("IndexedDB schema initialized");
      }
    };
  });
}

/**
 * Stores a dataset (file) in IndexedDB.
 * The full blob content is persisted locally.
 *
 * @param dataset - The dataset object with file content
 * @throws Error if storage fails
 */
export async function storeDataset(dataset: StoredDataset): Promise<void> {
  try {
    const database = await getDatabase();
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Convert Date to ISO string for storage (IDBDatabase doesn't store Date objects reliably)
    const request = store.add({
      ...dataset,
      uploadedAt: dataset.uploadedAt.toISOString(),
    });

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        console.error("Failed to add dataset:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log(
          `Dataset stored: ${dataset.fileName} (${dataset.size} bytes)`,
        );
        resolve();
      };
    });
  } catch (error) {
    console.error("Error storing dataset:", error);
    throw error;
  }
}

/**
 * Retrieves a specific dataset by ID.
 *
 * @param id - The dataset ID
 * @returns The dataset object or null if not found
 */
export async function getDataset(id: string): Promise<StoredDataset | null> {
  try {
    const database = await getDatabase();
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(id);

      request.onerror = () => {
        console.error("Failed to retrieve dataset:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Convert ISO string back to Date
          result.uploadedAt = new Date(result.uploadedAt);
          console.log(`Dataset retrieved: ${result.fileName}`);
        }
        resolve(result || null);
      };
    });
  } catch (error) {
    console.error("Error retrieving dataset:", error);
    return null;
  }
}

/**
 * Retrieves all stored datasets, sorted by upload date (newest first).
 *
 * @returns Array of all datasets
 */
export async function getAllDatasets(): Promise<StoredDataset[]> {
  try {
    const database = await getDatabase();
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("by-date");

    return new Promise((resolve, reject) => {
      // Use openCursor with reverse order to get newest first
      const request = index.openCursor(null, "prev");
      const results: StoredDataset[] = [];

      request.onerror = () => {
        console.error("Failed to retrieve datasets:", request.error);
        reject(request.error);
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          const dataset = cursor.value;
          dataset.uploadedAt = new Date(dataset.uploadedAt);
          results.push(dataset);
          cursor.continue();
        } else {
          console.log(`Retrieved ${results.length} datasets`);
          resolve(results);
        }
      };
    });
  } catch (error) {
    console.error("Error retrieving all datasets:", error);
    return [];
  }
}

/**
 * Deletes a specific dataset by ID.
 *
 * @param id - The dataset ID
 * @throws Error if deletion fails
 */
export async function deleteDataset(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);

      request.onerror = () => {
        console.error("Failed to delete dataset:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log(`Dataset deleted: ${id}`);
        resolve();
      };
    });
  } catch (error) {
    console.error("Error deleting dataset:", error);
    throw error;
  }
}

/**
 * Deletes all datasets from storage.
 * Use with caution.
 *
 * @throws Error if clearing fails
 */
export async function clearAllDatasets(): Promise<void> {
  try {
    const database = await getDatabase();
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.onerror = () => {
        console.error("Failed to clear datasets:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log("All datasets cleared from IndexedDB");
        resolve();
      };
    });
  } catch (error) {
    console.error("Error clearing datasets:", error);
    throw error;
  }
}

/**
 * Gets storage quota information.
 * Warns if usage exceeds 80% of quota.
 *
 * @returns Storage usage and quota in bytes
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  try {
    if (!navigator.storage || !navigator.storage.estimate) {
      console.warn("StorageManager API not available");
      return { used: 0, quota: 0, percentUsed: 0 };
    }

    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentUsed = quota > 0 ? (used / quota) * 100 : 0;

    if (percentUsed > 80) {
      console.warn(
        `Storage quota ${percentUsed.toFixed(1)}% used (${(used / (1024 * 1024)).toFixed(2)} MB of ${(quota / (1024 * 1024)).toFixed(2)} MB)`,
      );
    }

    return { used, quota, percentUsed };
  } catch (error) {
    console.error("Failed to get storage info:", error);
    return { used: 0, quota: 0, percentUsed: 0 };
  }
}

/**
 * Creates a blob URL from a Blob object (useful for downloads/previews).
 *
 * @param blob - The Blob to create a URL for
 * @returns A blob:// URL string
 */
export function createBlobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revokes a blob URL to free up memory.
 * Call this when you're done with a blob URL.
 *
 * @param url - The blob:// URL to revoke
 */
export function revokeBlobUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Checks if IndexedDB is available in the current browser.
 *
 * @returns true if IndexedDB is supported
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.indexedDB;
  } catch {
    return false;
  }
}

/**
 * Gets the current database instance (for debugging).
 * Returns null if not initialized.
 */
export function getDBInstance(): IDBDatabase | null {
  return db;
}

/**
 * Closes the database connection.
 * Useful for cleanup or testing.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log("IndexedDB closed");
  }
}

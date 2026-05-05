import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  storeDataset,
  getDataset,
  getAllDatasets,
  deleteDataset,
  clearAllDatasets,
  getStorageInfo,
  isIndexedDBAvailable,
  closeDatabase,
  type StoredDataset,
} from "@/lib/indexeddb-store";

describe("IndexedDB Store", () => {
  const skipIfNoIndexedDB = () => {
    if (!isIndexedDBAvailable()) {
      console.log(
        "⚠️  Skipping IndexedDB tests (not available in test environment)",
      );
    }
  };

  beforeEach(async () => {
    // Clear database before each test
    if (isIndexedDBAvailable()) {
      await clearAllDatasets();
    }
  });

  afterEach(async () => {
    // Cleanup
    if (isIndexedDBAvailable()) {
      await clearAllDatasets();
      closeDatabase();
    }
  });

  it("should detect IndexedDB availability", () => {
    skipIfNoIndexedDB();
    // In jsdom, IndexedDB is not available, but the check function works
    expect(typeof isIndexedDBAvailable()).toBe("boolean");
  });

  it("should store a dataset", async () => {
    if (!isIndexedDBAvailable()) {
      console.warn("IndexedDB not available, skipping test");
      return;
    }

    const blob = new Blob(["test data"], { type: "text/plain" });
    const dataset: StoredDataset = {
      id: "test-1",
      fileName: "test.csv",
      content: blob,
      uploadedAt: new Date(),
      size: blob.size,
      mimeType: "text/plain",
    };

    await expect(storeDataset(dataset)).resolves.not.toThrow();
  });

  it("should retrieve a stored dataset", async () => {
    if (!isIndexedDBAvailable()) return;

    const blob = new Blob(["test data"], { type: "text/plain" });
    const dataset: StoredDataset = {
      id: "test-2",
      fileName: "test.csv",
      content: blob,
      uploadedAt: new Date(),
      size: blob.size,
    };

    await storeDataset(dataset);
    const retrieved = await getDataset("test-2");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.fileName).toBe("test.csv");
    expect(retrieved?.size).toBe(blob.size);
  });

  it("should return null for non-existent dataset", async () => {
    if (!isIndexedDBAvailable()) return;

    const retrieved = await getDataset("nonexistent");
    expect(retrieved).toBeNull();
  });

  it("should retrieve all datasets", async () => {
    if (!isIndexedDBAvailable()) return;

    const blob1 = new Blob(["data1"], { type: "text/plain" });
    const blob2 = new Blob(["data2"], { type: "text/plain" });

    const dataset1: StoredDataset = {
      id: "test-3a",
      fileName: "file1.csv",
      content: blob1,
      uploadedAt: new Date(Date.now() - 1000),
      size: blob1.size,
    };

    const dataset2: StoredDataset = {
      id: "test-3b",
      fileName: "file2.csv",
      content: blob2,
      uploadedAt: new Date(),
      size: blob2.size,
    };

    await storeDataset(dataset1);
    await storeDataset(dataset2);

    const all = await getAllDatasets();
    expect(all).toHaveLength(2);
    // Should be sorted by date (newest first)
    expect(all[0].id).toBe("test-3b");
    expect(all[1].id).toBe("test-3a");
  });

  it("should delete a dataset", async () => {
    if (!isIndexedDBAvailable()) return;

    const blob = new Blob(["test data"], { type: "text/plain" });
    const dataset: StoredDataset = {
      id: "test-4",
      fileName: "test.csv",
      content: blob,
      uploadedAt: new Date(),
      size: blob.size,
    };

    await storeDataset(dataset);
    let retrieved = await getDataset("test-4");
    expect(retrieved).not.toBeNull();

    await deleteDataset("test-4");
    retrieved = await getDataset("test-4");
    expect(retrieved).toBeNull();
  });

  it("should clear all datasets", async () => {
    if (!isIndexedDBAvailable()) return;

    const blob = new Blob(["test data"], { type: "text/plain" });

    const dataset1: StoredDataset = {
      id: "test-5a",
      fileName: "file1.csv",
      content: blob,
      uploadedAt: new Date(),
      size: blob.size,
    };

    const dataset2: StoredDataset = {
      id: "test-5b",
      fileName: "file2.csv",
      content: blob,
      uploadedAt: new Date(),
      size: blob.size,
    };

    await storeDataset(dataset1);
    await storeDataset(dataset2);

    let all = await getAllDatasets();
    expect(all).toHaveLength(2);

    await clearAllDatasets();
    all = await getAllDatasets();
    expect(all).toHaveLength(0);
  });

  it("should get storage info", async () => {
    if (!isIndexedDBAvailable()) return;

    const info = await getStorageInfo();

    expect(info).toHaveProperty("used");
    expect(info).toHaveProperty("quota");
    expect(info).toHaveProperty("percentUsed");
    expect(typeof info.used).toBe("number");
    expect(typeof info.quota).toBe("number");
    expect(typeof info.percentUsed).toBe("number");
  });

  it("should handle Date serialization correctly", async () => {
    if (!isIndexedDBAvailable()) return;

    const now = new Date("2025-05-05T12:00:00Z");
    const blob = new Blob(["test"], { type: "text/plain" });

    const dataset: StoredDataset = {
      id: "test-6",
      fileName: "test.csv",
      content: blob,
      uploadedAt: now,
      size: blob.size,
    };

    await storeDataset(dataset);
    const retrieved = await getDataset("test-6");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.uploadedAt.toISOString()).toBe(now.toISOString());
  });

  it("should handle large blobs", async () => {
    if (!isIndexedDBAvailable()) return;

    // Create a 10MB blob
    const largeData = new Uint8Array(10 * 1024 * 1024);
    const largeBlob = new Blob([largeData], {
      type: "application/octet-stream",
    });

    const dataset: StoredDataset = {
      id: "test-large",
      fileName: "large.csv",
      content: largeBlob,
      uploadedAt: new Date(),
      size: largeBlob.size,
    };

    await expect(storeDataset(dataset)).resolves.not.toThrow();

    const retrieved = await getDataset("test-large");
    expect(retrieved?.size).toBe(10 * 1024 * 1024);
  });
});

/**
 * Example: How to Use IndexedDB Store in Theia Components
 * This demonstrates the integration patterns for file upload and retrieval.
 */

import {
  storeDataset,
  getDataset,
  getAllDatasets,
  deleteDataset,
  getStorageInfo,
  createBlobUrl,
  revokeBlobUrl,
  type StoredDataset,
} from "@/lib/indexeddb-store";

// ───────────────────────────────────────────────────────────────────────────
// Example 1: Upload a File from User Input
// ───────────────────────────────────────────────────────────────────────────

async function handleFileUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  try {
    // Store the file in IndexedDB
    const dataset: StoredDataset = {
      id: crypto.randomUUID(),
      fileName: file.name,
      content: file,
      uploadedAt: new Date(),
      size: file.size,
      mimeType: file.type,
    };

    await storeDataset(dataset);
    console.log(`✅ File stored: ${file.name}`);

    // Update UI signal with metadata (not the blob, just metadata)
    // This would go in your signals.ts
    // uploadedDatasets.value = [...uploadedDatasets.value, {
    //   id: dataset.id,
    //   fileName: dataset.fileName,
    //   size: dataset.size,
    //   uploadedAt: dataset.uploadedAt,
    // }];
  } catch (error) {
    console.error("❌ Failed to store file:", error);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Example 2: Retrieve and Display a File
// ───────────────────────────────────────────────────────────────────────────

async function loadDatasetForPreview(datasetId: string): Promise<void> {
  try {
    const dataset = await getDataset(datasetId);

    if (!dataset) {
      console.warn("Dataset not found");
      return;
    }

    // Create a temporary blob URL for preview/download
    const blobUrl = createBlobUrl(dataset.content);

    console.log(`📄 Dataset ready: ${dataset.fileName}`);
    console.log(`📊 Size: ${(dataset.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🔗 Blob URL: ${blobUrl}`);

    // Use the blob URL to:
    // - Display preview in iframe
    // - Create download link
    // - Send to Relevance AI agent

    // When done, clean up
    // revokeBlobUrl(blobUrl);
  } catch (error) {
    console.error("❌ Failed to load dataset:", error);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Example 3: List All Previously Uploaded Files
// ───────────────────────────────────────────────────────────────────────────

async function loadPreviousUploads(): Promise<void> {
  try {
    const datasets = await getAllDatasets();

    console.log(`📂 Found ${datasets.length} previous uploads:`);

    datasets.forEach((dataset) => {
      console.log(
        `  • ${dataset.fileName} (${(dataset.size / 1024).toFixed(2)} KB) - ${new Date(dataset.uploadedAt).toLocaleDateString()}`,
      );
    });

    // Update UI signal with metadata only
    // uploadedDatasets.value = datasets.map(d => ({
    //   id: d.id,
    //   fileName: d.fileName,
    //   size: d.size,
    //   uploadedAt: d.uploadedAt,
    // }));
  } catch (error) {
    console.error("❌ Failed to load uploads:", error);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Example 4: Delete a File
// ───────────────────────────────────────────────────────────────────────────

async function deleteDatasetFromStorage(datasetId: string): Promise<void> {
  try {
    await deleteDataset(datasetId);
    console.log(`🗑️  Dataset deleted: ${datasetId}`);

    // Update UI signal
    // uploadedDatasets.value = uploadedDatasets.value.filter(
    //   (d) => d.id !== datasetId
    // );
  } catch (error) {
    console.error("❌ Failed to delete dataset:", error);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Example 5: Check Storage Usage
// ───────────────────────────────────────────────────────────────────────────

async function checkStorageUsage(): Promise<void> {
  try {
    const info = await getStorageInfo();

    const usedMB = info.used / (1024 * 1024);
    const quotaMB = info.quota / (1024 * 1024);

    console.log(`💾 Storage Status:`);
    console.log(`   Used: ${usedMB.toFixed(2)} MB / ${quotaMB.toFixed(2)} MB`);
    console.log(`   Usage: ${info.percentUsed.toFixed(1)}%`);

    if (info.percentUsed > 80) {
      console.warn("⚠️  Storage quota is getting full!");
    }
  } catch (error) {
    console.error("❌ Failed to get storage info:", error);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Example 6: Component Integration Pattern (Preact/Signals)
// ───────────────────────────────────────────────────────────────────────────

/*
// In your component file (e.g., fraud-dataset-manager.tsx):

import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getAllDatasets } from "@/lib/indexeddb-store";

// Signal for metadata (not blobs)
export const uploadedDatasetMetadata = signal<Array<{
  id: string;
  fileName: string;
  size: number;
  uploadedAt: Date;
}>>([]);

export function DatasetManager() {
  useEffect(() => {
    // Load dataset metadata on component mount
    (async () => {
      try {
        const datasets = await getAllDatasets();
        uploadedDatasetMetadata.value = datasets.map(d => ({
          id: d.id,
          fileName: d.fileName,
          size: d.size,
          uploadedAt: d.uploadedAt,
        }));
      } catch (error) {
        console.error("Failed to load datasets:", error);
      }
    })();
  }, []);

  return (
    <div>
      <h2>Uploaded Datasets</h2>
      {uploadedDatasetMetadata.value.length === 0 ? (
        <p>No datasets uploaded</p>
      ) : (
        <ul>
          {uploadedDatasetMetadata.value.map(dataset => (
            <li key={dataset.id}>
              {dataset.fileName} ({dataset.size} bytes)
              <button onClick={() => handleDownload(dataset.id)}>
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function handleDownload(datasetId: string) {
  const dataset = await getDataset(datasetId);
  if (dataset) {
    const url = createBlobUrl(dataset.content);
    const a = document.createElement("a");
    a.href = url;
    a.download = dataset.fileName;
    a.click();
    revokeBlobUrl(url);
  }
}
*/

// ───────────────────────────────────────────────────────────────────────────
// Integration Checklist for Next Steps
// ───────────────────────────────────────────────────────────────────────────

/*
1. ✅ IndexedDB store created (indexeddb-store.ts)
2. ✅ Tests written and passing
3. ⏭️  Next: Update attachment-menu.tsx to use IndexedDB for file storage
4. ⏭️  Next: Update fraud-dataset-manager.tsx to load datasets from IndexedDB
5. ⏭️  Next: Update upload handler to store files in IndexedDB
6. ⏭️  Next: Add storage quota warning UI
7. ⏭️  Next: Test with actual CSV files (fraud detection datasets)
8. ⏭️  Next: Document migration path from localStorage metadata
*/

export {
  handleFileUpload,
  loadDatasetForPreview,
  loadPreviousUploads,
  deleteDatasetFromStorage,
  checkStorageUsage,
};

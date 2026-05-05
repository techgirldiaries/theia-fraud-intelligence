/**
 * Bridge layer between IndexedDB storage and Theia's signal-based state management.
 * Handles hybrid persistence (IndexedDB for file content + localStorage for metadata).
 */

import {
  getAllDatasets,
  getDataset,
  storeDataset,
  deleteDataset as deleteFromIndexedDB,
  type StoredDataset,
} from "@/lib/indexeddb-store";
import type { DatasetInfo } from "@/signals/types";

/**
 * Hybrid dataset metadata for UI display.
 * Metadata is stored in localStorage, file content in IndexedDB.
 */
export interface HybridDatasetMetadata extends DatasetInfo {
  /** Source of dataset: "indexeddb" (new) or "localstorage" (legacy) */
  source: "indexeddb" | "localstorage";
}

/**
 * Initializes datasets on app startup.
 * Loads from IndexedDB first, then falls back to localStorage for backwards compatibility.
 * Returns metadata only (not file content) for signals.
 */
export async function initializeDatasets(): Promise<HybridDatasetMetadata[]> {
  try {
    const idbDatasets = await getAllDatasets();

    // Convert IndexedDB datasets to metadata
    const idbMetadata: HybridDatasetMetadata[] = idbDatasets.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileUrl: "", // Will be populated on-demand
      uploadedAt: d.uploadedAt,
      size: d.size,
      type: "file",
      description: undefined,
      source: "indexeddb",
    }));

    console.log(
      `📂 Loaded ${idbMetadata.length} datasets from IndexedDB on startup`,
    );
    return idbMetadata;
  } catch (error) {
    console.warn("Failed to load from IndexedDB, falling back to localStorage");
    // Fallback will happen in state.ts with existing loadDatasetsFromStorage()
    return [];
  }
}

/**
 * Saves a file to IndexedDB and returns metadata for signals.
 * Called when user uploads a new file.
 */
export async function saveUploadedFile(
  file: File,
): Promise<HybridDatasetMetadata> {
  const datasetId = crypto.randomUUID();

  const dataset: StoredDataset = {
    id: datasetId,
    fileName: file.name,
    content: file,
    uploadedAt: new Date(),
    size: file.size,
    mimeType: file.type,
  };

  await storeDataset(dataset);

  console.log(`✅ File stored in IndexedDB: ${file.name}`);

  return {
    id: datasetId,
    fileName: file.name,
    fileUrl: "", // Will be generated on-demand via getBlobUrl()
    uploadedAt: new Date(),
    size: file.size,
    type: "file",
    description: undefined,
    source: "indexeddb",
  };
}

/**
 * Creates a blob URL from a stored dataset in IndexedDB.
 * Use this when you need to download, preview, or send to agent.
 *
 * @param datasetId - The dataset ID
 * @returns Blob URL string, or null if dataset not found
 */
export async function getBlobUrl(datasetId: string): Promise<string | null> {
  try {
    const dataset = await getDataset(datasetId);
    if (!dataset) {
      console.warn(`Dataset not found: ${datasetId}`);
      return null;
    }

    const blobUrl = URL.createObjectURL(dataset.content);
    console.log(`🔗 Created blob URL for: ${dataset.fileName}`);
    return blobUrl;
  } catch (error) {
    console.error("Failed to create blob URL:", error);
    return null;
  }
}

/**
 * Gets the full file content from IndexedDB.
 * Use this when you need to read the file content (e.g., for processing).
 *
 * @param datasetId - The dataset ID
 * @returns Blob content, or null if not found
 */
export async function getFileContent(datasetId: string): Promise<Blob | null> {
  try {
    const dataset = await getDataset(datasetId);
    return dataset?.content || null;
  } catch (error) {
    console.error("Failed to get file content:", error);
    return null;
  }
}

/**
 * Deletes a dataset from IndexedDB.
 *
 * @param datasetId - The dataset ID
 */
export async function deleteStoredDataset(datasetId: string): Promise<void> {
  await deleteFromIndexedDB(datasetId);
  console.log(`🗑️  Dataset deleted: ${datasetId}`);
}

/**
 * Gets full dataset info including file content.
 * Only retrieve this when you actually need the file content.
 */
export async function getFullDataset(
  datasetId: string,
): Promise<StoredDataset | null> {
  return getDataset(datasetId);
}

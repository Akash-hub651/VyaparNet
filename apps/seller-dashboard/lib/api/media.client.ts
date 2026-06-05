/**
 * Media API Client — apps/seller-dashboard/lib/api/media.client.ts
 *
 * Authority: seller_dashboard_architecture.md §8
 *
 * Rules:
 * - Uses typed media adapter layer so UI components are not coupled to raw responses.
 * - Uses XMLHttpRequest for upload to support progress tracking, which fetch() does not support.
 */

import { getApiBaseUrl } from "../config";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface UploadedMediaAdapter {
  id: string;
  url: string;
}

export interface UploadProgressHandler {
  (percentage: number): void;
}

interface RawMediaUploadResponse {
  success: boolean;
  data: {
    id: string;
    url: string;
  };
  error?: string | string[];
  message?: string | string[];
}

// ─────────────────────────────────────────────────────────────
// Media API Client functions
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/media/upload
 * Uploads a file with progress tracking via XHR.
 * Returns an adapter object containing only { id, url }.
 */
export async function uploadProductMedia(
  file: File,
  token: string,
  onProgress?: UploadProgressHandler,
): Promise<UploadedMediaAdapter> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const apiBase = getApiBaseUrl();
    xhr.open("POST", `${apiBase}/api/v1/media/upload`);

    // Auth headers
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    // Tracking progress
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText) as RawMediaUploadResponse;
          if (res.success && res.data) {
            resolve({
              id: res.data.id,
              url: res.data.url,
            });
          } else {
            reject(new Error(parseErrorStr(res)));
          }
        } catch {
          reject(new Error("Invalid JSON response from server"));
        }
      } else {
        // Try to parse error message if available
        let errorMsg = `Upload failed: ${xhr.statusText}`;
        try {
          const res = JSON.parse(xhr.responseText) as RawMediaUploadResponse;
          errorMsg = parseErrorStr(res) || errorMsg;
        } catch {
          // ignore
        }
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload"));
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mediaClass", "PRODUCT_IMAGE");

    xhr.send(formData);
  });
}

function parseErrorStr(res: RawMediaUploadResponse): string {
  if (typeof res.error === "string") return res.error;
  if (Array.isArray(res.error)) return res.error.join(", ");
  if (typeof res.message === "string") return res.message;
  if (Array.isArray(res.message)) return res.message.join(", ");
  return "Unknown error occurred during upload";
}

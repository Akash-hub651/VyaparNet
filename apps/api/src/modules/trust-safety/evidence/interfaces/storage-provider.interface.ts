export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface IStorageProvider {
  /**
   * Uploads a file buffer to storage and returns the deterministic object key
   */
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string>;

  /**
   * Generates a temporary signed URL for a given object key
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

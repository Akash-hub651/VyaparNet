export const STORAGE_SERVICE_TOKEN = Symbol('STORAGE_SERVICE_TOKEN');

export interface StorageService {
  upload(file: Buffer, key: string, mimeType: string): Promise<string>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

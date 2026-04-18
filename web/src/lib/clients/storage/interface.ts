export interface StoredFile {
  url: string;
  expiresAt: Date;
}

export interface StorageClient {
  putTempFile(localPath: string, ttlSeconds: number): Promise<StoredFile>;
  cleanup(maxAgeSeconds: number): Promise<number>;
}

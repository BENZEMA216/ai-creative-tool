import type { StorageClient } from './interface';
import { LocalFsStorageClient } from './local-fs';
import { OssStorageClient } from './oss';

export type { StorageClient, StoredFile } from './interface';

let cached: StorageClient | undefined;

export function getStorageClient(): StorageClient {
  if (cached) return cached;
  cached = process.env.STORAGE === 'oss' ? new OssStorageClient() : new LocalFsStorageClient();
  return cached;
}

export function _resetStorageClient(): void {
  cached = undefined;
}

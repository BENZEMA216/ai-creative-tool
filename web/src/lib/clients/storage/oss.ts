import type { StorageClient, StoredFile } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

export class OssStorageClient implements StorageClient {
  constructor() {
    if (!process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_BUCKET) {
      throw new AppError(ErrCode.InternalError, 'OSS 凭证未配置');
    }
  }

  async putTempFile(_localPath: string, _ttlSeconds: number): Promise<StoredFile> { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new AppError(ErrCode.InternalError, 'OSS 客户端未实现，请改用 STORAGE=local');
  }

  async cleanup(_maxAge: number): Promise<number> { // eslint-disable-line @typescript-eslint/no-unused-vars
    return 0;
  }
}

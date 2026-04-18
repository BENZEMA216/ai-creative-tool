import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import type { StorageClient, StoredFile } from './interface';

export class LocalFsStorageClient implements StorageClient {
  async putTempFile(localPath: string, ttlSeconds: number): Promise<StoredFile> {
    return {
      url: `file://${localPath}`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async cleanup(maxAgeSeconds: number): Promise<number> {
    const dir = process.env.TEMP_DIR ?? '/tmp/ai-creative';
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return 0;
    }
    let deleted = 0;
    const now = Date.now();
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = statSync(full);
        if ((now - st.mtimeMs) / 1000 > maxAgeSeconds) {
          if (st.isDirectory()) {
            await fs.rm(full, { recursive: true, force: true });
          } else {
            await fs.unlink(full);
          }
          deleted++;
        }
      } catch {}
    }
    return deleted;
  }
}

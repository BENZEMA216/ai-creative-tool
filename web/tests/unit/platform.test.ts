import { describe, it, expect } from 'vitest';
import { resolvePlatform, type Platform } from '@/lib/core/platform';

describe('resolvePlatform', () => {
  const cases: Array<[string, Platform | null]> = [
    ['https://www.douyin.com/video/7234567890', 'douyin'],
    ['https://v.douyin.com/abc', 'douyin'],
    ['https://www.xiaohongshu.com/explore/abc', 'xiaohongshu'],
    ['https://xhslink.com/abc', 'xiaohongshu'],
    ['https://www.bilibili.com/video/BV1xx411c7mD', 'bilibili'],
    ['https://b23.tv/abc', 'bilibili'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://example.com/video', null],
    ['not a url', null],
    ['', null],
  ];

  for (const [url, expected] of cases) {
    it(`maps ${JSON.stringify(url)} → ${expected}`, () => {
      expect(resolvePlatform(url)).toBe(expected);
    });
  }
});

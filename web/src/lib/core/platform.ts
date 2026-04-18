export type Platform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'youtube';

const PATTERNS: Array<[Platform, RegExp]> = [
  ['douyin', /(?:^|\.)douyin\.com$/i],
  ['xiaohongshu', /(?:^|\.)xiaohongshu\.com$/i],
  ['xiaohongshu', /(?:^|\.)xhslink\.com$/i],
  ['bilibili', /(?:^|\.)bilibili\.com$/i],
  ['bilibili', /(?:^|\.)b23\.tv$/i],
  ['youtube', /(?:^|\.)youtube\.com$/i],
  ['youtube', /(?:^|\.)youtu\.be$/i],
];

export function resolvePlatform(url: string): Platform | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [p, re] of PATTERNS) {
    if (re.test(host)) return p;
  }
  return null;
}

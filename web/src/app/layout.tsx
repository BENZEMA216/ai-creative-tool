import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 智能创作',
  description: '短视频文案提取 + 视频下载',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gradient-page min-h-screen text-white antialiased">
        {children}
      </body>
    </html>
  );
}

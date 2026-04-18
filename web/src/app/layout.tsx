import type { Metadata } from 'next';
import { Fraunces, Inter_Tight } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-editorial',
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI 智能创作',
  description: '短视频文案提取 + 视频下载',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${fraunces.variable} ${interTight.variable}`}>
      <body className="bg-gradient-page min-h-screen text-white antialiased">
        {children}
      </body>
    </html>
  );
}

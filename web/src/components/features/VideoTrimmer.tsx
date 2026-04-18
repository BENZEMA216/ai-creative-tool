'use client';

import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  title: string;
  platform: string;
  durationText: string;
  duration: number;       // 秒
  thumbnail: string;
  downloadUrl: string;
}

const MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MB

function fmt(t: number): string {
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VideoTrimmer(props: Props) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(props.duration);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);

  useEffect(() => { setEnd(props.duration); }, [props.duration]);

  async function loadFFmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;
    setProgress('加载 ffmpeg.wasm...');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }

  async function handleDownload() {
    setError(null);
    const isFull = start === 0 && end === props.duration;

    if (isFull) {
      const a = document.createElement('a');
      a.href = props.downloadUrl;
      a.download = `${props.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    setBusy(true);
    try {
      setProgress('下载完整视频...');
      const resp = await fetch(props.downloadUrl);
      const blob = await resp.blob();
      if (blob.size > MAX_INPUT_BYTES) {
        setError('视频过大（>200MB），请下载完整版后本地裁剪');
        return;
      }

      const ffmpeg = await loadFFmpeg();
      setProgress('裁剪中...');
      const inputName = 'in.mp4';
      const outputName = 'out.mp4';
      await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
      await ffmpeg.exec([
        '-ss', String(start),
        '-to', String(end),
        '-i', inputName,
        '-c', 'copy',
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      const outBlob = new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${props.title}-${fmt(start)}-${fmt(end)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`裁剪失败: ${msg}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <GlassCard className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
        <div><span className="text-white/40">视频标题</span><br /><span className="text-white">{props.title}</span></div>
        <div><span className="text-white/40">平台</span><br /><span className="text-white">{props.platform}</span></div>
        <div><span className="text-white/40">时长</span><br /><span className="text-white">{props.durationText}</span></div>
      </div>
      {props.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.thumbnail} alt={props.title} className="w-full max-w-md rounded-xl" />
      )}
      <div className="space-y-3">
        <p className="text-sm text-white/70">📐 片段选择（拖动滑块）</p>
        <div className="flex gap-3 text-xs text-white/60">
          <label className="flex-1 space-y-1">
            开始：{fmt(start)}
            <input
              type="range"
              min={0}
              max={props.duration}
              value={start}
              onChange={e => setStart(Math.min(Number(e.target.value), end - 1))}
              className="w-full accent-accent"
            />
          </label>
          <label className="flex-1 space-y-1">
            结束：{fmt(end)}
            <input
              type="range"
              min={0}
              max={props.duration}
              value={end}
              onChange={e => setEnd(Math.max(Number(e.target.value), start + 1))}
              className="w-full accent-accent"
            />
          </label>
        </div>
      </div>
      {progress && <p className="text-sm text-white/60">{progress}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button onClick={handleDownload} loading={busy} disabled={busy}>
        📥 {start === 0 && end === props.duration ? '下载完整视频' : `下载片段 (${fmt(start)} ~ ${fmt(end)})`}
      </Button>
    </GlassCard>
  );
}

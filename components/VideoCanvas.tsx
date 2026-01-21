import React, { useRef, useEffect } from 'react';
import { Asset, TimelineItem, TimelineTrack } from '../types';

interface VideoCanvasProps {
  currentTime: number;
  timeline: TimelineTrack[];
  assets: Asset[];
  isPlaying: boolean;
}

export const VideoCanvas: React.FC<VideoCanvasProps> = ({ currentTime, timeline, assets, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    // Get all visual tracks (video, text) - images go to video tracks
    const visualTracks = timeline.filter(t => t.type === 'video' || t.type === 'text');
    const activeItems = visualTracks
      .flatMap(track => track.items.map(item => ({ item, track })))
      .filter(({ item }) => currentTime >= item.startTime && currentTime < item.startTime + item.duration)
      .sort((a, b) => (a.item.layer || 0) - (b.item.layer || 0)); // Sort by layer

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render each active item
    activeItems.forEach(({ item, track }) => {
      const asset = assets.find(a => a.id === item.assetId);
      if (!asset) return;

      const itemTime = currentTime - item.startTime;
      let opacity = item.opacity !== undefined ? item.opacity : 1;

      // Apply transition effects
      if (item.transitionIn && itemTime < (item.transitionDuration || 0.5)) {
        const progress = itemTime / (item.transitionDuration || 0.5);
        if (item.transitionIn === 'fade' || item.transitionIn === 'dissolve') {
          opacity *= progress;
        }
      }
      if (item.transitionOut && (item.duration - itemTime) < (item.transitionDuration || 0.5)) {
        const progress = (item.duration - itemTime) / (item.transitionDuration || 0.5);
        if (item.transitionOut === 'fade' || item.transitionOut === 'dissolve') {
          opacity *= progress;
        }
      }

      ctx.globalAlpha = opacity;

      // Apply filters
      if (item.filters) {
        const filters: string[] = [];
        if (item.filters.brightness !== undefined) filters.push(`brightness(${item.filters.brightness})`);
        if (item.filters.contrast !== undefined) filters.push(`contrast(${item.filters.contrast})`);
        if (item.filters.saturation !== undefined) filters.push(`saturate(${item.filters.saturation})`);
        if (item.filters.blur !== undefined) filters.push(`blur(${item.filters.blur}px)`);
        ctx.filter = filters.join(' ');
      }

      if (asset.type === 'video') {
        let video = videoElementsRef.current.get(item.id);
        if (!video) {
          video = document.createElement('video');
          video.src = asset.url;
          video.preload = 'auto';
          video.muted = true;
          videoElementsRef.current.set(item.id, video);
        }

        if (isPlaying && video.paused) {
          video.currentTime = itemTime;
          video.play().catch(() => {});
        } else if (!isPlaying && !video.paused) {
          video.pause();
        }

        if (Math.abs(video.currentTime - itemTime) > 0.3) {
          video.currentTime = itemTime;
        }

        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      } else if (asset.type === 'image') {
        let img = imageElementsRef.current.get(item.id);
        if (!img) {
          img = new Image();
          img.crossOrigin = 'anonymous'; // CORS support
          img.onload = () => {
            // Force re-render when image loads
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx && img && img.complete) {
                ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
              }
            }
          };
          img.src = asset.url;
          imageElementsRef.current.set(item.id, img);
        }

        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else {
          // Show placeholder while loading
          ctx.fillStyle = '#18181b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#52525b';
          ctx.font = '24px Inter';
          ctx.textAlign = 'center';
          ctx.fillText('Loading image...', canvas.width / 2, canvas.height / 2);
        }
      } else if (asset.type === 'text' && asset.textContent) {
        const style = asset.textStyle || {
          fontFamily: 'Inter',
          fontSize: 48,
          color: '#ffffff',
          align: 'center',
          bold: false,
          italic: false
        };

        ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        ctx.textAlign = style.align;

        const x = style.align === 'center' ? canvas.width / 2 : style.align === 'right' ? canvas.width - 40 : 40;
        const y = canvas.height / 2;

        if (style.backgroundColor) {
          ctx.fillStyle = style.backgroundColor;
          const metrics = ctx.measureText(asset.textContent);
          ctx.fillRect(x - metrics.width / 2 - 20, y - style.fontSize / 2 - 10, metrics.width + 40, style.fontSize + 20);
          ctx.fillStyle = style.color;
        }

        ctx.fillText(asset.textContent, x, y);
      }

      // Reset filters and alpha
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    });

    const animationFrame = requestAnimationFrame(() => {});
    return () => cancelAnimationFrame(animationFrame);
  }, [currentTime, timeline, assets, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      className="w-full h-full object-contain"
    />
  );
};

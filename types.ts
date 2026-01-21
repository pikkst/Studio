
export type MediaType = 'video' | 'image' | 'audio' | 'text';

export interface Asset {
  id: string;
  type: MediaType;
  url: string;
  name: string;
  thumbnail?: string;
  duration?: number;
}

export interface ProjectState {
  id: string;
  title: string;
  assets: Asset[];
  timeline: TimelineTrack[];
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  volume: number; // 0 to 1
  items: TimelineItem[];
}

export interface TimelineItem {
  id: string;
  assetId: string;
  startTime: number;
  duration: number;
  layer: number;
}

export enum AIServiceMode {
  CHAT = 'CHAT',
  VIDEO_GEN = 'VIDEO_GEN',
  IMAGE_GEN = 'IMAGE_GEN',
  SPEECH_GEN = 'SPEECH_GEN',
  SEARCH = 'SEARCH'
}

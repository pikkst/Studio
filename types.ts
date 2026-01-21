
export type MediaType = 'video' | 'image' | 'audio' | 'text';

export interface Asset {
  id: string;
  type: MediaType;
  url: string;
  name: string;
  thumbnail?: string;
  duration?: number;
  textContent?: string;
  textStyle?: TextStyle;
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
  type: 'video' | 'audio' | 'text';
  volume: number; // 0 to 1
  items: TimelineItem[];
}

export interface TimelineItem {
  id: string;
  assetId: string;
  startTime: number;
  duration: number;
  layer: number;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number;
  opacity?: number;
  volume?: number;
  filters?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    blur?: number;
  };
}

export enum AIServiceMode {
  CHAT = 'CHAT',
  IMAGE_GEN = 'IMAGE_GEN',
  SPEECH_GEN = 'SPEECH_GEN',
  SEARCH = 'SEARCH'
}

export type TransitionType = 'none' | 'fade' | 'dissolve' | 'wipe' | 'slide';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  align: 'left' | 'center' | 'right';
}

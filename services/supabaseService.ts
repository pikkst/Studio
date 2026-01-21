import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { ProjectState, Asset } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

export interface StoredProject {
  id: string;
  user_id: string;
  title: string;
  data: ProjectState;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

export interface StoredAsset {
  id: string;
  user_id: string;
  project_id?: string;
  name: string;
  type: string;
  url: string;
  thumbnail_url?: string;
  duration?: number;
  file_size?: number;
  created_at: string;
}

/**
 * Supabase service for managing authentication, projects, and media storage
 */
export const supabaseService = {
  // ==================== AUTHENTICATION ====================
  
  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Get current session
   */
  async getSession(): Promise<Session | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Sign out
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user ?? null);
    });
  },

  // ==================== PROJECT MANAGEMENT ====================
  
  /**
   * Save project to database
   */
  async saveProject(project: ProjectState, userId: string): Promise<StoredProject> {
    const projectData = {
      user_id: userId,
      title: project.title,
      data: project,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('projects')
      .upsert(
        { id: project.id, ...projectData },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Load all projects for current user
   */
  async loadProjects(userId: string): Promise<StoredProject[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Load specific project by ID
   */
  async loadProject(projectId: string, userId: string): Promise<StoredProject | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },

  /**
   * Delete project
   */
  async deleteProject(projectId: string, userId: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  // ==================== MEDIA STORAGE ====================
  
  /**
   * Upload media file to Supabase Storage
   */
  async uploadMedia(file: File, userId: string, projectId?: string): Promise<StoredAsset> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const filePath = `${userId}/${projectId || 'library'}/${fileName}`;

    // Upload file to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    // Get file duration for video/audio
    let duration: number | undefined;
    if (file.type.startsWith('video') || file.type.startsWith('audio')) {
      duration = await this.getMediaDuration(file);
    }

    // Generate thumbnail for images
    let thumbnailUrl: string | undefined;
    if (file.type.startsWith('image')) {
      thumbnailUrl = publicUrl;
    }

    // Save asset metadata to database
    const assetData = {
      id: Math.random().toString(36).substr(2, 9),
      user_id: userId,
      project_id: projectId,
      name: file.name,
      type: file.type.startsWith('image') ? 'image' : file.type.startsWith('audio') ? 'audio' : 'video',
      url: publicUrl,
      thumbnail_url: thumbnailUrl,
      duration: duration,
      file_size: file.size,
    };

    const { data, error } = await supabase
      .from('assets')
      .insert(assetData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Load user's media library
   */
  async loadAssets(userId: string, projectId?: string): Promise<StoredAsset[]> {
    let query = supabase
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  /**
   * Delete media asset
   */
  async deleteAsset(assetId: string, userId: string) {
    // Get asset info first
    const { data: asset } = await supabase
      .from('assets')
      .select('url')
      .eq('id', assetId)
      .eq('user_id', userId)
      .single();

    if (asset) {
      // Extract file path from URL and delete from storage
      const urlParts = asset.url.split('/media/');
      if (urlParts[1]) {
        await supabase.storage
          .from('media')
          .remove([urlParts[1]]);
      }
    }

    // Delete from database
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', assetId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  // ==================== HELPERS ====================
  
  /**
   * Get media duration helper
   */
  async getMediaDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('audio')) {
        const audio = new Audio();
        audio.onloadedmetadata = () => {
          resolve(audio.duration);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          resolve(5);
          URL.revokeObjectURL(url);
        };
        audio.src = url;
      } else if (file.type.startsWith('video')) {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          resolve(video.duration);
          URL.revokeObjectURL(url);
        };
        video.onerror = () => {
          resolve(5);
          URL.revokeObjectURL(url);
        };
        video.src = url;
      } else {
        resolve(5);
      }
    });
  },

  /**
   * Create thumbnail for video
   */
  async createVideoThumbnail(videoFile: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.onloadeddata = () => {
        video.currentTime = Math.min(2, video.duration / 2);
      };
      
      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create thumbnail'));
        }, 'image/jpeg', 0.8);
      };
      
      video.onerror = reject;
      video.src = URL.createObjectURL(videoFile);
    });
  }
};

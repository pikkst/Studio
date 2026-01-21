<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Lumina AI Video Studio

Professional AI-powered video editing platform with Supabase backend and Gemini AI integration.

## Features

- ✅ **Supabase Backend:** Authentication, cloud storage, real-time database
- ✅ **Timeline Editor:** Drag-drop, resize, split clips with precision
- ✅ **Real-time Audio:** Synchronized multi-track audio playback
- ✅ **5 AI Modes:** Chat assistant, video generation (Veo), image generation, text-to-speech, media search
- ✅ **Auto-save:** Every 30 seconds to cloud
- ✅ **Professional UI:** Glassmorphism design with dark theme

## Setup

**Prerequisites:** Node.js, Supabase account, Google AI API key

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Add your credentials to `.env`:**
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `VITE_GEMINI_API_KEY` - Your Google Gemini API key

4. **Set up Supabase database:**
   - Go to [Supabase SQL Editor](https://supabase.com/dashboard)
   - Run the SQL from `supabase-schema.sql`

5. **Run dev server:**
   ```bash
   npm run dev
   ```

## Deployment

For production deployment:

1. **Set environment variables** in your hosting platform (Vercel/Netlify)
2. **Run build:** `npm run build`
3. **Deploy:** `npm run preview` (or platform-specific deploy)

**⚠️ Security Note:** For production, move Gemini API calls to Supabase Edge Functions to protect your API key.

## View Original

AI Studio app: https://ai.studio/apps/drive/1izN90IhJd9d_nHmbf9DvH6ifSYFcbTIb

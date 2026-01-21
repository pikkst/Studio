
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

// Manual base64 decode function as per @google/genai guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Service for interacting with Gemini API models.
 */
export const geminiService = {
  /**
   * General AI Assistant Chat
   */
  async askAssistant(prompt: string, context: string = "", apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Context: ${context}\n\nUser Question: ${prompt}`,
      config: {
        systemInstruction: "You are Lumina, a world-class AI video director. Help the user with creative advice, scripting, and technical video editing steps. Keep responses concise and inspiring.",
      }
    });
    return response.text;
  },

  /**
   * Search for stock assets or references using Google Search Grounding
   */
  async searchMediaReferences(query: string, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Find high-quality media references, stock footage descriptions, or free asset websites for: ${query}`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "List specific websites or sources where the user can find the requested media. Provide direct links from grounding chunks.",
      },
    });

    const links = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || "Resource",
      uri: chunk.web?.uri || "#"
    })) || [];

    return {
      text: response.text,
      links
    };
  },



  /**
   * Generate Image for assets
   */
  async generateImage(prompt: string, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    let imageUrl = '';
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }
    return imageUrl;
  },

  /**
   * Text to Speech Narration
   */
  async generateNarration(text: string, apiKey?: string, voice: string = 'Kore') {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say naturally: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const bytes = decode(base64Audio);
    const blob = new Blob([bytes], { type: 'audio/pcm' });
    return URL.createObjectURL(blob);
  },

  /**
   * Analyze timeline and give smart editing suggestions
   */
  async analyzeTimeline(timelineData: any, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    
    const prompt = `You are a professional video editor. Analyze this timeline data and provide practical editing suggestions:

Timeline: ${JSON.stringify(timelineData, null, 2)}

Provide:
1. Pacing analysis (is it too fast/slow?)
2. Transition suggestions (where to add fades, cuts)
3. Audio mixing tips (volume levels, balance)
4. Visual improvements (text placement, timing)
5. 3 specific actionable improvements

Format as numbered list, keep it concise and practical.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a professional video editor assistant. Give practical, actionable advice.",
      }
    });
    return response.text;
  },

  /**
   * Generate smart cut points based on timeline analysis
   */
  async suggestCutPoints(timelineData: any, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    
    const prompt = `Analyze this video timeline and suggest optimal cut points for better pacing:

${JSON.stringify(timelineData, null, 2)}

Return a JSON array of cut suggestions with this format:
[
  { "time": 5.5, "reason": "Natural pause point", "action": "split" },
  { "time": 12.3, "reason": "Long segment", "action": "trim" }
]

Only suggest cuts that would improve the video. Max 5 suggestions.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    try {
      const text = response.text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse cut suggestions:', e);
    }
    return [];
  },

  /**
   * Generate narration script based on timeline content
   */
  async generateNarrationScript(timelineData: any, style: string, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    
    const prompt = `Create a ${style} narration script for this video timeline:

${JSON.stringify(timelineData, null, 2)}

Style: ${style}
Duration: ${timelineData.duration} seconds

Write a natural, engaging voiceover script that matches the video pacing. Include timing markers like [0:05] for when each line should be spoken.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a professional voiceover scriptwriter. Write clear, engaging narration.",
      }
    });
    return response.text;
  },

  /**
   * Smart project suggestions based on current state
   */
  async getSmartSuggestions(projectData: any, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    
    const prompt = `Analyze this video project and give 3 quick actionable tips:

Project: "${projectData.title}"
Assets: ${projectData.videoCount} videos, ${projectData.audioCount} audio, ${projectData.textCount} text
Duration: ${projectData.totalDuration}s

Focus on: missing elements, pacing, polish, viewer engagement.
Format: "✓ [Tip]" one per line, max 15 words each.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  },

  /**
   * Suggest transitions between clips
   */
  async suggestTransitions(timelineData: any, apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    
    const prompt = `Analyze this timeline and suggest where to add transitions:

${JSON.stringify(timelineData, null, 2)}

Return JSON array:
[
  { "itemId": "abc123", "transitionType": "fade", "reason": "Scene change" },
  { "itemId": "xyz789", "transitionType": "dissolve", "reason": "Time passage" }
]

Suggest fade/dissolve transitions where they improve flow. Max 5 suggestions.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    try {
      const text = response.text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse transition suggestions:', e);
    }
    return [];
  }
};

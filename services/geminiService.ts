
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
   * Generate Video using Veo
   */
  async generateVideo(prompt: string, apiKey?: string, aspectRatio: '16:9' | '9:16' = '16:9') {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API key is required');
    const ai = new GoogleGenAI({ apiKey: key });
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const response = await fetch(`${downloadLink}&key=${key}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
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
  }
};

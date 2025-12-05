import { GoogleGenAI } from "@google/genai";

// Access API key safely. 
// We use a try-catch block to handle cases where `process` is not defined in the browser.
let apiKey = '';
try {
  apiKey = process.env.API_KEY || '';
} catch (e) {
  console.warn("process.env.API_KEY access failed, running without API key.");
}

// Initialize AI client only if key is present
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Fallback icon if AI fails
const DEFAULT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z"/></svg>`;

export const generateChoreIcon = async (choreTitle: string): Promise<string> => {
  if (!ai) {
    return DEFAULT_ICON;
  }

  try {
    // We want the AI to return raw SVG code.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Create a simple, bold, black outline SVG icon for a household chore titled "${choreTitle}". 
      Style constraints: 
      - Strictly minimalist line art (outline only). 
      - No fill, no shading, no colors (use stroke="currentColor").
      - Thick, clear strokes suitable for a small UI icon.
      - ViewBox "0 0 24 24".
      - Return ONLY the raw <svg>...</svg> string.`,
    });

    let svg = response.text || '';
    
    // Clean up potential markdown formatting if the model disobeys
    svg = svg.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();
    
    // Basic validation
    if (!svg.startsWith('<svg')) {
        return DEFAULT_ICON;
    }

    return svg;
  } catch (error) {
    console.error("Error generating icon:", error);
    return DEFAULT_ICON;
  }
};
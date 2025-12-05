import { GoogleGenAI, Type } from "@google/genai";

// Access API key safely. 
// We use a try-catch block to handle cases where `process` is not defined in the browser,
// preventing a ReferenceError if the build replacement doesn't happen.
let apiKey = '';
try {
  apiKey = process.env.API_KEY || '';
} catch (e) {
  console.warn("process.env.API_KEY access failed, running without API key.");
}

const ai = new GoogleGenAI({ apiKey });

export interface AIChoreSuggestion {
  title: string;
  points: number;
  description: string;
}

export const suggestChores = async (context: string): Promise<AIChoreSuggestion[]> => {
  if (!apiKey) {
    console.warn("Gemini API Key missing. Returning mock suggestions.");
    return [
      { title: "Organize Bookshelf", points: 150, description: "Sort books by size or color." },
      { title: "Water Plants", points: 50, description: "Check soil moisture first." }
    ];
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a list of 3 household chores suitable for kids based on this context: "${context}". 
      Assign realistic reward points (scale 10-500) based on difficulty.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              points: { type: Type.INTEGER },
              description: { type: Type.STRING }
            },
            required: ["title", "points", "description"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIChoreSuggestion[];
    }
    return [];
  } catch (error) {
    console.error("Error fetching AI suggestions:", error);
    return [];
  }
};
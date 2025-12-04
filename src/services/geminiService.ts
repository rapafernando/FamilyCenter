import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface AIChoreSuggestion {
  title: string;
  points: number;
  description: string;
}

export const suggestChores = async (context: string): Promise<AIChoreSuggestion[]> => {
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
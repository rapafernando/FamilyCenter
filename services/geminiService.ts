
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


import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, ChatAction } from "../types";

// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are a high-performance business assistant for a Telegram bot. 
Your primary objective is to manage customer relations effectively for a Small/Medium Business (SMB).

MESSAGING CONTEXT:
- You are responding to a real customer on Telegram.
- Keep replies mobile-friendly (short paragraphs, use emojis where appropriate).
- Be professional yet approachable.

CORE ACTIONS:
1. 'reply': For answering questions about services, hours, or general info.
2. 'schedule': When a user expresses intent to meet, call, or visit. 
   - ALWAYS provide 2-3 suggested ISO 8601 timestamps (e.g., '2025-10-15T14:30:00Z') in the 'schedule_times' array.
   - If the user didn't specify a time, suggest times in the next 48 hours.
3. 'help': For complex issues, complaints, or if they ask to speak to a person. Apologize and let them know a human will help soon.

OUTPUT FORMAT:
Return a JSON object only. Ensure 'reasoning' explains why you chose the action for the business owner to see.
`;

export const analyzeMessage = async (messageText: string, chatHistory: string): Promise<AIResponse> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current Time: ${new Date().toISOString()}\nHistory:\n${chatHistory}\n\nIncoming Message:\n${messageText}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description: "The action decision (reply, schedule, or help)."
            },
            reply_text: {
              type: Type.STRING,
              description: "The actual message to be sent to the Telegram user."
            },
            schedule_times: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Proposed ISO timestamps if scheduling."
            },
            confidence: {
              type: Type.NUMBER,
              description: "Internal confidence score (0-1)."
            },
            reasoning: {
                type: Type.STRING,
                description: "Brief explanation of the logic behind this response for the admin."
            }
          },
          required: ["action", "reply_text", "confidence", "reasoning"]
        }
      }
    });

    const text = response.text || '{}';
    return JSON.parse(text) as AIResponse;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      action: ChatAction.REPLY,
      reply_text: "Thank you for reaching out! I'm currently experiencing heavy traffic. A team member will get back to you shortly.",
      confidence: 0,
      reasoning: "API error fallback"
    };
  }
};

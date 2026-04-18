import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface InvestmentData {
  name: string;
  amount: number;
  category: 'Global Equity' | 'Cash/Fixed Income';
}

export const analyzeInvestmentImage = async (base64Image: string, mimeType: string): Promise<InvestmentData[]> => {
  const prompt = `
    Analyze this image of an investment portfolio. 
    Extract the list of funds/investments, their current values (amounts), and categorize them.
    
    Categories should be:
    - 'Global Equity' for stocks, ETFs, or equity funds.
    - 'Cash/Fixed Income' for cash, savings, or fixed income.
    
    Return the data as a JSON array of objects with 'name', 'amount', and 'category' fields.
    Ensure 'amount' is a number.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              category: { 
                type: Type.STRING,
                enum: ['Global Equity', 'Cash/Fixed Income']
              }
            },
            required: ['name', 'amount', 'category']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as InvestmentData[];
  } catch (error) {
    console.error("Error analyzing image with Gemini:", error);
    throw error;
  }
};

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { WordData, ExampleSentence, WordContext, ReadingArticle } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

// Helper to sanitize and parse JSON from LLM text response
const parseJSONResponse = (text: string): any => {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    // Attempt to extract JSON object if surrounded by text
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleanText = cleanText.substring(start, end + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    throw new Error("Failed to parse AI response");
  }
};

// Retry helper
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2); // Exponential backoff
  }
}

export const fetchWordDetails = async (word: string): Promise<Partial<WordData>> => {
  const ai = getClient();
  
  const prompt = `
    I need real-world dictionary data for the GRE word: "${word}".
    
    STEP 1: PERFORM A GOOGLE SEARCH to find:
      - The exact definitions of "${word}" from reputable dictionaries (Merriam-Webster, Oxford, Vocabulary.com).
      - The etymology/origin.
      - 3 REAL usage examples from major publications like "The New York Times", "The Atlantic", "The New Yorker", or "Scientific American".
    
    STEP 2: GENERATE a creative, wacky visual mnemonic to help remember this word (this part you create).

    STEP 3: Format the output as a SINGLE JSON object with this exact structure:
    {
      "definitions": [
        { "contextType": "e.g., Verb, Noun, or Context (Legal)", "definition": "The exact definition found from search." }
      ],
      "examples": [
        { "text": "The actual sentence found in search.", "source": "Publication Name" }
      ],
      "synonyms": ["synonym1", "synonym2"],
      "etymology": "The etymology found.",
      "aiMnemonic": "The mnemonic you generated."
    }

    IMPORTANT: 
    - Use the search results for definitions and examples. Do not hallucinate them.
    - Return ONLY the raw JSON string. No Markdown.
  `;

  return retry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      return parseJSONResponse(text) as Partial<WordData>;
    } catch (error) {
      console.warn(`Attempt failed for ${word}:`, error);
      throw error;
    }
  });
};

export const generateWordImage = async (word: string, mnemonic: string): Promise<string | null> => {
  const ai = getClient();
  const prompt = `Generate a simple, memorable, cartoon-style illustration to help remember the word "${word}". 
  The concept is: ${mnemonic || "A visual representation of " + word}. 
  Do not include text in the image.`;

  try {
     const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: prompt,
        config: {
           // No special config for flash-image model
        }
     });
     
     if (response.candidates?.[0]?.content?.parts) {
         for (const part of response.candidates[0].content.parts) {
             if (part.inlineData) {
                 return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
             }
         }
     }
     return null;
  } catch (e) {
      console.error("Image gen failed", e);
      return null;
  }
};

export const validateSentence = async (word: string, sentence: string): Promise<{ isCorrect: boolean; feedback: string }> => {
  const ai = getClient();
  
  const prompt = `
    The student is practicing for the GRE. They wrote a sentence using the word "${word}".
    Sentence: "${sentence}"
    
    Analyze if the word is used correctly (grammar, semantic sense, nuance).
    Return JSON with 'isCorrect' (boolean) and 'feedback' (string). 
    If incorrect, explain why and provide a corrected version. 
    If correct but simple, suggest a more "GRE-level" complex version.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      isCorrect: { type: Type.BOOLEAN },
      feedback: { type: Type.STRING },
    },
    required: ["isCorrect", "feedback"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const text = response.text;
    if (!text) return { isCorrect: false, feedback: "AI Error" };
    return JSON.parse(text);
  } catch (error) {
    return { isCorrect: false, feedback: "Could not validate sentence at this time." };
  }
};

export const getDailyReadings = async (): Promise<ReadingArticle[]> => {
  const ai = getClient();
  
  const prompt = `
    Search for 3 real, recent (within the last month), and intellectually stimulating articles suitable for GRE reading comprehension practice.
    Prioritize sources like "Arts & Letters Daily", "The Atlantic", "The New Yorker", "Scientific American", "Smithsonian Magazine", or reputable academic blogs.
    
    The articles should have complex sentence structures and advanced vocabulary.

    For each article found, strictly extract:
    1. The exact headline/title.
    2. A brief 1-2 sentence summary of the content.
    3. The Source Name.
    4. The DIRECT URL to the article.

    Output the result as a raw JSON array of objects with keys: "title", "summary", "source", "url".
    Do NOT use Markdown formatting (no \`\`\`json blocks). Just return the raw JSON string.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let text = response.text || "[]";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
        text = text.substring(start, end + 1);
    }

    return JSON.parse(text) as ReadingArticle[];
  } catch (error) {
    console.error("Error fetching readings:", error);
    return [
        {
            title: "Error fetching recent articles",
            summary: "We couldn't retrieve the latest articles right now. Please try again later.",
            source: "System",
            url: "https://www.aldaily.com/"
        }
    ];
  }
};
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function getFallbackPrompt(decade: string): string {
  return `Create a photograph of the person in this image as if they were living in the ${decade}. The photograph should capture the distinct fashion, hairstyles, and overall atmosphere of that time period. Ensure the final image is a clear photograph that looks authentic to the era.`;
}

function extractDecade(prompt: string): string | null {
  const match = prompt.match(/(\d{4}s)/);
  return match ? match[1] : null;
}

function extractImageFromResponse(response: any): string {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/jpeg';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  const textResponse = response.text || '';
  throw new Error(`The AI model responded with text instead of an image: "${textResponse || 'No image returned.'}"`);
}

async function callGemini(imagePart: object, textPart: object) {
  const candidateModels = ['gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image'];
  let lastError: any = null;

  for (const model of candidateModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts: [imagePart, textPart] },
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        console.error(`Gemini call attempt ${attempt} for model ${model} failed:`, msg);
        if (attempt < 2 && (msg.includes('500') || msg.includes('INTERNAL') || msg.includes('429'))) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
  }
  throw lastError || new Error('Gemini API call failed after retries.');
}

app.post('/api/generate-decade', async (req, res) => {
  try {
    const { imageDataUrl, prompt } = req.body;
    if (!imageDataUrl || !prompt) {
      return res.status(400).json({ error: 'Missing required imageDataUrl or prompt parameters.' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
    }

    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!match) {
      return res.status(400).json({ error: "Invalid image format. Expected data URL: 'data:image/...;base64,...'" });
    }

    const [, mimeType, base64Data] = match;
    const imagePart = {
      inlineData: { mimeType, data: base64Data },
    };

    let response;
    try {
      response = await callGemini(imagePart, { text: prompt });
      const imageUrl = extractImageFromResponse(response);
      return res.json({ imageUrl });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('responded with text instead of an image')) {
        const decade = extractDecade(prompt);
        if (decade) {
          console.warn(`Original prompt blocked for decade ${decade}, attempting fallback prompt...`);
          const fallbackPrompt = getFallbackPrompt(decade);
          const fallbackResponse = await callGemini(imagePart, { text: fallbackPrompt });
          const imageUrl = extractImageFromResponse(fallbackResponse);
          return res.json({ imageUrl });
        }
      }
      throw err;
    }
  } catch (err: any) {
    console.error('Error generating decade image:', err);
    return res.status(500).json({ error: err?.message || 'Failed to generate image.' });
  }
});

// Mounting Vite in development or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

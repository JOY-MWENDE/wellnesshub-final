const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { OpenAI } = require('openai');
require('dotenv').config();

// 1. Initialize Gemini Client (Preferred)
let ai = null;
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

if (hasGeminiKey) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log('✅ Gemini client successfully initialized for WellnessBot.');
  } catch (error) {
    console.error('Failed to initialize Gemini client:', error.message);
  }
}

// 2. Initialize OpenAI Client (Fallback)
let openai = null;
const hasOpenaiKey = Boolean(
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_api_key_here'
);

if (hasOpenaiKey) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✅ OpenAI client initialized for WellnessBot.');
  } catch (error) {
    console.error('Failed to initialize OpenAI client:', error.message);
  }
}

if (!hasGeminiKey && !hasOpenaiKey) {
  console.warn(
    '⚠ Neither GEMINI_API_KEY nor OPENAI_API_KEY is available — WellnessBot chat features are disabled.'
  );
}

router.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'A message is required.' });
  }

  const systemInstruction = "You are WellnessBot, an empathetic and supportive health and wellness coach for the WellnessHub platform. Your goal is to provide simple, actionable advice on fitness, nutrition, sleep, and mental wellness. Always encourage the user and remind them that you are an AI, not a doctor. If they report severe symptoms, advise them to see a medical professional.";

  // A. Use Gemini (Preferred)
  if (ai) {
    try {
      // Convert OpenAI conversation format to Gemini format
      const contents = (history || []).map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content || '' }]
      }));
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7
        }
      });

      const reply = response.text || "I'm here to support you. Let's focus on your wellness goals!";
      return res.json({ reply });
    } catch (error) {
      console.error('Gemini API Error:', error);
      // Fallback to OpenAI if Gemini fails and OpenAI is configured
      if (!openai) {
        return res.status(500).json({ error: 'Failed to connect to Wellness AI (Gemini)' });
      }
    }
  }

  // B. Use OpenAI (Fallback)
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemInstruction },
          ...(history || []),
          { role: "user", content: message }
        ],
      });

      return res.json({ reply: response.choices[0].message.content });
    } catch (error) {
      console.error('OpenAI API Error:', error);
      return res.status(500).json({ error: 'Failed to connect to Wellness AI (OpenAI)' });
    }
  }

  // C. No Provider Configured
  return res.status(503).json({
    error: 'WellnessBot is not configured yet. Set a valid GEMINI_API_KEY or OPENAI_API_KEY and restart the server.'
  });
});

module.exports = router;

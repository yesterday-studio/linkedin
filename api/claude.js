// Vercel Serverless Function — Gemini free API proxy
// Set GEMINI_API_KEY in Vercel dashboard → Settings → Environment Variables

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY not set in Vercel environment variables' } });
  }

  try {
    const { prompt, max_tokens = 1200 } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: max_tokens, temperature: 0.85 },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(response.status).json({ error: { message: data.error.message } });
    }

    // Normalise Gemini response → same format frontend expects
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({
      content: [{ type: 'text', text }],
    });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
}

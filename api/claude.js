// Vercel Serverless Function — Gemini 2.0 Flash (primary) + Groq Llama (fallback)
// Set in Vercel Environment Variables:
//   GEMINI_API_KEY  → aistudio.google.com
//   GROQ_API_KEY    → console.groq.com
// Both are free, no credit card required.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { prompt, max_tokens = 1200 } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: { message: 'No prompt provided' } });
  }

  // ── Try Gemini first ───────────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: max_tokens,
              temperature: 0.85,
            },
          }),
        }
      );

      const data = await geminiRes.json();

      // Rate limit or quota error — trigger fallback
      const isQuotaError =
        data.error?.code === 429 ||
        data.error?.status === 'RESOURCE_EXHAUSTED' ||
        data.error?.message?.toLowerCase().includes('quota') ||
        data.error?.message?.toLowerCase().includes('rate limit');

      if (data.error && !isQuotaError) {
        return res.status(geminiRes.status).json({
          error: { message: 'Gemini: ' + data.error.message },
        });
      }

      if (!data.error) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.status(200).json({
          content: [{ type: 'text', text }],
          provider: 'gemini',
        });
      }

      console.log('Gemini quota hit — switching to Groq fallback...');

    } catch (err) {
      console.log('Gemini network error — switching to Groq:', err.message);
    }
  }

  // ── Groq fallback ──────────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + groqKey,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens,
          temperature: 0.85,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await groqRes.json();

      if (data.error) {
        return res.status(groqRes.status).json({
          error: { message: 'Groq: ' + data.error.message },
        });
      }

      const text = data.choices?.[0]?.message?.content || '';
      return res.status(200).json({
        content: [{ type: 'text', text }],
        provider: 'groq',
      });

    } catch (err) {
      return res.status(500).json({
        error: { message: 'Groq fallback also failed: ' + err.message },
      });
    }
  }

  // ── Neither key set ────────────────────────────────────────────────────
  return res.status(500).json({
    error: {
      message: 'No AI provider configured. Add GEMINI_API_KEY and GROQ_API_KEY in Vercel environment variables.',
    },
  });
}

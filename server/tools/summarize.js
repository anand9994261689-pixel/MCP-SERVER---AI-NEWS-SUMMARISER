// Node 18+ has fetch built-in natively, so we use global fetch.

const SYSTEM_PROMPT = `You are a smart AI News Summarizer.

Your job is to convert news into simple, clear, and useful insights.

Instructions:
1. Read the given news carefully.
2. Generate:
   - One-line headline (Max 12 words)
   - Short summary (2-3 lines of conversational text summarizing the core news)
   - 5 bullet key points (specific actions, facts, or results)
   - Sentiment (Positive / Negative / Neutral)
3. Keep output:
   - Very simple English
   - Easy to understand
   - No complex words
4. Avoid:
   - Repeating sentences
   - Long paragraphs
5. If input is large:
   - Compress intelligently
6. Output in JSON format only:
{
  "headline": "...",
  "summary": "...",
  "points": ["...", "...", "...", "...", "..."],
  "sentiment": "Positive" // or Negative or Neutral
}`;

// Robust JSON extractor to handle any markdown formatting from models
function extractJSON(text) {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to strip markdown JSON blocks
    const markdownMatch = cleaned.match(/```(?:json)?([\s\S]*?)```/i);
    if (markdownMatch) {
      try {
        return JSON.parse(markdownMatch[1].trim());
      } catch (err) {}
    }
    // Find first { and last }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(cleaned.substring(start, end + 1));
      } catch (err) {}
    }
    throw new Error(`Could not extract valid JSON output from response: ${text.substring(0, 100)}...`);
  }
}

// Smart Offline Summarization Fallback Heuristics
function offlineSummarize(text) {
  if (!text || text.trim().length === 0) {
    return {
      headline: "Empty Text Provided",
      summary: "Please enter some news text to summarize.",
      points: ["No content provided.", "Awaiting input.", "Ready when you are."],
      sentiment: "Neutral",
      isOffline: true
    };
  }

  // Clean text and split into sentences
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  const sentences = cleanedText.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);

  if (sentences.length === 0) {
    return {
      headline: "Short Headline Snippet",
      summary: cleanedText.substring(0, 150) + (cleanedText.length > 150 ? "..." : ""),
      points: [cleanedText],
      sentiment: "Neutral",
      isOffline: true
    };
  }

  // Sentiment scoring dictionary
  const positiveWords = /\b(win|success|breakthrough|gain|surge|positive|record|agree|clean|safe|support|up|grow|double|launch|innovate|achieve|approve|boost|profit|recover|celebrate|benefit)\b/gi;
  const negativeWords = /\b(fail|drop|plunge|crash|down|decrease|warning|risk|loss|dead|war|damage|hurt|delay|charge|scandal|arrest|reject|crisis|disaster|threaten|collapse|protest)\b/gi;

  const textLower = cleanedText.toLowerCase();
  const posCount = (textLower.match(positiveWords) || []).length;
  const negCount = (textLower.match(negativeWords) || []).length;

  let sentiment = "Neutral";
  if (posCount > negCount + 1) sentiment = "Positive";
  if (negCount > posCount + 1) sentiment = "Negative";

  // Form a headline: try using first sentence truncated nicely
  let headline = sentences[0];
  if (headline.length > 80) {
    headline = headline.substring(0, 77) + "...";
  }

  // Form a summary: take 1st, middle, and last sentence
  let summary = "";
  if (sentences.length === 1) {
    summary = sentences[0];
  } else if (sentences.length === 2) {
    summary = sentences.join(' ');
  } else {
    summary = `${sentences[0]} ${sentences[Math.floor(sentences.length / 2)]} ${sentences[sentences.length - 1]}`;
  }
  if (summary.length > 250) {
    summary = summary.substring(0, 247) + "...";
  }

  // Form key points (max 5)
  const points = [];
  const maxPoints = Math.min(sentences.length, 5);
  
  // Grade sentences by unique keywords to find the most informative ones
  const gradedSentences = sentences.map((sentence, idx) => {
    let score = 0;
    if (idx === 0) score += 5; // First sentence is always highly important
    if (idx === sentences.length - 1) score += 3; // Last sentence is summarizing
    
    // Score based on metrics, numbers, keywords
    if (/\d+/.test(sentence)) score += 2; // Numbers are factual
    if (/\b(announced|stated|said|reported|revealed|discovered)\b/i.test(sentence)) score += 2;
    score += (sentence.match(/\b\w{6,}\b/g) || []).length * 0.1; // Longer words carry information
    
    return { sentence, score };
  });

  // Sort by score and take top ones, but keep them in original order
  const topSentences = gradedSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPoints)
    .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
    .map(x => x.sentence);

  // Fill up if less than 5 points are available
  while (topSentences.length < 5) {
    topSentences.push("Factual detail analyzed from source article.");
  }

  return {
    headline,
    summary,
    points: topSentences,
    sentiment,
    isOffline: true
  };
}

export default {
  name: 'summarize',
  description: 'AI-powered custom news text summarizer that provides structured headline, summary points, and sentiment scoring using Gemini, Ollama, or Offline Fallback.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The news content to summarize' },
      provider: { type: 'string', enum: ['gemini', 'ollama', 'offline'], description: 'The AI model provider to use' },
      geminiKey: { type: 'string', description: 'User-provided Gemini API key (optional)' },
      ollamaModel: { type: 'string', description: 'Ollama local model name (optional, e.g., llama3)' },
      ollamaUrl: { type: 'string', description: 'Ollama endpoint URL (optional, e.g., http://localhost:11434)' }
    },
    required: ['text']
  },
  
  async handler(args) {
    const { text, provider = 'offline', geminiKey, ollamaModel = 'llama3', ollamaUrl = 'http://localhost:11434' } = args;

    // Check fallback to offline mode if explicit or no key/configs
    if (provider === 'offline') {
      return offlineSummarize(text);
    }

    // --- GEMINI PROVIDER ---
    if (provider === 'gemini') {
      const apiKey = geminiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          error: "Gemini API key is not configured. Please set it in server environment or enter it in Settings.",
          fallback: offlineSummarize(text)
        };
      }

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${SYSTEM_PROMPT}\n\nNews Content to Summarize:\n${text}` }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Gemini API returned status ${response.status}`);
        }

        const data = await response.json();
        const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!outputText) {
          throw new Error("Empty response from Gemini API.");
        }

        const parsed = extractJSON(outputText);
        return { ...parsed, isOffline: false };
      } catch (error) {
        console.error("[MCP summarize] Gemini API Error:", error.message);
        return {
          error: `Gemini API error: ${error.message}`,
          fallback: offlineSummarize(text)
        };
      }
    }

    // --- OLLAMA PROVIDER ---
    if (provider === 'ollama') {
      try {
        const url = `${ollamaUrl.replace(/\/$/, '')}/api/generate`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: `${SYSTEM_PROMPT}\n\nNews Content to Summarize:\n${text}`,
            stream: false,
            format: "json"
          })
        });

        if (!response.ok) {
          throw new Error(`Ollama server returned status ${response.status}`);
        }

        const data = await response.json();
        const outputText = data.response;
        
        if (!outputText) {
          throw new Error("Empty response from Ollama API.");
        }

        const parsed = extractJSON(outputText);
        return { ...parsed, isOffline: false };
      } catch (error) {
        console.error("[MCP summarize] Ollama Local Error:", error.message);
        return {
          error: `Ollama error: Could not reach Ollama server at ${ollamaUrl}. Make sure Ollama is running and model '${ollamaModel}' is pulled. (Error: ${error.message})`,
          fallback: offlineSummarize(text)
        };
      }
    }

    // Fallback default
    return offlineSummarize(text);
  }
};

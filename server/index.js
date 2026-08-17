import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mcpClient from './mcp-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve Frontend Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Standard tools discovery endpoint
app.get('/tools', (req, res) => {
  res.json({
    status: 'success',
    tools: mcpClient.getTools()
  });
});

// Summarize endpoint (POST /summarize)
app.post('/summarize', async (req, res) => {
  const { text, provider, geminiKey, ollamaModel, ollamaUrl } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text content is required for summarization.' });
  }

  // Call the 'summarize' MCP tool
  const result = await mcpClient.call('summarize', {
    text,
    provider,
    geminiKey,
    ollamaModel,
    ollamaUrl
  });

  if (result.error) {
    return res.status(500).json(result);
  }

  res.json(result);
});

// Live news endpoint (GET /news)
app.get('/news', async (req, res) => {
  const category = req.query.category || 'all';

  // Call the 'news' MCP tool
  const result = await mcpClient.call('news', { category });

  if (result.error) {
    return res.status(500).json(result);
  }

  res.json(result);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 QuickNews AI Backend is running!`);
  console.log(`📡 Local server: http://localhost:${PORT}`);
  console.log(`🧠 In-process MCP Engine initialized.`);
  console.log(`=========================================`);
});

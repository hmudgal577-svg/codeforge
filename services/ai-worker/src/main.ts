// ============================================
// AI Worker — BullMQ Consumer for AI Analysis
// ============================================

import { Worker, Job } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

const PROMPTS: Record<string, (code: string, lang: string) => string> = {
  EXPLAIN: (c, l) => `Explain this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
  DEBUG: (c, l) => `Find bugs in this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
  OPTIMIZE: (c, l) => `Optimize this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
  VULNERABILITY: (c, l) => `Security analysis of this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
  COMPLEXITY: (c, l) => `Analyze complexity of this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
  REFACTOR: (c, l) => `Refactor this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
  SUMMARIZE: (c, l) => `Summarize this ${l} code:\n\`\`\`${l}\n${c}\n\`\`\``,
};

const worker = new Worker('ai-analysis', async (job: Job) => {
  const { type, code, language } = job.data;
  const prompt = PROMPTS[type]?.(code, language);
  if (!prompt) throw new Error(`Unknown type: ${type}`);

  if (OPENAI_KEY) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a senior software engineer.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });
    const data = await res.json() as any;
    return { result: data.choices?.[0]?.message?.content || 'No response', tokensUsed: data.usage?.total_tokens };
  }

  // Mock response
  return { result: `## ${type} Analysis\n\nAnalysis of your ${language} code completed successfully.\n\nThis is a mock response. Set OPENAI_API_KEY to enable real AI analysis.`, tokensUsed: 0 };
}, {
  connection: { url: REDIS_URL },
  concurrency: 3,
});

worker.on('completed', (job) => console.log(`✓ AI job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`✗ AI job ${job?.id} failed: ${err.message}`));

console.log(`🧠 CodeForge AI Worker started (model: ${MODEL}, base: ${BASE_URL})`);


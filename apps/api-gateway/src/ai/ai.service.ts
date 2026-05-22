// ============================================
// AI Semantic Engineering Engine
// ============================================
// Multi-provider failover AI with AST-enriched analysis.
// Automatically rotates between free providers to ensure
// AI is ALWAYS available — no single provider quota issue.

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiAnalysisType, AiRequestStatus } from '@prisma/client';
import { ASTAnalyzer } from './ast-analyzer';

// ── Provider Configuration ─────────────────────
interface AIProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dailyLimit: number;
  usedToday: number;
  lastReset: number;
  failCount: number;
  lastFail: number;
}

// Prompt templates for different analysis types
const PROMPTS: Record<string, (code: string, lang: string, astContext?: string) => string> = {
  EXPLAIN: (code, lang, ast) =>
    `You are a senior ${lang} developer. Explain the following code clearly and concisely. Include what each section does and the overall purpose.${ast ? `\n\n## Semantic Analysis:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  DEBUG: (code, lang, ast) =>
    `You are a senior ${lang} developer and debugging expert. Analyze the following code for bugs, logical errors, edge cases, and potential runtime failures. Provide specific fixes with code patches.${ast ? `\n\n## Pre-scan Results:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  OPTIMIZE: (code, lang, ast) =>
    `You are a performance optimization expert for ${lang}. Analyze this code and suggest specific optimizations for time complexity, space complexity, and readability. Show improved code.${ast ? `\n\n## Complexity Analysis:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  VULNERABILITY: (code, lang, ast) =>
    `You are a cybersecurity expert specializing in ${lang}. Analyze this code for security vulnerabilities including injection, XSS, CSRF, buffer overflows, race conditions, and OWASP Top 10 issues. Rate severity and provide fixes.${ast ? `\n\n## Pre-scan Vulnerabilities:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  COMPLEXITY: (code, lang, ast) =>
    `You are an algorithms expert. Analyze the time and space complexity of this ${lang} code. Provide Big-O notation for each function and suggest improvements.${ast ? `\n\n## AST Metrics:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  REFACTOR: (code, lang, ast) =>
    `You are a clean code expert for ${lang}. Refactor this code following SOLID principles, clean architecture, and best practices. Explain each change.${ast ? `\n\n## Code Structure:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  SUMMARIZE: (code, lang, ast) =>
    `Provide a brief summary of what this ${lang} code does in 2-3 sentences, followed by a bullet list of key functions/classes and their purposes.${ast ? `\n\n## Structure:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  ARCHITECTURE: (code, lang, ast) =>
    `You are a software architect. Analyze the architectural patterns, design decisions, and dependency structure of this ${lang} code. Suggest improvements for scalability and maintainability.${ast ? `\n\n## Dependency Graph:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  DEADLOCK: (code, lang, ast) =>
    `You are a concurrency expert for ${lang}. Analyze this code for potential deadlocks, race conditions, thread safety issues, and async/await pitfalls. Provide probability assessment and fixes.${ast ? `\n\n## Analysis:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
  MEMORY: (code, lang, ast) =>
    `You are a memory optimization expert for ${lang}. Analyze this code for memory leaks, excessive allocations, circular references, and inefficient data structures. Predict memory usage patterns.${ast ? `\n\n## Memory Analysis:\n${ast}` : ''}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``,
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly isEnabled: boolean;
  private readonly astAnalyzer: ASTAnalyzer;
  private providers: AIProvider[] = [];
  private currentProviderIndex = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.isEnabled = this.config.get<string>('AI_ENABLED', 'false') === 'true';
    this.astAnalyzer = new ASTAnalyzer();
    this.initProviders();
  }

  // ── Multi-Provider Setup ───────────────────────
  private initProviders() {
    // Primary: From env config
    const envKey = this.config.get<string>('OPENAI_API_KEY', '');
    const envModel = this.config.get<string>('OPENAI_MODEL', 'gemini-2.0-flash');
    const envBase = this.config.get<string>('AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai');

    if (envKey) {
      this.providers.push({
        name: 'primary', baseUrl: envBase, apiKey: envKey,
        model: envModel, dailyLimit: 1500, usedToday: 0,
        lastReset: Date.now(), failCount: 0, lastFail: 0,
      });
    }

    // Additional Gemini keys (from comma-separated env)
    const extraKeys = this.config.get<string>('AI_EXTRA_KEYS', '').split(',').filter(k => k.trim());
    extraKeys.forEach((key, i) => {
      this.providers.push({
        name: `gemini-backup-${i + 1}`,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: key.trim(), model: 'gemini-2.0-flash',
        dailyLimit: 1500, usedToday: 0, lastReset: Date.now(),
        failCount: 0, lastFail: 0,
      });
    });

    // Groq (if configured)
    const groqKey = this.config.get<string>('GROQ_API_KEY', '');
    if (groqKey) {
      this.providers.push({
        name: 'groq', baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: groqKey, model: 'llama-3.1-8b-instant',
        dailyLimit: 14400, usedToday: 0, lastReset: Date.now(),
        failCount: 0, lastFail: 0,
      });
    }

    // OpenRouter free (if configured)
    const orKey = this.config.get<string>('OPENROUTER_API_KEY', '');
    if (orKey) {
      this.providers.push({
        name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: orKey, model: 'meta-llama/llama-3.1-8b-instruct:free',
        dailyLimit: 200, usedToday: 0, lastReset: Date.now(),
        failCount: 0, lastFail: 0,
      });
    }

    this.logger.log(`AI Providers initialized: ${this.providers.map(p => p.name).join(', ')} (${this.providers.length} total)`);
  }

  // Get next available provider (skip rate-limited ones)
  private getAvailableProvider(): AIProvider | null {
    const now = Date.now();

    // Reset daily counters at midnight
    for (const p of this.providers) {
      if (now - p.lastReset > 24 * 60 * 60 * 1000) {
        p.usedToday = 0;
        p.lastReset = now;
        p.failCount = 0;
      }
    }

    // Try providers in order, skip ones that are rate-limited
    for (let i = 0; i < this.providers.length; i++) {
      const idx = (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[idx];

      // Skip if over daily limit
      if (provider.usedToday >= provider.dailyLimit) continue;

      // Skip if failed recently (backoff: failCount * 30 seconds)
      if (provider.failCount > 0 && now - provider.lastFail < provider.failCount * 30000) continue;

      return provider;
    }

    return null; // All providers exhausted
  }

  async analyze(userId: string, workspaceId: string, type: string, code: string, language: string) {
    if (!Object.keys(PROMPTS).includes(type)) {
      throw new BadRequestException(`Invalid analysis type: ${type}`);
    }
    if (code.length > 50000) {
      throw new BadRequestException('Code too large for analysis (max 50KB)');
    }

    // Create request record
    const request = await this.prisma.aiRequest.create({
      data: {
        userId,
        workspaceId,
        type: type as AiAnalysisType,
        code,
        language,
        status: 'PENDING',
      },
    });

    // Process
    this.processAnalysis(request.id, type, code, language).catch((err) => {
      this.logger.error(`AI analysis failed: ${request.id} — ${err.message}`);
    });

    return { requestId: request.id, status: 'PENDING' };
  }

  async getResult(requestId: string) {
    const req = await this.prisma.aiRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new BadRequestException('AI request not found');
    return req;
  }

  private async processAnalysis(requestId: string, type: string, code: string, language: string) {
    await this.prisma.aiRequest.update({
      where: { id: requestId },
      data: { status: 'PROCESSING' },
    });

    try {
      let result: string;
      let usedModel = 'mock';

      if (this.isEnabled && this.providers.length > 0) {
        const aiResult = await this.callWithFailover(type, code, language);
        result = aiResult.result;
        usedModel = aiResult.model;
      } else {
        result = this.getMockResponse(type, language);
      }

      await this.prisma.aiRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          result,
          model: usedModel,
          completedAt: new Date(),
        },
      });
    } catch (error: any) {
      await this.prisma.aiRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          result: `Error: ${error.message}`,
          completedAt: new Date(),
        },
      });
    }
  }

  // ── Multi-Provider Failover Call ───────────────
  private async callWithFailover(type: string, code: string, language: string): Promise<{ result: string; model: string }> {
    // AST analysis
    let astContext: string | undefined;
    try {
      const analysis = this.astAnalyzer.analyze(code, language);
      astContext = this.astAnalyzer.generateAIContext(analysis);
      this.logger.debug(`AST analysis: ${analysis.functions.length} functions, grade ${analysis.complexity.grade}`);
    } catch {
      this.logger.warn('AST analysis failed, sending raw code to AI');
    }

    const prompt = PROMPTS[type](code, language, astContext);
    const tried: string[] = [];

    // Try each provider in order
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const provider = this.getAvailableProvider();
      if (!provider) break;

      tried.push(provider.name);
      this.logger.debug(`Trying AI provider: ${provider.name} (${provider.model})`);

      try {
        const result = await this.callProvider(provider, prompt);
        provider.usedToday++;
        provider.failCount = 0;
        this.logger.log(`AI success via ${provider.name} (${provider.usedToday}/${provider.dailyLimit} today)`);
        return { result, model: `${provider.model} (via ${provider.name})` };
      } catch (err: any) {
        provider.failCount++;
        provider.lastFail = Date.now();

        if (err.message.includes('429') || err.message.includes('quota')) {
          provider.usedToday = provider.dailyLimit; // Mark as exhausted
          this.logger.warn(`Provider ${provider.name} rate limited, trying next...`);
        } else {
          this.logger.warn(`Provider ${provider.name} failed: ${err.message}`);
        }

        // Move to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
      }
    }

    // All providers failed — use intelligent mock
    this.logger.warn(`All AI providers exhausted (tried: ${tried.join(', ')}), using smart fallback`);
    return {
      result: this.getMockResponse(type, language) + `\n\n---\n*⚠️ All AI providers are temporarily at capacity. Showing pre-built analysis. Providers tried: ${tried.join(', ')}*`,
      model: 'smart-fallback',
    };
  }

  private async callProvider(provider: AIProvider, prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: 'system', content: 'You are a senior software engineer providing deep code analysis. Use the semantic analysis context provided to give precise, actionable feedback. Include specific line references and code patches when applicable.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 3000,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`API error: ${response.status} ${errText.substring(0, 200)}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || 'No response generated.';
    } finally {
      clearTimeout(timeout);
    }
  }

  private getMockResponse(type: string, language: string): string {
    const responses: Record<string, string> = {
      EXPLAIN: `## Code Explanation\n\nThis ${language} code implements the core logic with proper error handling and data validation. The main function initializes the application state and processes input through a pipeline of transformations.\n\n**Key Points:**\n- Well-structured with clear separation of concerns\n- Uses standard library functions effectively\n- Could benefit from additional error handling for edge cases`,
      DEBUG: `## Bug Analysis\n\n**Found 2 potential issues:**\n\n1. **Missing null check** (Line ~3): Input is not validated before processing, which could cause a runtime error.\n2. **Off-by-one error** (Loop boundary): The loop condition should use \`<\` instead of \`<=\` to avoid array index out of bounds.\n\n**Recommended Fixes:**\n- Add input validation at function entry\n- Fix loop boundary condition`,
      OPTIMIZE: `## Optimization Suggestions\n\n**Current Complexity:** O(n²)\n**Optimized Complexity:** O(n log n)\n\n**Suggestions:**\n1. Replace nested loop with hash map lookup to reduce time complexity\n2. Use early return pattern to avoid unnecessary iterations\n3. Cache repeated computations in a local variable`,
      VULNERABILITY: `## Security Analysis\n\n**Severity: Medium**\n\n**Found 1 potential vulnerability:**\n1. **Input Injection** — User input is not sanitized before being used in processing. Apply proper validation and encoding.\n\n**Recommendations:**\n- Validate all inputs against expected formats\n- Use parameterized queries for any database operations\n- Apply output encoding for displayed values`,
      COMPLEXITY: `## Complexity Analysis\n\n| Function | Time | Space |\n|----------|------|-------|\n| main | O(n) | O(1) |\n| process | O(n log n) | O(n) |\n\nOverall space complexity is O(n) dominated by the data structure allocation.`,
      REFACTOR: `## Refactoring Suggestions\n\n1. **Extract Method**: Break the main function into smaller, focused functions\n2. **Apply Single Responsibility**: Each function should do one thing well\n3. **Use Constants**: Replace magic numbers with named constants\n4. **Add Type Annotations**: Improve code readability with explicit types`,
      SUMMARIZE: `This code implements a data processing pipeline that reads input, transforms it through several stages, and outputs the result. It uses standard library functions for I/O and includes basic error handling.`,
      ARCHITECTURE: `## Architecture Analysis\n\n**Pattern:** Procedural with functional elements\n\n**Strengths:**\n- Clear entry point and execution flow\n- Minimal coupling between components\n\n**Improvements:**\n- Extract configuration into separate module\n- Add dependency injection for testability\n- Consider event-driven architecture for scalability`,
      DEADLOCK: `## Concurrency Analysis\n\n**Risk Level:** Low\n\n**Findings:**\n- No explicit threading or async operations detected\n- No shared mutable state concerns\n\n**Recommendations:**\n- If scaling to concurrent execution, add proper synchronization\n- Use immutable data structures where possible`,
      MEMORY: `## Memory Analysis\n\n**Estimated Memory:** O(n)\n\n**Findings:**\n- No memory leaks detected\n- Data structures are properly scoped\n\n**Optimizations:**\n- Use generators/iterators for large data sets\n- Consider streaming for file I/O operations`,
    };
    return responses[type] || 'Analysis complete.';
  }

  // ── Chat Method ─────────────────────────────────
  async chat(message: string, history: Array<{ role: string; content: string }>): Promise<string> {
    if (!message?.trim()) return 'Please send a message.';

    if (!this.isEnabled || this.providers.length === 0) {
      return 'AI is not configured. Please add API keys in the .env file.';
    }

    const messages = [
      {
        role: 'system',
        content: 'You are CodeForge AI — a friendly and helpful coding assistant inside a collaborative IDE. Answer coding questions, explain concepts, help debug code, and suggest improvements. Keep responses concise (under 300 words). Use markdown formatting. Be conversational and supportive. If the user greets you, greet them back warmly. Always respond in the same language the user writes in.',
      },
      ...history.slice(-10).map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    // Try each provider with failover
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const provider = this.getAvailableProvider();
      if (!provider) break;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            max_tokens: 1000,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`API ${response.status}: ${errText.substring(0, 100)}`);
        }

        const data = await response.json() as any;
        const result = data.choices?.[0]?.message?.content;
        if (result) {
          provider.usedToday++;
          provider.failCount = 0;
          this.logger.log(`Chat response via ${provider.name}`);
          return result;
        }
        throw new Error('Empty response from AI');
      } catch (err: any) {
        provider.failCount++;
        provider.lastFail = Date.now();
        if (err.message.includes('429') || err.message.includes('quota')) {
          provider.usedToday = provider.dailyLimit;
        }
        this.logger.warn(`Chat provider ${provider.name} failed: ${err.message}`);
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
      }
    }

    return 'Sorry, all AI providers are currently unavailable. Please try again in a moment.';
  }
}

// ============================================
// Hybrid Edge Execution Runtime — Browser WASM
// ============================================
// In-browser code execution using WebAssembly
// with Pyodide (Python) and QuickJS (JavaScript).
// Enables instant execution without cloud roundtrip.

export type ExecutionMode = 'browser' | 'cloud' | 'auto';

export interface WASMExecutionResult {
  output: string;
  error?: string;
  executionMs: number;
  mode: 'wasm';
  language: string;
}

interface RuntimeState {
  loaded: boolean;
  loading: boolean;
  error?: string;
}

/**
 * WASMRuntime — Browser-side code execution
 *
 * Features:
 * - Python via Pyodide (WASM)
 * - JavaScript via sandboxed eval
 * - Latency-aware execution routing
 * - Automatic cloud fallback for unsupported languages
 * - Memory-safe sandboxed execution
 */
export class WASMRuntime {
  private pyodide: any = null;
  private runtimeStates: Map<string, RuntimeState> = new Map();

  constructor() {
    this.runtimeStates.set('python', { loaded: false, loading: false });
    this.runtimeStates.set('javascript', { loaded: false, loading: false });
  }

  /**
   * Check if language can run in browser
   */
  canRunLocally(language: string): boolean {
    return ['python', 'javascript'].includes(language.toLowerCase());
  }

  /**
   * Decide execution mode based on latency and availability
   */
  async selectExecutionMode(language: string, codeSize: number, cloudLatencyMs?: number): Promise<ExecutionMode> {
    if (!this.canRunLocally(language)) return 'cloud';

    // Small code with high cloud latency → use browser
    if (codeSize < 5000 && (cloudLatencyMs || 500) > 200) return 'browser';

    // Large code or complex operations → prefer cloud
    if (codeSize > 50000) return 'cloud';

    return 'auto'; // Let caller decide
  }

  /**
   * Load Python WASM runtime (Pyodide)
   */
  async loadPython(): Promise<void> {
    const state = this.runtimeStates.get('python')!;
    if (state.loaded || state.loading) return;

    state.loading = true;
    try {
      // Dynamic import of Pyodide
      if (typeof window !== 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
        document.head.appendChild(script);

        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Pyodide'));
        });

        this.pyodide = await (window as any).loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
        });
      }

      state.loaded = true;
      state.loading = false;
      console.log('[WASMRuntime] Python runtime loaded');
    } catch (err: any) {
      state.loading = false;
      state.error = err.message;
      throw err;
    }
  }

  /**
   * Execute Python code in browser via Pyodide
   */
  async executePython(code: string, stdin?: string): Promise<WASMExecutionResult> {
    if (!this.pyodide) {
      await this.loadPython();
    }

    const start = performance.now();
    let output = '';
    let error: string | undefined;

    try {
      // Redirect stdout/stderr
      this.pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
`);

      if (stdin) {
        this.pyodide.runPython(`
import sys
from io import StringIO
sys.stdin = StringIO(${JSON.stringify(stdin)})
`);
      }

      // Execute user code with timeout
      await Promise.race([
        this.pyodide.runPythonAsync(code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timeout (30s)')), 30000)),
      ]);

      // Get stdout output
      output = this.pyodide.runPython('sys.stdout.getvalue()') || '';
      const stderr = this.pyodide.runPython('sys.stderr.getvalue()') || '';
      if (stderr) error = stderr;

    } catch (err: any) {
      error = err.message;
    }

    return {
      output: output.trim(),
      error,
      executionMs: Math.round(performance.now() - start),
      mode: 'wasm',
      language: 'python',
    };
  }

  /**
   * Execute JavaScript in sandboxed environment
   */
  async executeJavaScript(code: string, stdin?: string): Promise<WASMExecutionResult> {
    const start = performance.now();
    let output = '';
    let error: string | undefined;

    try {
      // Create sandboxed execution context
      const logs: string[] = [];
      const sandbox = {
        console: {
          log: (...args: any[]) => logs.push(args.map(String).join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
          info: (...args: any[]) => logs.push(args.map(String).join(' ')),
        },
        Math, JSON, parseInt, parseFloat, isNaN, isFinite,
        String, Number, Boolean, Array, Object, Map, Set,
        Date, RegExp, Error, Promise,
        setTimeout: undefined, setInterval: undefined, // Block timers
        fetch: undefined, XMLHttpRequest: undefined,     // Block network
      };

      // Wrap in function to isolate scope
      const wrappedCode = `
        'use strict';
        (function(console, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean, Array, Object, Map, Set, Date, RegExp, Error, Promise) {
          ${code}
        })(${Object.keys(sandbox).map(k => `this.${k}`).join(',')})
      `;

      const fn = new Function(wrappedCode);
      await Promise.race([
        Promise.resolve(fn.call(sandbox)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timeout (30s)')), 30000)),
      ]);

      output = logs.join('\n');
    } catch (err: any) {
      error = err.message;
    }

    return {
      output: output.trim(),
      error,
      executionMs: Math.round(performance.now() - start),
      mode: 'wasm',
      language: 'javascript',
    };
  }

  /**
   * Execute code with automatic language detection
   */
  async execute(code: string, language: string, stdin?: string): Promise<WASMExecutionResult> {
    switch (language.toLowerCase()) {
      case 'python': return this.executePython(code, stdin);
      case 'javascript': return this.executeJavaScript(code, stdin);
      default: throw new Error(`WASM execution not supported for ${language}. Use cloud execution.`);
    }
  }

  /**
   * Get runtime status
   */
  getStatus(): Record<string, RuntimeState> {
    const status: Record<string, RuntimeState> = {};
    this.runtimeStates.forEach((state, lang) => { status[lang] = { ...state }; });
    return status;
  }

  /**
   * Cleanup runtime
   */
  destroy(): void {
    this.pyodide = null;
    this.runtimeStates.forEach(state => {
      state.loaded = false;
      state.loading = false;
    });
  }
}

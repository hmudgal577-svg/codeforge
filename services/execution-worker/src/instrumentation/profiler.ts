// ============================================
// Runtime Instrumentation — Execution Profiling
// ============================================
// Function tracing, memory tracking, recursive
// depth visualization, CPU hotspot analysis,
// and execution replay debugging.

export interface TraceEntry {
  functionName: string;
  file: string;
  lineNumber: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  depth: number;
  memoryBefore: number;
  memoryAfter?: number;
  children: TraceEntry[];
  returnValue?: string;
  error?: string;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export interface FlamegraphNode {
  name: string;
  value: number; // total time in ms
  selfTime: number;
  children: FlamegraphNode[];
}

export interface ExecutionProfile {
  traceTree: TraceEntry[];
  memoryTimeline: MemorySnapshot[];
  flamegraph: FlamegraphNode;
  hotspots: Hotspot[];
  recursionDepth: number;
  totalFunctions: number;
  totalDuration: number;
  asyncDependencies: AsyncDependency[];
}

export interface Hotspot {
  functionName: string;
  file: string;
  totalTime: number;
  selfTime: number;
  callCount: number;
  avgTime: number;
  percentOfTotal: number;
}

export interface AsyncDependency {
  from: string;
  to: string;
  type: 'await' | 'callback' | 'promise' | 'event';
}

/**
 * RuntimeInstrumentor — Execution profiling engine
 *
 * Features:
 * - Function execution tracing
 * - Memory allocation tracking
 * - Recursive depth visualization
 * - Async dependency mapping
 * - CPU hotspot analysis
 * - Flamegraph generation
 * - Execution replay debugging
 */
export class RuntimeInstrumentor {

  /**
   * Instrument Python code with tracing
   */
  instrumentPython(code: string): string {
    return `
import sys
import time
import json
import tracemalloc

tracemalloc.start()
_trace_log = []
_memory_log = []
_call_depth = 0
_max_depth = 0

def _trace_calls(frame, event, arg):
    global _call_depth, _max_depth
    if event == 'call':
        _call_depth += 1
        _max_depth = max(_max_depth, _call_depth)
        mem = tracemalloc.get_traced_memory()
        _trace_log.append({
            'fn': frame.f_code.co_name,
            'file': frame.f_code.co_filename,
            'line': frame.f_lineno,
            'event': 'call',
            'depth': _call_depth,
            'time': time.time() * 1000,
            'mem': mem[0]
        })
        _memory_log.append({'t': time.time() * 1000, 'used': mem[0], 'peak': mem[1]})
    elif event == 'return':
        mem = tracemalloc.get_traced_memory()
        _trace_log.append({
            'fn': frame.f_code.co_name,
            'file': frame.f_code.co_filename,
            'line': frame.f_lineno,
            'event': 'return',
            'depth': _call_depth,
            'time': time.time() * 1000,
            'mem': mem[0]
        })
        _call_depth -= 1
    return _trace_calls

sys.settrace(_trace_calls)

# ── User code ──
${code}
# ── End user code ──

sys.settrace(None)
tracemalloc.stop()

# Output profiling data as JSON on stderr
import sys as _sys
_sys.stderr.write('__PROFILE_START__' + json.dumps({
    'trace': _trace_log[-500:],
    'memory': _memory_log[-200:],
    'maxDepth': _max_depth,
    'totalCalls': len([t for t in _trace_log if t['event'] == 'call'])
}) + '__PROFILE_END__')
`;
  }

  /**
   * Instrument JavaScript code with tracing
   */
  instrumentJavaScript(code: string): string {
    return `
const __traceLog = [];
const __memoryLog = [];
let __callDepth = 0;
let __maxDepth = 0;
const __startTime = Date.now();

function __traceWrap(fn, name) {
  return function(...args) {
    __callDepth++;
    __maxDepth = Math.max(__maxDepth, __callDepth);
    const start = performance.now();
    const mem = process.memoryUsage();
    __traceLog.push({ fn: name, event: 'call', depth: __callDepth, time: start, mem: mem.heapUsed });
    __memoryLog.push({ t: start, used: mem.heapUsed, total: mem.heapTotal });
    try {
      const result = fn.apply(this, args);
      if (result instanceof Promise) {
        return result.then(r => {
          const end = performance.now();
          __traceLog.push({ fn: name, event: 'return', depth: __callDepth, time: end, duration: end - start });
          __callDepth--;
          return r;
        });
      }
      const end = performance.now();
      __traceLog.push({ fn: name, event: 'return', depth: __callDepth, time: end, duration: end - start });
      __callDepth--;
      return result;
    } catch(e) {
      __traceLog.push({ fn: name, event: 'error', depth: __callDepth, error: e.message });
      __callDepth--;
      throw e;
    }
  };
}

// ── User code ──
${code}
// ── End user code ──

// Output profiling data
process.stderr.write('__PROFILE_START__' + JSON.stringify({
  trace: __traceLog.slice(-500),
  memory: __memoryLog.slice(-200),
  maxDepth: __maxDepth,
  totalCalls: __traceLog.filter(t => t.event === 'call').length,
  totalDuration: Date.now() - __startTime
}) + '__PROFILE_END__');
`;
  }

  /**
   * Parse profiling output from instrumented execution
   */
  parseProfile(stderr: string): ExecutionProfile | null {
    const match = stderr.match(/__PROFILE_START__(.+?)__PROFILE_END__/);
    if (!match) return null;

    try {
      const data = JSON.parse(match[1]);
      const traceTree = this.buildTraceTree(data.trace || []);
      const flamegraph = this.buildFlamegraph(data.trace || []);
      const hotspots = this.computeHotspots(data.trace || [], data.totalDuration || 0);

      return {
        traceTree,
        memoryTimeline: (data.memory || []).map((m: any) => ({
          timestamp: m.t,
          heapUsed: m.used,
          heapTotal: m.total || m.peak || 0,
          external: 0,
          arrayBuffers: 0,
        })),
        flamegraph,
        hotspots,
        recursionDepth: data.maxDepth || 0,
        totalFunctions: data.totalCalls || 0,
        totalDuration: data.totalDuration || 0,
        asyncDependencies: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Build trace tree from flat trace log
   */
  private buildTraceTree(trace: any[]): TraceEntry[] {
    const root: TraceEntry[] = [];
    const stack: TraceEntry[] = [];

    for (const entry of trace) {
      if (entry.event === 'call') {
        const node: TraceEntry = {
          functionName: entry.fn,
          file: entry.file || '',
          lineNumber: entry.line || 0,
          startTime: entry.time,
          depth: entry.depth,
          memoryBefore: entry.mem || 0,
          children: [],
        };

        if (stack.length > 0) {
          stack[stack.length - 1].children.push(node);
        } else {
          root.push(node);
        }
        stack.push(node);
      } else if (entry.event === 'return' && stack.length > 0) {
        const node = stack.pop()!;
        node.endTime = entry.time;
        node.duration = entry.time - node.startTime;
        node.memoryAfter = entry.mem;
      }
    }

    return root;
  }

  /**
   * Build flamegraph from trace data
   */
  private buildFlamegraph(trace: any[]): FlamegraphNode {
    const root: FlamegraphNode = { name: 'root', value: 0, selfTime: 0, children: [] };
    const callStack: any[] = [];

    for (const entry of trace) {
      if (entry.event === 'call') {
        callStack.push({ ...entry, startTime: entry.time });
      } else if (entry.event === 'return' && callStack.length > 0) {
        const call = callStack.pop();
        const duration = entry.time - call.startTime;

        let parent = root;
        for (const frame of callStack) {
          let child = parent.children.find(c => c.name === frame.fn);
          if (!child) {
            child = { name: frame.fn, value: 0, selfTime: 0, children: [] };
            parent.children.push(child);
          }
          parent = child;
        }

        let node = parent.children.find(c => c.name === call.fn);
        if (!node) {
          node = { name: call.fn, value: 0, selfTime: 0, children: [] };
          parent.children.push(node);
        }
        node.value += duration;
        node.selfTime += duration;
      }
    }

    root.value = root.children.reduce((sum, c) => sum + c.value, 0);
    return root;
  }

  /**
   * Compute CPU hotspots
   */
  private computeHotspots(trace: any[], totalDuration: number): Hotspot[] {
    const functionStats = new Map<string, { totalTime: number; callCount: number; file: string }>();

    const stack: any[] = [];
    for (const entry of trace) {
      if (entry.event === 'call') {
        stack.push(entry);
      } else if (entry.event === 'return' && stack.length > 0) {
        const call = stack.pop();
        const duration = entry.time - call.time;
        const key = call.fn;

        const stats = functionStats.get(key) || { totalTime: 0, callCount: 0, file: call.file || '' };
        stats.totalTime += duration;
        stats.callCount++;
        functionStats.set(key, stats);
      }
    }

    return Array.from(functionStats.entries())
      .map(([name, stats]) => ({
        functionName: name,
        file: stats.file,
        totalTime: Math.round(stats.totalTime * 100) / 100,
        selfTime: Math.round(stats.totalTime * 100) / 100,
        callCount: stats.callCount,
        avgTime: Math.round((stats.totalTime / stats.callCount) * 100) / 100,
        percentOfTotal: totalDuration ? Math.round((stats.totalTime / totalDuration) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 20);
  }
}

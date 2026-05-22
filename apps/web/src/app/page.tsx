'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Code2, Zap, Shield, Users, Brain, Terminal, ArrowRight, Sparkles } from 'lucide-react';

const features = [
  { icon: Code2,     title: 'Monaco Editor',        desc: 'VS Code-grade editing with IntelliSense and syntax highlighting' },
  { icon: Users,     title: 'Realtime Collaboration', desc: 'Edit code simultaneously with live cursors and presence' },
  { icon: Terminal,  title: 'Secure Execution',      desc: 'Run code in isolated Docker containers with resource limits' },
  { icon: Brain,     title: 'AI Assistant',           desc: 'Debug, optimize, and analyze code with AI-powered insights' },
  { icon: Shield,    title: 'Enterprise Security',   desc: 'JWT auth, RBAC, sandboxed execution, and audit logging' },
  { icon: Zap,       title: 'Blazing Fast',          desc: 'Distributed architecture with Redis caching and WebSocket sync' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-950 overflow-hidden">
      {/* ── Navbar ─────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              CodeForge
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-zinc-400 hover:text-white transition-colors px-4 py-2">
              Sign In
            </Link>
            <Link href="/register" className="btn-primary flex items-center gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────── */}
      <section className="pt-32 pb-20 px-6 relative">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-600/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm mb-8">
              <Sparkles className="w-4 h-4" />
              AI-Powered Cloud Development Environment
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
              <span className="bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">
                Code Together.
              </span>
              <br />
              <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
                Build Faster.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              A production-grade cloud IDE with realtime collaboration, secure sandboxed execution,
              and AI-assisted development — all in your browser.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="btn-primary text-lg px-8 py-3 flex items-center gap-2">
                Start Coding Free <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/login" className="btn-secondary text-lg px-8 py-3">
                Sign In
              </Link>
            </div>
          </motion.div>

          {/* Editor Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-16 rounded-xl border border-surface-700 bg-surface-900 overflow-hidden shadow-2xl shadow-brand-600/5"
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-800 border-b border-surface-700">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-zinc-500 ml-2 font-mono">main.py — CodeForge</span>
            </div>
            <div className="p-6 font-mono text-sm text-left leading-relaxed">
              <div><span className="text-purple-400">from</span> <span className="text-green-400">fastapi</span> <span className="text-purple-400">import</span> <span className="text-yellow-400">FastAPI</span></div>
              <div className="mt-1"><span className="text-purple-400">from</span> <span className="text-green-400">pydantic</span> <span className="text-purple-400">import</span> <span className="text-yellow-400">BaseModel</span></div>
              <div className="mt-3"><span className="text-zinc-500"># AI-assisted: This endpoint handles user creation</span></div>
              <div><span className="text-blue-400">app</span> = <span className="text-yellow-400">FastAPI</span>()</div>
              <div className="mt-3"><span className="text-purple-400">class</span> <span className="text-yellow-400">User</span>(<span className="text-yellow-400">BaseModel</span>):</div>
              <div className="pl-8"><span className="text-blue-400">name</span>: <span className="text-green-400">str</span></div>
              <div className="pl-8"><span className="text-blue-400">email</span>: <span className="text-green-400">str</span></div>
              <div className="mt-3"><span className="text-zinc-500">@app.post</span>(<span className="text-orange-400">&quot;/users&quot;</span>)</div>
              <div><span className="text-purple-400">async def</span> <span className="text-blue-400">create_user</span>(<span className="text-orange-400">user</span>: <span className="text-yellow-400">User</span>):</div>
              <div className="pl-8"><span className="text-purple-400">return</span> {`{`}<span className="text-orange-400">&quot;message&quot;</span>: <span className="text-orange-400">f&quot;Created {`{user.name}`}&quot;</span>{`}`}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block w-2 h-5 bg-brand-500 animate-pulse" />
                <span className="text-zinc-600 text-xs">2 users editing</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ───────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything You Need to Build
          </h2>
          <p className="text-zinc-500 text-center mb-16 max-w-xl mx-auto">
            Production-grade tools for modern development teams
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card group cursor-default"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center mb-4 group-hover:bg-brand-500/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="border-t border-surface-800 py-10 px-6 text-center text-zinc-600 text-sm">
        <p>&copy; {new Date().getFullYear()} CodeForge. Built with NestJS, Next.js, Docker & AI.</p>
      </footer>
    </div>
  );
}

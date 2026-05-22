import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { Providers } from '@/components/providers';
import { ErrorBoundary } from '@/components/error-boundary';
import './globals.css';

export const metadata: Metadata = {
  title: 'CodeForge — AI-Powered Cloud IDE',
  description: 'Collaborative cloud IDE with secure code execution, AI analysis, and realtime editing.',
  keywords: ['cloud IDE', 'code editor', 'collaborative coding', 'AI coding assistant'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-surface-950 text-white antialiased" suppressHydrationWarning>
        <Providers>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: '!bg-surface-800 !text-white !border !border-surface-700',
              duration: 4000,
            }}
          />
        </Providers>
      </body>
    </html>
  );
}

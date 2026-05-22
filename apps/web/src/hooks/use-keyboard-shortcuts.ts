'use client';
import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  onSave?: () => void;
  onRun?: () => void;
  onToggleSidebar?: () => void;
  onToggleConsole?: () => void;
  onToggleAiPanel?: () => void;
}

export function useKeyboardShortcuts(config: ShortcutConfig) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key === 's') {
      e.preventDefault();
      config.onSave?.();
    }

    if (isCtrl && e.key === 'Enter') {
      e.preventDefault();
      config.onRun?.();
    }

    if (isCtrl && e.key === 'b') {
      e.preventDefault();
      config.onToggleSidebar?.();
    }

    if (isCtrl && e.key === 'j') {
      e.preventDefault();
      config.onToggleConsole?.();
    }

    if (isCtrl && e.key === '/') {
      e.preventDefault();
      config.onToggleAiPanel?.();
    }
  }, [config]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

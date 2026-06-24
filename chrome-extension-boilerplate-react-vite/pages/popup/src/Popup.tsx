import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, LoadingSpinner, ErrorDisplay } from '@extension/ui';
import { useState } from 'react';

const BACKEND_URL = "https://productivity-companion-backend.onrender.com";

type View = 'intake' | 'loading' | 'result';

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [view, setView] = useState<View>('intake');
  const [task, setTask] = useState('');
  const [deadline, setDeadline] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bg = isLight ? 'bg-slate-50' : 'bg-gray-900';
  const card = isLight ? 'bg-white border border-gray-200' : 'bg-gray-800 border border-gray-700';
  const text = isLight ? 'text-gray-900' : 'text-gray-100';
  const subtext = isLight ? 'text-gray-500' : 'text-gray-400';
  const input = isLight
    ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
    : 'bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-400';

  const handleSubmit = async () => {
    if (!task.trim() || !deadline) return;
    setView('loading');
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/parse-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, deadline }),
      });
      const data = await res.json();
      setResult(data.battlePlan);
      setView('result');
    } catch (err) {
      setError('Failed to connect. Try again.');
      setView('intake');
    }
  };

  const reset = () => {
    setTask('');
    setDeadline('');
    setResult(null);
    setError(null);
    setView('intake');
  };

  return (
    <div className={cn(bg, 'w-80 min-h-48 p-4 font-sans')}>

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🎯</span>
        <div>
          <h1 className={cn('text-sm font-bold leading-tight', text)}>Productivity Companion</h1>
          <p className={cn('text-xs', subtext)}>Beat your deadlines.</p>
        </div>
      </div>

      {/* Intake view */}
      {view === 'intake' && (
        <div className={cn('rounded-xl p-3', card)}>
          <label className={cn('block text-xs font-medium mb-1', subtext)}>What do you need to do?</label>
          <textarea
            className={cn('w-full rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors', input)}
            rows={3}
            placeholder="e.g. Submit Atlassian internship application"
            value={task}
            onChange={e => setTask(e.target.value)}
          />

          <label className={cn('block text-xs font-medium mt-3 mb-1', subtext)}>Deadline</label>
          <input
            type="datetime-local"
            className={cn('w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors', input)}
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
          />

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!task.trim() || !deadline}
            className={cn(
              'mt-3 w-full rounded-lg py-2 text-sm font-bold transition-all',
              task.trim() && deadline
                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm hover:scale-[1.02]'
                : 'bg-gray-300 text-gray-400 cursor-not-allowed',
            )}>
            Build my battle plan →
          </button>
        </div>
      )}

      {/* Loading view */}
      {view === 'loading' && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className={cn('text-xs', subtext)}>Gemini is building your plan...</p>
        </div>
      )}

      {/* Result view */}
      {view === 'result' && result && (
        <div>
          <div className={cn('rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap', card, text)}>
            {result}
          </div>
          <button
            onClick={reset}
            className={cn('mt-3 w-full rounded-lg py-2 text-xs font-medium transition-colors',
              isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            )}>
            ← Add another task
          </button>
        </div>
      )}

    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

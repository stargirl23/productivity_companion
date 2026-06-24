import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, LoadingSpinner, ErrorDisplay } from '@extension/ui';
import { useState } from 'react';

const BACKEND_URL = "https://productivity-companion-backend.onrender.com";

type View = 'intake' | 'loading' | 'explicit' | 'one-off' | 'continuous' | 'battle-plan';

interface Classification {
  execution_type: 'explicit' | 'one-off' | 'continuous';
  priority_score: number;
  priority_reason: string;
  event_time: string | null;
  duration_minutes: number | null;
  daily_minutes: number | null;
  frequency_per_week: number | null;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'text-red-500' },
  2: { label: 'High', color: 'text-orange-500' },
  3: { label: 'Medium', color: 'text-yellow-500' },
  4: { label: 'Low', color: 'text-green-500' },
  5: { label: 'Backburner', color: 'text-gray-400' },
};

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [view, setView] = useState<View>('intake');
  const [task, setTask] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [classification, setClassification] = useState<Classification | null>(null);
  const [battlePlan, setBattlePlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Theme helpers
  const bg = isLight ? 'bg-slate-50' : 'bg-gray-900';
  const card = isLight ? 'bg-white border border-gray-200' : 'bg-gray-800 border border-gray-700';
  const text = isLight ? 'text-gray-900' : 'text-gray-100';
  const subtext = isLight ? 'text-gray-500' : 'text-gray-400';
  const inputCn = isLight
    ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
    : 'bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-400';

  const reset = () => {
    setTask('');
    setTargetDate('');
    setClassification(null);
    setBattlePlan(null);
    setError(null);
    setView('intake');
  };

  // --- Schedule It flow ---
  const handleSchedule = async () => {
    if (!task.trim() || !targetDate) return;
    setView('loading');
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/classify-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, targetDate }),
      });
      const data: Classification = await res.json();
      setClassification(data);
      setView(data.execution_type);
    } catch {
      setError('Failed to connect. Try again.');
      setView('intake');
    }
  };

  // --- Build Plan flow ---
  const handleBuildPlan = async () => {
    if (!task.trim() || !targetDate) return;
    setView('loading');
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/parse-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, deadline: targetDate }),
      });
      const data = await res.json();
      setBattlePlan(data.battlePlan);
      setView('battle-plan');
    } catch {
      setError('Failed to connect. Try again.');
      setView('intake');
    }
  };

  const priorityInfo = classification ? PRIORITY_LABELS[classification.priority_score] : null;

  // --- Priority badge ---
  const PriorityBadge = () =>
    classification && priorityInfo ? (
      <div className={cn('flex items-center gap-1 text-xs font-medium mt-2', priorityInfo.color)}>
        <span>●</span>
        <span>Priority {classification.priority_score} — {priorityInfo.label}</span>
        <span className={cn('ml-1 font-normal', subtext)}>· {classification.priority_reason}</span>
      </div>
    ) : null;

  // --- Back button ---
  const BackButton = () => (
    <button
      onClick={reset}
      className={cn('mt-3 w-full rounded-lg py-2 text-xs font-medium transition-colors',
        isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
      )}>
      ← Add another task
    </button>
  );

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

      {/* INTAKE VIEW */}
      {view === 'intake' && (
        <div className={cn('rounded-xl p-3', card)}>
          <label className={cn('block text-xs font-medium mb-1', subtext)}>What do you need to do?</label>
          <textarea
            className={cn('w-full rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors', inputCn)}
            rows={3}
            placeholder="e.g. Interview at Google tomorrow 10am"
            value={task}
            onChange={e => setTask(e.target.value)}
          />

          <label className={cn('block text-xs font-medium mt-3 mb-1', subtext)}>Target date</label>
          <input
            type="datetime-local"
            className={cn('w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors', inputCn)}
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
          />

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

          {/* Two CTAs */}
          <div className="flex gap-2 mt-3">
            {/* Primary: Schedule It */}
            <button
              onClick={handleSchedule}
              disabled={!task.trim() || !targetDate}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-bold transition-all',
                task.trim() && targetDate
                  ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm hover:scale-[1.02]'
                  : 'bg-gray-300 text-gray-400 cursor-not-allowed',
              )}>
              Schedule It
            </button>

            {/* Secondary: Build Plan */}
            <button
              onClick={handleBuildPlan}
              disabled={!task.trim() || !targetDate}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium border transition-all',
                task.trim() && targetDate
                  ? isLight
                    ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-200 text-gray-400 cursor-not-allowed',
              )}>
              Build Plan
            </button>
          </div>
        </div>
      )}

      {/* LOADING VIEW */}
      {view === 'loading' && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className={cn('text-xs', subtext)}>Thinking...</p>
        </div>
      )}

      {/* BUCKET 1: EXPLICIT EVENT */}
      {view === 'explicit' && classification && (
        <div className={cn('rounded-xl p-3', card)}>
          <p className={cn('text-xs font-semibold mb-1', subtext)}>📅 Event detected</p>
          <p className={cn('text-sm font-bold', text)}>{task}</p>
          <p className={cn('text-xs mt-1', subtext)}>
            {classification.event_time
              ? new Date(classification.event_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
              : new Date(targetDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <PriorityBadge />
          <button className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
            Confirm & Add to Calendar
          </button>
          <BackButton />
        </div>
      )}

      {/* BUCKET 2: ONE-OFF TASK */}
      {view === 'one-off' && classification && (
        <div className={cn('rounded-xl p-3', card)}>
          <p className={cn('text-xs font-semibold mb-1', subtext)}>✅ One-off task</p>
          <p className={cn('text-sm font-bold', text)}>{task}</p>
          <p className={cn('text-xs mt-1', subtext)}>
            Due {new Date(targetDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            {classification.duration_minutes ? ` · ~${classification.duration_minutes} min` : ''}
          </p>
          <PriorityBadge />
          <button className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
            Find Free Slots →
          </button>
          <BackButton />
        </div>
      )}

      {/* BUCKET 3: CONTINUOUS EFFORT */}
      {view === 'continuous' && classification && (
        <div className={cn('rounded-xl p-3', card)}>
          <p className={cn('text-xs font-semibold mb-1', subtext)}>🔄 Ongoing effort</p>
          <p className={cn('text-sm font-bold', text)}>{task}</p>
          <p className={cn('text-xs mt-1', subtext)}>
            Target: {new Date(targetDate).toLocaleDateString([], { dateStyle: 'medium' })}
          </p>
          <div className={cn('mt-3 rounded-lg p-2 text-xs', isLight ? 'bg-slate-100' : 'bg-gray-700')}>
            <p className={cn('font-medium mb-1', text)}>AI suggests:</p>
            <p className={subtext}>
              {classification.daily_minutes} min/day · {classification.frequency_per_week}x per week
            </p>
          </div>
          <PriorityBadge />
          <button className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
            Find Recurring Slots →
          </button>
          <BackButton />
        </div>
      )}

      {/* BATTLE PLAN VIEW */}
      {view === 'battle-plan' && battlePlan && (
        <div>
          <div className={cn('rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap', card, text)}>
            {battlePlan}
          </div>
          <button className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
            Schedule First Step →
          </button>
          <BackButton />
        </div>
      )}

    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, LoadingSpinner, ErrorDisplay } from '@extension/ui';
import { useState,useEffect } from 'react';
import { signInWithGoogle, getGoogleToken } from '@src/lib/auth';

const BACKEND_URL = "https://productivity-companion-backend.onrender.com";

type View = 'intake' | 'loading' | 'explicit' | 'one-off' | 'continuous' | 'battle-plan'| 'onboarding' | 'slots' | 'confirmed';
type AvailabilityWindow = { start: string; end: string; label: string }
interface Classification {
  execution_type: 'explicit' | 'one-off' | 'continuous';
  priority_score: number;
  priority_reason: string;
  event_time: string | null;
  duration_minutes: number | null;
  daily_minutes: number | null;
  frequency_per_week: number | null;
    task_id?: string;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'text-red-500' },
  2: { label: 'High', color: 'text-orange-500' },
  3: { label: 'Medium', color: 'text-yellow-500' },
  4: { label: 'Low', color: 'text-green-500' },
  5: { label: 'Backburner', color: 'text-gray-400' },
};
const Popup = () => {
  const [userToken, setUserToken] = useState<string | null>(null);
const [authLoading, setAuthLoading] = useState(true);
const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([
  { start: '06:00', end: '12:00', label: '' }
])
const [distractionSites, setDistractionSites] = useState<string[]>(['youtube.com', 'netflix.com', 'instagram.com'])
const [newSite, setNewSite] = useState('')
const [slots, setSlots] = useState<{ start: string; end: string; reason: string }[]>([])
const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string; reason: string } | null>(null)
const [workUrl, setWorkUrl] = useState('')
const [taskId, setTaskId] = useState<string | null>(null)
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

// Check auth on mount
useEffect(() => {
  getGoogleToken().then(async token => {
    setUserToken(token)
    if (token) {
      // Check if user has completed onboarding
      try {
        const res = await fetch(`${BACKEND_URL}/preferences`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (!data.exists) {
          setView('onboarding')
        }
      } catch {
        // If check fails, go to intake anyway
      }
    }
    setAuthLoading(false)
  })
}, [])
  const reset = () => {
    setTask('');
    setTargetDate('');
    setClassification(null);
    setBattlePlan(null);
    setError(null);
    setView('intake');
  };

const handleSchedule = async () => {
  if (!task.trim() || !targetDate) return;
  setView('loading');
  setError(null);
  try {
    const res = await fetch(`${BACKEND_URL}/classify-intent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ task, targetDate, workUrl }),
    });
    const data: Classification = await res.json();
    setClassification(data);
    if (data.task_id) setTaskId(data.task_id)
    setView(data.execution_type);
  } catch {
    setError('Failed to connect. Try again.');
    setView('intake');
  }
};
const handleFindSlots = async () => {
  if (!classification || !taskId) return
  setView('loading')
  setError(null)
  try {
    const res = await fetch(`${BACKEND_URL}/find-slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        task_id: taskId,
        task,
        duration_minutes: classification.duration_minutes,
        daily_minutes: classification.daily_minutes,
        execution_type: classification.execution_type,
        target_date: targetDate
      })
    })
    const data = await res.json()
    if (data.slots?.length > 0) {
      setSlots(data.slots)
      setView('slots')
    } else {
      setError('No free slots found. Try adjusting your availability windows.')
      setView(classification.execution_type)
    }
  } catch {
    setError('Failed to find slots. Try again.')
    setView(classification.execution_type)
  }
}
const handleBuildPlan = async () => {
  if (!task.trim() || !targetDate) return;
  setView('loading');
  setError(null);
  try {
    const res = await fetch(`${BACKEND_URL}/parse-task`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ task, targetDate, workUrl }),
    });
    const data = await res.json();
    setBattlePlan(data.battlePlan);
    setView('battle-plan');
  } catch(err) {
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

      {/* AUTH GATE */}
      {authLoading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!authLoading && !userToken && (
        <div className={cn('rounded-xl p-4 text-center', card)}>
          <p className={cn('text-sm font-medium mb-3', text)}>Sign in to get started</p>
          <button
            onClick={async () => {
              setAuthLoading(true)
              try {
                const token = await signInWithGoogle()
                setUserToken(token)
              } catch (err) {
                console.error('Sign in error:', err)
                setError(`Sign in failed: ${err}`)
              } finally {
                setAuthLoading(false)
              }
            }}
            className="w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
            Sign in with Google
          </button>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      {/* ALL VIEWS — only shown when authenticated */}
      {!authLoading && userToken && (
        <>
        {/* ONBOARDING VIEW */}
{view === 'onboarding' && (
  <div className={cn('rounded-xl p-3 space-y-4', card)}>
    <div>
      <p className={cn('text-sm font-bold', text)}>Welcome! Let's set you up 👋</p>
      <p className={cn('text-xs mt-1', subtext)}>This takes 30 seconds.</p>
    </div>

    {/* Availability Windows */}
    <div>
      <p className={cn('text-xs font-semibold mb-2', text)}>When are you available to work?</p>
      {availabilityWindows.map((window: { start: string; end: string; label: string }, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <input
            type="time"
            value={window.start}
            onChange={e => {
              const updated = [...availabilityWindows]
              updated[i].start = e.target.value
              setAvailabilityWindows(updated)
            }}
            className={cn('flex-1 rounded px-2 py-1 text-xs outline-none', inputCn)}
          />
          <span className={cn('text-xs', subtext)}>→</span>
          <input
            type="time"
            value={window.end}
            onChange={e => {
              const updated = [...availabilityWindows]
              updated[i].end = e.target.value
              setAvailabilityWindows(updated)
            }}
            className={cn('flex-1 rounded px-2 py-1 text-xs outline-none', inputCn)}
          />
          {availabilityWindows.length > 1 && (
            <button
              onClick={() => setAvailabilityWindows(availabilityWindows.filter((_: { start: string; end: string; label: string }, j: number) => j !== i))}
              className="text-red-400 text-xs font-bold">×</button>
          )}
        </div>
      ))}
      <button
        onClick={() => setAvailabilityWindows([...availabilityWindows, { start: '15:00', end: '18:00', label: '' }])}
        className={cn('text-xs font-medium', isLight ? 'text-blue-500' : 'text-blue-400')}>
        + Add time window
      </button>
    </div>

    {/* Distraction Sites */}
    <div>
      <p className={cn('text-xs font-semibold mb-2', text)}>Your distraction sites</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {distractionSites.map((site, i) => (
          <span key={i} className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full', isLight ? 'bg-slate-100 text-gray-700' : 'bg-gray-700 text-gray-300')}>
            {site}
            <button
              onClick={() => setDistractionSites(distractionSites.filter((_, j) => j !== i))}
              className="text-red-400 font-bold ml-1">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="e.g. reddit.com"
          value={newSite}
          onChange={e => setNewSite(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newSite.trim()) {
              setDistractionSites([...distractionSites, newSite.trim()])
              setNewSite('')
            }
          }}
          className={cn('flex-1 rounded px-2 py-1 text-xs outline-none', inputCn)}
        />
        <button
          onClick={() => {
            if (newSite.trim()) {
              setDistractionSites([...distractionSites, newSite.trim()])
              setNewSite('')
            }
          }}
          className="text-xs px-2 py-1 bg-blue-500 text-white rounded">
          Add
        </button>
      </div>
    </div>

    <button
      onClick={async () => {
        try {
          await fetch(`${BACKEND_URL}/preferences`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
              availability_windows: availabilityWindows,
              distraction_sites: distractionSites
            })
          })
          // Save distraction sites to chrome.storage.local for content script
          chrome.storage.local.set({ distraction_sites: distractionSites })
          setView('intake')
        } catch {
          setError('Failed to save preferences.')
        }
      }}
      className="w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
      Save & Get Started →
    </button>
  </div>
)}

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
<label className={cn('block text-xs font-medium mt-3 mb-1', subtext)}>
  Work resource URL <span className={cn('font-normal', subtext)}>(optional)</span>
</label>
<input
  type="url"
  placeholder="e.g. https://leetcode.com/problems/..."
  value={workUrl}
  onChange={e => setWorkUrl(e.target.value)}
  className={cn('w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors', inputCn)}
/>
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
          <select
  value={classification.priority_score}
  onChange={e => setClassification({ ...classification, priority_score: Number(e.target.value) })}
  className={cn('mt-3 w-full rounded px-2 py-1 text-xs outline-none', inputCn)}
>
  <option value={1}>1 — Critical</option>
  <option value={2}>2 — High</option>
  <option value={3}>3 — Medium</option>
  <option value={4}>4 — Low</option>
  <option value={5}>5 — Backburner</option>
</select>
         <button
  onClick={async () => {
    if (!taskId || !classification) return
    setView('loading')
    try {
      const startTime = classification.event_time ?? targetDate
      const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString()
      
      const res = await fetch(`${BACKEND_URL}/confirm-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          task_id: taskId,
          title: task,
          event_time: startTime,
          end_time: endTime,
          priority_score: classification.priority_score
        })
      })
      const data = await res.json()
      if (data.success) setView('confirmed')
      else setError('Failed to confirm.')
    } catch {
      setError('Failed to confirm.')
      setView('explicit')
    }
  }}
  className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
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
          <select
  value={classification.priority_score}
  onChange={e => setClassification({ ...classification, priority_score: Number(e.target.value) })}
  className={cn('mt-3 w-full rounded px-2 py-1 text-xs outline-none', inputCn)}
>
  <option value={1}>1 — Critical</option>
  <option value={2}>2 — High</option>
  <option value={3}>3 — Medium</option>
  <option value={4}>4 — Low</option>
  <option value={5}>5 — Backburner</option>
</select>
          <button 
  onClick={handleFindSlots}
  className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
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

    <div className={cn('mt-3 rounded-lg p-2 text-xs space-y-2', isLight ? 'bg-slate-100' : 'bg-gray-700')}>
      <p className={cn('font-medium', text)}>Adjust AI suggestion:</p>

      <div className="flex items-center justify-between gap-2">
        <label className={cn(subtext)}>Min/day</label>
        <input
          type="number"
          min={5}
          max={480}
          value={classification.daily_minutes ?? 30}
          onChange={e => setClassification({ ...classification, daily_minutes: Number(e.target.value) })}
          className={cn('w-20 rounded px-2 py-1 text-xs text-center outline-none', inputCn)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className={cn(subtext)}>Days/week</label>
        <input
          type="number"
          min={1}
          max={7}
          value={classification.frequency_per_week ?? 3}
          onChange={e => setClassification({ ...classification, frequency_per_week: Number(e.target.value) })}
          className={cn('w-20 rounded px-2 py-1 text-xs text-center outline-none', inputCn)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className={cn(subtext)}>Priority</label>
        <select
          value={classification.priority_score}
          onChange={e => setClassification({ ...classification, priority_score: Number(e.target.value) })}
          className={cn('w-28 rounded px-2 py-1 text-xs outline-none', inputCn)}
        >
          <option value={1}>1 — Critical</option>
          <option value={2}>2 — High</option>
          <option value={3}>3 — Medium</option>
          <option value={4}>4 — Low</option>
          <option value={5}>5 — Backburner</option>
        </select>
      </div>
    </div>

    <p className={cn('text-xs mt-2 italic', subtext)}>{classification.priority_reason}</p>

   <button 
  onClick={handleFindSlots}
  className="mt-3 w-full rounded-lg py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all">
  Find Recurring Slots →
</button>
    <BackButton />
  </div>
)}
{/* SLOTS VIEW */}
{view === 'slots' && slots.length > 0 && (
  <div className={cn('rounded-xl p-3', card)}>
    <p className={cn('text-xs font-semibold mb-3', subtext)}>📅 Best slots for you</p>
    <p className={cn('text-sm font-bold mb-3', text)}>{task}</p>
    
    {slots.map((slot, i) => (
      <button
        key={i}
        onClick={() => setSelectedSlot(slot)}
        className={cn(
          'w-full text-left rounded-lg p-3 mb-2 border transition-all',
          selectedSlot?.start === slot.start
            ? 'border-blue-500 bg-blue-50'
            : isLight
              ? 'border-gray-200 hover:border-blue-300 bg-white'
              : 'border-gray-700 hover:border-blue-500 bg-gray-800'
        )}>
        <p className={cn('text-xs font-bold', text)}>
          {new Date(slot.start).toLocaleString('en-IN', { 
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })}
          {' → '}
          {new Date(slot.end).toLocaleString('en-IN', { 
            hour: '2-digit', minute: '2-digit'
          })}
        </p>
        <p className={cn('text-xs mt-1', subtext)}>{slot.reason}</p>
      </button>
    ))}

    <button
      onClick={async () => {
        if (!selectedSlot || !taskId || !classification) return
        setView('loading')
        try {
          const res = await fetch(`${BACKEND_URL}/confirm-task`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
              task_id: taskId,
              title: task,
              event_time: selectedSlot.start,
              end_time: selectedSlot.end,
              daily_minutes: classification.daily_minutes,
              frequency_per_week: classification.frequency_per_week,
              duration_minutes: classification.duration_minutes,
              priority_score: classification.priority_score,
               execution_type: classification.execution_type,  // ADD THIS
              target_date: targetDate  
            })
          })
          const data = await res.json()
          if (data.success) setView('confirmed')
          else setError('Failed to confirm. Try again.')
        } catch {
          setError('Failed to confirm. Try again.')
          setView('slots')
        }
      }}
      disabled={!selectedSlot}
      className={cn(
        'mt-2 w-full rounded-lg py-2 text-sm font-bold transition-all',
        selectedSlot
          ? 'bg-blue-500 hover:bg-blue-600 text-white'
          : 'bg-gray-300 text-gray-400 cursor-not-allowed'
      )}>
      Confirm this slot →
    </button>
    <BackButton />
  </div>
)}

{/* CONFIRMED VIEW */}
{view === 'confirmed' && (
  <div className={cn('rounded-xl p-4 text-center', card)}>
    <div className="text-2xl mb-2">✅</div>
    <p className={cn('text-sm font-bold', text)}>Scheduled!</p>
    {selectedSlot && (
      <p className={cn('text-xs mt-2', subtext)}>
        {new Date(selectedSlot.start).toLocaleString('en-IN', {
          weekday: 'long', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })}
      </p>
    )}
    <p className={cn('text-xs mt-1', subtext)}>
      Added to your Google Calendar
    </p>
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
    </>
      )}

    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

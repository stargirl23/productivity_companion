import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, LoadingSpinner, ErrorDisplay } from '@extension/ui';
import { useState } from 'react';

const BACKEND_URL = "https://productivity-companion-backend.onrender.com";

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testBackend = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch(`${BACKEND_URL}/test-gemini`);
      const data = await res.json();
      setResponse(data.response);
    } catch (err) {
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('App', isLight ? 'bg-slate-50' : 'bg-gray-800')} style={{ minWidth: '320px', padding: '16px' }}>
      <h1 className={cn('text-lg font-bold mb-4', isLight ? 'text-gray-900' : 'text-gray-100')}>
        Productivity Companion
      </h1>

      <button
        onClick={testBackend}
        disabled={loading}
        className={cn(
          'w-full rounded px-4 py-2 font-bold shadow hover:scale-105 transition-transform',
          isLight ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white',
        )}>
        {loading ? 'Thinking...' : 'Test AI Connection'}
      </button>

      {response && (
        <div className={cn('mt-4 rounded p-3 text-sm', isLight ? 'bg-green-50 text-green-800' : 'bg-green-900 text-green-100')}>
          <p className="font-bold mb-1">Gemini says:</p>
          <p>{response}</p>
        </div>
      )}

      {error && (
        <div className={cn('mt-4 rounded p-3 text-sm', isLight ? 'bg-red-50 text-red-800' : 'bg-red-900 text-red-100')}>
          {error}
        </div>
      )}
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

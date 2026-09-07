import { useEffect, useState } from 'react';

interface CreditScoreData {
  score: number | null;
  pulledAt: string | null;
  hasScore: boolean;
}

interface HistoryItem {
  score: number;
  pulledAt: string;
}

type Props = {
  authToken?: string;
  onPullScore?: (score: number) => void;
};

export default function CreditScoreWidget({ authToken, onPullScore }: Props) {
  const [score, setScore] = useState<CreditScoreData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulled, setPulled] = useState(false);

  const apiBase = process.env.REACT_APP_API_URL || 'https://credxapi-production.up.railway.app/api';

  useEffect(() => {
    fetchLatestScore();
  }, []);

  async function fetchLatestScore() {
    try {
      const res = await fetch(`${apiBase}/credit-score/latest`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setScore(data);
      }
    } catch (err) {
      console.error('Failed to fetch score:', err);
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch(`${apiBase}/credit-score/history?limit=12`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }

  async function handlePullScore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/credit-score/pull`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error('Failed to pull credit score');
      }

      const data = await res.json();
      setScore({
        score: data.score,
        pulledAt: data.timestamp,
        hasScore: true
      });
      setPulled(true);
      onPullScore?.(data.score);

      // Fetch updated history
      await fetchHistory();

      // Clear success message after 3 seconds
      setTimeout(() => setPulled(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull score');
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = score?.score
    ? score.score >= 750
      ? '#10b981'
      : score.score >= 650
        ? '#f59e0b'
        : '#ef4444'
    : '#6b7280';

  const scoreLabel = score?.score
    ? score.score >= 750
      ? 'Excellent'
      : score.score >= 650
        ? 'Fair'
        : 'Poor'
    : 'Not Available';

  return (
    <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
          Your Credit Score
        </h3>
        <button
          onClick={handlePullScore}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {loading ? 'Pulling...' : 'Get Free Score'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '12px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {pulled && (
        <div style={{ padding: '12px', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: '4px', marginBottom: '12px', fontSize: '14px' }}>
          ✓ Score updated successfully!
        </div>
      )}

      {score?.hasScore ? (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: scoreColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '32px',
                fontWeight: 'bold'
              }}
            >
              {score.score}
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#6b7280' }}>Current Score</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: scoreColor }}>
                {scoreLabel}
              </p>
              {score.pulledAt && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                  Pulled {new Date(score.pulledAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '4px', textAlign: 'center', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 12px 0', color: '#1e40af', fontSize: '14px' }}>
            Pull your free credit score to get started and track your progress through the masterclass.
          </p>
          <button
            onClick={handlePullScore}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1e40af',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {loading ? 'Pulling Score...' : 'Pull My Credit Score'}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
            Score History
          </p>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '60px' }}>
            {history.slice(-12).map((item, idx) => {
              const minScore = Math.min(...history.map(h => h.score));
              const maxScore = Math.max(...history.map(h => h.score));
              const range = maxScore - minScore || 1;
              const height = ((item.score - minScore) / range) * 100;

              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height: `${Math.max(20, height)}%`,
                    backgroundColor: '#3b82f6',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s'
                  }}
                  title={`${item.score} on ${new Date(item.pulledAt).toLocaleDateString()}`}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

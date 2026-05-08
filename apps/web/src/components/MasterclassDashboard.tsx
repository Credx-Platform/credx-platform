import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MASTERCLASS_DAYS, MASTERCLASS_INTRO, type LessonDay } from '../masterclassCurriculum';
import { MASTERCLASS_QUIZZES, QUIZ_PASSING_SCORE, type DayQuiz } from '../masterclassQuizzes';

type IntroSelection = { kind: 'intro' };
type DaySelection = { kind: 'day'; day: number };
type Selection = IntroSelection | DaySelection;

export type QuizSubmitResult = {
  passed: boolean;
  correct: number;
  total: number;
  percent: number;
  cooldownUntil?: string | null;
  attemptsRemaining: number;
};

export type QuizAttemptState = {
  count: number;
  lastAttemptAt: string;
  cooldownUntil?: string | null;
};

type Props = {
  firstName?: string;
  completedDays: string[];
  passedQuizzes?: string[];
  quizAttempts?: Record<string, QuizAttemptState>;
  onMarkComplete?: (slug: string) => void;
  onSubmitQuiz?: (slug: string, answers: Record<string, number>) => Promise<QuizSubmitResult>;
  onActiveDayChange?: (day: LessonDay) => void;
};

export default function MasterclassDashboard({
  firstName,
  completedDays,
  passedQuizzes = [],
  quizAttempts = {},
  onMarkComplete,
  onSubmitQuiz,
  onActiveDayChange
}: Props) {
  const [selection, setSelection] = useState<Selection>(() => {
    if (typeof window === 'undefined') return { kind: 'day', day: 1 };
    const stored = sessionStorage.getItem('credx-masterclass-selection');
    if (stored === 'intro') return { kind: 'intro' };
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= 1 && n <= MASTERCLASS_DAYS.length) return { kind: 'day', day: n };
    }
    return { kind: 'day', day: 1 };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('credx-masterclass-selection', selection.kind === 'intro' ? 'intro' : String(selection.day));
  }, [selection]);

  const isIntro = selection.kind === 'intro';
  const activeDay = isIntro ? 0 : selection.day;
  const day = useMemo<LessonDay>(() => {
    if (isIntro) return MASTERCLASS_DAYS[0]; // placeholder; not used when isIntro
    return MASTERCLASS_DAYS.find((d) => d.day === activeDay) || MASTERCLASS_DAYS[0];
  }, [activeDay, isIntro]);

  // Notify parent so the topbar accent can match the active day's color.
  useEffect(() => {
    if (isIntro) {
      onActiveDayChange?.({ ...MASTERCLASS_DAYS[0], slug: MASTERCLASS_INTRO.slug, title: MASTERCLASS_INTRO.title, eyebrow: MASTERCLASS_INTRO.eyebrow, tagline: MASTERCLASS_INTRO.tagline, summary: MASTERCLASS_INTRO.summary, image: MASTERCLASS_INTRO.image, accent: MASTERCLASS_INTRO.accent } as LessonDay);
    } else {
      onActiveDayChange?.(day);
    }
  }, [day, isIntro, onActiveDayChange]);

  const slidesSrc = isIntro ? MASTERCLASS_INTRO.slidesPath : day.slidesPath;
  const isCompleted = !isIntro && completedDays.includes(day.slug);
  const isBonus = !isIntro && !!day.isBonus;
  const accent = isIntro ? MASTERCLASS_INTRO.accent : day.accent;
  const dayQuiz = useMemo<DayQuiz | null>(
    () => (isIntro ? null : (MASTERCLASS_QUIZZES.find((q) => q.slug === day.slug) || null)),
    [day.slug, isIntro]
  );
  const quizPassed = !isIntro && passedQuizzes.includes(day.slug);
  const dayAttempt = isIntro ? undefined : quizAttempts[day.slug];

  return (
    <div className="mc-shell" style={{ ['--day-accent' as string]: accent } as CSSProperties}>
      <section className="mc-hero">
        <div>
          <p className="eyebrow" style={{ color: accent }}>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</p>
          <p className="mc-hero-sub">Your 5-day credit repair masterclass plus bonus day. Each day pairs short videos, glossary terms, the slide follow-along, and real-life Q&amp;A.</p>
        </div>
        <div className="mc-progress">
          <div className="mc-progress-label" style={{ color: accent }}>Progress</div>
          <div className="mc-progress-num">{completedDays.length}<span>/{MASTERCLASS_DAYS.length}</span></div>
          <div className="mc-progress-bar"><div className="mc-progress-fill" style={{ width: `${(completedDays.length / MASTERCLASS_DAYS.length) * 100}%`, background: accent }} /></div>
        </div>
      </section>

      <section className="mc-day-grid">
        <button
          key="intro"
          type="button"
          onClick={() => setSelection({ kind: 'intro' })}
          className={`mc-day-card${isIntro ? ' is-active' : ''}`}
          style={{ ['--card-accent' as string]: MASTERCLASS_INTRO.accent } as CSSProperties}
        >
          <div className="mc-day-card-num">★</div>
          <div className="mc-day-card-badge">Intro</div>
          <div className="mc-day-card-title">Course Overview</div>
        </button>
        {MASTERCLASS_DAYS.map((d) => {
          const done = completedDays.includes(d.slug);
          const isActive = !isIntro && d.day === activeDay;
          const passed = passedQuizzes.includes(d.slug);
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => setSelection({ kind: 'day', day: d.day })}
              className={`mc-day-card${isActive ? ' is-active' : ''}${d.isBonus ? ' is-bonus' : ''}${done ? ' is-done' : ''}`}
              style={{ ['--card-accent' as string]: d.accent } as CSSProperties}
            >
              <div className="mc-day-card-num">{d.isBonus ? '★' : `0${d.day}`}</div>
              <div className="mc-day-card-badge">{d.isBonus ? 'Bonus' : `Day ${d.day}`}</div>
              <div className="mc-day-card-title">{d.isBonus ? 'Bonus Day' : `Day ${d.day}`}</div>
              {done ? <div className="mc-day-card-done">✓ Completed</div> : passed ? <div className="mc-day-card-done">Quiz passed</div> : null}
            </button>
          );
        })}
      </section>

      {isIntro ? (
        <section className="panel mc-day-panel">
          <header className="mc-day-panel-head">
            <div>
              <p className="eyebrow" style={{ color: MASTERCLASS_INTRO.accent }}>{MASTERCLASS_INTRO.eyebrow}</p>
              <h2 className="mc-day-panel-title">{MASTERCLASS_INTRO.tagline}</h2>
            </div>
            <img src={MASTERCLASS_INTRO.image} alt={MASTERCLASS_INTRO.title} className="mc-day-panel-img" style={{ borderColor: MASTERCLASS_INTRO.accent }} />
          </header>
          <p className="mc-day-panel-summary">{MASTERCLASS_INTRO.summary}</p>
          <div className="mc-section">
            <h3 className="mc-section-h">Course preview</h3>
            <div className="mc-slides-frame">
              <iframe src={MASTERCLASS_INTRO.slidesPath} title="Course Overview slides" />
            </div>
            <p className="mc-slides-help">
              <a href={MASTERCLASS_INTRO.slidesPath} target="_blank" rel="noopener noreferrer">Open in a new tab →</a>
            </p>
          </div>
          <div className="mc-day-footer">
            <button type="button" className="mc-complete-btn" onClick={() => setSelection({ kind: 'day', day: 1 })}>
              Start with Day 1 →
            </button>
          </div>
        </section>
      ) : null}

      {!isIntro ? (
      <section className={`panel mc-day-panel${isBonus ? ' is-bonus' : ''}`}>
        <header className="mc-day-panel-head">
          <div>
            <p className="eyebrow" style={{ color: accent }}>{day.eyebrow}</p>
            <h2 className="mc-day-panel-title">{day.tagline}</h2>
          </div>
          <img src={day.image} alt={day.title} className="mc-day-panel-img" style={{ borderColor: accent }} />
        </header>
        <p className="mc-day-panel-summary">{day.summary}</p>

        <div className="mc-section">
          <h3 className="mc-section-h">Today's objectives</h3>
          <ul className="mc-objective-list">
            {day.objectives.map((o, i) => <li key={i}><span /> {o}</li>)}
          </ul>
        </div>

        <div className="mc-section">
          <h3 className="mc-section-h">Lessons</h3>
          <div className="mc-video-grid">
            {day.videos.map((v, i) => (
              <div key={i} className="mc-video-card">
                <div className="mc-video-frame">
                  {v.url ? (
                    <iframe src={v.url} title={v.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                  ) : (
                    <div className="mc-video-placeholder">
                      <div className="mc-video-play">▶</div>
                      <div className="mc-video-soon">Lesson recording coming soon</div>
                    </div>
                  )}
                </div>
                <div className="mc-video-meta">
                  <div className="mc-video-meta-head">
                    <strong>{v.title}</strong>
                    {v.duration ? <span className="mc-video-duration">{v.duration}</span> : null}
                  </div>
                  <p className="mc-video-desc">{v.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mc-section">
          <h3 className="mc-section-h">Slide follow-along</h3>
          <div className="mc-slides-frame">
            <iframe src={slidesSrc} title={`${day.title} slides`} />
          </div>
          <p className="mc-slides-help">
            Day {day.day} chapter of the masterclass deck.{' '}
            <a href={slidesSrc} target="_blank" rel="noopener noreferrer">Open in a new tab →</a>
          </p>
        </div>

        <div className="mc-section">
          <h3 className="mc-section-h">Key terms</h3>
          <div className="mc-glossary">
            {day.glossary.map((g) => (
              <div key={g.term} className="mc-glossary-item">
                <strong>{g.term}</strong>
                <span>{g.definition}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mc-section">
          <h3 className="mc-section-h">Action steps</h3>
          <ol className="mc-action-list">
            {day.actionSteps.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        </div>

        {day.qa && day.qa.length > 0 ? (
          <div className="mc-section">
            <h3 className="mc-section-h">Real questions, real answers</h3>
            <div className="mc-qa-list">
              {day.qa.map((item, i) => (
                <details key={i} className="mc-qa-item" open={i === 0}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        ) : null}

        {dayQuiz ? (
          <div className="mc-section">
            <h3 className="mc-section-h">Day {day.day} quiz <span style={{ fontWeight: 400, opacity: 0.7, fontSize: '0.85em' }}>— score {Math.round(QUIZ_PASSING_SCORE * 100)}%+ to unlock completion</span></h3>
            <DayQuizForm
              quiz={dayQuiz}
              accent={accent}
              passed={quizPassed}
              attempt={dayAttempt}
              disabled={!onSubmitQuiz}
              onSubmit={async (answers) => {
                if (!onSubmitQuiz) throw new Error('Quiz submission unavailable');
                return onSubmitQuiz(day.slug, answers);
              }}
            />
          </div>
        ) : null}

        <div className="mc-day-footer">
          {!isCompleted && onMarkComplete ? (
            <button
              type="button"
              className="mc-complete-btn"
              onClick={() => onMarkComplete(day.slug)}
              disabled={!quizPassed}
              title={quizPassed ? undefined : 'Pass the quiz with 80%+ to unlock'}
              style={!quizPassed ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {quizPassed ? `Mark Day ${day.day} complete` : `Pass the quiz to mark Day ${day.day} complete`}
            </button>
          ) : isCompleted ? (
            <div className="mc-complete-state">✓ Day {day.day} marked complete</div>
          ) : null}
          {activeDay < MASTERCLASS_DAYS.length ? (
            <button type="button" className="ghost-button" onClick={() => setSelection({ kind: 'day', day: activeDay + 1 })}>
              Next day →
            </button>
          ) : null}
        </div>
      </section>
      ) : null}
    </div>
  );
}

function DayQuizForm({
  quiz,
  accent,
  passed,
  attempt,
  disabled,
  onSubmit
}: {
  quiz: DayQuiz;
  accent: string;
  passed: boolean;
  attempt?: QuizAttemptState;
  disabled?: boolean;
  onSubmit: (answers: Record<string, number>) => Promise<QuizSubmitResult>;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setAnswers({});
    setResult(null);
    setError(null);
  }, [quiz.slug]);

  const cooldownUntil = result?.cooldownUntil || attempt?.cooldownUntil || null;
  const cooldownActive = !!cooldownUntil && new Date(cooldownUntil).getTime() > now;

  useEffect(() => {
    if (!cooldownActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownActive]);

  const allAnswered = quiz.questions.every((q) => Number.isInteger(answers[q.id]));

  const handleSubmit = async () => {
    if (submitting || passed || cooldownActive || disabled) return;
    if (!allAnswered) {
      setError('Answer every question before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = await onSubmit(answers);
      setResult(next);
      if (!next.passed) {
        // surface the wrong answers via rationale where we can — keep selections but disable retry until cooldown clears
        if (!next.cooldownUntil) setAnswers({});
      }
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: string; cooldownUntil?: string } } | Error;
      const status = (e as any)?.status;
      const body = (e as any)?.body;
      if (status === 429 && body?.cooldownUntil) {
        setResult({ passed: false, correct: 0, total: quiz.questions.length, percent: 0, cooldownUntil: body.cooldownUntil, attemptsRemaining: 0 });
      } else {
        setError((e as Error).message || 'Quiz submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cooldownLabel = useMemo(() => {
    if (!cooldownUntil) return null;
    const remaining = Math.max(0, new Date(cooldownUntil).getTime() - now);
    if (!remaining) return null;
    const totalSeconds = Math.ceil(remaining / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${m}m ${s}s`;
  }, [cooldownUntil, now]);

  if (passed || result?.passed) {
    return (
      <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.45)', borderRadius: 12, padding: '14px 16px', color: '#86efac', fontWeight: 600 }}>
        ✓ You passed this quiz {result ? `(${result.correct}/${result.total} — ${result.percent}%)` : ''}. You can mark Day {quiz.day} complete at the bottom of this page.
      </div>
    );
  }

  const passingPct = Math.round(QUIZ_PASSING_SCORE * 100);

  return (
    <div className="mc-quiz" style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, opacity: 0.8 }}>
        {quiz.questions.length} questions. Score {passingPct}% or higher to unlock Day {quiz.day} completion.
        After 3 failed attempts the quiz locks for 24 hours.
      </p>

      {cooldownActive ? (
        <div style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.45)', borderRadius: 12, padding: '14px 16px', color: '#fda4af', fontWeight: 600 }}>
          You've used all 3 attempts. Quiz unlocks again in {cooldownLabel}. Use the time to rewatch the lessons and review the glossary.
        </div>
      ) : null}

      <ol style={{ display: 'grid', gap: 14, paddingLeft: 22, margin: 0 }}>
        {quiz.questions.map((q) => (
          <li key={q.id} style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: '0.95rem' }}>{q.prompt}</strong>
            <div style={{ display: 'grid', gap: 6 }}>
              {q.choices.map((choice, ci) => {
                const selected = answers[q.id] === ci;
                const showResult = !!result && !result.passed && !cooldownActive;
                const isCorrect = q.correctIndex === ci;
                let tone: CSSProperties = {
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'inherit'
                };
                if (selected) tone = { border: `1px solid ${accent}`, background: `${accent}26`, color: 'inherit' };
                if (showResult && selected && !isCorrect) tone = { border: '1px solid rgba(239,68,68,0.55)', background: 'rgba(239,68,68,0.15)', color: '#fda4af' };
                if (showResult && isCorrect) tone = { border: '1px solid rgba(34,197,94,0.55)', background: 'rgba(34,197,94,0.15)', color: '#86efac' };
                return (
                  <label key={ci} style={{ ...tone, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: cooldownActive || submitting ? 'not-allowed' : 'pointer', fontSize: '0.92rem' }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={selected}
                      disabled={cooldownActive || submitting}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: ci }))}
                      style={{ accentColor: accent }}
                    />
                    <span><strong style={{ marginRight: 6, opacity: 0.6 }}>{String.fromCharCode(65 + ci)}.</strong>{choice}</span>
                  </label>
                );
              })}
            </div>
            {result && !result.passed && !cooldownActive ? (
              <div style={{ fontSize: '0.85rem', color: 'rgba(226,232,240,0.78)', borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>
                <em>Why:</em> {q.rationale}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {error ? <div style={{ color: '#fda4af', fontWeight: 600 }}>{error}</div> : null}

      {result && !result.passed && !cooldownActive ? (
        <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.45)', borderRadius: 12, padding: '12px 14px', color: '#fde68a', fontWeight: 600 }}>
          You scored {result.correct}/{result.total} ({result.percent}%). You need {passingPct}% to pass.
          {result.attemptsRemaining > 0 ? ` ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} left before a 24h cooldown.` : ''}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="mc-complete-btn"
          onClick={handleSubmit}
          disabled={cooldownActive || submitting || disabled || !allAnswered}
          style={{ background: accent, opacity: cooldownActive || submitting || disabled || !allAnswered ? 0.5 : 1 }}
        >
          {submitting ? 'Grading…' : result && !result.passed ? 'Submit again' : 'Submit quiz'}
        </button>
        {!allAnswered && !cooldownActive ? <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>Answer all {quiz.questions.length} questions to enable submit.</span> : null}
      </div>
    </div>
  );
}

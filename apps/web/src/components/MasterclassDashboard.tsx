import { useEffect, useMemo, useState } from 'react';
import { MASTERCLASS_DAYS, type LessonDay } from '../masterclassCurriculum';

type Props = {
  firstName?: string;
  completedDays: string[];
  onMarkComplete?: (slug: string) => void;
};

export default function MasterclassDashboard({ firstName, completedDays, onMarkComplete }: Props) {
  const [activeDay, setActiveDay] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const stored = sessionStorage.getItem('credx-masterclass-day');
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= 1 && n <= MASTERCLASS_DAYS.length) return n;
    }
    return 1;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('credx-masterclass-day', String(activeDay));
    }
  }, [activeDay]);

  const day = useMemo<LessonDay>(() => {
    return MASTERCLASS_DAYS.find((d) => d.day === activeDay) || MASTERCLASS_DAYS[0];
  }, [activeDay]);

  const slidesSrc = `/masterclass/slides/index.html#slide-${day.slidesRange.from}`;
  const isCompleted = completedDays.includes(day.slug);
  const isBonus = !!day.isBonus;

  return (
    <div className="mc-shell">
      <section className="mc-hero">
        <div>
          <p className="eyebrow" style={{ color: '#00c6fb' }}>CredX Masterclass</p>
          <h1 className="mc-hero-title">Welcome{firstName ? `, ${firstName}` : ''}</h1>
          <p className="mc-hero-sub">Your 5-day credit repair masterclass plus bonus day. Each day pairs short videos, glossary terms, and the slide follow-along.</p>
        </div>
        <div className="mc-progress">
          <div className="mc-progress-label">Progress</div>
          <div className="mc-progress-num">{completedDays.length}<span>/{MASTERCLASS_DAYS.length}</span></div>
          <div className="mc-progress-bar"><div className="mc-progress-fill" style={{ width: `${(completedDays.length / MASTERCLASS_DAYS.length) * 100}%` }} /></div>
        </div>
      </section>

      <section className="mc-day-grid">
        {MASTERCLASS_DAYS.map((d) => {
          const done = completedDays.includes(d.slug);
          const isActive = d.day === activeDay;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => setActiveDay(d.day)}
              className={`mc-day-card${isActive ? ' is-active' : ''}${d.isBonus ? ' is-bonus' : ''}${done ? ' is-done' : ''}`}
            >
              <div className="mc-day-card-num">{d.isBonus ? '★' : `0${d.day}`}</div>
              <div className="mc-day-card-badge">{d.eyebrow.split('·')[0].trim()}</div>
              <div className="mc-day-card-title">{d.tagline}</div>
              {done ? <div className="mc-day-card-done">✓ Completed</div> : null}
            </button>
          );
        })}
      </section>

      <section className={`panel mc-day-panel${isBonus ? ' is-bonus' : ''}`}>
        <header className="mc-day-panel-head">
          <div>
            <p className="eyebrow" style={{ color: isBonus ? '#f59e0b' : '#00c6fb' }}>{day.eyebrow}</p>
            <h2 className="mc-day-panel-title">{day.tagline}</h2>
          </div>
          <img src={day.image} alt={day.title} className="mc-day-panel-img" />
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
                  <strong>{v.title}</strong>
                  {v.duration ? <span>{v.duration}</span> : null}
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
            Slides {day.slidesRange.from}–{day.slidesRange.to} of the masterclass deck.{' '}
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

        <div className="mc-day-footer">
          {!isCompleted && onMarkComplete ? (
            <button type="button" className="mc-complete-btn" onClick={() => onMarkComplete(day.slug)}>
              Mark Day {day.day} complete
            </button>
          ) : isCompleted ? (
            <div className="mc-complete-state">✓ Day {day.day} marked complete</div>
          ) : null}
          {activeDay < MASTERCLASS_DAYS.length ? (
            <button type="button" className="ghost-button" onClick={() => setActiveDay(activeDay + 1)}>
              Next day →
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

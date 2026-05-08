// Server-side answer key for masterclass quizzes. Mirrors the IDs and correct
// indices in apps/web/src/masterclassQuizzes.ts. Keep both files in sync — the
// client renders prompts/choices; the server is authoritative for grading.

export const QUIZ_PASSING_SCORE = 0.8;
export const QUIZ_MAX_ATTEMPTS_BEFORE_COOLDOWN = 3;
export const QUIZ_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type DayAnswerKey = {
  day: number;
  slug: string;
  answers: Record<string, number>;
};

export const QUIZ_ANSWER_KEYS: DayAnswerKey[] = [
  {
    day: 1,
    slug: 'day-1-credit-fundamentals',
    answers: { d1q1: 3, d1q2: 2, d1q3: 1, d1q4: 2, d1q5: 2, d1q6: 1, d1q7: 1, d1q8: 2, d1q9: 1, d1q10: 2 }
  },
  {
    day: 2,
    slug: 'day-2-disputes-decoded',
    answers: { d2q1: 1, d2q2: 1, d2q3: 2, d2q4: 1, d2q5: 1, d2q6: 2, d2q7: 2, d2q8: 1, d2q9: 1, d2q10: 2 }
  },
  {
    day: 3,
    slug: 'day-3-advanced-tactics',
    answers: { d3q1: 1, d3q2: 1, d3q3: 1, d3q4: 0, d3q5: 1, d3q6: 1, d3q7: 1, d3q8: 2, d3q9: 1, d3q10: 0 }
  },
  {
    day: 4,
    slug: 'day-4-building-positive-credit',
    answers: { d4q1: 1, d4q2: 1, d4q3: 0, d4q4: 1, d4q5: 1, d4q6: 1, d4q7: 1, d4q8: 1, d4q9: 1, d4q10: 1 }
  },
  {
    day: 5,
    slug: 'day-5-business-credit',
    answers: { d5q1: 1, d5q2: 1, d5q3: 1, d5q4: 1, d5q5: 1, d5q6: 1, d5q7: 1, d5q8: 1, d5q9: 1, d5q10: 1 }
  },
  {
    day: 6,
    slug: 'bonus-generational-wealth',
    answers: { d6q1: 1, d6q2: 1, d6q3: 1, d6q4: 1, d6q5: 1, d6q6: 1, d6q7: 1, d6q8: 1, d6q9: 2, d6q10: 1 }
  }
];

export function getAnswerKey(daySlug: string): DayAnswerKey | null {
  return QUIZ_ANSWER_KEYS.find(a => a.slug === daySlug) || null;
}

export function gradeSubmission(daySlug: string, submitted: Record<string, number>): { correct: number; total: number; percent: number; passed: boolean; key: DayAnswerKey } | null {
  const key = getAnswerKey(daySlug);
  if (!key) return null;
  const ids = Object.keys(key.answers);
  let correct = 0;
  for (const id of ids) {
    if (submitted[id] === key.answers[id]) correct += 1;
  }
  const total = ids.length;
  const percent = total ? correct / total : 0;
  return { correct, total, percent, passed: percent >= QUIZ_PASSING_SCORE, key };
}

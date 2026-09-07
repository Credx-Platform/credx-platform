import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateReadinessScore } from '../src/lib/readinessScore.js';

describe('calculateReadinessScore', () => {
  it('returns a limited baseline score with the required disclosure', () => {
    const result = calculateReadinessScore({});

    assert.equal(result.maxScore, 100);
    assert.equal(result.dataQuality, 'limited');
    assert.equal(result.label, 'Needs Foundation');
    assert.match(result.disclosure, /not a consumer credit score/i);
    assert.ok(result.opportunities.includes('Complete address and profile details.'));
    assert.ok(result.nextBestActions.includes('Upload a current report before relying on readiness recommendations.'));
  });

  it('maps next-best actions to a ranked, categorized structure', () => {
    const result = calculateReadinessScore({});

    assert.ok(result.nextBestActionDetails.length > 0);
    // Blocker categories (creditData / derogatory) must rank first.
    assert.equal(result.nextBestActionDetails[0].priority, 'high');
    // Sorted by priority then potential points, non-increasing points within a tier.
    const ranks = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < result.nextBestActionDetails.length; i += 1) {
      const prev = result.nextBestActionDetails[i - 1];
      const cur = result.nextBestActionDetails[i];
      assert.ok(ranks[prev.priority] <= ranks[cur.priority], 'priority order');
    }
    for (const action of result.nextBestActionDetails) {
      assert.match(action.href, /^#/);
      assert.ok(action.potentialPoints >= 1 && action.potentialPoints <= 20);
      assert.ok(result.nextBestActions.includes(action.rationale));
    }
    // The missing-credit-report action should point at the documents area.
    const upload = result.nextBestActionDetails.find((a) => a.id === 'upload-credit-report');
    assert.ok(upload);
    assert.equal(upload!.category, 'creditData');
  });

  it('rewards profile completion, credit data, low utilization, and task progress', () => {
    const result = calculateReadinessScore({
      currentAddressLine1: '123 Main St',
      currentCity: 'Newark',
      currentState: 'NJ',
      currentPostalCode: '07102',
      progress: {
        onboarding: { status: 'completed', completedAt: '2026-09-03T00:00:00.000Z' },
        uploadedDocs: [{ type: 'credit_report', name: 'report.pdf' }],
        analysis: { summaryTiles: { utilization: '8%' } },
        education: { masterclassProgress: ['day-1', 'day-2'] }
      },
      creditReports: [{ score: 735, tradelines: [{ accountType: 'credit card', status: 'open', balance: 0 }] }],
      tasks: [{ completed: true }, { completed: true }, { completed: false }]
    });

    assert.ok(result.score >= 80, `expected strong score, got ${result.score}`);
    assert.equal(result.label, 'Strong Readiness');
    assert.equal(result.dataQuality, 'strong');
    assert.ok(result.strengths.some((strength) => /Credit analysis is available/i.test(strength)));
    assert.ok(result.categories.find((category) => category.key === 'utilization')?.score === 20);
  });

  it('surfaces utilization and derogatory risks without making outcome promises', () => {
    const result = calculateReadinessScore({
      currentAddressLine1: '123 Main St',
      currentCity: 'Newark',
      currentState: 'NJ',
      currentPostalCode: '07102',
      progress: {
        onboarding: { status: 'completed' },
        uploadedDocs: [{ type: 'credit_report' }],
        analysis: {
          utilization: 0.72,
          accounts: [
            { accountType: 'collection', status: 'open collection', isNegative: true },
            { accountType: 'credit card', status: '60 days late', negative: true }
          ]
        },
        education: { masterclassProgress: [] }
      },
      creditReports: [{ score: 555, tradelines: [{ accountType: 'credit card', status: 'past due', isNegative: true }] }],
      tasks: [{ completed: false }, { completed: false }]
    });

    assert.ok(result.score < 70, `expected risk-adjusted score below 70, got ${result.score}`);
    assert.ok(result.opportunities.some((item) => /Lower revolving utilization/i.test(item)));
    assert.ok(result.opportunities.some((item) => /Review derogatory indicators/i.test(item)));
    assert.ok(result.nextBestActions.some((item) => /lawful dispute or validation workflows/i.test(item)));
    assert.doesNotMatch(result.disclosure, /guarantee(?! of any credit-report change)/i);
  });
});

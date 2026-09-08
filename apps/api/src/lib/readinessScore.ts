type ScoreInputClient = {
  currentAddressLine1?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentPostalCode?: string | null;
  status?: string | null;
  progress?: {
    onboarding?: unknown;
    education?: unknown;
    uploadedDocs?: unknown;
    analysis?: unknown;
  } | null;
  creditReports?: Array<{
    score?: number | null;
    tradelines?: Array<{
      accountType?: string | null;
      status?: string | null;
      balance?: unknown;
      isNegative?: boolean | null;
    }>;
  }>;
  tasks?: Array<{ completed?: boolean | null }>;
};

export type ReadinessCategory =
  | 'profile'
  | 'creditData'
  | 'utilization'
  | 'derogatory'
  | 'activity'
  | 'education';

export type NextBestActionPriority = 'high' | 'medium' | 'low';

export type NextBestAction = {
  id: string;
  title: string;
  rationale: string;
  category: ReadinessCategory;
  priority: NextBestActionPriority;
  /** Rough upside toward the 100-point scale if this area is fully addressed. */
  potentialPoints: number;
  /** Portal deep-link (hash route inside the client portal). */
  href: string;
};

export type ReadinessScoreResult = {
  score: number;
  maxScore: 100;
  label: 'Needs Foundation' | 'Building' | 'Preparing' | 'Strong Readiness';
  dataQuality: 'limited' | 'partial' | 'strong';
  disclosure: string;
  categories: Array<{
    key: ReadinessCategory;
    label: string;
    score: number;
    maxScore: number;
    explanation: string;
  }>;
  strengths: string[];
  opportunities: string[];
  nextBestActions: string[];
  /** Structured, ranked version of nextBestActions with category + impact. */
  nextBestActionDetails: NextBestAction[];
  generatedAt: string;
};

const PRIORITY_RANK: Record<NextBestActionPriority, number> = { high: 0, medium: 1, low: 2 };

// Categories where any gap is a hard blocker on trustworthy readiness output.
const BLOCKER_CATEGORIES = new Set<ReadinessCategory>(['creditData', 'derogatory']);

const ACTION_HREF: Record<ReadinessCategory, string> = {
  profile: '#profile',
  creditData: '#documents',
  utilization: '#tools',
  derogatory: '#disputes',
  activity: '#action-plan',
  education: '#learning'
};

const DISCLOSURE = 'CredX Readiness Score is a proprietary CredX readiness metric and is not a consumer credit score, FICO score, funding approval, legal opinion, or guarantee of any credit-report change.';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,%]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    const parsed = (value as any).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function labelFor(score: number): ReadinessScoreResult['label'] {
  if (score >= 80) return 'Strong Readiness';
  if (score >= 65) return 'Preparing';
  if (score >= 45) return 'Building';
  return 'Needs Foundation';
}

function looksRevolving(accountType?: string | null): boolean {
  return /card|revolving|credit line/i.test(String(accountType || ''));
}

function looksDerogatory(account: { accountType?: string | null; status?: string | null; isNegative?: boolean | null }): boolean {
  const text = `${account.accountType || ''} ${account.status || ''}`;
  return Boolean(account.isNegative) || /collection|charge.?off|late|past due|derogatory|repossession|foreclosure|bankrupt|judgment|lien/i.test(text);
}

function accountCollections(client: ScoreInputClient) {
  const reports = client.creditReports || [];
  const tradelines = reports.flatMap((report) => report.tradelines || []);
  const analysis = asRecord(client.progress?.analysis);
  const analysisAccounts = [
    ...asArray(analysis.accounts),
    ...asArray(analysis.tradelines),
    ...asArray(analysis.accountDetails)
  ].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));

  return { reports, tradelines, analysisAccounts };
}

function averageBureauScore(client: ScoreInputClient): number | null {
  const directScores = (client.creditReports || [])
    .map((report) => report.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (directScores.length) {
    return Math.round(directScores.reduce((sum, score) => sum + score, 0) / directScores.length);
  }

  const progressScores = asRecord((client.progress as any)?.scores);
  const fallbackScores = ['experian', 'equifax', 'transunion']
    .map((key) => numeric(progressScores[key]))
    .filter((score): score is number => score != null);
  if (!fallbackScores.length) return null;
  return Math.round(fallbackScores.reduce((sum, score) => sum + score, 0) / fallbackScores.length);
}

function utilizationFromAnalysis(client: ScoreInputClient): number | null {
  const analysis = asRecord(client.progress?.analysis);
  const summaryTiles = asRecord(analysis.summaryTiles);
  const direct = numeric(summaryTiles.utilization) ?? numeric(analysis.utilization) ?? numeric(analysis.averageUtilization);
  if (direct == null) return null;
  return direct > 1 ? direct / 100 : direct;
}

export function calculateReadinessScore(client: ScoreInputClient): ReadinessScoreResult {
  const now = new Date().toISOString();
  const onboarding = asRecord(client.progress?.onboarding);
  const education = asRecord(client.progress?.education);
  const uploadedDocs = asArray(client.progress?.uploadedDocs);
  const { reports, tradelines, analysisAccounts } = accountCollections(client);

  const hasAddress = Boolean(client.currentAddressLine1 && client.currentCity && client.currentState && client.currentPostalCode);
  const onboardingComplete = onboarding.status === 'completed' || Boolean(onboarding.completedAt);
  const hasCreditReport = reports.length > 0 || uploadedDocs.some((doc) => /credit|report/i.test(String(asRecord(doc).type || asRecord(doc).name || '')));
  const hasAnalysis = Boolean(client.progress?.analysis);
  const completedTasks = (client.tasks || []).filter((task) => task.completed).length;
  const taskTotal = client.tasks?.length || 0;
  const taskCompletionRate = taskTotal ? completedTasks / taskTotal : 0;
  const educationProgress = asArray(education.masterclassProgress).length + asArray((client.progress as any)?.completedDays).length;
  const averageScore = averageBureauScore(client);
  const utilization = utilizationFromAnalysis(client);

  const derogatoryCount = tradelines.filter(looksDerogatory).length
    + analysisAccounts.filter((account) => looksDerogatory({
      accountType: String(account.accountType || account.category || account.type || ''),
      status: String(account.status || account.paymentStatus || ''),
      isNegative: Boolean(account.isNegative || account.negative)
    })).length;

  const revolvingCount = tradelines.filter((line) => looksRevolving(line.accountType)).length
    + analysisAccounts.filter((account) => looksRevolving(String(account.accountType || account.type || ''))).length;

  const categories: ReadinessScoreResult['categories'] = [
    {
      key: 'profile',
      label: 'Profile Foundation',
      maxScore: 15,
      score: clamp((hasAddress ? 8 : 0) + (onboardingComplete ? 7 : 0), 0, 15),
      explanation: hasAddress && onboardingComplete
        ? 'Core profile and onboarding details are in place.'
        : 'CredX needs a complete profile and onboarding record before readiness can be measured confidently.'
    },
    {
      key: 'creditData',
      label: 'Credit Data Depth',
      maxScore: 20,
      score: clamp((hasCreditReport ? 8 : 0) + (hasAnalysis ? 8 : 0) + (averageScore ? 4 : 0), 0, 20),
      explanation: hasCreditReport && hasAnalysis
        ? 'Credit-report data and analysis are available for decision support.'
        : 'Readiness is limited until a current credit report and analysis are available.'
    },
    {
      key: 'utilization',
      label: 'Utilization Readiness',
      maxScore: 20,
      score: utilization == null
        ? (revolvingCount ? 10 : 8)
        : utilization <= 0.1 ? 20 : utilization <= 0.3 ? 15 : utilization <= 0.5 ? 10 : 5,
      explanation: utilization == null
        ? 'Utilization could not be calculated from current data.'
        : `Estimated revolving utilization is ${Math.round(utilization * 100)}%.`
    },
    {
      key: 'derogatory',
      label: 'Derogatory Risk',
      maxScore: 20,
      score: derogatoryCount === 0 ? 20 : derogatoryCount <= 2 ? 14 : derogatoryCount <= 5 ? 8 : 4,
      explanation: derogatoryCount === 0
        ? 'No derogatory indicators were found in available data.'
        : `${derogatoryCount} derogatory indicator${derogatoryCount === 1 ? '' : 's'} need review for accuracy, completeness, and recency.`
    },
    {
      key: 'activity',
      label: 'Action Progress',
      maxScore: 15,
      score: clamp(Math.round(taskCompletionRate * 15), 0, 15),
      explanation: taskTotal
        ? `${completedTasks} of ${taskTotal} tracked action item${taskTotal === 1 ? '' : 's'} completed.`
        : 'No tracked action items are available yet.'
    },
    {
      key: 'education',
      label: 'Education Progress',
      maxScore: 10,
      score: clamp(educationProgress * 2, 0, 10),
      explanation: educationProgress
        ? `${educationProgress} education milestone${educationProgress === 1 ? '' : 's'} recorded.`
        : 'Learning progress is not recorded yet.'
    }
  ];

  let score = categories.reduce((sum, category) => sum + category.score, 0);
  if (averageScore != null) {
    if (averageScore >= 720) score += 3;
    else if (averageScore < 580) score -= 3;
  }
  score = clamp(Math.round(score), 0, 100);

  const strengths: string[] = [];

  if (hasAnalysis) strengths.push('Credit analysis is available inside the CredX workspace.');
  if (onboardingComplete) strengths.push('Onboarding is complete, so the workflow can move forward.');
  if (educationProgress) strengths.push('Learning progress is already being tracked.');
  if (completedTasks) strengths.push('Some action-plan items have been completed.');
  if (averageScore != null) strengths.push(`Average available bureau score snapshot is ${averageScore}.`);
  if (!strengths.length) strengths.push('CredX account foundation has started.');

  // ---- Next-best-action mapping -------------------------------------------
  // Each candidate ties an opportunity + concrete action to a scoring category
  // so we can rank by real point headroom and route the user to the right tool.
  const headroomFor = (key: ReadinessCategory) => {
    const cat = categories.find((c) => c.key === key)!;
    return Math.max(0, cat.maxScore - cat.score);
  };

  type Candidate = {
    id: string;
    active: boolean;
    category: ReadinessCategory;
    opportunity: string;
    title: string;
    rationale: string;
  };

  const candidates: Candidate[] = [
    {
      id: 'complete-profile',
      active: !hasAddress,
      category: 'profile',
      opportunity: 'Complete address and profile details.',
      title: 'Complete your profile',
      rationale: 'Finish profile setup so CredX can evaluate readiness with better context.'
    },
    {
      id: 'upload-credit-report',
      active: !hasCreditReport,
      category: 'creditData',
      opportunity: 'Upload a current credit report.',
      title: 'Upload a current credit report',
      rationale: 'Upload a current report before relying on readiness recommendations.'
    },
    {
      id: 'complete-analysis',
      active: !hasAnalysis,
      category: 'creditData',
      opportunity: 'Generate or review the CredX credit analysis.',
      title: 'Review your credit analysis',
      rationale: 'Complete report analysis to identify accurate next-best actions.'
    },
    {
      id: 'reduce-utilization',
      active: utilization != null && utilization > 0.3,
      category: 'utilization',
      opportunity: 'Lower revolving utilization toward 30%, then 10% if cash flow allows.',
      title: 'Lower revolving utilization',
      rationale: 'Use the utilization calculator before statement close to plan balance reductions.'
    },
    {
      id: 'review-derogatory',
      active: derogatoryCount > 0,
      category: 'derogatory',
      opportunity: 'Review derogatory indicators for accuracy, completeness, age, and documentation gaps.',
      title: 'Review derogatory indicators',
      rationale: 'Prioritize documented, lawful dispute or validation workflows for unverifiable or inaccurate items.'
    },
    {
      id: 'build-action-plan',
      active: !taskTotal,
      category: 'activity',
      opportunity: 'Create a prioritized action plan.',
      title: 'Build a prioritized action plan',
      rationale: 'Turn analysis findings into dated action items.'
    },
    {
      id: 'advance-action-plan',
      active: taskTotal > 0 && taskCompletionRate < 0.5,
      category: 'activity',
      opportunity: 'Complete more tracked action items.',
      title: 'Advance your action plan',
      rationale: 'Focus on the top open action item before adding new tasks.'
    },
    {
      id: 'start-learning',
      active: !educationProgress,
      category: 'education',
      opportunity: 'Start the Learning Center path.',
      title: 'Start the Learning Center path',
      rationale: 'Complete the first education module to improve decision quality.'
    }
  ];

  const activeCandidates = candidates.filter((c) => c.active);

  const nextBestActionDetails: NextBestAction[] = activeCandidates
    .map((c) => {
      const headroom = headroomFor(c.category);
      const blocker = BLOCKER_CATEGORIES.has(c.category);
      const priority: NextBestActionPriority =
        blocker || headroom >= 12 ? 'high' : headroom >= 6 ? 'medium' : 'low';
      const potentialPoints = clamp(headroom + (blocker ? 2 : 0), 1, 20);
      return {
        id: c.id,
        title: c.title,
        rationale: c.rationale,
        category: c.category,
        priority,
        potentialPoints,
        href: ACTION_HREF[c.category]
      };
    })
    .sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.potentialPoints - a.potentialPoints
    );

  const opportunities = activeCandidates.map((c) => c.opportunity);
  const nextBestActions = nextBestActionDetails.map((d) => d.rationale);
  if (!nextBestActions.length) {
    nextBestActions.push('Keep monitoring profile changes and complete the next scheduled check-in.');
  }

  const dataSignals = [hasAddress, hasCreditReport, hasAnalysis, averageScore != null, taskTotal > 0].filter(Boolean).length;
  const dataQuality: ReadinessScoreResult['dataQuality'] = dataSignals >= 4 ? 'strong' : dataSignals >= 2 ? 'partial' : 'limited';

  return {
    score,
    maxScore: 100,
    label: labelFor(score),
    dataQuality,
    disclosure: DISCLOSURE,
    categories,
    strengths,
    opportunities,
    nextBestActions,
    nextBestActionDetails,
    generatedAt: now
  };
}

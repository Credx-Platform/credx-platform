export type PlanCode = 'FREE' | 'MASTERCLASS' | 'ESSENTIAL' | 'PREMIUM' | 'FAMILY';

export type EntitlementKey =
  | 'can_access_dashboard'
  | 'can_use_basic_tools'
  | 'can_use_learning_center'
  | 'can_use_cesar'
  | 'can_use_advanced_tools'
  | 'can_use_business_credit'
  | 'can_use_funding_readiness'
  | 'can_store_documents'
  | 'can_manage_dispute_workflows'
  | 'can_manage_family_profiles'
  | 'can_manage_clients';

export type Entitlements = Record<EntitlementKey, boolean>;

export type PlanDefinition = {
  code: PlanCode;
  label: string;
  description: string;
  setupFee: number | null;
  oneTime: number | null;
  monthly: number | null;
  billing: string;
  entitlements: Entitlements;
};

const none: Entitlements = {
  can_access_dashboard: false,
  can_use_basic_tools: false,
  can_use_learning_center: false,
  can_use_cesar: false,
  can_use_advanced_tools: false,
  can_use_business_credit: false,
  can_use_funding_readiness: false,
  can_store_documents: false,
  can_manage_dispute_workflows: false,
  can_manage_family_profiles: false,
  can_manage_clients: false
};

function withEntitlements(enabled: EntitlementKey[]): Entitlements {
  return enabled.reduce<Entitlements>((acc, key) => {
    acc[key] = true;
    return acc;
  }, { ...none });
}

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  FREE: {
    code: 'FREE',
    label: 'Free',
    description: 'Free CredX account: dashboard, an introductory readiness view, basic tools, and Learning Center previews.',
    setupFee: null,
    oneTime: null,
    monthly: 0,
    billing: 'No charge.',
    entitlements: withEntitlements([
      'can_access_dashboard',
      'can_use_basic_tools',
      'can_use_learning_center'
    ])
  },
  MASTERCLASS: {
    code: 'MASTERCLASS',
    label: '5-Day Masterclass',
    description: 'Education-focused portal access for the CredX 5-Day Masterclass.',
    setupFee: null,
    oneTime: 47,
    monthly: null,
    billing: 'One-time education purchase.',
    entitlements: withEntitlements(['can_access_dashboard', 'can_use_learning_center', 'can_use_basic_tools'])
  },
  ESSENTIAL: {
    code: 'ESSENTIAL',
    label: 'Essential',
    description: 'Core CredX dashboard, action workflow, document, education, and Cesar guidance access.',
    setupFee: 150,
    oneTime: null,
    monthly: 75,
    billing: 'First-work fee after analysis review, then monthly platform/support access.',
    entitlements: withEntitlements([
      'can_access_dashboard',
      'can_use_basic_tools',
      'can_use_learning_center',
      'can_use_cesar',
      'can_store_documents',
      'can_manage_dispute_workflows'
    ])
  },
  PREMIUM: {
    code: 'PREMIUM',
    label: 'Premium',
    description: 'Expanded CredX platform access for advanced tools, readiness workflows, and deeper guidance.',
    setupFee: null,
    oneTime: 447,
    monthly: null,
    billing: 'Billed after analysis review is delivered and confirmed. No guaranteed outcome.',
    entitlements: withEntitlements([
      'can_access_dashboard',
      'can_use_basic_tools',
      'can_use_learning_center',
      'can_use_cesar',
      'can_use_advanced_tools',
      'can_use_business_credit',
      'can_use_funding_readiness',
      'can_store_documents',
      'can_manage_dispute_workflows'
    ])
  },
  FAMILY: {
    code: 'FAMILY',
    label: 'Family',
    description: 'Family-oriented CredX access with profile coordination and expanded workflow support.',
    setupFee: 300,
    oneTime: null,
    monthly: 95,
    billing: 'First-work fee after analysis review, then monthly platform/support access.',
    entitlements: withEntitlements([
      'can_access_dashboard',
      'can_use_basic_tools',
      'can_use_learning_center',
      'can_use_cesar',
      'can_use_advanced_tools',
      'can_store_documents',
      'can_manage_dispute_workflows',
      'can_manage_family_profiles'
    ])
  }
};

export function planCodeForServiceTier(tier?: string | null): PlanCode {
  const normalized = String(tier || '').trim().toUpperCase();
  if (normalized === 'AGGRESSIVE' || normalized === 'PREMIUM') return 'PREMIUM';
  if (normalized === 'FAMILY') return 'FAMILY';
  return 'ESSENTIAL';
}

/**
 * Central plan/entitlement resolution.
 *
 * Effective access is derived from the client's lifecycle state, not just the
 * serviceTier field, so an unpaid lead never receives paid entitlements:
 *   - masterclass/education student            -> MASTERCLASS
 *   - activated + paying (ACTIVE / PAST_DUE)    -> serviceTier plan
 *   - everyone else (LEAD, INTAKE, ANALYSIS...) -> FREE
 *
 * PAST_DUE keeps entitlements (soft dunning) but callers may choose to gate
 * separately on `pastDue`.
 */
export type ClientPlanInputs = {
  status?: string | null;
  serviceTier?: string | null;
  setupFeePaid?: boolean | null;
  masterclassAccess?: boolean | null;
};

export type ResolvedEntitlements = {
  plan: PlanCode;
  entitlements: Entitlements;
  pastDue: boolean;
  paid: boolean;
};

const PAID_STATUSES = new Set(['ACTIVE', 'PAST_DUE']);

export function resolveClientEntitlements(input: ClientPlanInputs): ResolvedEntitlements {
  const status = String(input.status || '').trim().toUpperCase();
  const pastDue = status === 'PAST_DUE';
  const isMasterclass = status === 'STUDENT' || input.masterclassAccess === true;

  let plan: PlanCode;
  if (PAID_STATUSES.has(status)) {
    plan = planCodeForServiceTier(input.serviceTier);
  } else if (isMasterclass) {
    plan = 'MASTERCLASS';
  } else {
    plan = 'FREE';
  }

  return {
    plan,
    entitlements: entitlementsForPlan(plan),
    pastDue,
    paid: PAID_STATUSES.has(status) || isMasterclass
  };
}

export function publicPlanCatalog() {
  return Object.values(PLAN_DEFINITIONS)
    .filter((plan) => plan.code !== 'FREE')
    .map((plan) => ({
    code: plan.code,
    label: plan.label,
    description: plan.description,
    setupFee: plan.setupFee,
    oneTime: plan.oneTime,
    monthly: plan.monthly,
    billing: plan.billing,
    entitlements: plan.entitlements
  }));
}

export function entitlementsForPlan(code: PlanCode): Entitlements {
  return { ...PLAN_DEFINITIONS[code].entitlements };
}

export function setupFeeForPlan(code: PlanCode): number {
  return PLAN_DEFINITIONS[code].setupFee ?? PLAN_DEFINITIONS[code].oneTime ?? 0;
}

export function monthlyFeeForPlan(code: PlanCode): number {
  return PLAN_DEFINITIONS[code].monthly ?? 0;
}

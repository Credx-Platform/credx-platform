export type GlossaryTerm = { term: string; definition: string };
export type LessonVideo = { title: string; url: string | null; duration?: string };
export type LessonDay = {
  day: number;
  slug: string;
  title: string;
  eyebrow: string;
  tagline: string;
  summary: string;
  image: string;
  slidesRange: { from: number; to: number };
  objectives: string[];
  videos: [LessonVideo, LessonVideo];
  glossary: GlossaryTerm[];
  actionSteps: string[];
  isBonus?: boolean;
};

export const MASTERCLASS_DAYS: LessonDay[] = [
  {
    day: 1,
    slug: 'day-1-credit-fundamentals',
    title: 'Credit Fundamentals & Report Analysis',
    eyebrow: 'Day 1 · Credit Fundamentals',
    tagline: 'Understand how credit really works',
    summary:
      'Before you fix anything, you need to know what you are looking at. The foundation: how FICO is calculated, how to read a tri-merge report, and how to spot the items actually moving your score.',
    image: '/masterclass/day1_image.jpg',
    slidesRange: { from: 3, to: 6 },
    objectives: [
      'Break down the five FICO factors and where your effort returns the most points.',
      'Pull all three bureau reports and read every section confidently.',
      'Run a systematic line-by-line review to surface errors and outdated negatives.'
    ],
    videos: [
      { title: 'Lesson 1A — The FICO Score Breakdown', url: null, duration: '12 min' },
      { title: 'Lesson 1B — Reading Your Tri-Merge Report', url: null, duration: '15 min' }
    ],
    glossary: [
      { term: 'FICO Score', definition: 'The credit score model used by ~90% of lenders. Built from payment history (35%), utilization (30%), length (15%), new credit (10%), and credit mix (10%).' },
      { term: 'Credit Utilization', definition: 'The percentage of your revolving credit limit currently in use. Below 30% is OK, below 10% is ideal for score gains.' },
      { term: 'Tri-Merge Report', definition: 'A single report combining data from Equifax, Experian, and TransUnion. Used because not every account reports to all three.' },
      { term: 'Hard Inquiry', definition: 'A credit pull triggered by a credit application. Stays on your report 24 months and impacts your score for ~12.' },
      { term: 'Soft Inquiry', definition: 'A credit pull that does not affect your score — pre-approvals, your own checks, employment verification.' }
    ],
    actionSteps: [
      'Pull all three bureau reports (annualcreditreport.com or your monitoring service).',
      'Highlight every account, inquiry, and public record line item.',
      'Mark anything inaccurate, outdated, or unfamiliar — that is your dispute target list.'
    ]
  },
  {
    day: 2,
    slug: 'day-2-disputes-decoded',
    title: 'The Dispute Process Decoded',
    eyebrow: 'Day 2 · Disputes & Removals',
    tagline: 'Your legal rights and the dispute workflow',
    summary:
      'The Fair Credit Reporting Act gives you a real toolkit — most people just do not know how to use it. The laws that protect you and the dispute workflow that forces investigations.',
    image: '/masterclass/day2_image.jpg',
    slidesRange: { from: 7, to: 10 },
    objectives: [
      'Know your rights under the FCRA and FDCPA cold.',
      'Draft a dispute letter that bureaus cannot legally ignore.',
      'Track responses and escalate within the 30-day reinvestigation window.'
    ],
    videos: [
      { title: 'Lesson 2A — Your FCRA & FDCPA Rights', url: null, duration: '14 min' },
      { title: 'Lesson 2B — The Complete Dispute Workflow', url: null, duration: '18 min' }
    ],
    glossary: [
      { term: 'FCRA', definition: 'Fair Credit Reporting Act — federal law giving you the right to access, dispute, and seek damages for inaccurate credit reporting.' },
      { term: 'FDCPA', definition: 'Fair Debt Collection Practices Act — limits how third-party debt collectors can contact you and what they must prove.' },
      { term: 'Reinvestigation', definition: 'The mandatory 30-day investigation a bureau must conduct after you dispute an item. If they fail to verify, the item must be removed.' },
      { term: 'Method of Verification (MOV)', definition: 'A formal request for the bureau to disclose how they verified a disputed item. Often exposes weak verification.' },
      { term: 'Furnisher', definition: 'The creditor or collector who reports an account to the bureaus. Has its own duty under the FCRA to investigate disputes.' }
    ],
    actionSteps: [
      'Pick 1–3 inaccurate items from your Day 1 target list.',
      'Draft a clear, specific dispute letter for each (no form letters).',
      'Mail certified with return receipt; log the date so you can demand action at day 30.'
    ]
  },
  {
    day: 3,
    slug: 'day-3-advanced-tactics',
    title: 'Advanced Dispute Tactics',
    eyebrow: 'Day 3 · Advanced Tactics',
    tagline: 'Escalation when bureaus stall',
    summary:
      'Standard disputes get most things removed, but some negatives need extra pressure. The escalation playbook — 609 letters, validation, and the regulatory levers that get bureaus and collectors to comply.',
    image: '/masterclass/day3_image.jpg',
    slidesRange: { from: 11, to: 14 },
    objectives: [
      'Use Section 609 to demand verifiable proof of reporting.',
      'Force collectors to validate before paying or settling.',
      'Escalate non-compliance to the CFPB, state AG, or small claims.'
    ],
    videos: [
      { title: 'Lesson 3A — 609 Letters & The Verification Duty', url: null, duration: '13 min' },
      { title: 'Lesson 3B — Debt Validation & Escalation Path', url: null, duration: '16 min' }
    ],
    glossary: [
      { term: 'Section 609', definition: 'The FCRA provision letting you request the source documents used to verify a disputed item. Bureaus that cannot produce them must remove the item.' },
      { term: 'Debt Validation', definition: 'A formal demand under the FDCPA forcing a collector to prove the debt is theirs to collect, the amount is correct, and they own or service it.' },
      { term: 'CFPB Complaint', definition: 'A complaint filed with the Consumer Financial Protection Bureau. Companies must respond within 15 days and it often resolves stalled disputes.' },
      { term: 'Pay-for-Delete', definition: 'A negotiated settlement where the collector agrees to remove the tradeline in exchange for payment. Get it in writing before paying.' },
      { term: 'Statute of Limitations', definition: 'The legal window during which a creditor can sue you. Different from the 7-year reporting window — never confuse the two.' }
    ],
    actionSteps: [
      'For any item that survived Day 2 disputes, send a 609 letter or validation request.',
      'If the bureau ignores the 30-day window, file a CFPB complaint same-day.',
      'Document every step — certified mail receipts, response letters, complaint IDs.'
    ]
  },
  {
    day: 4,
    slug: 'day-4-building-positive-credit',
    title: 'Building Positive Credit',
    eyebrow: 'Day 4 · Building Positive Credit',
    tagline: 'Add strong tradelines to push the score up',
    summary:
      'Removing negatives is half the work. The other half is replacing them with strong, consistent positive history. The building blocks that move scores fastest without taking on real risk.',
    image: '/masterclass/day4_image.jpg',
    slidesRange: { from: 15, to: 18 },
    objectives: [
      'Use authorized-user tradelines to import years of payment history.',
      'Choose and use a secured card so it actually graduates.',
      'Stack credit-builder loans, rent reporting, and utility reporting for compounding gains.'
    ],
    videos: [
      { title: 'Lesson 4A — Authorized User Strategy', url: null, duration: '11 min' },
      { title: 'Lesson 4B — Secured Cards & Builder Loans', url: null, duration: '14 min' }
    ],
    glossary: [
      { term: 'Authorized User (AU)', definition: 'A person added to someone else\'s credit card who inherits the account\'s payment history on their own report — without being legally liable.' },
      { term: 'Secured Credit Card', definition: 'A credit card backed by a refundable deposit. Reports like any other card and is the easiest unfunded line to qualify for.' },
      { term: 'Credit Builder Loan', definition: 'A small installment loan held in escrow until paid. Builds payment history and adds an installment account to your mix.' },
      { term: 'Tradeline', definition: 'Any account on your credit report — credit card, loan, mortgage. Each tradeline contributes to length, mix, and utilization.' },
      { term: 'Graduation', definition: 'When a secured card is converted to an unsecured card and your deposit is returned. Triggered by consistent on-time use.' }
    ],
    actionSteps: [
      'Identify one trusted family member with strong, low-utilization credit and ask to be added as an AU.',
      'Open one secured card — small deposit, lowest fees, reports to all three bureaus.',
      'Set every recurring bill on autopay; never carry a balance over the statement date.'
    ]
  },
  {
    day: 5,
    slug: 'day-5-business-credit',
    title: 'Business Credit & Funding',
    eyebrow: 'Day 5 · Business Credit & Funding',
    tagline: 'Separate personal and business credit for growth',
    summary:
      'Business credit is its own profile and it scales differently than personal. Build the foundation correctly — entity, EIN, banking, vendor lines — so you can qualify for funding without leaning on personal credit.',
    image: '/masterclass/day5_image.jpg',
    slidesRange: { from: 19, to: 22 },
    objectives: [
      'Stand up a credible business profile lenders will trust (LLC, EIN, banking, address).',
      'Open Net-30 vendor accounts to start a real business credit file.',
      'Move from vendor credit to business credit lines and term funding.'
    ],
    videos: [
      { title: 'Lesson 5A — Entity Formation & The Credible Profile', url: null, duration: '15 min' },
      { title: 'Lesson 5B — Net-30 Vendors & Business Funding', url: null, duration: '17 min' }
    ],
    glossary: [
      { term: 'EIN', definition: 'Employer Identification Number — the IRS-issued tax ID for a business. Free, takes minutes, required to build business credit.' },
      { term: 'D-U-N-S Number', definition: 'A unique 9-digit identifier from Dun & Bradstreet that your business credit file is built on. Free to request.' },
      { term: 'Net-30 Account', definition: 'A vendor credit line where invoices are due 30 days after billing. Reports to business bureaus and is the standard starter tradeline.' },
      { term: 'Paydex Score', definition: 'Dun & Bradstreet\'s 0–100 business payment score. 80+ means paying on time; 90+ means paying early.' },
      { term: 'Business Credit Profile', definition: 'The combined record across D&B, Experian Business, and Equifax Business. Lenders pull this before extending business credit.' }
    ],
    actionSteps: [
      'File the LLC and request the EIN; open a dedicated business bank account.',
      'Get the D-U-N-S number and open 3–5 Net-30 vendor accounts that report.',
      'Pay every Net-30 invoice early for 90 days, then apply for a business credit card.'
    ]
  },
  {
    day: 6,
    slug: 'bonus-generational-wealth',
    isBonus: true,
    title: 'Generational Wealth',
    eyebrow: 'Bonus Day · Generational Wealth',
    tagline: 'Build something that outlasts you',
    summary:
      'Credit is a tool. Wealth is the goal. The bonus day connects everything you have learned to the longer game — investing, real estate, passive income, and the structures that protect what you build for the next generation.',
    image: '/masterclass/final_image.jpg',
    slidesRange: { from: 23, to: 23 },
    objectives: [
      'Use strong credit to access better real-estate financing.',
      'Set up a boring, consistent investing routine that compounds.',
      'Use trust structures to protect and transfer what you build.'
    ],
    videos: [
      { title: 'Bonus 6A — Real Estate as a Leveraged Asset', url: null, duration: '14 min' },
      { title: 'Bonus 6B — Investing, Trusts & Legacy', url: null, duration: '16 min' }
    ],
    glossary: [
      { term: 'Leverage', definition: 'Using borrowed capital — typically a mortgage — to control an asset larger than your cash position. Amplifies gains and risk.' },
      { term: 'Compound Growth', definition: 'Earnings that themselves earn returns. Why consistent contributions over decades outperform timing the market.' },
      { term: 'Revocable Living Trust', definition: 'A trust you control during life that passes assets without probate at death. The simplest structure for most families.' },
      { term: 'Asset Protection', definition: 'Legal structures (LLCs, trusts, insurance) that separate your personal wealth from business and liability risk.' },
      { term: 'Legacy Transfer', definition: 'The deliberate process of passing financial assets and financial literacy to the next generation, by titling and education.' }
    ],
    actionSteps: [
      'Open a brokerage and automate a monthly contribution — even $50.',
      'Talk to a real-estate agent about what your improved credit qualifies you for.',
      'Schedule a consult with an estate attorney to set up a basic revocable trust.'
    ]
  }
];

export function findDay(day: number): LessonDay | undefined {
  return MASTERCLASS_DAYS.find((d) => d.day === day);
}

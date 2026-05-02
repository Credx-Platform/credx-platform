export type GlossaryTerm = { term: string; definition: string };
export type LessonVideo = { title: string; description: string; url: string | null; duration?: string };
export type LessonQA = { question: string; answer: string };
export type LessonDay = {
  day: number;
  slug: string;
  title: string;
  eyebrow: string;
  tagline: string;
  summary: string;
  image: string;
  accent: string;
  slidesRange: { from: number; to: number };
  objectives: string[];
  videos: [LessonVideo, LessonVideo];
  glossary: GlossaryTerm[];
  actionSteps: string[];
  qa: LessonQA[];
  isBonus?: boolean;
};

export const DAY_ACCENTS: Record<number, string> = {
  1: '#00c6fb', // cyan — fundamentals
  2: '#a855f7', // violet — disputes / legal
  3: '#22d3ee', // teal — escalation
  4: '#22c55e', // green — building positive
  5: '#3b82f6', // royal blue — business
  6: '#f59e0b'  // gold — bonus / wealth
};

export const MASTERCLASS_DAYS: LessonDay[] = [
  {
    day: 1,
    slug: 'day-1-credit-fundamentals',
    title: 'Credit Fundamentals & Report Analysis',
    eyebrow: 'Day 1 · Credit Fundamentals',
    tagline: 'Learn how credit really works',
    accent: '#00c6fb',
    summary:
      'Today you find out what a credit score actually is, what makes it go up or down, and how to read your own credit report. Think of this as the rulebook everyone needs before they start playing the credit game.',
    image: '/masterclass/day1_image.jpg',
    slidesRange: { from: 3, to: 6 },
    objectives: [
      'Know the 5 things that make up your FICO score and which matter most.',
      'Pull your free credit report from all 3 bureaus the right way.',
      'Spot mistakes on your report so you know what to fix.'
    ],
    videos: [
      {
        title: 'Lesson 1A — How Your Credit Score Works',
        description:
          'A simple breakdown of the 5 ingredients in your FICO score: paying on time (35%), how much of your credit limit you use (30%), how long you have had credit (15%), new accounts (10%), and your mix of accounts (10%). You will see why "pay on time and keep balances low" is the most important rule.',
        url: null,
        duration: '12 min'
      },
      {
        title: 'Lesson 1B — Reading Your Credit Report Like a Pro',
        description:
          'Walks through every section of a real credit report: personal info, accounts, inquiries, and public records. You will learn what each line means in plain English and how to tell when something looks wrong.',
        url: null,
        duration: '15 min'
      }
    ],
    glossary: [
      { term: 'Credit Score', definition: 'A 3-digit number (300–850) that tells lenders how risky it is to lend to you. Higher is better.' },
      { term: 'FICO Score', definition: 'The most popular credit score. Almost every bank and lender uses it. Built from 5 things — see Lesson 1A.' },
      { term: 'Credit Utilization', definition: 'How much of your credit card limit you are using. Example: $300 owed on a $1,000 card = 30% utilization. Keep this under 30%, ideally under 10%.' },
      { term: 'Credit Bureau', definition: 'A company that collects and stores your credit history. There are 3 big ones: Equifax, Experian, and TransUnion.' },
      { term: 'Tri-Merge Report', definition: 'A single report that shows your credit info from all 3 bureaus side by side. Used because not every lender reports to all 3.' },
      { term: 'Hard Inquiry', definition: 'When you apply for credit, the lender pulls your report. This drops your score a few points and stays for 24 months.' },
      { term: 'Soft Inquiry', definition: 'When you check your own credit or a pre-approved offer is sent. Does NOT lower your score.' }
    ],
    actionSteps: [
      'Go to annualcreditreport.com and pull your reports from all 3 bureaus (free).',
      'Read every line of each report. Highlight anything you do not recognize.',
      'Make a list of every mistake or strange item — that is your fix-it list for Day 2.'
    ],
    qa: [
      {
        question: '"I checked my credit and the 3 scores are all different. Which one is real?"',
        answer:
          'All 3 are real. Each bureau gets its info from different lenders, so they rarely match exactly. What matters is the trend — if all 3 are going up, you are doing it right.'
      },
      {
        question: '"Will checking my own credit hurt my score?"',
        answer:
          'No. Pulling your own report is a soft inquiry and does not affect your score. You can check it as often as you want.'
      },
      {
        question: '"I have never had a credit card. Do I have a credit score?"',
        answer:
          'Probably not yet. Without any accounts, you are "credit invisible." Day 4 covers exactly how to start your first tradeline the right way.'
      },
      {
        question: '"My utilization is at 80% — how fast can I drop it?"',
        answer:
          'Pay it down before the statement closes. Cards report your balance once a month on the statement date. If you pay it off before that day, the bureau sees a low balance and your score updates within 30 days.'
      }
    ]
  },
  {
    day: 2,
    slug: 'day-2-disputes-decoded',
    title: 'The Dispute Process Decoded',
    eyebrow: 'Day 2 · Disputes & Removals',
    tagline: 'Use your legal rights to fix mistakes',
    accent: '#a855f7',
    summary:
      'There are real laws that protect you and force credit bureaus to fix mistakes. Most people do not know about them. Today you learn the laws, how to write a dispute letter that actually works, and what happens after you send it.',
    image: '/masterclass/day2_image.jpg',
    slidesRange: { from: 7, to: 10 },
    objectives: [
      'Understand your rights under the FCRA and FDCPA in plain English.',
      'Write a clear, simple dispute letter that bureaus must investigate.',
      'Track the 30-day clock and know what to do if they ignore you.'
    ],
    videos: [
      {
        title: 'Lesson 2A — Your Rights: FCRA + FDCPA',
        description:
          'Two laws are on your side. The FCRA controls credit bureaus and gives you the right to dispute anything inaccurate. The FDCPA controls debt collectors and limits how they can contact you. This lesson breaks down each one in plain words.',
        url: null,
        duration: '14 min'
      },
      {
        title: 'Lesson 2B — Writing a Dispute Letter That Works',
        description:
          'A template-by-template walkthrough: what to include, what to leave out, how specific to be, and how to mail it so the bureau cannot pretend it never arrived. By the end you will have a letter ready to send.',
        url: null,
        duration: '18 min'
      }
    ],
    glossary: [
      { term: 'FCRA', definition: 'Fair Credit Reporting Act. The federal law that says you can dispute anything wrong on your credit report and the bureau must investigate within 30 days.' },
      { term: 'FDCPA', definition: 'Fair Debt Collection Practices Act. The federal law that says debt collectors cannot harass you, call you at work after you tell them not to, or lie about what you owe.' },
      { term: 'Dispute', definition: 'A formal request asking a credit bureau to look into something on your report and remove it if they cannot prove it is correct.' },
      { term: 'Reinvestigation', definition: 'The 30-day window the bureau has to check your dispute. If they cannot prove the item is right, they must delete it.' },
      { term: 'Furnisher', definition: 'The company that originally reported the account (the credit card, lender, or collector). They also have to investigate your dispute.' }
    ],
    actionSteps: [
      'Pick 1 to 3 mistakes from your Day 1 fix-it list. Start small.',
      'Write a short, clear letter for each. Say exactly what is wrong and why.',
      'Mail the letters certified with return receipt. Save the green card. The 30-day clock starts when they sign.'
    ],
    qa: [
      {
        question: '"Can I dispute a debt that is really mine just because I do not want to pay?"',
        answer:
          'No. Disputes are for inaccurate, incomplete, or unverifiable info. Disputing things you know are correct is fraud. Day 3 shows you legal options for real debts.'
      },
      {
        question: '"How long does a dispute take?"',
        answer:
          'The bureau has 30 days from when they receive your letter (45 days if you sent extra info during the window). Most people see results in 30–45 days.'
      },
      {
        question: '"I disputed online and they said \'verified.\' What now?"',
        answer:
          'Online disputes are often automated and weak. Send the same dispute again by certified mail with specific reasons. Mailed disputes are taken more seriously.'
      },
      {
        question: '"A collector keeps calling me. Can I make it stop?"',
        answer:
          'Yes. Send a written "cease and desist" letter (the FDCPA gives you this right). After they get it, they can only contact you to confirm they are stopping or to tell you they are suing.'
      }
    ]
  },
  {
    day: 3,
    slug: 'day-3-advanced-tactics',
    title: 'Advanced Dispute Tactics',
    eyebrow: 'Day 3 · Advanced Tactics',
    tagline: 'What to do when the easy disputes do not work',
    accent: '#22d3ee',
    summary:
      'Most disputes get fixed in Round 1. The stubborn ones need extra pressure. Today you learn 3 advanced tools: 609 letters, debt validation, and how to use government agencies to make bureaus and collectors comply.',
    image: '/masterclass/day3_image.jpg',
    slidesRange: { from: 11, to: 14 },
    objectives: [
      'Use a 609 letter to demand the bureau show their proof.',
      'Force a collector to prove the debt is actually theirs to collect.',
      'File a CFPB complaint when bureaus drag their feet.'
    ],
    videos: [
      {
        title: 'Lesson 3A — 609 Letters Made Simple',
        description:
          'Section 609 of the FCRA lets you ask the bureau for the actual paperwork they used to verify a disputed item. If they cannot produce it, the item must come off. This lesson gives you the wording and when to use it.',
        url: null,
        duration: '13 min'
      },
      {
        title: 'Lesson 3B — Validation + The CFPB Escalation Path',
        description:
          'Step 1: make collectors prove the debt is theirs. Step 2: if they cannot, the debt comes off. Step 3: if anyone refuses to follow the law, you file a CFPB complaint and they have 15 days to respond. We walk through all 3.',
        url: null,
        duration: '16 min'
      }
    ],
    glossary: [
      { term: '609 Letter', definition: 'A letter that uses Section 609 of the FCRA to demand the bureau show the original documents that prove an account is yours. No proof = item removed.' },
      { term: 'Debt Validation', definition: 'A request that forces a debt collector to prove (1) the debt exists, (2) you owe it, (3) they have the right to collect it. If they cannot, they have to stop.' },
      { term: 'CFPB', definition: 'Consumer Financial Protection Bureau. A government agency that takes complaints against lenders, bureaus, and collectors. Companies must respond within 15 days.' },
      { term: 'Pay-for-Delete', definition: 'A deal where a collector agrees to remove the bad mark in exchange for payment. Always get this in writing BEFORE you pay.' },
      { term: 'Statute of Limitations', definition: 'The time window where a creditor can sue you for an unpaid debt. Different from the 7-year credit reporting limit. Never confuse the two.' }
    ],
    actionSteps: [
      'For any item that survived Day 2, send a 609 letter or a debt validation letter.',
      'Wait 30 days. If you get no response or a "verified" with no proof, file a CFPB complaint.',
      'Keep every letter, receipt, and confirmation number. Documentation wins these fights.'
    ],
    qa: [
      {
        question: '"A collector said they would settle for half. Should I take it?"',
        answer:
          'Sometimes. But always negotiate "pay for delete" first. Settling without removal still leaves the bad mark on your report for 7 years. Get any deal in writing before sending money.'
      },
      {
        question: '"What if the 609 letter does not work?"',
        answer:
          'Move to a CFPB complaint, then a state attorney general complaint. These complaints get attention because companies hate the paperwork that follows them.'
      },
      {
        question: '"I was told the debt is past the statute of limitations. Should I just pay it off?"',
        answer:
          'No — paying or even acknowledging an old debt can RESTART the clock and make it suable again. Talk to a consumer-protection attorney before you pay anything on an old debt.'
      },
      {
        question: '"The collector keeps reporting after I disputed. Is that legal?"',
        answer:
          'No. Once a debt is in dispute under the FDCPA, the collector must mark it as disputed on your credit report. If they do not, that is a separate violation you can sue for.'
      }
    ]
  },
  {
    day: 4,
    slug: 'day-4-building-positive-credit',
    title: 'Building Positive Credit',
    eyebrow: 'Day 4 · Building Positive Credit',
    tagline: 'Add good accounts to push your score up',
    accent: '#22c55e',
    summary:
      'Removing bad stuff is half the job. The other half is adding good payment history that says "I am responsible." Today you learn the safest, fastest ways to build positive credit without taking on real risk.',
    image: '/masterclass/day4_image.jpg',
    slidesRange: { from: 15, to: 18 },
    objectives: [
      'Become an authorized user on a strong card to import good history.',
      'Pick the right secured credit card and use it the right way.',
      'Stack credit-builder loans, rent reporting, and bill reporting for extra wins.'
    ],
    videos: [
      {
        title: 'Lesson 4A — Authorized User Strategy',
        description:
          'Being added to a family member\'s credit card can put their good payment history on YOUR report — without you being responsible for the debt. We cover who to ask, what to look for, and the mistakes that ruin this strategy.',
        url: null,
        duration: '11 min'
      },
      {
        title: 'Lesson 4B — Secured Cards + Builder Loans',
        description:
          'A secured card is a real credit card backed by a small refundable deposit. A builder loan is a small loan that builds your payment history. We pick the best ones, show how to use them, and explain when to graduate to a regular card.',
        url: null,
        duration: '14 min'
      }
    ],
    glossary: [
      { term: 'Tradeline', definition: 'Any account on your credit report — credit card, loan, mortgage. More positive tradelines = better score.' },
      { term: 'Authorized User (AU)', definition: 'Someone added to another person\'s credit card. Gets the card\'s full history on their own report but is NOT legally responsible for the bill.' },
      { term: 'Secured Credit Card', definition: 'A credit card backed by a refundable deposit (often $200–$500). Easy to qualify for and reports like a normal card.' },
      { term: 'Credit Builder Loan', definition: 'A small loan where the money is held in a savings account until you pay it off. Each on-time payment is reported to the bureaus.' },
      { term: 'Graduation', definition: 'When a secured card converts to an unsecured (regular) card and you get your deposit back. Triggered by paying on time, every time.' }
    ],
    actionSteps: [
      'Ask one trusted family member with strong, low-utilization credit to add you as an AU.',
      'Open one secured card with a low fee that reports to all 3 bureaus.',
      'Set every recurring bill on autopay so you never miss a payment by accident.'
    ],
    qa: [
      {
        question: '"My family\'s credit is bad. Can I still be an authorized user?"',
        answer:
          'Skip it — you would inherit their history and it could hurt you. Focus on the secured card and builder loan path instead. AU only helps when the primary account is strong.'
      },
      {
        question: '"How long until I see my score go up?"',
        answer:
          '30–60 days for the first reporting cycle. Real, sustained gains usually show up after 3–6 months of clean on-time payments and low utilization.'
      },
      {
        question: '"Should I close my old credit card after I open new ones?"',
        answer:
          'Usually no. Closing it shortens your credit history AND lowers your total credit limit, which raises utilization. Keep it open and use it once every few months.'
      },
      {
        question: '"Is it OK to carry a small balance to \'build credit\'?"',
        answer:
          'No — that is a myth. Pay your statement balance in full every month. You build credit by USING the card, not by carrying interest.'
      }
    ]
  },
  {
    day: 5,
    slug: 'day-5-business-credit',
    title: 'Business Credit & Funding',
    eyebrow: 'Day 5 · Business Credit & Funding',
    tagline: 'Build credit for your business, not just yourself',
    accent: '#3b82f6',
    summary:
      'Business credit is its own separate score for your company. Done right, your business can qualify for cards, lines, and loans without using your personal credit. Today you learn how to set the foundation and open your first business tradelines.',
    image: '/masterclass/day5_image.jpg',
    slidesRange: { from: 19, to: 22 },
    objectives: [
      'Set up a real business profile that lenders trust (LLC, EIN, bank account, address).',
      'Open Net-30 vendor accounts to start a business credit file.',
      'Move from vendor credit to business credit cards and real funding.'
    ],
    videos: [
      {
        title: 'Lesson 5A — Setting Up the Business Foundation',
        description:
          'Step-by-step: file the LLC, get the EIN (free, takes minutes), open a business bank account, and get a business address and phone. Lenders check ALL of this. We list the exact order to do it in.',
        url: null,
        duration: '15 min'
      },
      {
        title: 'Lesson 5B — Net-30 Vendors + Real Funding',
        description:
          'The 5 best Net-30 vendor accounts to start with, how to qualify with no business history, and the exact 90-day path from your first vendor account to a real business credit card or line of credit.',
        url: null,
        duration: '17 min'
      }
    ],
    glossary: [
      { term: 'EIN', definition: 'Employer Identification Number. The IRS tax ID for your business — like a Social Security Number for the company. Free at irs.gov.' },
      { term: 'D-U-N-S Number', definition: 'A 9-digit ID from Dun & Bradstreet that your business credit file is built on. Free to get and required for many vendors.' },
      { term: 'Net-30 Account', definition: 'A vendor that lets you buy now and pay in 30 days. They report your on-time payments to business credit bureaus — your starter tradelines.' },
      { term: 'Paydex Score', definition: 'A 0–100 business payment score from Dun & Bradstreet. 80 = paying on time. 90+ = paying early. Aim for 80+.' },
      { term: 'Business Credit Profile', definition: 'Your business\'s combined record across D&B, Experian Business, and Equifax Business. Lenders pull this before approving real funding.' }
    ],
    actionSteps: [
      'File the LLC, get the EIN, and open a business bank account this week.',
      'Get a free D-U-N-S number and open 3–5 starter Net-30 accounts.',
      'Pay every Net-30 invoice early for 90 days, then apply for your first business credit card.'
    ],
    qa: [
      {
        question: '"Do I need an LLC, or can I use my Social Security Number?"',
        answer:
          'You can technically build "business" credit as a sole proprietor with your SSN, but it ties everything to your personal credit. The LLC + EIN combo is what actually separates the two.'
      },
      {
        question: '"How long until my business can qualify for a real credit card?"',
        answer:
          '90 days of clean Net-30 payments + a Paydex of 80+ usually unlocks Capital One Spark, Amex Business, and similar starter business cards.'
      },
      {
        question: '"Will my business credit show up on my personal report?"',
        answer:
          'Not if you set it up right. EIN-only accounts that report to D&B/Experian Business stay off your personal report. Some business cards still pull personal credit during application — read before you apply.'
      },
      {
        question: '"My business is brand new. Can I still get funding?"',
        answer:
          'Yes — but start small. Vendor credit first, then a business credit card after 90 days, then a line of credit after 6 months. Skipping steps is what gets people denied.'
      }
    ]
  },
  {
    day: 6,
    slug: 'bonus-generational-wealth',
    isBonus: true,
    title: 'Generational Wealth',
    eyebrow: 'Bonus Day · Generational Wealth',
    tagline: 'Use credit to build something that lasts',
    accent: '#f59e0b',
    summary:
      'Credit is a tool. The goal is wealth — money and assets that outlive you and help your family. Today connects everything you have learned to the bigger picture: investing, real estate, and the structures that protect what you build.',
    image: '/masterclass/final_image.jpg',
    slidesRange: { from: 23, to: 23 },
    objectives: [
      'Use strong credit to qualify for better real-estate financing.',
      'Set up a simple, automatic investing routine.',
      'Use a basic trust to protect and pass down what you build.'
    ],
    videos: [
      {
        title: 'Bonus 6A — Real Estate as Your First Big Win',
        description:
          'Why a primary home is usually the first wealth-building purchase, how strong credit unlocks better mortgage rates, and how a single house can compound into multiple properties over a decade.',
        url: null,
        duration: '14 min'
      },
      {
        title: 'Bonus 6B — Investing + Legacy',
        description:
          'How to start investing with $50/month, why "boring and consistent" beats trying to time the market, and how a basic revocable living trust keeps your assets out of probate so your family actually gets them.',
        url: null,
        duration: '16 min'
      }
    ],
    glossary: [
      { term: 'Leverage', definition: 'Using borrowed money (like a mortgage) to control an asset bigger than your cash. Multiplies gains AND losses.' },
      { term: 'Compound Growth', definition: 'When your money earns money, and that money also starts earning money. Over decades it is how small contributions become real wealth.' },
      { term: 'Revocable Living Trust', definition: 'A trust you control during your life that passes assets to your family without going through probate court when you die.' },
      { term: 'Asset Protection', definition: 'Legal structures (LLCs, trusts, insurance) that keep your personal money safe from business risk and lawsuits.' },
      { term: 'Legacy Transfer', definition: 'The process of passing money, assets, AND financial knowledge to the next generation so they keep what you built.' }
    ],
    actionSteps: [
      'Open a brokerage account and automate a small monthly contribution — even $50.',
      'Talk to a real-estate agent about what your improved credit qualifies you for.',
      'Schedule a consultation with an estate-planning attorney to set up a basic trust.'
    ],
    qa: [
      {
        question: '"Should I pay off all my debt before I start investing?"',
        answer:
          'Pay off high-interest debt (credit cards) first. But for low-interest debt like a mortgage, you can usually invest at the same time — the long-term return on the market typically beats the mortgage rate.'
      },
      {
        question: '"How much do I need to start investing in real estate?"',
        answer:
          'For a primary home, FHA loans go down to 3.5% — on a $200,000 house, that is $7,000 down. Strong credit gets you better rates and lower private mortgage insurance.'
      },
      {
        question: '"Do I really need a trust if I do not have much money yet?"',
        answer:
          'A revocable living trust is cheap insurance. It avoids probate (which can take 6–18 months and cost thousands) and lets your family inherit smoothly. Set it up before you need it.'
      },
      {
        question: '"How do I teach my kids about money without overwhelming them?"',
        answer:
          'Start with the basics they can see — savings, why we pay bills on time, how a credit card works. Let them watch you make decisions. Modeling beats lecturing.'
      }
    ]
  }
];

export function findDay(day: number): LessonDay | undefined {
  return MASTERCLASS_DAYS.find((d) => d.day === day);
}

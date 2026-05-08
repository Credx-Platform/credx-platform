export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  rationale: string;
};

export type DayQuiz = {
  day: number;
  slug: string;
  passingScore: number;
  questions: QuizQuestion[];
};

export const QUIZ_PASSING_SCORE = 0.8;
export const QUIZ_MAX_ATTEMPTS_BEFORE_COOLDOWN = 3;
export const QUIZ_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const MASTERCLASS_QUIZZES: DayQuiz[] = [
  {
    day: 1,
    slug: 'day-1-credit-fundamentals',
    passingScore: 0.8,
    questions: [
      {
        id: 'd1q1',
        prompt: 'What share of your FICO score comes from payment history?',
        choices: ['10%', '15%', '30%', '35%'],
        correctIndex: 3,
        rationale: 'Payment history is the single biggest factor at 35%, which is why "pay on time, every time" is rule one.'
      },
      {
        id: 'd1q2',
        prompt: 'Credit utilization makes up what percentage of your FICO score?',
        choices: ['10%', '15%', '30%', '35%'],
        correctIndex: 2,
        rationale: 'Utilization is 30% — second only to payment history. Keep balances under 30% of the limit, ideally under 10%.'
      },
      {
        id: 'd1q3',
        prompt: 'What is the score range for a standard FICO score?',
        choices: ['100–999', '300–850', '500–900', '0–1000'],
        correctIndex: 1,
        rationale: 'FICO scores run 300 to 850. Higher means lower risk to a lender.'
      },
      {
        id: 'd1q4',
        prompt: 'Which of these counts as a SOFT inquiry that does not lower your score?',
        choices: [
          'Applying for a new credit card',
          'A car-loan pre-approval after you submit a full application',
          'Pulling your own credit report from annualcreditreport.com',
          'Shopping mortgage rates with five lenders in one week'
        ],
        correctIndex: 2,
        rationale: 'Checking your own credit is a soft pull. Hard pulls happen when you submit applications for new credit.'
      },
      {
        id: 'd1q5',
        prompt: 'How long does a hard inquiry stay on your credit report?',
        choices: ['6 months', '12 months', '24 months', '7 years'],
        correctIndex: 2,
        rationale: 'Hard inquiries remain visible for 24 months but only meaningfully affect scoring for the first 12.'
      },
      {
        id: 'd1q6',
        prompt: 'Which three companies are the major U.S. credit bureaus?',
        choices: [
          'FICO, Vantage, and TransUnion',
          'Equifax, Experian, and TransUnion',
          'Equifax, FICO, and Experian',
          'Dun & Bradstreet, Equifax, and Experian'
        ],
        correctIndex: 1,
        rationale: 'Equifax, Experian, and TransUnion are the three nationwide consumer credit bureaus. FICO is a score, not a bureau.'
      },
      {
        id: 'd1q7',
        prompt: 'What is a tri-merge report?',
        choices: [
          'A score that averages all three bureaus into one number',
          'A single report that shows your credit info from all three bureaus side by side',
          'A monthly subscription that monitors three accounts at once',
          'A merger of three creditor accounts into a single tradeline'
        ],
        correctIndex: 1,
        rationale: 'A tri-merge stacks all three bureau reports together because not every lender reports to all three.'
      },
      {
        id: 'd1q8',
        prompt: 'You owe $300 on a card with a $1,000 limit. What is your utilization on that card?',
        choices: ['3%', '10%', '30%', '70%'],
        correctIndex: 2,
        rationale: 'Utilization = balance / limit. 300 ÷ 1,000 = 30%. Aim to keep this number below 30%, ideally under 10%.'
      },
      {
        id: 'd1q9',
        prompt: 'When does a credit card report your balance to the bureaus?',
        choices: [
          'On the payment due date',
          'On the statement closing date',
          'On the day you make a purchase',
          'On the first of every month'
        ],
        correctIndex: 1,
        rationale: 'Cards typically report the statement balance — pay it down before the statement date if you want low utilization to show.'
      },
      {
        id: 'd1q10',
        prompt: 'Two of the three bureaus show different scores. Which is the "real" one?',
        choices: [
          'The lowest score is the only honest one',
          'The middle of the three is the official FICO',
          'All three are real because each bureau gets data from different lenders',
          'The highest score because it reflects your best behavior'
        ],
        correctIndex: 2,
        rationale: 'All three are valid. They differ because lenders do not all report to every bureau. Watch the trend, not any single number.'
      }
    ]
  },
  {
    day: 2,
    slug: 'day-2-disputes-decoded',
    passingScore: 0.8,
    questions: [
      {
        id: 'd2q1',
        prompt: 'What does FCRA stand for?',
        choices: [
          'Federal Credit Recovery Act',
          'Fair Credit Reporting Act',
          'Financial Conduct & Reporting Authority',
          'Federal Consumer Rights Act'
        ],
        correctIndex: 1,
        rationale: 'The Fair Credit Reporting Act is the federal law that gives consumers the right to dispute inaccurate items.'
      },
      {
        id: 'd2q2',
        prompt: 'What does FDCPA stand for?',
        choices: [
          'Federal Debt Cancellation Protection Act',
          'Fair Debt Collection Practices Act',
          'Financial Default & Collection Protection Authority',
          'Federal Disclosure & Consumer Practices Act'
        ],
        correctIndex: 1,
        rationale: 'The Fair Debt Collection Practices Act limits how debt collectors can contact and treat consumers.'
      },
      {
        id: 'd2q3',
        prompt: 'How many days does a credit bureau have to investigate a written dispute?',
        choices: ['7 days', '15 days', '30 days', '90 days'],
        correctIndex: 2,
        rationale: 'The FCRA gives bureaus 30 days from receipt to reinvestigate (45 if you send additional info during the window).'
      },
      {
        id: 'd2q4',
        prompt: 'Why are mailed disputes generally taken more seriously than online disputes?',
        choices: [
          'They cost more to process so the bureau pays attention',
          'Online disputes are often handled by automated systems and given less scrutiny',
          'Federal law only allows mailed disputes to count',
          'Bureaus get a bigger fine if they ignore mailed letters'
        ],
        correctIndex: 1,
        rationale: 'Online disputes hit the e-OSCAR automated pipeline. Certified mail puts a documented, human-handled letter on the bureau\'s desk.'
      },
      {
        id: 'd2q5',
        prompt: 'What is a "furnisher" in dispute language?',
        choices: [
          'The bureau that sends your monthly statement',
          'The original company that reported the account (the lender, card issuer, or collector)',
          'The lawyer hired to defend a credit-repair company',
          'A retailer that resells a charged-off debt to a collector'
        ],
        correctIndex: 1,
        rationale: 'The furnisher is the data source — the creditor or collector that sent the info to the bureau in the first place.'
      },
      {
        id: 'd2q6',
        prompt: 'Is it legal to dispute a debt you actually owe just because you do not want to pay?',
        choices: [
          'Yes, all consumers can dispute anything',
          'Only if it is over five years old',
          'No — disputes are for inaccurate, incomplete, or unverifiable items only',
          'Only with written permission from the creditor'
        ],
        correctIndex: 2,
        rationale: 'Disputes exist to correct errors, not to erase legitimate accurate accounts. Misuse can be considered fraud.'
      },
      {
        id: 'd2q7',
        prompt: 'A debt collector keeps calling. Which letter forces them to stop most contact?',
        choices: [
          'A pay-for-delete request',
          'A 609 letter',
          'A written cease-and-desist letter under the FDCPA',
          'A CFPB consumer complaint'
        ],
        correctIndex: 2,
        rationale: 'Once a written cease-and-desist is delivered, the FDCPA only lets a collector contact you to confirm the stop or to say they are suing.'
      },
      {
        id: 'd2q8',
        prompt: 'What happens if a bureau cannot verify a disputed item within the FCRA window?',
        choices: [
          'It stays on the report with a "verified" flag',
          'It must be deleted from the report',
          'It is moved to a separate disputes section for 12 months',
          'The bureau gets another 60 days to verify'
        ],
        correctIndex: 1,
        rationale: 'No proof = required deletion. That is the consumer\'s leverage under § 1681i.'
      },
      {
        id: 'd2q9',
        prompt: 'Which of these makes a dispute letter strongest?',
        choices: [
          'Aggressive language and threats of lawsuits',
          'A specific reason for each item with supporting evidence, sent certified mail',
          'Filing it through every credit-repair website at once',
          'A handwritten note attached to the bureau\'s online form'
        ],
        correctIndex: 1,
        rationale: 'Specificity + documentation + delivery proof. Vague letters are easy to dismiss as "frivolous."'
      },
      {
        id: 'd2q10',
        prompt: 'Why is certified mail with return receipt the standard delivery method?',
        choices: [
          'It is the only legally accepted form of delivery',
          'It costs less than regular mail',
          'It proves the bureau received the letter and starts the 30-day clock',
          'It guarantees the letter is read within 24 hours'
        ],
        correctIndex: 2,
        rationale: 'The signed green card is your proof of receipt — it is what locks in the 30-day reinvestigation deadline.'
      }
    ]
  },
  {
    day: 3,
    slug: 'day-3-advanced-tactics',
    passingScore: 0.8,
    questions: [
      {
        id: 'd3q1',
        prompt: 'What does a 609 letter ask the bureau to do?',
        choices: [
          'Refund any disputed fees',
          'Provide the original documents that prove a disputed account is yours',
          'Reset your score to its previous value',
          'Notify your employer of the dispute'
        ],
        correctIndex: 1,
        rationale: 'Section 609 of the FCRA gives consumers the right to request the actual documentation behind a disputed item.'
      },
      {
        id: 'd3q2',
        prompt: 'If a furnisher cannot produce the proof a 609 letter requests, what should happen to the item?',
        choices: [
          'It stays but gets a "disputed" flag',
          'It must be removed from your credit file',
          'It moves to a public-records section',
          'You have to file a CFPB complaint to force removal'
        ],
        correctIndex: 1,
        rationale: 'No verification = required deletion under § 1681i. The 609 request creates that documented failure to verify.'
      },
      {
        id: 'd3q3',
        prompt: 'A debt validation letter forces a collector to prove three things. Which set is correct?',
        choices: [
          'Your name, your SSN, and your current address',
          'The debt exists, you owe it, and the collector has the right to collect it',
          'The original creditor, the interest rate, and the late-payment count',
          'Your employer, your income, and your bank account'
        ],
        correctIndex: 1,
        rationale: 'Validation requires proof of existence, ownership of the debt by you, and the collector\'s legal right to collect it.'
      },
      {
        id: 'd3q4',
        prompt: 'What does CFPB stand for?',
        choices: [
          'Consumer Financial Protection Bureau',
          'Credit File Protection Board',
          'Council for Federal Pricing & Banking',
          'Consumer Federal Privacy Bureau'
        ],
        correctIndex: 0,
        rationale: 'The Consumer Financial Protection Bureau is the federal agency that takes complaints against bureaus, lenders, and collectors.'
      },
      {
        id: 'd3q5',
        prompt: 'How many days does a company have to respond to a CFPB complaint?',
        choices: ['7 days', '15 days', '30 days', '60 days'],
        correctIndex: 1,
        rationale: 'Companies must respond through the CFPB portal within 15 days. Their response is visible to the consumer.'
      },
      {
        id: 'd3q6',
        prompt: 'What is "pay-for-delete" and what is the most important rule?',
        choices: [
          'Paying the original creditor before any collector — must be done by phone',
          'A deal where the collector removes the bad mark in exchange for payment — always get it in writing first',
          'Pre-paying a future debt to lock in a lower balance — works best on weekends',
          'Paying only half the balance to settle — the remainder stays as a positive item'
        ],
        correctIndex: 1,
        rationale: 'Pay-for-delete only works if the agreement to remove the item is captured in writing BEFORE you send a dollar.'
      },
      {
        id: 'd3q7',
        prompt: 'How is the statute of limitations different from the 7-year credit reporting limit?',
        choices: [
          'They are the same thing',
          'The statute of limitations controls when a creditor can sue you for a debt; the 7-year rule controls how long it can be reported',
          'The 7-year rule applies only to medical debt',
          'The statute of limitations only applies to mortgages'
        ],
        correctIndex: 1,
        rationale: 'They are two different clocks — never confuse legal collectability with credit-report visibility.'
      },
      {
        id: 'd3q8',
        prompt: 'What can RESTART the statute of limitations on an old debt?',
        choices: [
          'Ignoring all collector calls',
          'Pulling your credit report',
          'Making a payment or even acknowledging the debt in writing',
          'Filing a CFPB complaint'
        ],
        correctIndex: 2,
        rationale: 'A partial payment or written acknowledgment can re-start the clock and make a time-barred debt suable again.'
      },
      {
        id: 'd3q9',
        prompt: 'A collector keeps reporting after you sent a written dispute. Are they required to mark the account as disputed?',
        choices: [
          'No — once they verify it once, the dispute flag goes away',
          'Yes — under the FDCPA, the collector must report the account as disputed',
          'Only if you also filed a CFPB complaint',
          'Only if you sent the dispute by certified mail'
        ],
        correctIndex: 1,
        rationale: 'Failing to mark the account as disputed is itself an FDCPA violation that the consumer can act on.'
      },
      {
        id: 'd3q10',
        prompt: 'Which escalation path is correct after a 609 or validation letter fails?',
        choices: [
          'CFPB complaint, then state attorney general complaint',
          'Sue immediately in federal court',
          'Ignore it and wait for the 7-year clock to expire',
          'Mail another identical 609 letter every week until they comply'
        ],
        correctIndex: 0,
        rationale: 'Escalation order: bureau dispute → 609/validation → CFPB complaint → state AG complaint. Each step adds documented pressure.'
      }
    ]
  },
  {
    day: 4,
    slug: 'day-4-building-positive-credit',
    passingScore: 0.8,
    questions: [
      {
        id: 'd4q1',
        prompt: 'What is a tradeline?',
        choices: [
          'A credit-bureau hotline for filing disputes',
          'Any account on your credit report — credit card, loan, or mortgage',
          'A trading-card collection that builds equity',
          'A trade school that teaches credit management'
        ],
        correctIndex: 1,
        rationale: 'Tradelines are the individual accounts reported on your credit file. More positive tradelines means more positive history.'
      },
      {
        id: 'd4q2',
        prompt: 'As an authorized user, are you legally responsible for the card\'s debt?',
        choices: [
          'Yes — equally with the primary cardholder',
          'No — the AU gets the history but is not legally responsible for the bill',
          'Only after 12 months of being on the account',
          'Only if the card is over its limit'
        ],
        correctIndex: 1,
        rationale: 'AUs inherit the account\'s reporting history but the primary cardholder owns the debt.'
      },
      {
        id: 'd4q3',
        prompt: 'When does the authorized-user strategy backfire?',
        choices: [
          'When the primary account has weak credit, high utilization, or late payments',
          'When the primary cardholder lives in a different state',
          'When the card is a credit union account',
          'When the card has a low credit limit'
        ],
        correctIndex: 0,
        rationale: 'You inherit the account\'s history — bad or good. Only do it when the primary account is rock-solid.'
      },
      {
        id: 'd4q4',
        prompt: 'How does a secured credit card work?',
        choices: [
          'You pre-pay charges before the card lets you use it',
          'You back the card with a refundable deposit and use it like a normal card',
          'The card is locked to a single retailer',
          'The card has no credit limit, only a debit balance'
        ],
        correctIndex: 1,
        rationale: 'Secured cards are real credit cards backed by a deposit (often $200–$500). They report to bureaus exactly like any card.'
      },
      {
        id: 'd4q5',
        prompt: 'What is a credit builder loan?',
        choices: [
          'A loan that buys you a new credit score',
          'A small loan where the funds are held in savings until you pay it off, with each on-time payment reported',
          'A loan from a credit-repair agency',
          'A loan that automatically pays your credit card bill'
        ],
        correctIndex: 1,
        rationale: 'Builder loans build payment history first, then release the cash. Cheap and effective for new credit profiles.'
      },
      {
        id: 'd4q6',
        prompt: 'Should you carry a small balance on a card to "build credit"?',
        choices: [
          'Yes — interest paid is what builds your score',
          'No — pay the statement balance in full every month; using the card builds credit, not carrying interest',
          'Only on cards under $500 limit',
          'Only if the APR is below 15%'
        ],
        correctIndex: 1,
        rationale: 'Carrying a balance only earns the bank interest. Use the card and pay it off — that is what builds credit.'
      },
      {
        id: 'd4q7',
        prompt: 'Should you close an old credit card after opening new ones?',
        choices: [
          'Yes — old cards drag your score down',
          'No — closing it shortens your history and lowers total credit limit, raising utilization',
          'Only if it has an annual fee',
          'Only if the card is more than 10 years old'
        ],
        correctIndex: 1,
        rationale: 'Closing an old card shortens length-of-history AND raises utilization. Keep it open and use it once every few months.'
      },
      {
        id: 'd4q8',
        prompt: 'What does it mean when a secured card "graduates"?',
        choices: [
          'The card is shipped to a different bank',
          'It converts to an unsecured card and you get your deposit back',
          'You qualify for a higher interest rate',
          'You become eligible for a co-signer'
        ],
        correctIndex: 1,
        rationale: 'Graduation is triggered by consistent on-time payments — the bank releases your deposit and converts the card to a regular line.'
      },
      {
        id: 'd4q9',
        prompt: 'Roughly how long until you see your first score bump from a new positive tradeline?',
        choices: [
          '7 days',
          '30–60 days for the first reporting cycle',
          'A full year',
          'Three years'
        ],
        correctIndex: 1,
        rationale: 'The first reporting cycle takes 30–60 days. Real, sustained gains usually show after 3–6 months of clean behavior.'
      },
      {
        id: 'd4q10',
        prompt: 'Which mistake ruins the AU strategy?',
        choices: [
          'Being added to a strong, low-utilization card',
          'Being added to a card with high utilization or late payments',
          'Being added to a card opened over five years ago',
          'Being added to a card with a low credit limit'
        ],
        correctIndex: 1,
        rationale: 'AU inherits the account\'s utilization and payment history. High utilization or lates make the strategy hurt instead of help.'
      }
    ]
  },
  {
    day: 5,
    slug: 'day-5-business-credit',
    passingScore: 0.8,
    questions: [
      {
        id: 'd5q1',
        prompt: 'What is an EIN?',
        choices: [
          'Electronic Investment Number — used for stock accounts',
          'Employer Identification Number — the IRS tax ID for a business',
          'Estimated Income Notation — a banking score for businesses',
          'Equity Issuance Number — used when filing for an LLC'
        ],
        correctIndex: 1,
        rationale: 'The EIN is your business\'s "Social Security Number." Free to obtain at irs.gov in minutes.'
      },
      {
        id: 'd5q2',
        prompt: 'What is a D-U-N-S Number?',
        choices: [
          'A Department of Commerce small-business loan number',
          'A 9-digit ID from Dun & Bradstreet that your business credit file is built on',
          'A Delaware-only LLC registration number',
          'A duplicate filing number used when transferring an LLC'
        ],
        correctIndex: 1,
        rationale: 'The D-U-N-S Number is the foundation of business credit at Dun & Bradstreet. Free to get and required by many vendors.'
      },
      {
        id: 'd5q3',
        prompt: 'What is a Net-30 vendor account?',
        choices: [
          'A credit card with a 30-day grace period',
          'A vendor that lets you buy now and pay in 30 days, reporting on-time payments to business bureaus',
          'A wholesale account that requires a 30% deposit',
          'An invoice that compounds interest after 30 days'
        ],
        correctIndex: 1,
        rationale: 'Net-30 vendors are the starter tradelines for business credit. Pay early to build a strong Paydex score.'
      },
      {
        id: 'd5q4',
        prompt: 'On the Paydex score, what does an 80 mean?',
        choices: [
          'Paying 30 days late on average',
          'Paying on time',
          'Paying 30 days early on average',
          'Paying 60 days late on average'
        ],
        correctIndex: 1,
        rationale: 'Paydex 80 = paying invoices on time. 90+ = paying early. Aim for 80+ to unlock business credit cards.'
      },
      {
        id: 'd5q5',
        prompt: 'Which step is correct order for setting up business credit?',
        choices: [
          'Apply for a business credit card → file LLC → get EIN → open bank account',
          'File LLC → get EIN → open business bank account → get D-U-N-S → open Net-30 accounts',
          'Open Net-30 accounts → file LLC → get EIN',
          'Get D-U-N-S → apply for funding → file LLC'
        ],
        correctIndex: 1,
        rationale: 'Foundation first (LLC + EIN + bank), then identity (D-U-N-S), then tradelines (Net-30). Skipping steps gets applications denied.'
      },
      {
        id: 'd5q6',
        prompt: 'How long of clean Net-30 history typically unlocks a starter business credit card?',
        choices: ['1 month', 'About 90 days', '6 months', '2 years'],
        correctIndex: 1,
        rationale: '90 days of clean Net-30 payments + Paydex of 80+ usually opens the door to Capital One Spark, Amex Business, and similar cards.'
      },
      {
        id: 'd5q7',
        prompt: 'Will business credit always show up on your personal credit report?',
        choices: [
          'Yes — it always does',
          'No — EIN-only accounts that report only to D&B / Experian Business stay off your personal report',
          'Only if the business is an LLC',
          'Only after the business is five years old'
        ],
        correctIndex: 1,
        rationale: 'Done right, business credit is separate from personal. Some business cards still pull personal credit at application — read the fine print.'
      },
      {
        id: 'd5q8',
        prompt: 'Can a sole proprietor build "business credit" without an LLC?',
        choices: [
          'No — it is illegal without an LLC',
          'Technically yes, but it stays tied to your personal credit; the LLC + EIN combo is what actually separates the two',
          'Yes — sole proprietors get the same separation for free',
          'Only if the business has employees'
        ],
        correctIndex: 1,
        rationale: 'Without an LLC + EIN, the "business" credit is really just your personal credit dressed up. Real separation needs the legal entity.'
      },
      {
        id: 'd5q9',
        prompt: 'Which three business-credit bureaus matter most?',
        choices: [
          'Equifax, Experian, and TransUnion',
          'Dun & Bradstreet, Experian Business, and Equifax Business',
          'FICO, Vantage, and Paydex',
          'IRS, SBA, and FDIC'
        ],
        correctIndex: 1,
        rationale: 'Lenders pull D&B, Experian Business, and Equifax Business when reviewing business funding applications.'
      },
      {
        id: 'd5q10',
        prompt: 'What is the smartest first funding move for a brand-new business?',
        choices: [
          'Apply for a $250k SBA loan immediately',
          'Open Net-30 vendor accounts first, then a business credit card after 90 days, then a line of credit after 6 months',
          'Skip vendor accounts and go straight to business credit cards',
          'Use a personal credit card and worry about business credit later'
        ],
        correctIndex: 1,
        rationale: 'Sequencing matters. Vendor → card → line of credit is the path that gets approvals; skipping steps gets denials.'
      }
    ]
  },
  {
    day: 6,
    slug: 'bonus-generational-wealth',
    passingScore: 0.8,
    questions: [
      {
        id: 'd6q1',
        prompt: 'What is leverage in a wealth-building context?',
        choices: [
          'Hiring a financial advisor to manage your money',
          'Using borrowed money (like a mortgage) to control an asset bigger than your cash',
          'Refinancing a credit card at 0% APR',
          'Earning compound interest on a savings account'
        ],
        correctIndex: 1,
        rationale: 'Leverage multiplies both gains and losses. Used right, it lets you control real estate or businesses worth far more than your cash.'
      },
      {
        id: 'd6q2',
        prompt: 'What is compound growth?',
        choices: [
          'Combining several small accounts into one big account',
          'When your money earns money, and that money also starts earning money',
          'A 0% interest period that compounds into a higher APR',
          'A type of business credit reported to multiple bureaus'
        ],
        correctIndex: 1,
        rationale: 'Compound growth is how small consistent contributions become real wealth over decades. Time + consistency beats timing.'
      },
      {
        id: 'd6q3',
        prompt: 'What does a revocable living trust do?',
        choices: [
          'It eliminates estate taxes',
          'It passes assets to your family without going through probate court when you die',
          'It guarantees your investments will outpace inflation',
          'It transfers your debts to a trustee'
        ],
        correctIndex: 1,
        rationale: 'A revocable living trust lets your assets bypass probate so heirs receive them faster and more privately.'
      },
      {
        id: 'd6q4',
        prompt: 'What is "asset protection"?',
        choices: [
          'A bank vault service',
          'Legal structures (LLCs, trusts, insurance) that keep personal money safe from business risk and lawsuits',
          'A type of FDIC coverage',
          'Locking in a fixed mortgage rate'
        ],
        correctIndex: 1,
        rationale: 'Asset-protection planning uses legal entities and insurance to wall off your personal wealth from business and legal risks.'
      },
      {
        id: 'd6q5',
        prompt: 'Should you pay off all debt before you start investing?',
        choices: [
          'Yes — clear every dollar of debt first',
          'Pay off high-interest debt first; you can usually invest alongside low-interest debt like a mortgage',
          'Never invest until you own a home outright',
          'Always invest before paying any debt'
        ],
        correctIndex: 1,
        rationale: 'High-interest debt (cards) goes first. Low-interest debt like a mortgage can sit while you invest at potentially higher long-term returns.'
      },
      {
        id: 'd6q6',
        prompt: 'What is a smart starter investment habit recommended in this lesson?',
        choices: [
          'Buying individual penny stocks weekly',
          'Automating a small monthly contribution to a brokerage account — even $50 to start',
          'Investing your entire emergency fund into one stock',
          'Trading options daily until you build capital'
        ],
        correctIndex: 1,
        rationale: '"Boring and consistent" beats trying to time the market. Automated monthly contributions compound powerfully over decades.'
      },
      {
        id: 'd6q7',
        prompt: 'Why does strong personal credit matter for real-estate investing?',
        choices: [
          'It is required to attend open houses',
          'It unlocks better mortgage rates and bigger loan amounts',
          'It exempts you from property taxes',
          'It speeds up the title search'
        ],
        correctIndex: 1,
        rationale: 'Better credit = lower rate = lower monthly payment = more buying power. A 0.5% rate difference is tens of thousands over a 30-year loan.'
      },
      {
        id: 'd6q8',
        prompt: 'What is "legacy transfer"?',
        choices: [
          'Wiring all your money to one family member',
          'Passing money, assets, AND financial knowledge to the next generation so they keep what you built',
          'Transferring an EIN to a new business owner',
          'Shifting your stock portfolio to bonds before retirement'
        ],
        correctIndex: 1,
        rationale: 'Legacy is more than money — it includes the knowledge that lets the next generation preserve and grow what you passed down.'
      },
      {
        id: 'd6q9',
        prompt: 'Which professional helps you set up a basic trust?',
        choices: [
          'A real-estate agent',
          'A loan officer',
          'An estate-planning attorney',
          'A credit counselor'
        ],
        correctIndex: 2,
        rationale: 'Estate-planning attorneys draft trusts and other legacy documents. Worth the consult fee for the protection it provides.'
      },
      {
        id: 'd6q10',
        prompt: 'What is the bigger-picture role of credit in wealth-building?',
        choices: [
          'Credit IS wealth — building a high score is the goal',
          'Credit is a tool; the goal is wealth — assets that outlive you and help your family',
          'Credit is only useful for emergencies',
          'Credit and wealth are unrelated'
        ],
        correctIndex: 1,
        rationale: 'Credit is leverage for buying assets — homes, businesses, investments. The score is the means; wealth is the destination.'
      }
    ]
  }
];

export function getQuizForDay(day: number): DayQuiz | null {
  return MASTERCLASS_QUIZZES.find(q => q.day === day) || null;
}

export function gradeQuiz(quiz: DayQuiz, answers: Record<string, number>): { correct: number; total: number; percent: number; passed: boolean } {
  let correct = 0;
  for (const q of quiz.questions) {
    if (answers[q.id] === q.correctIndex) correct += 1;
  }
  const total = quiz.questions.length;
  const percent = total ? correct / total : 0;
  return { correct, total, percent, passed: percent >= quiz.passingScore };
}

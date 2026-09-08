export type AffiliateLink = {
  label: string;
  url: string;
  category: string;
  reason?: string;
};

export const defaultAffiliateLinks: AffiliateLink[] = [
  { label: 'Self Lender', url: 'https://self.inc/refer/16452347', category: 'credit_builder' },
  { label: 'Credit Strong', url: 'https://creditstrong.referralrock.com/l/3JAMES442/', category: 'credit_builder' },
  { label: 'Rent Reporters', url: 'https://prf.hn/click/camref:1101l52pUS', category: 'rent_reporting' },
  { label: 'Credit Builder Card', url: 'https://www.creditbuildercard.com/mgf.html', category: 'builder_card' },
  { label: 'Grow Credit', url: 'https://growcredit.com/?kid=12BYTD', category: 'subscription_reporting' },
  { label: 'Kovo', url: 'https://kovocredit.com/r/O6LDVXN7', category: 'credit_builder' },
  { label: 'Ava', url: 'https://meetava.app.link/tdMaQUdV7Rb', category: 'rent_utility_reporting' }
];

function analysisText(analysis: unknown) {
  try {
    return JSON.stringify(analysis || {}).toLowerCase();
  } catch {
    return '';
  }
}

export function recommendedAffiliateLinksForAnalysis(analysis: unknown): AffiliateLink[] {
  const text = analysisText(analysis);
  const selected = new Map<string, AffiliateLink>();

  const add = (label: string, reason: string) => {
    const link = defaultAffiliateLinks.find((item) => item.label === label);
    if (link) selected.set(label, { ...link, reason });
  };

  if (/utilization|maxed|credit card|revolving|thin file|limited credit|no open positive/.test(text)) {
    add('Self Lender', 'Credit-builder account option for adding positive installment history.');
    add('Credit Strong', 'Credit-builder installment option when the file needs more positive reporting.');
    add('Credit Builder Card', 'Revolving builder-card option when utilization or open-card depth is weak.');
  }

  if (/rent|rental|lease/.test(text)) {
    add('Rent Reporters', 'Rent reporting option when rental history may help build positive payment data.');
  }

  if (/subscription|utility|phone|streaming|netflix|hulu|disney|spotify/.test(text)) {
    add('Grow Credit', 'Subscription reporting option for adding eligible monthly payments.');
    add('Ava', 'Rent and utility reporting option for clients with eligible monthly bills.');
  }

  if (selected.size === 0) {
    add('Self Lender', 'General credit-builder option for rebuilding positive history.');
    add('Kovo', 'Low-friction credit-builder education/reporting option.');
  }

  return Array.from(selected.values());
}

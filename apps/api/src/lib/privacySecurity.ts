export type PrivacySecurityCommand = 'FREEZE' | 'UNFREEZE' | 'REQUEST_REPORT' | 'OPT_OUT' | 'DISPUTE';

export type PrivacySecurityAgency = {
  code: string;
  name: string;
  category: 'Major Bureaus' | 'Specialty Reporting' | 'Banking Reports';
  note: string;
  actions: Array<{
    command: PrivacySecurityCommand;
    label: string;
    url: string;
  }>;
};

export const PRIVACY_SECURITY_AGENCIES: PrivacySecurityAgency[] = [
  {
    code: 'experian',
    name: 'Experian',
    category: 'Major Bureaus',
    note: 'Place or manage an Experian security freeze through the official consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.experian.com/help/credit-freeze/' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.experian.com/help/credit-freeze/' }
    ]
  },
  {
    code: 'equifax',
    name: 'Equifax',
    category: 'Major Bureaus',
    note: 'Place or manage an Equifax security freeze through the official consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/' }
    ]
  },
  {
    code: 'transunion',
    name: 'TransUnion',
    category: 'Major Bureaus',
    note: 'Place or manage a TransUnion security freeze through the official consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.transunion.com/credit-freeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.transunion.com/credit-freeze' }
    ]
  },
  {
    code: 'lexisnexis',
    name: 'LexisNexis Risk Solutions',
    category: 'Specialty Reporting',
    note: 'Manage eligible security-freeze, disclosure, and opt-out requests.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://consumer.risk.lexisnexis.com/freeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://consumer.risk.lexisnexis.com/freeze' },
      { command: 'REQUEST_REPORT', label: 'Request disclosure', url: 'https://consumer.risk.lexisnexis.com/request' },
      { command: 'OPT_OUT', label: 'Review opt-out choices', url: 'https://consumer.risk.lexisnexis.com/opt' }
    ]
  },
  {
    code: 'innovis',
    name: 'Innovis',
    category: 'Specialty Reporting',
    note: 'Manage an Innovis security freeze or request a consumer report.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.innovis.com/personal/securityFreeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.innovis.com/personal/securityFreeze' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.innovis.com/personal/creditReport' }
    ]
  },
  {
    code: 'corelogic',
    name: 'Cotality / CoreLogic',
    category: 'Specialty Reporting',
    note: 'Use the CFPB consumer-reporting-company directory to identify the correct specialty report and request channel.',
    actions: [
      { command: 'REQUEST_REPORT', label: 'Find consumer-report options', url: 'https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/companies-list/' }
    ]
  },
  {
    code: 'chexsystems',
    name: 'ChexSystems',
    category: 'Banking Reports',
    note: 'Request your report, manage a security freeze, or begin a banking-report dispute workflow.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.chexsystems.com/security-freeze/place-freeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.chexsystems.com/security-freeze/lookup-your-security-freeze' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.chexsystems.com/request-reports/consumer-disclosure' },
      { command: 'DISPUTE', label: 'Start dispute preparation', url: 'https://www.chexsystems.com/dispute' }
    ]
  },
  {
    code: 'early-warning',
    name: 'Early Warning Services',
    category: 'Banking Reports',
    note: 'Request a consumer report or prepare a dispute concerning banking information.',
    actions: [
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.earlywarning.com/consumer-information' },
      { command: 'DISPUTE', label: 'Start dispute preparation', url: 'https://www.earlywarning.com/consumer-information' }
    ]
  }
];

export function findPrivacySecurityAction(agencyCode: string, command: string) {
  const agency = PRIVACY_SECURITY_AGENCIES.find((candidate) => candidate.code === agencyCode);
  const action = agency?.actions.find((candidate) => candidate.command === command);
  return agency && action ? { agency, action } : null;
}

export function privacySecurityRequestKey(agencyCode: string, command: string) {
  return `privacy-security:${agencyCode}:${command.toLowerCase()}`;
}

export function privacySecurityActionTitle(agencyName: string, command: PrivacySecurityCommand) {
  const verbs: Record<PrivacySecurityCommand, string> = {
    FREEZE: 'Freeze',
    UNFREEZE: 'Unfreeze',
    REQUEST_REPORT: 'Request report from',
    OPT_OUT: 'Review opt-out with',
    DISPUTE: 'Prepare dispute for'
  };
  return command === 'FREEZE' || command === 'UNFREEZE'
    ? `${verbs[command]} ${agencyName} file`
    : `${verbs[command]} ${agencyName}`;
}

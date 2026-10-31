export type PrivacySecurityCommand = 'FREEZE' | 'UNFREEZE' | 'REQUEST_REPORT' | 'OPT_OUT' | 'DISPUTE';

export type PrivacySecurityAgency = {
  code: string;
  name: string;
  category: 'Credit Bureaus' | 'Specialty & Third-Party Reports' | 'ChexSystems';
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
    category: 'Credit Bureaus',
    note: 'Place or manage an Experian security freeze through the official consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.experian.com/help/credit-freeze/' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.experian.com/help/credit-freeze/' }
    ]
  },
  {
    code: 'equifax',
    name: 'Equifax',
    category: 'Credit Bureaus',
    note: 'Place or manage an Equifax security freeze through the official consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/' }
    ]
  },
  {
    code: 'transunion',
    name: 'TransUnion',
    category: 'Credit Bureaus',
    note: 'Place or manage a TransUnion security freeze through the official consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.transunion.com/credit-freeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.transunion.com/credit-freeze' }
    ]
  },
  {
    code: 'lexisnexis',
    name: 'LexisNexis Risk Solutions',
    category: 'Specialty & Third-Party Reports',
    note: 'Manage eligible security-freeze, disclosure, and opt-out requests.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://consumer.risk.lexisnexis.com/freeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://consumer.risk.lexisnexis.com/freeze' },
      { command: 'REQUEST_REPORT', label: 'Request disclosure', url: 'https://consumer.risk.lexisnexis.com/request' },
      { command: 'OPT_OUT', label: 'Review opt-out choices', url: 'https://consumer.risk.lexisnexis.com/opt' }
    ]
  },
  {
    code: 'sagestream',
    name: 'SageStream (LexisNexis)',
    category: 'Specialty & Third-Party Reports',
    note: 'SageStream consumer-file requests and freezes are now handled through the LexisNexis consumer portal.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://consumer.risk.lexisnexis.com/freeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://consumer.risk.lexisnexis.com/freeze' },
      { command: 'REQUEST_REPORT', label: 'Request disclosure', url: 'https://consumer.risk.lexisnexis.com/request' }
    ]
  },
  {
    code: 'innovis',
    name: 'Innovis',
    category: 'Specialty & Third-Party Reports',
    note: 'Manage an Innovis security freeze or request a consumer report.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.innovis.com/personal/securityFreeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.innovis.com/personal/securityFreeze' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.innovis.com/personal/creditReport' }
    ]
  },
  {
    code: 'nctue',
    name: 'NCTUE',
    category: 'Specialty & Third-Party Reports',
    note: 'Manage the telecom and utility consumer report maintained by the National Consumer Telecom & Utilities Exchange.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://nctueconsumerportal.com/' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://nctueconsumerportal.com/' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://nctueconsumerportal.com/' }
    ]
  },
  {
    code: 'datax-teletrack',
    name: 'DataX / Teletrack',
    category: 'Specialty & Third-Party Reports',
    note: 'Teletrack consumer services now direct consumers to DataX, an Equifax company.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://consumers.dataxltd.com/consumerCreditFreeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://consumers.dataxltd.com/consumerCreditFreeze' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://consumers.dataxltd.com/annualCreditReport' }
    ]
  },
  {
    code: 'clarity-services',
    name: 'Clarity Services (Experian)',
    category: 'Specialty & Third-Party Reports',
    note: 'Manage a Clarity Services specialty consumer-report freeze or request a file disclosure.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://consumers.clarityservices.com/securityFreeze' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://consumers.clarityservices.com/securityFreeze' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.clarityservices.com/support/' }
    ]
  },
  {
    code: 'factortrust',
    name: 'FactorTrust (TransUnion)',
    category: 'Specialty & Third-Party Reports',
    note: 'Use TransUnion’s official FactorTrust consumer inquiry page for report, dispute, and freeze instructions.',
    actions: [
      { command: 'FREEZE', label: 'Request freeze', url: 'https://www.transunion.com/client-support/factortrust-consumer-inquiry' },
      { command: 'UNFREEZE', label: 'Request unfreeze', url: 'https://www.transunion.com/client-support/factortrust-consumer-inquiry' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.transunion.com/client-support/factortrust-consumer-inquiry' }
    ]
  },
  {
    code: 'microbilt',
    name: 'MicroBilt / PRBC',
    category: 'Specialty & Third-Party Reports',
    note: 'MicroBilt provides its security-freeze request as an official form.',
    actions: [
      { command: 'FREEZE', label: 'Open freeze form', url: 'https://www.microbilt.com/Cms_Data/Contents/Microbilt/Media/Docs/ConsumerAffair/0222_Update/MicroBilt-Security-Freeze-Fraud-Active-Duty-Alert-Form-03-01-21-.pdf' },
      { command: 'REQUEST_REPORT', label: 'Request report', url: 'https://www.microbilt.com/us/consumer-affairs' }
    ]
  },
  {
    code: 'corelogic-cotality',
    name: 'Cotality / CoreLogic Credco',
    category: 'Specialty & Third-Party Reports',
    note: 'Credco combines reports from the nationwide bureaus. No separate online Credco freeze was confirmed; freeze the underlying bureau files above.',
    actions: [
      { command: 'REQUEST_REPORT', label: 'Review official information', url: 'https://www.cotality.com/products/credco-credit-reports' }
    ]
  },
  {
    code: 'chexsystems',
    name: 'ChexSystems',
    category: 'ChexSystems',
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
    category: 'Specialty & Third-Party Reports',
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

export type FilingStep = {
  number: number;
  title: string;
  detail: string;
  fieldHints?: string[];
  link?: { label: string; url: string };
};

export type FilingWorkflow = {
  agency: 'FTC' | 'CFPB';
  title: string;
  portalUrl: string;
  portalLabel: string;
  estimatedMinutes: number;
  responseSla: string;
  prerequisites: string[];
  attachments: string[];
  legalCitations: string[];
  whatHappensNext: string[];
  steps: FilingStep[];
};

export const FTC_WORKFLOW: FilingWorkflow = {
  agency: 'FTC',
  title: 'File an FTC Identity Theft / Inaccurate Reporting Complaint',
  portalUrl: 'https://reportfraud.ftc.gov',
  portalLabel: 'ReportFraud.ftc.gov',
  estimatedMinutes: 12,
  responseSla: 'FTC issues your Identity Theft Report instantly; bureaus then have 4 business days to block listed items under § 605B.',
  prerequisites: [
    'Bureau dispute letters generated and (ideally) mailed.',
    'Profile complete: legal name, current address, SSN last 4, email, phone.',
    'Government ID and a recent utility bill or lease saved as PDF/JPG (FTC may ask for proof of identity and address).',
  ],
  attachments: [
    'Your CredX-generated FTC report PDF (download from this tab).',
    'Government ID (driver\'s license, passport, or state ID).',
    'Proof of address dated in the last 60 days.',
    'Optional: copies of the bureau dispute letters CredX already produced.',
  ],
  legalCitations: [
    'FCRA § 605B (15 U.S.C. § 1681c-2) — block of information resulting from identity theft.',
    'FCRA § 1681i — investigation of disputed information.',
    'FDCPA § 1692 — debt collection practices.',
  ],
  whatHappensNext: [
    'You receive an FTC Identity Theft Report (PDF) instantly — save it.',
    'Send a copy of that Identity Theft Report to each bureau; they must block flagged items within 4 business days.',
    'CredX tracks bureau responses in the Responses tab and grades each outcome.',
  ],
  steps: [
    {
      number: 1,
      title: 'Open ReportFraud.ftc.gov',
      detail: 'Click the button below. Choose "Credit Bureaus, Banks, and Lenders" → "Credit Reports" when the FTC asks what happened.',
      link: { label: 'Open ReportFraud.ftc.gov', url: 'https://reportfraud.ftc.gov' },
    },
    {
      number: 2,
      title: 'Describe what happened',
      detail: 'Paste the "Statement of the Complaint" from your CredX report. Reference each disputed account and the bureau(s) where it appears.',
      fieldHints: [
        '"What happened?" → "Inaccurate / unauthorized items appearing on my credit report after formal dispute."',
        '"When did it happen?" → use the date on your earliest dispute letter.',
      ],
    },
    {
      number: 3,
      title: 'List the companies involved',
      detail: 'Add Equifax, Experian, and/or TransUnion (whichever bureaus appear on your disputed items), plus the original creditor or collector for each item.',
    },
    {
      number: 4,
      title: 'Add your contact + identity info',
      detail: 'CredX pre-fills these fields in the report PDF — just match the form.',
      fieldHints: ['Full legal name', 'Current address', 'Email + phone', 'SSN (last 4 only is fine)'],
    },
    {
      number: 5,
      title: 'Upload your CredX FTC report PDF',
      detail: 'Attach the downloaded PDF as your written statement. Also upload your ID and proof of address if prompted.',
    },
    {
      number: 6,
      title: 'Submit + save the FTC Identity Theft Report',
      detail: 'The FTC issues a numbered Identity Theft Report immediately after submit. Download it and upload it back into CredX (Responses tab) so we can attach it to follow-up bureau letters.',
    },
  ],
};

export const CFPB_WORKFLOW: FilingWorkflow = {
  agency: 'CFPB',
  title: 'File a CFPB Consumer Complaint',
  portalUrl: 'https://www.consumerfinance.gov/complaint/',
  portalLabel: 'consumerfinance.gov/complaint',
  estimatedMinutes: 10,
  responseSla: 'Companies must respond through the CFPB portal within 15 days; the CFPB tracks the response publicly.',
  prerequisites: [
    'Bureau dispute letters generated (the CFPB asks what you have already tried).',
    'At least one of: a bureau response that "verified" without proof, no response after 30 days, or continued inaccurate reporting.',
    'Profile complete: legal name, address, email, phone.',
  ],
  attachments: [
    'Your CredX-generated CFPB complaint PDF (download from this tab).',
    'Copies of the bureau dispute letters you already sent.',
    'Any bureau response letters (mark them "verified without proof" if applicable).',
    'Optional: USPS certified-mail green cards or Lob tracking confirmations.',
  ],
  legalCitations: [
    'FCRA § 1681i — duty to reinvestigate disputed information within 30 days.',
    'FCRA § 1681s-2 — furnisher accuracy + investigation duties.',
    'Regulation V — CFPB rules implementing the FCRA.',
  ],
  whatHappensNext: [
    'CFPB forwards the complaint to each named company and assigns a tracking number.',
    'Companies must respond within 15 days through the CFPB portal — the response is visible to you.',
    'CredX upload the CFPB response PDF into the Responses tab; the AI graders flag whether the bureau actually re-investigated.',
  ],
  steps: [
    {
      number: 1,
      title: 'Open the CFPB complaint portal',
      detail: 'Click the button below. Pick the product "Credit reporting, credit repair services, or other personal consumer reports" → sub-product "Credit reporting".',
      link: { label: 'Open CFPB complaint portal', url: 'https://www.consumerfinance.gov/complaint/' },
    },
    {
      number: 2,
      title: 'Choose the issue',
      detail: 'Select "Incorrect information on your report" → "Information belongs to someone else" or "Account status incorrect" depending on the dispute reason CredX assigned.',
    },
    {
      number: 3,
      title: 'Describe what happened',
      detail: 'Paste the "What Happened" section from your CredX CFPB complaint. Mention the dates of your bureau letters, what response (or non-response) you received, and the specific FCRA sections violated.',
      fieldHints: [
        'Cite § 1681i (failure to reinvestigate within 30 days).',
        'Cite § 1681s-2 (furnisher non-compliance) if a creditor / collector kept reporting after dispute.',
        'State the remedy: "Remove the disputed items or produce verifiable proof within 15 days."',
      ],
    },
    {
      number: 4,
      title: 'Name the companies',
      detail: 'Add the bureau(s) the items appear on. The CFPB lets you name multiple companies — list all relevant bureaus and any furnisher (creditor / collector) still reporting.',
    },
    {
      number: 5,
      title: 'Attach supporting documents',
      detail: 'Upload your CredX CFPB complaint PDF as the lead attachment. Add the bureau dispute letters and any "verified" responses as supporting evidence.',
    },
    {
      number: 6,
      title: 'Confirm contact info + submit',
      detail: 'CredX pre-fills your contact info into the PDF — match it to the form. Submit and save the CFPB tracking number. The portal will email you when each company responds.',
    },
    {
      number: 7,
      title: 'Upload the CFPB response back into CredX',
      detail: 'When each company responds (within 15 days), download the response PDF from the CFPB portal and upload it in the Responses tab so CredX can grade and chain the next round.',
    },
  ],
};

export const FILING_WORKFLOWS: Record<'ftc' | 'cfpb', FilingWorkflow> = {
  ftc: FTC_WORKFLOW,
  cfpb: CFPB_WORKFLOW,
};

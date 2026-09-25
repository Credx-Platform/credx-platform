import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditAnalysisService } from '../src/lib/creditAnalysis.js';

function input(accounts: any[]) {
  return {
    client: {
      user: { firstName: 'Test', lastName: 'Consumer', email: 'test@example.com' }
    },
    creditReports: [{
      bureau: 'EXPERIAN',
      rawPayload: { rich: { accounts, scores: [], personalProfile: { experian: null, equifax: null, transunion: null, publicRecords: [] } } },
      tradelines: []
    }]
  } as any;
}

const fields = (overrides: any = {}) => ({
  accountNumber: '1234',
  accountStatus: 'Closed',
  paymentStatus: 'Paid as agreed',
  accountRating: null,
  comments: null,
  accountDescription: null,
  accountType: 'Installment',
  balanceOwed: 0,
  dateOpened: '2020-01-01',
  dateReported: '2026-09-01',
  ...overrides
});

test('inventories negative accounts from status/history even when parser flag is false', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Lead Bank',
    category: 'positive',
    isNegative: false,
    experian: fields({ paymentStatus: '30 days late' }),
    equifax: fields({ paymentStatus: '30 days late' }),
    transunion: null,
    paymentHistory: {
      months: ['Nov 22'],
      experian: ['30'], equifax: ['30'], transunion: [null]
    }
  }]));

  assert.equal(analysis.negativeAccounts.length, 1);
  assert.equal(analysis.negativeAccounts[0].creditorName, 'Lead Bank');
  assert.equal(analysis.inquiries.length, 0);
});

test('cross-references payment-history disagreements as dispute opportunities', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Lead Bank',
    category: 'late_payment',
    isNegative: true,
    experian: fields({ paymentStatus: '30 days late' }),
    equifax: fields({ paymentStatus: '30 days late' }),
    transunion: fields({ paymentStatus: 'Paid as agreed' }),
    paymentHistory: {
      months: ['Nov 22'],
      experian: ['30'], equifax: ['30'], transunion: ['OK']
    }
  }]));

  assert.ok(analysis.negativeAccounts[0].inconsistencies.includes('paymentHistory:Nov 22'));
  assert.ok(analysis.disputeOpportunities.some((op: any) => /payment history.*Nov 22/i.test(op.issue)));
});

test('keeps inquiries separate from negative accounts and dispute opportunities', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Example Lender',
    category: 'inquiry',
    isNegative: false,
    experian: fields({ accountNumber: null, accountType: 'Hard inquiry', accountStatus: 'Inquiry', dateReported: '2026-08-01' }),
    equifax: null,
    transunion: null,
    paymentHistory: null
  }]));

  assert.equal(analysis.negativeAccounts.length, 0);
  assert.equal(analysis.disputeOpportunities.length, 0);
  assert.equal(analysis.inquiries.length, 1);
  assert.deepEqual(analysis.inquiries[0].bureaus, ['experian']);
});

test('unions newer non-rich tradelines so manually added negatives are recovered', () => {
  const report = input([{
    creditorName: 'Lead Bank',
    category: 'late_payment',
    isNegative: true,
    experian: fields({ accountNumber: '5800', paymentStatus: '30 days late' }),
    equifax: null,
    transunion: null,
    paymentHistory: null
  }]);
  report.creditReports[0].pulledAt = new Date('2026-09-01');
  report.creditReports.push({
    bureau: 'EQUIFAX',
    pulledAt: new Date('2026-09-10'),
    rawPayload: null,
    tradelines: [
      { creditorName: 'Consolidated Ed', accountNumber: '0000', accountType: 'Collection', status: 'Collection Account', balance: 8191, isNegative: true },
      { creditorName: 'Topline Reporting', accountNumber: '3347', accountType: 'Rental', status: '30 days late', balance: 0, isNegative: false }
    ]
  });

  const analysis = CreditAnalysisService.generate(report);
  const names = analysis.negativeAccounts.map((item) => item.creditorName);
  assert.ok(names.includes('Lead Bank'));
  assert.ok(names.includes('Consolidated Ed'));
  assert.ok(names.includes('Topline Reporting'));
  assert.equal(analysis.negativeAccounts.length, 3);
});

test('does not duplicate accounts from tradeline rows derived from the same rich upload', () => {
  const report = input([{
    creditorName: 'Lead Bank',
    category: 'late_payment',
    isNegative: true,
    experian: fields({ accountNumber: '5800XXXX', paymentStatus: '30 days late', balanceOwed: 500 }),
    equifax: fields({ accountNumber: 'XXXX5800', paymentStatus: '30 days late', balanceOwed: 520 }),
    transunion: null,
    paymentHistory: null
  }]);
  report.creditReports[0].tradelines = [
    { creditorName: 'Lead Bank', accountNumber: '5800XXXX', accountType: 'Installment', status: '30 days late', balance: 500, isNegative: true }
  ];
  report.creditReports.push({ ...report.creditReports[0], bureau: 'EQUIFAX', tradelines: [
    { creditorName: 'Lead Bank', accountNumber: 'XXXX5800', accountType: 'Installment', status: '30 days late', balance: 520, isNegative: true }
  ] });

  const analysis = CreditAnalysisService.generate(report);
  assert.equal(analysis.negativeAccounts.length, 1);
});

// ---- Single-bureau accuracy rules ----------------------------------

function negative(overrides: any) {
  return {
    creditorName: 'Midland Credit',
    category: 'collection',
    isNegative: true,
    experian: null,
    equifax: null,
    transunion: null,
    paymentHistory: null,
    ...overrides
  };
}

function flagCodes(analysis: any): string[] {
  return analysis.negativeAccounts.flatMap((a: any) => a.accuracyFlags.map((f: any) => f.code));
}

test('flags impossible dates inside a single bureau record', () => {
  const analysis = CreditAnalysisService.generate(input([negative({
    experian: fields({ accountStatus: 'Collection', dateOpened: '2023-05-01', dateOfLastActivity: '2022-01-01', dateOfLastPayment: '2022-01-01', balanceOwed: 900 })
  })]));
  assert.ok(flagCodes(analysis).includes('date_before_opened'));
});

test('flags balances that contradict status and each other', () => {
  const analysis = CreditAnalysisService.generate(input([negative({
    creditorName: 'Capital One',
    category: 'charge_off',
    experian: fields({ accountStatus: 'Paid charge-off', paymentStatus: 'Charge-off', balanceOwed: 1200, pastDueAmount: 1500, paymentAmount: 45, dateOfLastActivity: '2024-01-01' })
  })]));
  const codes = flagCodes(analysis);
  assert.ok(codes.includes('past_due_exceeds_balance'));
  assert.ok(codes.includes('paid_with_balance'));
  assert.ok(codes.includes('closed_with_monthly_payment'));
});

test('flags current status with a past-due amount and marks the account negative', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Chase',
    category: 'positive',
    isNegative: false,
    experian: fields({ accountStatus: 'Open', paymentStatus: 'Current', balanceOwed: 800, pastDueAmount: 120 }),
    equifax: null,
    transunion: null,
    paymentHistory: null
  }]));
  assert.equal(analysis.negativeAccounts.length, 1);
  assert.ok(flagCodes(analysis).includes('current_with_past_due'));
});

test('flags obsolete items past the 7-year reporting period', () => {
  const analysis = CreditAnalysisService.generate(input([negative({
    experian: fields({ accountStatus: 'Collection', dateOpened: '2016-01-01', dateOfLastActivity: '2016-02-01', balanceOwed: 400 })
  })]));
  assert.ok(flagCodes(analysis).includes('obsolete_7_year'));
});

test('flags possible re-aging when activity date is far after the last payment', () => {
  const analysis = CreditAnalysisService.generate(input([negative({
    experian: fields({ accountStatus: 'Collection', dateOpened: '2021-01-01', dateOfLastPayment: '2021-03-01', dateOfLastActivity: '2024-06-01', balanceOwed: 700 })
  })]));
  assert.ok(flagCodes(analysis).includes('possible_reaging'));
});

test('flags late marks outside the account life and never-late contradictions', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Discover',
    category: 'late_payment',
    isNegative: true,
    experian: fields({ accountStatus: 'Closed', paymentStatus: 'Never late', dateOpened: '2021-06-01', closedDate: '2023-01-01', dateOfLastActivity: '2023-01-01' }),
    equifax: null,
    transunion: null,
    paymentHistory: { months: ['Mar 21', 'Jun 23'], experian: ['30', '60'], equifax: [null, null], transunion: [null, null] }
  }]));
  const codes = flagCodes(analysis);
  assert.ok(codes.includes('late_before_opened'));
  assert.ok(codes.includes('late_after_closed'));
  assert.ok(codes.includes('never_late_with_late_marks'));
});

test('flags stale dispute remarks and incomplete negative records', () => {
  const analysis = CreditAnalysisService.generate(input([negative({
    experian: fields({ accountNumber: null, dateOpened: null, dateOfLastActivity: null, accountStatus: 'Collection', comments: 'Account information disputed by consumer', balanceOwed: 300 })
  })]));
  const codes = flagCodes(analysis);
  assert.ok(codes.includes('dispute_remark'));
  assert.ok(codes.includes('incomplete_negative'));
});

test('flags the same debt reported by original creditor and collector', () => {
  const analysis = CreditAnalysisService.generate(input([
    negative({ creditorName: 'Synchrony Bank', category: 'charge_off', experian: fields({ accountNumber: '60191234', accountStatus: 'Charge-off', balanceOwed: 2150, dateOfLastActivity: '2024-02-01' }) }),
    negative({ creditorName: 'Portfolio Recovery', category: 'collection', experian: fields({ accountNumber: '7788', accountStatus: 'Collection', balanceOwed: 2150, dateOfLastActivity: '2024-02-01' }) })
  ]));
  const dupes = analysis.negativeAccounts.filter((a: any) => a.accuracyFlags.some((f: any) => f.code === 'duplicate_debt'));
  assert.equal(dupes.length, 2);
});

test('sends single-bureau errors only to the bureau that reports them', () => {
  const analysis = CreditAnalysisService.generate(input([negative({
    experian: fields({ accountStatus: 'Collection', balanceOwed: 100, pastDueAmount: 400, dateOfLastActivity: '2024-01-01' }),
    equifax: fields({ accountStatus: 'Collection', balanceOwed: 100, pastDueAmount: 100, dateOfLastActivity: '2024-01-01' })
  })]));
  const op = analysis.disputeOpportunities.find((o: any) => o.fieldKey === 'rule:past_due_exceeds_balance');
  assert.ok(op);
  assert.deepEqual(op!.bureaus, ['experian']);
});

test('groups payment-history mismatches into one dispute per account', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Lead Bank',
    category: 'late_payment',
    isNegative: true,
    experian: fields({ paymentStatus: '30 days late' }),
    equifax: fields({ paymentStatus: '30 days late' }),
    transunion: fields({ paymentStatus: '30 days late' }),
    paymentHistory: { months: ['Nov 22', 'Dec 22', 'Jan 23'], experian: ['30', '60', 'OK'], equifax: ['OK', '30', 'OK'], transunion: ['30', 'OK', '30'] }
  }]));
  const ops = analysis.disputeOpportunities.filter((o: any) => o.fieldKey === 'paymentHistory');
  assert.equal(ops.length, 1);
  assert.match(ops[0].issue, /3 months/);
});

test('flags personal information mismatches across bureaus', () => {
  const report = input([]);
  report.creditReports[0].rawPayload.rich.personalProfile = {
    experian: { reportDate: null, name: 'JOHN A SMITH', alsoKnownAs: null, dateOfBirth: '1985-02-01', currentAddress: '1 Main St', previousAddresses: [], employers: [] },
    equifax: { reportDate: null, name: 'JOHN A SMITH', alsoKnownAs: null, dateOfBirth: '1958-02-01', currentAddress: '1 Main St', previousAddresses: [], employers: [] },
    transunion: null,
    publicRecords: []
  };
  const analysis = CreditAnalysisService.generate(report);
  assert.deepEqual(analysis.personalInfoFlags.map((f: any) => f.field), ['dateOfBirth']);
});

test('clean positive account produces no accuracy flags', () => {
  const analysis = CreditAnalysisService.generate(input([{
    creditorName: 'Amex',
    category: 'positive',
    isNegative: false,
    experian: fields({ accountStatus: 'Open', paymentStatus: 'Paid as agreed', accountType: 'Revolving', balanceOwed: 200, creditLimit: 5000 }),
    equifax: null,
    transunion: null,
    paymentHistory: null
  }]));
  assert.equal(analysis.negativeAccounts.length, 0);
  assert.equal(analysis.positiveAccounts[0].accuracyFlags.length, 0);
});

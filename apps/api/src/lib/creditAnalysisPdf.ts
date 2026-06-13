import PDFDocument from 'pdfkit';
import type { CreditAnalysis, Finding, DisputeOpportunity } from './creditAnalysis.js';

const ACCENT = '#00c6fb';
const TEXT = '#0d1420';
const MUTED = '#475569';
const BORDER = '#cbd5e1';
const NEG = '#dc2626';
const POS = '#16a34a';
const WARN = '#d97706';

const SEVERITY_COLOR: Record<Finding['severity'], string> = {
  critical: NEG,
  high: WARN,
  medium: '#0891b2',
  low: MUTED
};

const PRIORITY_COLOR: Record<DisputeOpportunity['priority'], string> = {
  high: NEG,
  medium: WARN,
  low: MUTED
};

const BUREAU_LABEL: Record<string, string> = {
  EXPERIAN: 'Experian',
  EQUIFAX: 'Equifax',
  TRANSUNION: 'TransUnion',
  experian: 'Experian',
  equifax: 'Equifax',
  transunion: 'TransUnion'
};

export async function renderCreditAnalysisPdf(analysis: CreditAnalysis): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 56, bottom: 56, left: 56, right: 56 },
        info: {
          Title: `CredX Credit Analysis — ${analysis.clientProfile.name}`,
          Author: analysis.branding.companyName || 'CredX',
          Subject: 'Credit Analysis Report',
          CreationDate: new Date(analysis.generatedAt)
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, analysis);
      drawClientBlock(doc, analysis);
      drawBureauScores(doc, analysis);
      drawSummaryTiles(doc, analysis);
      drawClientFacingSummary(doc, analysis);
      drawKeyFindings(doc, analysis);
      drawDisputeOpportunities(doc, analysis);
      drawNextSteps(doc, analysis);
      drawFooter(doc, analysis);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawHeader(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  doc
    .rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 4)
    .fill(ACCENT);
  doc.moveDown(0.6);
  doc
    .fillColor(TEXT)
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(analysis.branding.companyName || 'CredX', { continued: false });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text('Credit Analysis Report');
  doc
    .fillColor(MUTED)
    .fontSize(9)
    .text(`Generated ${formatDate(analysis.generatedAt)}`);
  doc.moveDown(1);
}

function drawClientBlock(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  sectionTitle(doc, 'Prepared for');
  const p = analysis.clientProfile;
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(13).text(p.name || 'Client');
  doc.font('Helvetica').fontSize(10).fillColor(MUTED);
  if (p.email) doc.text(p.email);
  const addressLine = [p.address, p.ssnLast4 ? `SSN ••••${p.ssnLast4}` : null, p.dob ? `DOB ${p.dob}` : null]
    .filter(Boolean)
    .join('  ·  ');
  if (addressLine) doc.text(addressLine);
  doc.moveDown(1);
}

function drawBureauScores(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  if (!analysis.bureauScores?.length) return;
  sectionTitle(doc, 'Bureau Scores');

  const startY = doc.y;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 3;
  analysis.bureauScores.forEach((snap, idx) => {
    const x = doc.page.margins.left + colW * idx;
    const score = typeof snap.score === 'number' ? snap.score : null;
    const scoreColor = score == null ? MUTED : score >= 700 ? POS : score >= 600 ? WARN : NEG;
    doc.rect(x + 4, startY, colW - 8, 70).lineWidth(1).strokeColor(BORDER).stroke();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9)
      .text(BUREAU_LABEL[snap.bureau] || String(snap.bureau), x + 12, startY + 10, { width: colW - 24 });
    doc.fillColor(scoreColor).font('Helvetica-Bold').fontSize(28)
      .text(score == null ? '—' : String(score), x + 12, startY + 24, { width: colW - 24 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(snap.pulledAt ? `Pulled ${formatDate(snap.pulledAt)}` : 'FICO', x + 12, startY + 56, { width: colW - 24 });
  });
  doc.y = startY + 80;
  doc.moveDown(0.4);
}

function drawSummaryTiles(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  const t = analysis.summaryTiles;
  if (!t) return;
  sectionTitle(doc, 'Account Summary');
  const tiles: Array<[string, number, string]> = [
    ['Total Accounts', analysis.overallStats?.totalAccounts ?? 0, TEXT],
    ['Negative Accounts', analysis.overallStats?.totalNegativeAccounts ?? 0, NEG],
    ['Collections', t.derogatory?.collections ?? 0, NEG],
    ['Charge-offs', t.derogatory?.chargeOffs ?? 0, NEG],
    ['Late Payments', t.derogatory?.latePayments ?? 0, WARN],
    ['Inquiries', t.derogatory?.inquiries ?? 0, WARN]
  ];

  const startY = doc.y;
  const innerW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const tileW = (innerW - 10) / 3;
  const tileH = 46;
  tiles.forEach((tile, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = doc.page.margins.left + col * (tileW + 5);
    const y = startY + row * (tileH + 6);
    doc.rect(x, y, tileW, tileH).lineWidth(1).strokeColor(BORDER).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(tile[0], x + 10, y + 8, { width: tileW - 20 });
    doc.fillColor(tile[2]).font('Helvetica-Bold').fontSize(20).text(String(tile[1]), x + 10, y + 20, { width: tileW - 20 });
  });
  doc.y = startY + Math.ceil(tiles.length / 3) * (tileH + 6);
  doc.moveDown(0.4);
}

function drawClientFacingSummary(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  if (!analysis.clientFacingSummary) return;
  pageBreakIfNeeded(doc, 120);
  sectionTitle(doc, 'Your Summary');
  doc.fillColor(TEXT).font('Helvetica').fontSize(10.5).text(analysis.clientFacingSummary, {
    align: 'left',
    lineGap: 2
  });
  doc.moveDown(0.8);
}

function drawKeyFindings(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  if (!analysis.keyFindings?.length) return;
  pageBreakIfNeeded(doc, 140);
  sectionTitle(doc, `Key Findings (${analysis.keyFindings.length})`);
  analysis.keyFindings.slice(0, 20).forEach((f) => {
    pageBreakIfNeeded(doc, 70);
    const color = SEVERITY_COLOR[f.severity] || MUTED;
    const innerW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const blockTop = doc.y;
    doc.rect(doc.page.margins.left, blockTop, 3, 48).fill(color);
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11)
      .text(f.title, doc.page.margins.left + 10, blockTop, { width: innerW - 10 });
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8)
      .text(`${f.severity.toUpperCase()} · ${f.category.replace(/_/g, ' ')}`, { width: innerW - 10 });
    doc.fillColor(TEXT).font('Helvetica').fontSize(10)
      .text(f.description, { width: innerW - 10, lineGap: 1.5 });
    if (f.recommendation) {
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
        .text(`Recommendation: ${f.recommendation}`, { width: innerW - 10 });
    }
    doc.moveDown(0.5);
  });
  doc.moveDown(0.4);
}

function drawDisputeOpportunities(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  if (!analysis.disputeOpportunities?.length) return;
  pageBreakIfNeeded(doc, 140);
  sectionTitle(doc, `Dispute Opportunities (${analysis.disputeOpportunities.length})`);
  analysis.disputeOpportunities.slice(0, 25).forEach((d) => {
    pageBreakIfNeeded(doc, 60);
    const color = PRIORITY_COLOR[d.priority] || MUTED;
    const innerW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const top = doc.y;
    doc.rect(doc.page.margins.left, top, 3, 38).fill(color);
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(10.5)
      .text(`${d.accountName}${d.accountNumber ? ` · ${d.accountNumber}` : ''}`, doc.page.margins.left + 10, top, { width: innerW - 10 });
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8)
      .text(`${d.priority.toUpperCase()} PRIORITY · ${d.bureaus.map((b) => BUREAU_LABEL[b] || b).join(', ')}`, { width: innerW - 10 });
    doc.fillColor(TEXT).font('Helvetica').fontSize(9.5)
      .text(`${d.issue}${d.reason ? ` — ${d.reason}` : ''}`, { width: innerW - 10, lineGap: 1.5 });
    doc.moveDown(0.4);
  });
  doc.moveDown(0.4);
}

function drawNextSteps(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  if (!analysis.nextSteps?.length) return;
  pageBreakIfNeeded(doc, 140);
  sectionTitle(doc, 'Next Steps');
  analysis.nextSteps.forEach((step) => {
    pageBreakIfNeeded(doc, 70);
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11).text(step.title);
    if (step.description) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(step.description, { lineGap: 1.5 });
    }
    if (step.bullets?.length) {
      step.bullets.forEach((b) => {
        doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(`  •  ${b}`, { lineGap: 1.5 });
      });
    }
    doc.moveDown(0.5);
  });
}

function drawFooter(doc: PDFKit.PDFDocument, analysis: CreditAnalysis) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - doc.page.margins.bottom + 18;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(
        `${analysis.branding.companyName || 'CredX'} · ${analysis.branding.website || 'credxme.com'} · ${analysis.branding.email || 'contact@credxme.com'}`,
        doc.page.margins.left,
        y,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
      );
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, y + 10, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center'
    });
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, label: string) {
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8)
    .text(label.toUpperCase(), { characterSpacing: 1.2 });
  doc.moveDown(0.25);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(0.5)
    .strokeColor(BORDER)
    .stroke();
  doc.moveDown(0.4);
}

function pageBreakIfNeeded(doc: PDFKit.PDFDocument, minSpace: number) {
  if (doc.y + minSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

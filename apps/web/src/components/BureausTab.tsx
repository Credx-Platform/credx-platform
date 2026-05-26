import { useState, useEffect, useMemo } from 'react';
import type { DisputeItem, ImportedTradeline } from './DisputeManager';

interface BureausTabProps {
  token: string;
  selectedClientId: string;
  selectedClientLabel?: string;
  clientName?: string;
  clientAddress?: string;
  items: DisputeItem[];
  tradelines: ImportedTradeline[];
  prefillKey?: string | null;
  onConsumePrefill?: () => void;
  pendingTradelineKeys?: string[];
  onConsumePendingKeys?: () => void;
  onItemCreated: () => void;
  onBackToItems: () => void;
  onOpenTracking: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '';

type BureauKey = 'equifax' | 'experian' | 'transunion';

const bureauMeta: Array<{ key: BureauKey; short: string; label: string; address: string }> = [
  { key: 'equifax', short: 'EFX', label: 'Equifax', address: 'P.O. Box 740256, Atlanta, GA 30374-0256' },
  { key: 'experian', short: 'XPN', label: 'Experian', address: 'P.O. Box 4500, Allen, TX 75013' },
  { key: 'transunion', short: 'TU', label: 'TransUnion', address: 'P.O. Box 2000, Chester, PA 19016' }
];

const accountTypes = [
  { value: 'LATE_PAYMENT', label: 'Late Payment' },
  { value: 'COLLECTION', label: 'Collection' },
  { value: 'CHARGE_OFF', label: 'Charge-off' },
  { value: 'INQUIRY', label: 'Inquiry' },
  { value: 'OTHER', label: 'Other' }
];

const disputeReasons = [
  'Not mine',
  'Inaccurate Reporting',
  'Incorrect balance',
  'Incorrect dates',
  'Account closed',
  'Duplicate account',
  'Identity theft',
  'Statute of limitations',
  'Other'
];

type LetterTemplate = {
  id: string;
  name: string;
  description: string;
  implicitReason?: string;
  body: string; // {{client_name}} {{client_address}} {{date}} {{bureau_label}} {{bureau_address}} {{accounts_list}}
};

const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: 'none',
    name: 'Default (no template)',
    description: 'Use the built-in dispute letter body.',
    body: ''
  },
  {
    id: 'initial_611',
    name: 'Initial dispute (FCRA §611)',
    description: 'Standard first-round dispute citing FCRA §611 investigation rights.',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}}\n{{client_address}}\n\nDear {{bureau_label}},\n\nUnder the Fair Credit Reporting Act, 15 U.S.C. §1681i, I am exercising my right to dispute the following item(s) appearing on my consumer credit file. Each item below is inaccurate, incomplete, or unverifiable and must be reinvestigated within 30 days as required by §611.\n\n{{accounts_list}}\n\nPlease conduct a reasonable reinvestigation, delete or correct each item that cannot be verified, and forward a free updated copy of my consumer report to the address above upon completion.\n\nSincerely,\n{{client_name}}`
  },
  {
    id: 'mov_round2',
    name: 'Method of Verification (Round 2)',
    description: 'Second-round letter demanding the verification procedure under §611(a)(7).',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}}\n{{client_address}}\n\nDear {{bureau_label}},\n\nIn response to your prior verification of the item(s) listed below, I am invoking my right under FCRA §611(a)(7) to receive a description of the procedure used to determine the accuracy and completeness of the information, including the business name and address of any furnisher contacted in connection with the verification.\n\n{{accounts_list}}\n\nIf you cannot produce the requested description within 15 days, please delete the disputed item(s) and update my file accordingly.\n\nSincerely,\n{{client_name}}`
  },
  {
    id: 'demand_15day',
    name: '15-day demand / failure to verify',
    description: 'Escalation when the bureau missed its statutory deadline.',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}}\n{{client_address}}\n\nDear {{bureau_label}},\n\nYou have failed to complete a reasonable reinvestigation of the disputed item(s) below within the time period required by FCRA §611(a)(1). Continued reporting of unverified information violates §611(a)(5)(A) and exposes you to liability under §616 and §617.\n\n{{accounts_list}}\n\nDelete the item(s) immediately and send written confirmation along with an updated free consumer report within 15 days of receipt of this letter.\n\nSincerely,\n{{client_name}}`
  },
  {
    id: 'identity_theft_605b',
    name: 'Identity Theft Affidavit (FCRA §605B)',
    description: 'Identity-theft block request — auto-selects the Identity theft reason.',
    implicitReason: 'Identity theft',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}} — Identity Theft Block Request\n{{client_address}}\n\nDear {{bureau_label}},\n\nI am a victim of identity theft. Pursuant to FCRA §605B, I demand that the following item(s) be blocked from my consumer report within four (4) business days of receipt of this notice. A copy of my FTC Identity Theft Report and proof of identity are enclosed.\n\n{{accounts_list}}\n\nPlease confirm in writing once the block is in place and that the furnisher(s) and any subsequent purchasers have been notified per §605B(b).\n\nSincerely,\n{{client_name}}`
  },
  {
    id: 'outdated_605',
    name: 'Outdated information (FCRA §605)',
    description: '7-year / 10-year reporting limit violations.',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}}\n{{client_address}}\n\nDear {{bureau_label}},\n\nThe item(s) listed below exceed the reporting period permitted by FCRA §605 and must be removed from my consumer file. Continued reporting of obsolete information is a violation that subjects you to liability under §616 and §617.\n\n{{accounts_list}}\n\nDelete the item(s) and send written confirmation along with an updated free consumer report within 30 days.\n\nSincerely,\n{{client_name}}`
  },
  {
    id: 'mixed_file',
    name: 'Mixed file dispute',
    description: 'Wrong-person reporting / file merging with another consumer.',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}} — Mixed File\n{{client_address}}\n\nDear {{bureau_label}},\n\nMy consumer file contains information that does not belong to me. The account(s) below appear to be commingled from another consumer with a similar identifier. Please separate the files, remove the foreign data, and confirm in writing once corrected.\n\n{{accounts_list}}\n\nPursuant to FCRA §1681e(b), you are required to maintain reasonable procedures to assure maximum possible accuracy. Mixed-file reporting is per se inaccurate and must be resolved within the §611 timeframe.\n\nSincerely,\n{{client_name}}`
  },
  {
    id: 'inaccurate_generic',
    name: 'Inaccurate reporting',
    description: 'Generic inaccuracy challenge — auto-selects the Inaccurate Reporting reason.',
    implicitReason: 'Inaccurate Reporting',
    body: `{{bureau_label}}\n{{bureau_address}}\n\nDate: {{date}}\n\nRe: {{client_name}}\n{{client_address}}\n\nDear {{bureau_label}},\n\nThe following item(s) on my consumer credit report are inaccurate and must be corrected or deleted under FCRA §611. Each entry below is being reported with information that does not match my records and cannot be substantiated by the furnisher.\n\n{{accounts_list}}\n\nReinvestigate, correct or delete the disputed item(s) within 30 days, and forward an updated free consumer report to the address above.\n\nSincerely,\n{{client_name}}`
  }
];

type TradelineGroup = {
  key: string;
  sample: ImportedTradeline;
  bureaus: Set<'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION'>;
};

type BatchEntry = {
  localId: string;
  tradelineKey: string;
  furnisher: string;
  accountNumber: string;
  accountType: 'LATE_PAYMENT' | 'COLLECTION' | 'CHARGE_OFF' | 'INQUIRY' | 'OTHER';
  balance: string;
  dateAdded: string;
  disputeEquifax: boolean;
  disputeExperian: boolean;
  disputeTransunion: boolean;
  reason: string;
  customInstruction: string;
  templateId: string;
};

function groupTradelines(tradelines: ImportedTradeline[]): TradelineGroup[] {
  const map = new Map<string, TradelineGroup>();
  for (const t of tradelines) {
    const key = `${(t.creditorName || '').trim().toLowerCase()}|${(t.accountNumber || '').trim()}`;
    const entry = map.get(key);
    if (entry) entry.bureaus.add(t.bureau);
    else map.set(key, { key, sample: t, bureaus: new Set([t.bureau]) });
  }
  return Array.from(map.values());
}

function inferAccountType(t: ImportedTradeline): BatchEntry['accountType'] {
  const v = `${t.accountType || ''} ${t.status || ''}`.toLowerCase();
  if (v.includes('collection')) return 'COLLECTION';
  if (v.includes('charge')) return 'CHARGE_OFF';
  if (v.includes('inquir')) return 'INQUIRY';
  if (v.includes('late') || v.includes('past due')) return 'LATE_PAYMENT';
  return 'OTHER';
}

const EMPTY_FORM: Omit<BatchEntry, 'localId' | 'tradelineKey'> = {
  furnisher: '',
  accountNumber: '',
  accountType: 'OTHER',
  balance: '',
  dateAdded: '',
  disputeEquifax: false,
  disputeExperian: false,
  disputeTransunion: false,
  reason: '',
  customInstruction: '',
  templateId: 'none'
};

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function entryMatchesBureau(e: BatchEntry, b: BureauKey) {
  if (b === 'equifax') return e.disputeEquifax;
  if (b === 'experian') return e.disputeExperian;
  return e.disputeTransunion;
}

function renderAccountsList(entries: BatchEntry[]): string {
  return entries.map((e, i) =>
    `${i + 1}. ${e.furnisher} | ${e.accountNumber || 'Account number pending'} | ${e.accountType.replace(/_/g, ' ')} | Reason: ${e.reason || 'Reason pending'}${e.customInstruction ? ` | Instruction: ${e.customInstruction}` : ''}`
  ).join('\n');
}

function buildBureauLetter(label: string, address: string, entries: BatchEntry[], clientName?: string, clientAddress?: string, template?: LetterTemplate) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const accountsList = renderAccountsList(entries);

  if (template && template.id !== 'none' && template.body) {
    return template.body
      .replace(/\{\{bureau_label\}\}/g, label)
      .replace(/\{\{bureau_address\}\}/g, address)
      .replace(/\{\{date\}\}/g, today)
      .replace(/\{\{client_name\}\}/g, clientName || '[Client Name]')
      .replace(/\{\{client_address\}\}/g, clientAddress || '[Client Address]')
      .replace(/\{\{accounts_list\}\}/g, accountsList);
  }

  return `${label}\n${address}\n\nDate: ${today}\n\n${clientName ? `Re: ${clientName}\n` : ''}${clientAddress ? `${clientAddress}\n\n` : ''}Dear ${label},\n\nI am writing to dispute the following accounts on my credit report. Please investigate each item and correct or delete any inaccurate, incomplete, or unverifiable reporting.\n\n${accountsList}\n\nPlease send the investigation results and updated report to the mailing address on file.\n\nSincerely,\n${clientName || '[Client Name]'}`;
}

function openLetterWindow(title: string, body: string) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:32px;line-height:1.6;color:#111}h1{font-size:20px;margin-bottom:18px}pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre><script>window.onload=function(){window.print();}</script></body></html>`);
  w.document.close();
  w.focus();
}

function saveLetterFile(filename: string, body: string) {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BureausTab({
  token,
  selectedClientId,
  selectedClientLabel,
  clientName,
  clientAddress,
  items,
  tradelines,
  prefillKey,
  onConsumePrefill,
  pendingTradelineKeys,
  onConsumePendingKeys,
  onItemCreated,
  onBackToItems,
  onOpenTracking
}: BureausTabProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [batch, setBatch] = useState<BatchEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Anything already saved as a DisputeItem counts as "used".
  const usedTradelineKeys = useMemo(() => {
    const used = new Set<string>();
    for (const item of items) {
      used.add(`${(item.furnisher || '').trim().toLowerCase()}|${(item.accountNumber || '').trim()}`);
    }
    for (const e of batch) used.add(e.tradelineKey);
    return used;
  }, [items, batch]);

  const grouped = useMemo(() => groupTradelines(tradelines), [tradelines]);
  const unusedTradelines = useMemo(() => grouped.filter((g) => !usedTradelineKeys.has(g.key)), [grouped, usedTradelineKeys]);

  const applyTradeline = (g: TradelineGroup) => {
    setSelectedKey(g.key);
    setFormData({
      furnisher: g.sample.creditorName || '',
      accountNumber: g.sample.accountNumber || '',
      accountType: inferAccountType(g.sample),
      balance: g.sample.balance != null ? String(g.sample.balance) : '',
      dateAdded: '',
      disputeEquifax: g.bureaus.has('EQUIFAX'),
      disputeExperian: g.bureaus.has('EXPERIAN'),
      disputeTransunion: g.bureaus.has('TRANSUNION'),
      reason: g.sample.isNegative ? 'Not mine' : '',
      customInstruction: '',
      templateId: 'none'
    });
    setError(null);
  };

  const handleTemplateChange = (id: string) => {
    const tpl = LETTER_TEMPLATES.find((t) => t.id === id);
    setFormData((p) => ({
      ...p,
      templateId: id,
      reason: tpl?.implicitReason ? tpl.implicitReason : p.reason
    }));
  };

  useEffect(() => {
    if (!prefillKey) return;
    const match = grouped.find((g) => g.key === prefillKey);
    if (match) {
      applyTradeline(match);
      onConsumePrefill?.();
    }
  }, [prefillKey, grouped]);

  // Bulk-stage tradelines pushed in from Add Items. Each key becomes a BatchEntry
  // with the imported-report defaults and "Inaccurate Reporting" as the dispute reason.
  useEffect(() => {
    if (!pendingTradelineKeys || !pendingTradelineKeys.length) return;
    const additions: BatchEntry[] = [];
    for (const key of pendingTradelineKeys) {
      // Skip anything that is already saved as a DisputeItem or already in the batch.
      if (usedTradelineKeys.has(key)) continue;
      const g = grouped.find((x) => x.key === key);
      if (!g) continue;
      additions.push({
        localId: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tradelineKey: g.key,
        furnisher: g.sample.creditorName || '',
        accountNumber: g.sample.accountNumber || '',
        accountType: inferAccountType(g.sample),
        balance: g.sample.balance != null ? String(g.sample.balance) : '',
        dateAdded: '',
        disputeEquifax: g.bureaus.has('EQUIFAX'),
        disputeExperian: g.bureaus.has('EXPERIAN'),
        disputeTransunion: g.bureaus.has('TRANSUNION'),
        reason: 'Inaccurate Reporting',
        customInstruction: '',
        templateId: 'none'
      });
    }
    if (additions.length) {
      setBatch((b) => [...b, ...additions]);
      setNotice(`Added ${additions.length} account${additions.length === 1 ? '' : 's'} from the imported report. Pick a template and Save & generate when ready.`);
    }
    onConsumePendingKeys?.();
  }, [pendingTradelineKeys, grouped]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setSelectedKey('');
    setError(null);
  };

  const handleFurnisherChange = (key: string) => {
    if (!key) { resetForm(); return; }
    const g = unusedTradelines.find((u) => u.key === key) || grouped.find((u) => u.key === key);
    if (g) applyTradeline(g);
  };

  const handleAddToDispute = () => {
    if (!selectedKey) { setError('Pick an account from the Furnisher dropdown first.'); return; }
    if (!formData.reason) { setError('Pick a dispute reason.'); return; }
    if (!formData.disputeEquifax && !formData.disputeExperian && !formData.disputeTransunion) {
      setError('Pick at least one bureau to dispute with.');
      return;
    }
    setBatch((b) => [...b, { localId: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, tradelineKey: selectedKey, ...formData }]);
    setNotice('Added to current dispute batch.');
    resetForm();
  };

  const removeFromBatch = (localId: string) => {
    setBatch((b) => b.filter((e) => e.localId !== localId));
  };

  const clearBatch = () => {
    if (!batch.length) return;
    if (!confirm(`Clear all ${batch.length} item(s) from the dispute batch?`)) return;
    setBatch([]);
  };

  const persistBatch = async (): Promise<string[]> => {
    if (!selectedClientId) throw new Error('Pick a client at the top of the dispute workspace first.');
    if (!batch.length) throw new Error('Add at least one account to the dispute batch.');
    const newIds: string[] = [];
    for (const e of batch) {
      const res = await fetch(`${API_BASE}/api/disputes/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          furnisher: e.furnisher,
          accountNumber: e.accountNumber,
          accountType: e.accountType,
          balance: e.balance ? parseFloat(e.balance) : null,
          dateAdded: e.dateAdded,
          disputeEquifax: e.disputeEquifax,
          disputeExperian: e.disputeExperian,
          disputeTransunion: e.disputeTransunion,
          reason: e.reason,
          customInstruction: e.customInstruction
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed for ${e.furnisher}`);
      }
      const saved = await res.json();
      if (saved?.id) newIds.push(saved.id);
    }
    return newIds;
  };

  const handleSaveBatch = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await persistBatch();
      setBatch([]);
      setNotice('Batch saved. Items are on the Add Items tab.');
      onItemCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Group entries by (bureau, templateId) so each (bureau, template) pair becomes one letter.
  // Returns a flat list of letter cards in the order: EFX(template1, template2,...), XPN(...), TU(...).
  const groupByBureauAndTemplate = (entries: BatchEntry[]) => {
    const out: { bureau: typeof bureauMeta[number]; template: LetterTemplate; entries: BatchEntry[] }[] = [];
    for (const meta of bureauMeta) {
      const forBureau = entries.filter((e) => entryMatchesBureau(e, meta.key));
      if (!forBureau.length) continue;
      const byTpl = new Map<string, BatchEntry[]>();
      for (const e of forBureau) {
        const list = byTpl.get(e.templateId) || [];
        list.push(e);
        byTpl.set(e.templateId, list);
      }
      // Render in the order templates appear in LETTER_TEMPLATES (stable / predictable).
      for (const tpl of LETTER_TEMPLATES) {
        const group = byTpl.get(tpl.id);
        if (group?.length) out.push({ bureau: meta, template: tpl, entries: group });
      }
    }
    return out;
  };

  const handleSaveAndGenerate = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const snapshot = batch.slice();
    try {
      await persistBatch();
      setBatch([]);
      onItemCreated();
      for (const group of groupByBureauAndTemplate(snapshot)) {
        const body = buildBureauLetter(group.bureau.label, group.bureau.address, group.entries, clientName, clientAddress, group.template);
        const title = group.template.id === 'none'
          ? `${group.bureau.label} Dispute Letter`
          : `${group.bureau.label} — ${group.template.name}`;
        openLetterWindow(title, body);
      }
      setNotice('Batch saved and letters opened in print windows.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save & generate failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckAllBureaus = (checked: boolean) => {
    setFormData((p) => ({ ...p, disputeEquifax: checked, disputeExperian: checked, disputeTransunion: checked }));
  };

  // Letter preview cards — one per (bureau, template) pair represented in the batch.
  const lettersPreview = useMemo(() => groupByBureauAndTemplate(batch), [batch]);

  return (
    <div className="bureaus-tab">
      <style>{`
        .bureaus-tab { padding: 1.5rem; display:grid; gap:1.5rem; }
        .bt-header { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; }
        .bt-header h3 { margin:0; font-size:1.25rem; color:#1e293b; }
        .bt-header p { margin:.35rem 0 0; color:#64748b; line-height:1.6; max-width:760px; font-size:.9rem; }
        .bt-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
        .bt-btn { padding:.55rem 1rem; border:1px solid transparent; border-radius:8px; font-weight:600; font-size:.85rem; cursor:pointer; transition: transform .15s ease, opacity .15s ease; }
        .bt-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .bt-btn:disabled { opacity:.55; cursor:not-allowed; }
        .bt-btn--primary { background:#00c6fb; color:#0f1929; border-color:#00c6fb; }
        .bt-btn--success { background:#22c55e; color:#fff; border-color:#22c55e; }
        .bt-btn--ghost { background:transparent; color:#475569; border-color:#cbd5e1; }
        .bt-btn--danger { background:transparent; color:#b91c1c; border-color:#fecaca; }

        .bt-notice { padding:.75rem 1rem; border-radius:8px; font-size:.875rem; }
        .bt-notice--info { background: rgba(0,198,251,.08); color:#0a4f7a; border:1px solid rgba(0,198,251,.32); }
        .bt-notice--success { background: rgba(34,197,94,.10); color:#166534; border:1px solid rgba(34,197,94,.32); }
        .bt-notice--error { background: rgba(220,38,38,.10); color:#8a1313; border:1px solid rgba(220,38,38,.32); }

        .bt-form { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.5rem; }
        .bt-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1rem; }
        .bt-field { display:flex; flex-direction:column; gap:.35rem; }
        .bt-field label { font-size:.8rem; font-weight:600; color:#374151; text-transform:uppercase; letter-spacing:.04em; }
        .bt-field input, .bt-field select, .bt-field textarea { padding:.6rem .75rem; border:1px solid #d1d5db; border-radius:6px; font-size:.9rem; background:#fff; color:#0f172a; font-family:inherit; }
        .bt-field input:focus, .bt-field select:focus, .bt-field textarea:focus { outline:none; border-color:#00c6fb; box-shadow:0 0 0 3px rgba(0,198,251,.15); }
        .bt-field input:disabled, .bt-field select:disabled, .bt-field textarea:disabled { background:#f1f5f9; color:#64748b; cursor:not-allowed; }
        .bt-bureaus { display:flex; gap:1.25rem; flex-wrap:wrap; padding:1rem; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem; }
        .bt-bureau { display:flex; align-items:center; gap:.5rem; font-size:.875rem; color:#374151; font-weight:500; }
        .bt-bureau input { width:16px; height:16px; accent-color:#00c6fb; }
        .bt-form-actions { display:flex; gap:.75rem; flex-wrap:wrap; padding-top:1rem; border-top:1px solid #e2e8f0; }

        .bt-batch { background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:1.25rem; }
        .bt-batch__header { display:flex; justify-content:space-between; align-items:center; gap:.75rem; flex-wrap:wrap; margin-bottom:.75rem; }
        .bt-batch__title { color:#1e293b; font-weight:700; font-size:.95rem; }
        .bt-batch__title small { display:block; color:#64748b; font-size:.78rem; font-weight:500; margin-top:2px; }
        .bt-batch__list { display:grid; gap:.5rem; }
        .bt-batch__row { display:grid; grid-template-columns: 1fr auto auto auto; gap:.75rem; align-items:center; padding:.65rem .85rem; background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; }
        .bt-batch__row strong { color:#0f172a; }
        .bt-batch__row .meta { color:#64748b; font-size:.78rem; }
        .bt-chips { display:flex; gap:3px; }
        .bt-chip { font-size:.65rem; padding:2px 6px; border-radius:999px; font-weight:700; letter-spacing:.04em; }
        .bt-chip--EQ { background:rgba(34,197,94,.14); color:#166534; }
        .bt-chip--EX { background:rgba(59,130,246,.14); color:#1e40af; }
        .bt-chip--TU { background:rgba(168,85,247,.14); color:#6b21a8; }

        .bt-letters { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; }
        .bt-letter { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; display:grid; gap:.75rem; box-shadow:0 12px 32px rgba(15,23,42,.06); }
        .bt-letter h4 { margin:0; font-size:1.05rem; color:#0f172a; }
        .bt-letter p { margin:0; color:#64748b; font-size:.86rem; }
        .bt-letter .pill { display:inline-flex; align-items:center; gap:.5rem; padding:.35rem .7rem; border-radius:999px; background:#eff6ff; color:#2563eb; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
        .bt-letter ol { margin:.25rem 0 0; padding-left:1.2rem; color:#0f172a; font-size:.82rem; }
        .bt-letter .letter-actions { display:flex; gap:.5rem; flex-wrap:wrap; }

        .bt-empty { background:#fff; border:1px dashed #cbd5e1; border-radius:10px; padding:2rem; text-align:center; color:#64748b; font-size:.9rem; }
        .bt-empty strong { display:block; color:#1e293b; margin-bottom:.4rem; }
      `}</style>

      <div className="bt-header">
        <div>
          <h3>Bureaus — build &amp; send</h3>
          <p>Queue multiple accounts into a single dispute batch, then generate one letter per bureau covering every account flagged for that bureau.</p>
        </div>
        <div className="bt-actions">
          <button type="button" className="bt-btn bt-btn--ghost" onClick={onBackToItems}>Back to Add Items</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={onOpenTracking}>Continue to Tracking</button>
        </div>
      </div>

      {notice ? <div className="bt-notice bt-notice--success">{notice}</div> : null}
      {error ? <div className="bt-notice bt-notice--error">{error}</div> : null}

      {/* FORM */}
      {!tradelines.length ? (
        <div className="bt-empty">
          <strong>Import a credit report first.</strong>
          The furnisher dropdown pulls from accounts in the imported report. Use the Import Report tab to upload one.
        </div>
      ) : unusedTradelines.length === 0 ? (
        <div className="bt-empty">
          <strong>Every account on the report is already staged or saved.</strong>
          Items in the dispute pipeline live on the Add Items tab. Import a fresh report to add more.
        </div>
      ) : (
        <div className="bt-form">
          {!selectedKey ? <div className="bt-notice bt-notice--info" style={{ marginBottom: '1rem' }}>Pick an account from the Furnisher dropdown — the rest of the form auto-fills from the imported report.</div> : null}

          <div className="bt-row">
            <div className="bt-field">
              <label>Furnisher *</label>
              <select value={selectedKey} onChange={(e) => handleFurnisherChange(e.target.value)}>
                <option value="">— Select account from imported report —</option>
                {unusedTradelines.map((g) => {
                  const bChips = Array.from(g.bureaus).map((b) => b === 'EXPERIAN' ? 'EX' : b === 'EQUIFAX' ? 'EQ' : 'TU').sort().join('/');
                  const acctTail = g.sample.accountNumber ? ` · ${g.sample.accountNumber}` : '';
                  const negTag = g.sample.isNegative ? ' · NEG' : '';
                  return (
                    <option key={g.key} value={g.key}>
                      {g.sample.creditorName || 'Unknown'}{acctTail} · [{bChips}]{negTag}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="bt-field">
              <label>Account Number</label>
              <input value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} disabled={!selectedKey} />
            </div>

            <div className="bt-field">
              <label>Account Type</label>
              <select value={formData.accountType} onChange={(e) => setFormData({ ...formData, accountType: e.target.value as BatchEntry['accountType'] })} disabled={!selectedKey}>
                {accountTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="bt-row">
            <div className="bt-field">
              <label>Balance</label>
              <input type="number" value={formData.balance} onChange={(e) => setFormData({ ...formData, balance: e.target.value })} placeholder="0.00" disabled={!selectedKey} />
            </div>
            <div className="bt-field">
              <label>Letter Template</label>
              <select value={formData.templateId} onChange={(e) => handleTemplateChange(e.target.value)} disabled={!selectedKey}>
                {LETTER_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {selectedKey && formData.templateId !== 'none' ? (
                <small style={{ color: '#64748b', fontSize: '.72rem' }}>
                  {LETTER_TEMPLATES.find((t) => t.id === formData.templateId)?.description}
                </small>
              ) : null}
            </div>
            <div className="bt-field">
              <label>Date Added</label>
              <input type="date" value={formData.dateAdded} onChange={(e) => setFormData({ ...formData, dateAdded: e.target.value })} disabled={!selectedKey} />
            </div>
            <div className="bt-field">
              <label>Dispute Reason *</label>
              <select value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} disabled={!selectedKey}>
                <option value="">Select reason...</option>
                {disputeReasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="bt-bureaus">
            <label className="bt-bureau">
              <input
                type="checkbox"
                checked={formData.disputeEquifax && formData.disputeExperian && formData.disputeTransunion}
                onChange={(e) => handleCheckAllBureaus(e.target.checked)}
                disabled={!selectedKey}
              />
              Check All
            </label>
            <label className="bt-bureau">
              <input type="checkbox" checked={formData.disputeEquifax} onChange={(e) => setFormData({ ...formData, disputeEquifax: e.target.checked })} disabled={!selectedKey} />
              EFX (Equifax)
            </label>
            <label className="bt-bureau">
              <input type="checkbox" checked={formData.disputeExperian} onChange={(e) => setFormData({ ...formData, disputeExperian: e.target.checked })} disabled={!selectedKey} />
              XPN (Experian)
            </label>
            <label className="bt-bureau">
              <input type="checkbox" checked={formData.disputeTransunion} onChange={(e) => setFormData({ ...formData, disputeTransunion: e.target.checked })} disabled={!selectedKey} />
              TU (TransUnion)
            </label>
          </div>

          <div className="bt-field">
            <label>Custom Instructions</label>
            <textarea
              rows={2}
              value={formData.customInstruction}
              onChange={(e) => setFormData({ ...formData, customInstruction: e.target.value })}
              placeholder="Optional instructions for this dispute…"
              disabled={!selectedKey}
            />
          </div>

          <div className="bt-form-actions">
            <button type="button" className="bt-btn bt-btn--primary" onClick={handleAddToDispute} disabled={!selectedKey || saving}>
              + Add to dispute
            </button>
            <button type="button" className="bt-btn bt-btn--ghost" onClick={resetForm} disabled={!selectedKey || saving}>
              Clear form
            </button>
          </div>
        </div>
      )}

      {/* BATCH */}
      <div className="bt-batch">
        <div className="bt-batch__header">
          <div className="bt-batch__title">
            Accounts in this dispute
            <small>
              {batch.length
                ? `${batch.length} account${batch.length === 1 ? '' : 's'} queued for ${selectedClientLabel || 'this client'}`
                : 'Queued accounts will appear here. They are not saved until you press Save batch.'}
            </small>
          </div>
          <div className="bt-actions">
            <button type="button" className="bt-btn bt-btn--danger" onClick={clearBatch} disabled={!batch.length || saving}>
              Clear batch
            </button>
            <button type="button" className="bt-btn bt-btn--ghost" onClick={handleSaveBatch} disabled={!batch.length || saving}>
              {saving ? 'Saving…' : 'Save batch'}
            </button>
            <button type="button" className="bt-btn bt-btn--success" onClick={handleSaveAndGenerate} disabled={!batch.length || saving}>
              {saving ? 'Saving…' : 'Save & generate letters'}
            </button>
          </div>
        </div>

        {batch.length ? (
          <div className="bt-batch__list">
            {batch.map((e) => (
              <div key={e.localId} className="bt-batch__row">
                <div>
                  <strong>{e.furnisher}</strong>
                  <div className="meta">{e.accountNumber || '—'} · {e.accountType.replace('_', ' ')} · {e.reason || 'reason pending'}</div>
                </div>
                <div className="bt-chips">
                  {e.disputeEquifax ? <span className="bt-chip bt-chip--EQ">EQ</span> : null}
                  {e.disputeExperian ? <span className="bt-chip bt-chip--EX">EX</span> : null}
                  {e.disputeTransunion ? <span className="bt-chip bt-chip--TU">TU</span> : null}
                </div>
                <div className="meta">{e.balance ? `$${Number(e.balance).toLocaleString()}` : '—'}</div>
                <button type="button" className="bt-btn bt-btn--danger" style={{ padding: '.35rem .7rem' }} onClick={() => removeFromBatch(e.localId)} disabled={saving}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* LETTER PREVIEW */}
      {batch.length ? (
        <div>
          <div className="bt-batch__title" style={{ marginBottom: '.75rem' }}>
            Letter preview
            <small>One letter per bureau × template. Accounts using the same template ride together; mixing templates on one bureau creates additional letters.</small>
          </div>
          <div className="bt-letters">
            {lettersPreview.length ? lettersPreview.map((l, idx) => {
              const title = l.template.id === 'none' ? `${l.bureau.label} Dispute Letter` : `${l.bureau.label} — ${l.template.name}`;
              const filename = l.template.id === 'none'
                ? `${l.bureau.label.toLowerCase()}-dispute-letter.txt`
                : `${l.bureau.label.toLowerCase()}-${l.template.id}.txt`;
              return (
                <article key={`${l.bureau.key}_${l.template.id}_${idx}`} className="bt-letter">
                  <div>
                    <span className="pill">{l.bureau.short}{l.template.id !== 'none' ? ` · ${l.template.name}` : ''}</span>
                    <h4>{l.bureau.label}</h4>
                    <p>{l.entries.length} account{l.entries.length === 1 ? '' : 's'} on this letter.</p>
                  </div>
                  <ol>{l.entries.map((e) => <li key={e.localId}>{e.furnisher}{e.accountNumber ? ` · ${e.accountNumber}` : ''} — {e.reason}</li>)}</ol>
                  <div className="letter-actions">
                    <button type="button" className="bt-btn bt-btn--primary" onClick={() => openLetterWindow(title, buildBureauLetter(l.bureau.label, l.bureau.address, l.entries, clientName, clientAddress, l.template))}>
                      Print letter
                    </button>
                    <button type="button" className="bt-btn bt-btn--ghost" onClick={() => saveLetterFile(filename, buildBureauLetter(l.bureau.label, l.bureau.address, l.entries, clientName, clientAddress, l.template))}>
                      Save .txt
                    </button>
                  </div>
                </article>
              );
            }) : (
              <div className="bt-empty">No accounts in the batch have any bureau checkboxes selected — letters appear once at least one bureau is ticked.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

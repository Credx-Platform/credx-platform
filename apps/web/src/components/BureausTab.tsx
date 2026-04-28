import type { DisputeItem } from './DisputeManager';

interface BureausTabProps {
  items: DisputeItem[];
  selectedItemIds: string[];
  onBackToItems: () => void;
  onOpenTracking: () => void;
}

type BureauKey = 'equifax' | 'experian' | 'transunion';

const bureauMeta: Array<{ key: BureauKey; short: string; label: string; address: string }> = [
  { key: 'equifax', short: 'EFX', label: 'Equifax', address: '[EFXAddress]' },
  { key: 'experian', short: 'XPN', label: 'Experian', address: '[XPNAddress]' },
  { key: 'transunion', short: 'TU', label: 'TransUnion', address: '[TUAddress]' }
];

function itemMatchesBureau(item: DisputeItem, bureau: BureauKey) {
  if (bureau === 'equifax') return item.disputeEquifax;
  if (bureau === 'experian') return item.disputeExperian;
  return item.disputeTransunion;
}

function buildLetter(label: string, address: string, bureauItems: DisputeItem[]) {
  const lines = bureauItems.map((item, index) => (
    `${index + 1}. ${item.furnisher} | ${item.accountNumber || 'Account number pending'} | ${item.accountType.replace(/_/g, ' ')} | Reason: ${item.reason || 'Reason pending'}${item.customInstruction ? ` | Instruction: ${item.customInstruction}` : ''}`
  ));

  return `${label}\n${address}\n\nDate: __________________\n\nDear ${label},\n\nI am writing to dispute the following accounts on my credit report. Please investigate each item and correct or delete any inaccurate, incomplete, or unverifiable reporting.\n\n${lines.join('\n')}\n\nPlease send the investigation results and updated report to the mailing address on file.\n\nSincerely,\n[Client Name]`;
}

export function BureausTab({ items, selectedItemIds, onBackToItems, onOpenTracking }: BureausTabProps) {
  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));

  const handlePrint = (bureauLabel: string, address: string, bureauItems: DisputeItem[]) => {
    const letter = buildLetter(bureauLabel, address, bureauItems);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${bureauLabel} Dispute Letter</title><style>body{font-family:Arial,sans-serif;padding:32px;line-height:1.6;color:#111}h1{font-size:20px;margin-bottom:18px}pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px}</style></head><body><h1>${bureauLabel} Dispute Letter</h1><pre>${letter.replace(/</g, '&lt;')}</pre></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleSave = (bureauLabel: string, address: string, bureauItems: DisputeItem[]) => {
    const letter = buildLetter(bureauLabel, address, bureauItems);
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${bureauLabel.toLowerCase().replace(/\s+/g, '-')}-dispute-letter.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bureaus-tab">
      <style>{`
        .bureaus-tab { padding: 1.5rem; }
        .bureaus-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap; }
        .bureaus-header h3 { margin:0; font-size:1.25rem; color:#1e293b; }
        .bureaus-header p { margin:.35rem 0 0; color:#64748b; line-height:1.6; max-width:760px; }
        .bureaus-actions { display:flex; gap:.75rem; flex-wrap:wrap; }
        .btn { padding:.65rem 1rem; border:none; border-radius:8px; font-weight:600; cursor:pointer; font-size:.875rem; }
        .btn-primary { background:#2563eb; color:#fff; }
        .btn-secondary { background:#e2e8f0; color:#0f172a; }
        .bureau-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; }
        .bureau-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; display:grid; gap:1rem; box-shadow:0 12px 32px rgba(15,23,42,.06); }
        .bureau-card h4 { margin:0; font-size:1.05rem; color:#0f172a; }
        .bureau-card p { margin:0; color:#64748b; font-size:.88rem; }
        .bureau-pill { display:inline-flex; align-items:center; gap:.5rem; padding:.35rem .7rem; border-radius:999px; background:#eff6ff; color:#2563eb; font-size:.74rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
        .bureau-items { display:grid; gap:.65rem; }
        .bureau-item { border:1px solid #e5e7eb; border-radius:10px; padding:.8rem; background:#f8fafc; }
        .bureau-item strong { display:block; color:#0f172a; margin-bottom:.2rem; }
        .bureau-item span { display:block; color:#64748b; font-size:.84rem; line-height:1.5; }
        .bureau-card-actions { display:flex; gap:.75rem; flex-wrap:wrap; }
        .btn-outline { background:#fff; border:1px solid #cbd5e1; color:#334155; }
        .empty-stage { background:#f8fafc; border:1px dashed #cbd5e1; border-radius:14px; padding:2rem; text-align:center; color:#64748b; }
      `}</style>

      <div className="bureaus-header">
        <div>
          <h3>Bureau Letter Staging</h3>
          <p>Selected accounts from Add Items land here. This section groups them by bureau so they can be prepared for dispute letters, then printed or saved before moving into tracking.</p>
        </div>
        <div className="bureaus-actions">
          <button className="btn btn-secondary" onClick={onBackToItems}>Back to Add Items</button>
          <button className="btn btn-primary" onClick={onOpenTracking}>Continue to Tracking</button>
        </div>
      </div>

      {!selectedItems.length ? (
        <div className="empty-stage">
          <strong>No accounts staged yet.</strong>
          <p>Select dispute accounts in Add Items, then use “Add Selected to Bureaus.”</p>
        </div>
      ) : (
        <div className="bureau-grid">
          {bureauMeta.map((bureau) => {
            const bureauItems = selectedItems.filter((item) => itemMatchesBureau(item, bureau.key));
            return (
              <article key={bureau.key} className="bureau-card">
                <div>
                  <span className="bureau-pill">{bureau.short}</span>
                  <h4>{bureau.label}</h4>
                  <p>{bureauItems.length} selected account{bureauItems.length === 1 ? '' : 's'} staged for this letter.</p>
                </div>

                <div className="bureau-items">
                  {bureauItems.length ? bureauItems.map((item) => (
                    <div key={item.id} className="bureau-item">
                      <strong>{item.furnisher}</strong>
                      <span>{item.accountNumber || 'Account number pending'} · {item.accountType.replace(/_/g, ' ')}</span>
                      <span>Reason: {item.reason || 'Reason pending'}</span>
                    </div>
                  )) : <div className="empty-stage">No staged accounts for {bureau.label} yet.</div>}
                </div>

                <div className="bureau-card-actions">
                  <button className="btn btn-primary" disabled={!bureauItems.length} onClick={() => handlePrint(bureau.label, bureau.address, bureauItems)}>
                    Print Letter
                  </button>
                  <button className="btn btn-outline" disabled={!bureauItems.length} onClick={() => handleSave(bureau.label, bureau.address, bureauItems)}>
                    Save Letter
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

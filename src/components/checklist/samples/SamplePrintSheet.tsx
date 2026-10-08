/**
 * The paper pull sheet: the sample request exactly as it stands, laid out for one printed page. It is mounted
 * only while printing, in a portal on <body>; printSampleSheet() swaps it in for the app while the browser prints
 * (see .sample-print-sheet in index.css). Staff tick each line as they pull it and the page travels with the box.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { SAMPLE_BRAND_LABELS, SAMPLE_BRAND_ORDER } from '../../../utils/sampleRequestApi';
import type { SampleCatalog, EventSampleRequest, SampleEventInfo, SampleRequestItem, SampleRequestMaterial } from '../../../utils/sampleRequestApi';
import { brandGroups, visibleMaterials, isRequested } from './sampleGroups';
import { formatCloseDate } from './sampleRequestText';

const PRINTING_CLASS = 'printing-sample-sheet';

/** Shows the sheet in place of the app for the duration of the browser's print dialog, then calls onDone. */
export function printSampleSheet(onDone?: () => void): void {
  const done = () => { document.body.classList.remove(PRINTING_CLASS); window.removeEventListener('afterprint', done); onDone?.(); };
  document.body.classList.add(PRINTING_CLASS);
  window.addEventListener('afterprint', done);
  window.print();
}

interface Props {
  catalog: SampleCatalog;
  request: EventSampleRequest;
  event?: SampleEventInfo;
  items: Map<string, SampleRequestItem>;
  materials: Map<string, SampleRequestMaterial>;
  /** ISO close time while the form is still open; null once closed. An open form can still change after printing. */
  openUntil: string | null;
}

const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const stamp = (iso: string) => `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`;

const TH = 'border-b border-black px-1 pb-0.5 text-[7.5pt] font-bold uppercase tracking-wide';
const NUM = 'border-b border-l border-neutral-400 px-1 text-center tabular-nums';
const Tick: React.FC<{ show: boolean }> = ({ show }) => (
  <td className="border-b border-l border-neutral-400 text-center align-middle">
    {show && <span aria-hidden="true" className="inline-block h-[9pt] w-[9pt] border border-black align-middle" />}
  </td>
);
const qty = (n: number | undefined) => (n && n > 0 ? n : '');
const Blank: React.FC<{ label: string; wide?: boolean }> = ({ label, wide }) => (
  <div className={`flex items-end gap-1.5 ${wide ? 'flex-[2]' : 'flex-1'}`}>
    <span className="whitespace-nowrap">{label}</span><span className="h-[14pt] flex-1 border-b border-black" />
  </div>
);

export const SamplePrintSheet: React.FC<Props> = ({ catalog, request, event, items, materials, openUntil }) => {
  const rows = [...items.values()];
  const totals = rows.reduce((t, i) => ({ singles: t.singles + i.singles, displays: t.displays + i.displays, empty: t.empty + i.emptyDisplays }),
    { singles: 0, displays: 0, empty: 0 });
  const productCount = rows.filter(isRequested).length;
  const place = [event?.venue, [event?.city, event?.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const dates = event?.showStartDate
    ? (event.showEndDate && event.showEndDate !== event.showStartDate ? `${day(event.showStartDate)} – ${day(event.showEndDate)}` : day(event.showStartDate))
    : null;
  const submitted = request.status === 'submitted';
  const editedSinceSubmit = submitted && !!request.submittedAt && !!request.lastEditedAt
    && new Date(request.lastEditedAt).getTime() > new Date(request.submittedAt).getTime();
  const warning = !submitted ? 'DRAFT: this request has not been submitted. Quantities may change.'
    : editedSinceSubmit ? 'Edited after it was last submitted. Quantities may change.'
    : openUntil ? `The form is open until ${formatCloseDate(openUntil)}. Quantities may change.` : null;

  const brandTable = (brand: (typeof SAMPLE_BRAND_ORDER)[number]) => (
    <section key={brand} className="mb-3">
      <h2 className="mb-1 text-[11pt] font-bold">{SAMPLE_BRAND_LABELS[brand]}</h2>
      <table className="w-full table-fixed border-collapse">
        <colgroup><col /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup>
        <thead>
          <tr>
            <th scope="col" className={`${TH} text-left`}>Item</th>
            <th scope="col" className={`${TH} text-center`}>Singles</th>
            <th scope="col" className={`${TH} text-center`}>Displays</th>
            <th scope="col" className={`${TH} text-center`}>Empty</th>
            <th scope="col" className={`${TH} text-center`}>Pulled</th>
          </tr>
        </thead>
        {brandGroups(catalog, items, brand).map(({ line, products }) => (
          <tbody key={line.id} className="break-inside-avoid">
            <tr><th colSpan={5} scope="rowgroup" className="border-b border-neutral-400 px-1 pb-0.5 pt-1.5 text-left text-[7.5pt] font-bold uppercase tracking-wide">{line.name}</th></tr>
            {products.map((p) => {
              const row = items.get(p.id);
              const on = isRequested(row);
              return (
                <tr key={p.id}>
                  <td className={`border-b border-neutral-400 px-1 py-[1.5pt] ${on ? 'font-bold' : ''}`}>{p.name}</td>
                  <td className={`${NUM} font-bold`}>{qty(row?.singles)}</td>
                  <td className={`${NUM} font-bold`}>{qty(row?.displays)}</td>
                  <td className={`${NUM} font-bold`}>{qty(row?.emptyDisplays)}</td>
                  <Tick show={on} />
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </section>
  );

  const [firstBrand, ...otherBrands] = SAMPLE_BRAND_ORDER;

  return createPortal(
    <div className="sample-print-sheet" aria-hidden="true">
      <div className="font-sans text-[9pt] leading-tight text-black">
        <header className="mb-2 flex items-start justify-between gap-4 border-b-2 border-black pb-1.5">
          <div className="min-w-0">
            <p className="text-[8pt] font-bold uppercase tracking-widest">Sample Request</p>
            <h1 className="text-[16pt] font-bold leading-tight">{event?.name ?? 'Trade show'}</h1>
            {(place || dates) && <p className="mt-0.5">{[place, dates].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="inline-block border border-black px-2 py-0.5 text-[9pt] font-bold uppercase tracking-wide">{submitted ? 'Submitted' : 'Draft'}</p>
            {submitted && request.submittedAt && <p className="mt-1">Submitted by {request.submittedBy?.name ?? 'someone'}, {stamp(request.submittedAt)}</p>}
            {request.lastEditedAt && <p>Last edited by {request.lastEditedBy?.name ?? 'someone'}, {stamp(request.lastEditedAt)}</p>}
            <p>Printed {stamp(new Date().toISOString())}</p>
          </div>
        </header>

        {warning && <p className="mb-2 border border-black px-2 py-1 font-bold">{warning}</p>}

        <p className="mb-2">
          <strong>Totals:</strong> {productCount} {productCount === 1 ? 'product' : 'products'} · {totals.singles} singles · {totals.displays} displays · {totals.empty} empty displays
        </p>

        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            {brandTable(firstBrand)}
            <section className="mb-3 break-inside-avoid">
              <h2 className="mb-1 text-[11pt] font-bold">Marketing &amp; booth supplies</h2>
              <table className="w-full table-fixed border-collapse">
                <colgroup><col /><col className="w-[12%]" /><col className="w-[36%]" /><col className="w-[12%]" /></colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={`${TH} text-left`}>Item</th>
                    <th scope="col" className={`${TH} text-center`}>Qty</th>
                    <th scope="col" className={`${TH} text-left`}>Notes</th>
                    <th scope="col" className={`${TH} text-center`}>Pulled</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMaterials(catalog, materials).map((m) => {
                    const row = materials.get(m.id);
                    const on = (row?.qty ?? 0) > 0;
                    return (
                      <tr key={m.id}>
                        <td className={`border-b border-neutral-400 px-1 py-[1.5pt] ${on ? 'font-bold' : ''}`}>{m.name}</td>
                        <td className={`${NUM} font-bold`}>{qty(row?.qty)}</td>
                        <td className="break-words border-b border-l border-neutral-400 px-1">{row?.notes ?? ''}</td>
                        <Tick show={on} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>
          <div className="min-w-0 flex-1">{otherBrands.map(brandTable)}</div>
        </div>

        <footer className="mt-3 break-inside-avoid space-y-2.5 border-t-2 border-black pt-2">
          <div className="flex gap-5"><Blank label="Pulled by" wide /><Blank label="Date" /><Blank label="Boxes" /></div>
          <div className="flex gap-5"><Blank label="Checked by" wide /><Blank label="Date" /><Blank label="Received at show by" wide /></div>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

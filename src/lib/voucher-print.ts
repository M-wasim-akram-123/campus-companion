import { CAMPUS_LOGO_URL, CAMPUS_NAME } from "@/lib/campus";

/** Open print/PDF window with campus logo and print-friendly styles */
export function printVoucherHtml(innerHtml: string, title: string) {
  const logoBlock = CAMPUS_LOGO_URL
    ? `<img src="${CAMPUS_LOGO_URL}" alt="${CAMPUS_NAME}" class="campus-logo" />`
    : "";
  const w = window.open("", "_blank");
  if (!w) return;
  const logoWrap = logoBlock ? `<div style="text-align:center">${logoBlock}</div>` : "";
  w.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <title>${title} — ${CAMPUS_NAME}</title>
  <style>
    @page { size: A4 landscape; margin: 7mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #000; background: #fff; }
    .campus-logo { display: none; }
    .voucher-print { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; align-items: stretch; }
    .voucher-copy { page-break-inside: avoid; break-inside: avoid; margin: 0; min-height: calc(210mm - 14mm); border: 1.5px solid #000; padding: 7px; font-size: 10px; line-height: 1.18; }
    .voucher-header { border-bottom: 1.5px solid #000; padding-bottom: 4px; text-align: center; }
    .voucher-header img { max-height: 30px; max-width: 120px; margin: 0 auto 2px; display: block; object-fit: contain; }
    .voucher-header h1 { margin: 0; font-size: 13px; line-height: 1.1; text-transform: uppercase; }
    .voucher-header p { margin: 1px 0; }
    .voucher-main { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 5px; }
    .voucher-info p { margin: 1px 0; }
    .voucher-lines { margin-top: 6px; font-size: 10px; }
    .voucher-lines th, .voucher-lines td { padding: 2px 0; }
    .voucher-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; text-align: center; font-size: 8px; }
    .voucher-signatures div { border-top: 1px solid #000; padding-top: 14px; }
    .voucher-note { margin: 5px 0 0; text-align: center; font-size: 8px; }
    svg, canvas, img { max-width: 100%; }
    @media print {
      .voucher-copy { page-break-after: auto; }
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 0; }
  </style>
</head><body>
  ${logoWrap}
  ${innerHtml}
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

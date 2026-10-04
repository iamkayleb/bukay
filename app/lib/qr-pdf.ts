import QRCode from "qrcode";

export type QrPdfInput = {
  /** Tenant display name, printed as the heading. */
  name: string;
  slug: string;
  /** Origin used to build the booking URL, e.g. "https://bukay.app". */
  origin: string;
};

/** Booking link that the QR code resolves to: `{origin}/{slug}`. */
export function bookingUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/${encodeURIComponent(slug)}`;
}

/** Dark-module matrix for the booking URL (row-major, true = dark). */
export function qrMatrix(url: string): boolean[][] {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(Boolean(data[y * size + x]));
    rows.push(row);
  }
  return rows;
}

/** PNG rendering of the booking QR code. */
export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 512 });
}

function pdfText(value: string): string {
  // Standard Helvetica is WinAnsi: replace anything outside Latin-1 and escape delimiters.
  return value.replace(/[^\x20-\x7e\xa0-\xff]/g, "?").replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Build a single-page A5 PDF: tenant name, QR code and the booking URL. */
export function buildQrPdf({ name, slug, origin }: QrPdfInput): Buffer {
  const url = bookingUrl(origin, slug);
  const matrix = qrMatrix(url);
  const quiet = 4;
  const total = matrix.length + quiet * 2;
  const width = 420;
  const height = 595;
  const qrSize = 320;
  const cell = qrSize / total;
  const left = (width - qrSize) / 2;
  const bottom = 150;

  const ops: string[] = [];
  ops.push("0 0 0 rg");
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (!matrix[y][x]) continue;
      const px = left + (x + quiet) * cell;
      const py = bottom + qrSize - (y + quiet + 1) * cell;
      ops.push(`${px.toFixed(3)} ${py.toFixed(3)} ${cell.toFixed(3)} ${cell.toFixed(3)} re`);
    }
  }
  ops.push("f");

  const centered = (text: string, size: number, y: number, font: string) => {
    // Helvetica averages ~0.55em per glyph; good enough for centering.
    const approx = text.length * size * 0.55;
    const x = Math.max(20, (width - approx) / 2);
    return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y} Td (${pdfText(text)}) Tj ET`;
  };
  ops.push(centered(name, 26, 520, "F2"));
  ops.push(centered("Scan to book an appointment", 14, 490, "F1"));
  ops.push(centered(url, 12, 120, "F1"));

  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

import QRCode from "qrcode";

export type QrPdfOptions = {
  businessName: string;
  bookingUrl: string;
};

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1").replace(/[\r\n]+/g, " ");
}

function qrDrawingCommands(bookingUrl: string): string[] {
  const qr = QRCode.create(bookingUrl, { errorCorrectionLevel: "M" });
  const size = 180;
  const moduleSize = size / qr.modules.size;
  const originX = 216;
  const originY = 430;
  const commands = ["q", "1 1 1 rg", `${originX} ${originY} ${size} ${size} re f`, "0 0 0 rg"];

  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (qr.modules.get(row, column)) {
        commands.push(
          `${(originX + column * moduleSize).toFixed(2)} ${(
            originY +
            (qr.modules.size - row - 1) * moduleSize
          ).toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re f`
        );
      }
    }
  }

  commands.push("Q");
  return commands;
}

/**
 * Builds a compact, printable booking card. The booking URL is deliberately
 * included as text so a downloaded card remains useful when printed without
 * a camera or when a QR reader cannot scan it.
 */
export function buildQrPdf({ businessName, bookingUrl }: QrPdfOptions): Uint8Array {
  const title = escapePdfText(`Book with ${businessName}`);
  const url = escapePdfText(bookingUrl);
  const content = [
    "BT",
    "/F1 24 Tf",
    "72 710 Td",
    `(${title}) Tj`,
    "0 -32 Td",
    "/F1 13 Tf",
    "(Scan the QR code below or visit:) Tj",
    "0 -22 Td",
    "/F1 11 Tf",
    `(${url}) Tj`,
    "ET",
    ...qrDrawingCommands(bookingUrl),
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

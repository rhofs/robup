import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/prisma';
import { loadDocJSONForExport } from '@/lib/collab/loadDocForExport';
import { writeDocToPdf } from '@/lib/collab/docJSONToPdf';
import { resolveDocImages } from '@/lib/collab/resolveDocImages';

function renderPdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.doc.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) return new Response('Not found', { status: 404 });

  const json = loadDocJSONForExport(doc);
  const title = doc.title || 'Untitled';
  // Fetched/read up front — pdfkit's own embed call is synchronous, and the doc-JSON tree walk it
  // runs inside (writeDocToPdf) is otherwise synchronous too. See resolveDocImages' own comment.
  const images = await resolveDocImages(json);

  const buffer = await renderPdfBuffer((pdf) => {
    pdf.font('Helvetica-Bold').fontSize(20).text(title);
    pdf.moveDown();
    writeDocToPdf(pdf, json, images);
  });

  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeTitle}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

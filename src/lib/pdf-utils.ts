import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, Color as PDFLibColor } from 'pdf-lib';
import { formatSpanishDate } from '@/lib/date-utils';
import {
  Meaning,
  GRAMMATICAL_CATEGORIES,
  MEANING_MARKER_GROUPS,
  MEANING_MARKER_KEYS,
} from '@/lib/definitions';

export interface PDFWord {
  lemma: string;
  root?: string | null;
  letter: string;
  status?: string;
  meanings?: Meaning[];
  notes?: Array<{
    note: string | null;
    date: string | null;
    user?: string | null;
  }> | null;
}

/**
 * Sanitizes text to be safe for PDF generation with WinAnsi encoding.
 *
 * @param text - The text string to sanitize
 * @returns A cleaned string with line breaks replaced by spaces and control characters removed
 *
 */
function sanitizeTextForPDF(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}

/**
 * Parse simple markdown and return segments with their styles
 *
 * @param text - The markdown text to parse
 * @returns Array of text segments with bold/italic flags
 */
function parseMarkdown(text: string): Array<{ text: string; bold: boolean; italic: boolean }> {
  const segments: Array<{ text: string; bold: boolean; italic: boolean }> = [];

  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|[^*]+)/g;
  const matches = text.match(regex) || [];

  for (const match of matches) {
    if (match.startsWith('***') && match.endsWith('***')) {
      // Bold + Italic
      segments.push({
        text: match.slice(3, -3),
        bold: true,
        italic: true,
      });
    } else if (match.startsWith('**') && match.endsWith('**')) {
      // Bold
      segments.push({
        text: match.slice(2, -2),
        bold: true,
        italic: false,
      });
    } else if (match.startsWith('*') && match.endsWith('*')) {
      // Italic
      segments.push({
        text: match.slice(1, -1),
        bold: false,
        italic: true,
      });
    } else {
      // Normal text
      segments.push({
        text: match,
        bold: false,
        italic: false,
      });
    }
  }
  return segments;
}

/**
 * Generate a PDF report of redacted and reviewed by lexicographers words with their editorial comments
 *
 * @param words - List of words to include in the report
 * @param reportType - Type of report: 'redacted', 'reviewedLex', or 'both'
 * @returns A Uint8Array containing the generated PDF data
 */
export async function generatePDFreport(
  words: PDFWord[],
  reportType: 'redacted' | 'reviewedLex' | 'both'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  // Fonts
  const fontTitle = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontText = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Margins and layout
  const marginLeft = 60;
  const marginRight = 60;
  const marginTop = 50;
  const marginBottom = 50;
  const lineHeight = 16;
  const contentWidth = width - marginLeft - marginRight;

  // Ensure there is enough space for the next content, otherwise add a new page
  const ensureSpace = (neededLines: number) => {
    if (y - neededLines * lineHeight < marginBottom + 30) {
      // draw footer on current page before creating a new one
      drawFooter(pageNumber);
      page = pdfDoc.addPage();
      pageNumber += 1;
      y = height - marginTop;
      drawHeader();
    }
  };

  // To split text into lines if too long
  const wrapText = (text: string, maxChars: number): string[] => {
    const lines: string[] = [];
    let current = text;

    while (current.length > maxChars) {
      const cutAt = current.lastIndexOf(' ', maxChars);
      const idx = cutAt > 0 ? cutAt : maxChars;
      lines.push(current.slice(0, idx));
      current = current.slice(idx).trimStart();
    }

    if (current.length > 0) lines.push(current);
    return lines;
  };

  // Draw parsed markdown segments in sequence at the current y
  // Returns the final X position after drawing all segments
  const drawSegments = (
    segments: Array<{ text: string; bold: boolean; italic: boolean }>,
    startX: number,
    size: number,
    color: PDFLibColor
  ): number => {
    let currentX = startX;
    for (const seg of segments) {
      const segFont =
        seg.bold && seg.italic
          ? fontBoldItalic
          : seg.bold
            ? fontTitle
            : seg.italic
              ? fontItalic
              : fontText;

      const cleanText = sanitizeTextForPDF(seg.text);
      page.drawText(cleanText, {
        x: currentX,
        y,
        size,
        font: segFont,
        color,
      });

      currentX += segFont.widthOfTextAtSize(cleanText, size);
    }
    return currentX;
  };

  // Draw wrapped text
  const drawWrapped = (
    text: string,
    x: number,
    size: number,
    maxChars: number,
    opts?: {
      markdown?: boolean;
      font?: PDFFont;
      color?: PDFLibColor;
      lineStep?: number;
    }
  ) => {
    const {
      markdown = false,
      font = fontText,
      color = rgb(0, 0, 0),
      lineStep = lineHeight,
    } = opts || {};
    const lines = wrapText(text, maxChars);
    for (const line of lines) {
      ensureSpace(1);
      if (markdown) {
        const segments = parseMarkdown(line);
        drawSegments(segments, x, size, color);
      } else {
        page.drawText(sanitizeTextForPDF(line), {
          x,
          y,
          size,
          font,
          color,
        });
      }
      y -= lineStep;
    }
  };

  // Draws either a wrapped block (if maxChars provided) or a single line
  // supports markdown rendering, custom font/color, and automatic y decrement.
  const drawLine = (
    text: string,
    x: number,
    opts?: {
      size?: number;
      font?: PDFFont;
      color?: PDFLibColor;
      markdown?: boolean;
      maxChars?: number;
      lineStep?: number;
      ensureLines?: number;
    }
  ) => {
    const {
      size = 10,
      font = fontText,
      color = rgb(0.3, 0.3, 0.3),
      markdown = false,
      lineStep = lineHeight,
      ensureLines = 1,
    } = opts || {};

    if (opts && opts.maxChars !== undefined) {
      drawWrapped(text, x, size, opts.maxChars, { markdown, font, color, lineStep });
      return;
    }

    ensureSpace(ensureLines);

    if (markdown) {
      const segments = parseMarkdown(text);
      drawSegments(segments, x, size, color);
    } else {
      page.drawText(sanitizeTextForPDF(text), {
        x,
        y,
        size,
        font,
        color,
      });
    }

    y -= lineStep;
  };

  let y = height - marginTop;

  // Current date string
  const dateStr = formatSpanishDate();

  // Header
  const drawHeader = () => {
    const titleMap = {
      redacted: 'Reporte de palabras redactadas',
      reviewedLex: 'Reporte de palabras revisadas por lexicógrafo',
      both: 'Reporte de palabras pendientes de revisión por comisión',
    };

    const title = sanitizeTextForPDF(titleMap[reportType]);
    const titleSize = 16;
    const titleWidth = fontTitle.widthOfTextAtSize(title, titleSize);
    const titleX = marginLeft + (contentWidth - titleWidth) / 2;

    drawLine(title, titleX, {
      size: titleSize,
      font: fontTitle,
      color: rgb(0, 0, 0),
      lineStep: 22,
    });

    const subtitle = sanitizeTextForPDF(`Al ${dateStr}`);
    const subtitleSize = 11;
    const subtitleWidth = fontText.widthOfTextAtSize(subtitle, subtitleSize);
    const subtitleX = marginLeft + (contentWidth - subtitleWidth) / 2;

    drawLine(subtitle, subtitleX, {
      size: subtitleSize,
      font: fontText,
      color: rgb(0.3, 0.3, 0.3),
      lineStep: 20,
    });
  };

  // Footer
  const drawFooter = (pageNumber: number) => {
    const footerY = marginBottom - 20;
    const pageLabel = sanitizeTextForPDF(`— ${pageNumber} —`);
    const pageLabelWidth = fontText.widthOfTextAtSize(pageLabel, 9);
    const pageLabelX = marginLeft + (contentWidth - pageLabelWidth) / 2;

    // Draw the page label
    page.drawText(sanitizeTextForPDF(pageLabel), {
      x: pageLabelX,
      y: footerY,
      size: 9,
      font: fontText,
      color: rgb(0.4, 0.4, 0.4),
    });
  };

  let pageNumber = 1;
  drawHeader();

  // Draw editorial notes for a word
  const drawEditorialNotesForWord = (notes: PDFWord['notes']) => {
    drawLine('Comentarios editoriales:', marginLeft + 15, {
      size: 10,
      font: fontTitle,
      color: rgb(0.2, 0.2, 0.2),
      lineStep: lineHeight,
    });

    if (!notes || notes.length === 0) {
      drawLine('Sin comentarios.', marginLeft + 25, {
        size: 10,
        font: fontItalic,
        color: rgb(0.5, 0.5, 0.5),
        lineStep: lineHeight,
      });
      return;
    }

    for (const note of notes) {
      ensureSpace(3);
      const username = note.user ? `@${note.user}` : 'Anónimo';
      const noteDate = note.date ? formatSpanishDate(new Date(note.date)) : null;
      const noteLabel = noteDate ? `${username} (${noteDate})` : username;

      drawLine(`• ${noteLabel}:`, marginLeft + 25, {
        size: 10,
        markdown: true,
        lineStep: lineHeight - 2,
      });

      const noteText = note.note ?? '';
      if (noteText) {
        drawWrapped(noteText, marginLeft + 40, 10, 100, { markdown: true });
      }

      y -= 6;
    }
  };

  // Draw a meaning block
  const drawMeaningBlock = (meaning: Meaning) => {
    ensureSpace(6);

    drawLine(`Acepción ${meaning.number}:`, marginLeft + 15, {
      size: 11,
      font: fontTitle,
      color: rgb(0, 0, 0),
      lineStep: lineHeight,
    });

    // Origin
    if (meaning.origin) {
      drawLine(`Origen: ${meaning.origin}`, marginLeft + 25, {
        size: 9,
        font: fontText,
        color: rgb(0.3, 0.3, 0.3),
        lineStep: lineHeight - 2,
      });
    }

    // Categories
    if (meaning.grammarCategory) {
      const cat = `"${GRAMMATICAL_CATEGORIES[meaning.grammarCategory] || meaning.grammarCategory}"`;
      drawWrapped(`Categoría: ${cat}`, marginLeft + 25, 9, 100, {
        markdown: true,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Meaning with markdown
    drawWrapped(meaning.meaning, marginLeft + 25, 10, 100, { markdown: true });
    const markerDescriptions = MEANING_MARKER_KEYS.flatMap((markerKey) => {
      const value = meaning[markerKey] as string | null | undefined;
      if (!value) return [];
      const label = MEANING_MARKER_GROUPS[markerKey].labels[value] || value;
      return [`${MEANING_MARKER_GROUPS[markerKey].label}: ${label}`];
    });

    for (const markerLine of markerDescriptions) {
      drawLine(markerLine, marginLeft + 25, {
        size: 9,
        font: fontText,
        color: rgb(0.3, 0.3, 0.3),
        lineStep: lineHeight - 2,
      });
    }

    // Observation
    if (meaning.observation) {
      drawLine('Observación:', marginLeft + 25, {
        size: 9,
        font: fontTitle,
        color: rgb(0.3, 0.3, 0.3),
        lineStep: lineHeight - 2,
      });

      drawWrapped(meaning.observation, marginLeft + 30, 9, 100, {
        markdown: true,
        color: rgb(0.2, 0.2, 0.4),
        lineStep: lineHeight - 2,
      });
    }

    // Remission
    if (meaning.remission) {
      drawLine(`Ver: ${meaning.remission}`, marginLeft + 25, {
        size: 9,
        font: fontItalic,
        color: rgb(0, 0, 0.5),
        lineStep: lineHeight - 2,
      });
    }

    // Examples
    if (meaning.examples && meaning.examples.length > 0) {
      drawLine(`Ejemplo ${meaning.examples.length}:`, marginLeft + 25, {
        size: 9,
        font: fontTitle,
        color: rgb(0.3, 0.3, 0.3),
        lineStep: lineHeight,
      });

      for (const ex of meaning.examples) {
        ensureSpace(4);

        drawWrapped(`${ex.value}`, marginLeft + 30, 9, 120, {
          markdown: true,
          color: rgb(0.15, 0.15, 0.15),
          lineStep: lineHeight - 3,
        });

        const metadata: string[] = [];
        if (ex.author) metadata.push(`Autor: ${ex.author}`);
        if (ex.title) metadata.push(`Título: ${ex.title}`);
        if (ex.source) metadata.push(`Fuente: ${ex.source}`);
        if (ex.date) metadata.push(`Fecha: ${ex.date}`);
        if (ex.page) metadata.push(`Pág: ${ex.page}`);

        if (metadata.length > 0) {
          const metaText = metadata.join(' | ');
          const metaLines = wrapText(metaText, 85);

          for (const line of metaLines) {
            drawLine(line, marginLeft + 30, {
              size: 7,
              font: fontText,
              color: rgb(0.5, 0.5, 0.5),
              lineStep: lineHeight - 4,
            });
          }
        }

        y -= 4;
      }
    }

    y -= 8;
  };

  // If no redacted words
  if (words.length === 0) {
    ensureSpace(3);
    drawLine('No se encontraron palabras en estado redactada.', marginLeft, {
      size: 12,
      font: fontItalic,
      color: rgb(0.3, 0.3, 0.3),
      lineStep: 20,
    });
    return pdfDoc.save();
  }

  y -= 2;

  // Total redacted words
  drawLine(`Total de palabras: ${words.length}`, marginLeft, {
    size: 10,
    font: fontText,
    color: rgb(0.3, 0.3, 0.3),
    lineStep: 30,
  });

  let index = 1;

  // Draw each redacted word
  for (const word of words) {
    ensureSpace(5);

    const heading = `${index}. ${word.lemma.toUpperCase()}`;
    drawLine(heading, marginLeft, {
      size: 13,
      font: fontTitle,
      color: rgb(0, 0, 0),
      lineStep: lineHeight + 4,
    });

    // Show status if both type of word
    if (reportType === 'both' && word.status) {
      const statusLabel = word.status === 'redacted' ? 'Redactada' : 'Revisada por lexicógrafo';
      drawLine(`Estado: ${statusLabel}`, marginLeft + 15, {
        size: 9,
        font: fontItalic,
        color: rgb(0.4, 0.4, 0.4),
        lineStep: lineHeight,
      });
    }

    // Root
    if (word.root && word.root !== word.lemma) {
      drawLine(`Palabra base: ${word.root}`, marginLeft + 15, {
        size: 9,
        font: fontText,
        color: rgb(0.4, 0.4, 0.4),
        lineStep: lineHeight,
      });
    }

    // Meanings
    if (word.meanings && word.meanings.length > 0) {
      for (const meaning of word.meanings) {
        drawMeaningBlock(meaning);
      }
    } else {
      drawLine('Sin definiciones.', marginLeft + 15, {
        size: 10,
        font: fontItalic,
        color: rgb(0.5, 0.5, 0.5),
        lineStep: lineHeight,
      });
    }

    // Editorial notes
    drawEditorialNotesForWord(word.notes);

    y -= 10;
    index += 1;
  }
  // Draw footer on the last page before saving
  drawFooter(pageNumber);
  return pdfDoc.save();
}

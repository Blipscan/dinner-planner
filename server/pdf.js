// ============================================================
// PDF generation for Avery print products (minimal v1)
// ============================================================

const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");

const LETTER = { width: 8.5 * 72, height: 11 * 72 };

function inches(n) {
  return n * 72;
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);
    doc.end();
  });
}

function getGuestNames(context) {
  const raw = context?.guestList || "";
  return String(raw)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function menuLines(menu) {
  const courses = menu?.courses || [];
  return courses.map((c) => `${c.type}: ${c.name}`);
}

function layoutFor(type, sku) {
  // NOTE: These are pragmatic layouts (not exact Avery spec), good enough for beta.
  if (type === "placeCards") {
    if (sku === "35701") {
      // 6 per sheet (flat place cards)
      return {
        page: LETTER,
        cols: 2,
        rows: 3,
        marginX: inches(0.5),
        marginY: inches(0.6),
        gapX: inches(0.25),
        gapY: inches(0.25),
      };
    }
    // Default 4 per sheet (tent/flat)
    return {
      page: LETTER,
      cols: 2,
      rows: 2,
      marginX: inches(0.6),
      marginY: inches(1.0),
      gapX: inches(0.4),
      gapY: inches(0.4),
    };
  }

  if (type === "menuCards") {
    // 2 per sheet (quarter-fold-ish)
    return {
      page: LETTER,
      cols: 2,
      rows: 1,
      marginX: inches(0.5),
      marginY: inches(0.8),
      gapX: inches(0.5),
      gapY: inches(0.0),
    };
  }

  if (type === "invitations") {
    // 2 per sheet
    return {
      page: LETTER,
      cols: 2,
      rows: 1,
      marginX: inches(0.5),
      marginY: inches(0.8),
      gapX: inches(0.5),
      gapY: inches(0.0),
    };
  }

  throw new Error(`Unsupported print product type: ${type}`);
}

function gridPositions(layout) {
  const { page, cols, rows, marginX, marginY, gapX, gapY } = layout;
  const cellW = (page.width - marginX * 2 - gapX * (cols - 1)) / cols;
  const cellH = (page.height - marginY * 2 - gapY * (rows - 1)) / rows;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: marginX + c * (cellW + gapX),
        y: marginY + r * (cellH + gapY),
        w: cellW,
        h: cellH,
      });
    }
  }
  return { cellW, cellH, positions };
}

function drawCropBox(doc, box) {
  doc.save();
  doc.lineWidth(0.5);
  doc.dash(3, { space: 3 });
  doc.strokeColor("#d1d5db");
  doc.rect(box.x, box.y, box.w, box.h).stroke();
  doc.undash();
  doc.restore();
}

function drawPlaceCard(doc, box, name, context) {
  drawCropBox(doc, box);
  const title = context?.eventTitle ? String(context.eventTitle) : "";

  doc.save();
  doc.fillColor("#1E3A5F");
  doc.font("Times-Bold").fontSize(22);
  doc.text(String(name), box.x + 10, box.y + box.h / 2 - 14, {
    width: box.w - 20,
    align: "center",
  });

  if (title) {
    doc.fillColor("#6b7280");
    doc.font("Times-Roman").fontSize(10);
    doc.text(title, box.x + 10, box.y + box.h - 22, {
      width: box.w - 20,
      align: "center",
    });
  }
  doc.restore();
}

function drawMenuCard(doc, box, menu, context) {
  drawCropBox(doc, box);
  const eventTitle = context?.eventTitle || "Dinner Party";
  const date = context?.eventDate || "";
  const time = context?.serviceTime ? `Service ${context.serviceTime}` : "";

  doc.save();
  doc.fillColor("#1E3A5F");
  doc.font("Times-Bold").fontSize(18).text(String(eventTitle), box.x + 16, box.y + 18, {
    width: box.w - 32,
    align: "center",
  });

  doc.fillColor("#C9A227");
  doc.font("Times-Italic").fontSize(12).text(menu?.title || "Menu", box.x + 16, box.y + 42, {
    width: box.w - 32,
    align: "center",
  });

  doc.fillColor("#6b7280");
  doc.font("Times-Roman").fontSize(10).text([date, time].filter(Boolean).join(" · "), box.x + 16, box.y + 60, {
    width: box.w - 32,
    align: "center",
  });

  const lines = menuLines(menu);
  doc.fillColor("#111827");
  doc.font("Times-Roman").fontSize(11);
  doc.text(lines.join("\n"), box.x + 22, box.y + 88, {
    width: box.w - 44,
    align: "left",
    lineGap: 3,
  });

  doc.restore();
}

function drawInvitation(doc, box, context) {
  drawCropBox(doc, box);
  const eventTitle = context?.eventTitle || "Dinner Party";
  const date = context?.eventDate || "Date TBD";
  const time = context?.serviceTime || "7:00 PM";
  const guests = context?.guestCount ? `${context.guestCount} guests` : "";

  doc.save();
  doc.fillColor("#1E3A5F");
  doc.font("Times-Italic").fontSize(13).text("You are warmly invited to", box.x + 16, box.y + 40, {
    width: box.w - 32,
    align: "center",
  });
  doc.font("Times-Bold").fontSize(22).text(String(eventTitle), box.x + 16, box.y + 66, {
    width: box.w - 32,
    align: "center",
  });

  doc.fillColor("#111827");
  doc.font("Times-Roman").fontSize(12).text(`${date} · ${time}`, box.x + 16, box.y + 112, {
    width: box.w - 32,
    align: "center",
  });
  if (guests) {
    doc.fillColor("#6b7280");
    doc.font("Times-Roman").fontSize(10).text(guests, box.x + 16, box.y + 132, {
      width: box.w - 32,
      align: "center",
    });
  }

  doc.restore();
}

async function generatePrintPdf({ type, sku, cookbook }) {
  const layout = layoutFor(type, sku);
  const { positions } = gridPositions(layout);

  const doc = new PDFDocument({
    size: [layout.page.width, layout.page.height],
    margin: 0,
    autoFirstPage: true,
  });

  const context = cookbook?.context || {};
  const menu = cookbook?.menu || {};

  if (type === "placeCards") {
    const names = getGuestNames(context);
    const items = names.length ? names : ["Guest"];

    let idx = 0;
    while (idx < items.length) {
      if (idx > 0) doc.addPage();
      for (let i = 0; i < positions.length && idx < items.length; i++, idx++) {
        drawPlaceCard(doc, positions[i], items[idx], context);
      }
    }
  } else if (type === "menuCards") {
    // Fill every slot with same menu card for easy printing.
    for (let i = 0; i < positions.length; i++) drawMenuCard(doc, positions[i], menu, context);
  } else if (type === "invitations") {
    for (let i = 0; i < positions.length; i++) drawInvitation(doc, positions[i], context);
  } else {
    throw new Error(`Unsupported print product type: ${type}`);
  }

  return collectPdf(doc);
}

module.exports = { generatePrintPdf };


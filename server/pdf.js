// ============================================================
// PDF generation for Avery print products (SKU-driven)
// ============================================================

const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");

const LETTER_PORTRAIT = { width: 8.5 * 72, height: 11 * 72 };
const LETTER_LANDSCAPE = { width: 11 * 72, height: 8.5 * 72 };

function inches(n) {
  return n * 72;
}

function parseInchesToken(token) {
  // Supports:
  // - 4.25
  // - 3-3/4
  // - 7/16
  const t = String(token || "").trim();
  if (!t) return 0;

  // mixed number (e.g., 1-7/16)
  if (t.includes("-")) {
    const [whole, frac] = t.split("-").map((s) => s.trim());
    return parseFloat(whole || "0") + parseInchesToken(frac);
  }

  // fraction (e.g., 7/16)
  if (t.includes("/")) {
    const [num, den] = t.split("/").map((s) => s.trim());
    const n = parseFloat(num || "0");
    const d = parseFloat(den || "1");
    return d ? n / d : 0;
  }

  return parseFloat(t) || 0;
}

function parseSizeInches(sizeStr) {
  // Examples:
  //  - 2" x 3.5"
  //  - 1-7/16" x 3-3/4"
  const cleaned = String(sizeStr || "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split("x").map((s) => s.trim());
  if (parts.length !== 2) return { w: 0, h: 0 };
  return { w: parseInchesToken(parts[0]), h: parseInchesToken(parts[1]) };
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

function factorGrid(perSheet, cardW, cardH, page) {
  // Choose cols/rows to match perSheet and fit page.
  // Handles common counts (1,2,4,6). Falls back to 1xN.
  if (perSheet === 1) return { cols: 1, rows: 1 };
  if (perSheet === 4) return { cols: 2, rows: 2 };
  if (perSheet === 6) return { cols: 2, rows: 3 };
  if (perSheet === 2) {
    // Prefer 2-up across if it fits comfortably.
    if (cardW * 2 <= page.width && cardH <= page.height) return { cols: 2, rows: 1 };
    return { cols: 1, rows: 2 };
  }
  return { cols: 1, rows: Math.max(1, perSheet) };
}

function buildLayoutFromProduct({ type, sku, product }) {
  if (!product?.size || !product?.perSheet) {
    throw new Error("Missing product size/perSheet.");
  }

  // Base size from metadata.
  let { w, h } = parseSizeInches(product.size);
  if (!w || !h) throw new Error(`Unparseable product size: ${product.size}`);

  // Normalize so "w" is the larger dimension for easier orientation logic.
  let cardW = Math.max(w, h);
  let cardH = Math.min(w, h);

  // Tent-card special handling so both sides print correctly:
  // - 5302 / 3328: size is folded face (2 x 3.5). Flat is 3.5 x 4 with fold at 2" (horizontal).
  // - 5309: size is flat (3.5 x 11). Fold at 5.5" (vertical).
  const tentSku = new Set(["5302", "3328", "5309", "5305"]);
  const isTent = type === "placeCards" && tentSku.has(String(sku));

  let fold = null;
  if (isTent) {
    if (String(sku) === "5309") {
      // Flat width is the long side (11") and height is 3.5"
      cardW = Math.max(w, h); // expect 11
      cardH = Math.min(w, h); // expect 3.5
      fold = { axis: "vertical", atInches: cardW / 2 };
    } else if (String(sku) === "5305") {
      // 5305 (table numbers) not currently exposed in UI, but keep sane behavior:
      // assume size is folded face (2.5 x 8.5) => flat 8.5 x 5 with horizontal fold.
      const faceH = Math.min(w, h);
      const faceW = Math.max(w, h);
      cardW = faceW;
      cardH = faceH * 2;
      fold = { axis: "horizontal", atInches: faceH };
    } else {
      // 5302 / 3328
      const faceH = Math.min(w, h); // 2
      const faceW = Math.max(w, h); // 3.5
      cardW = faceW;
      cardH = faceH * 2; // 4
      fold = { axis: "horizontal", atInches: faceH };
    }
  }

  // Choose page orientation to fit.
  let page = LETTER_PORTRAIT;
  const portraitFits =
    cardW <= LETTER_PORTRAIT.width && cardH <= LETTER_PORTRAIT.height;
  const landscapeFits =
    cardW <= LETTER_LANDSCAPE.width && cardH <= LETTER_LANDSCAPE.height;
  if (!portraitFits && landscapeFits) page = LETTER_LANDSCAPE;

  // Decide grid for this perSheet on this page.
  let { cols, rows } = factorGrid(product.perSheet, cardW, cardH, page);

  // If it still doesn't fit, attempt landscape (again) or scale down slightly.
  const totalW = cols * cardW;
  const totalH = rows * cardH;
  if (totalW > page.width || totalH > page.height) {
    // Try swapping orientation.
    if (page === LETTER_PORTRAIT) {
      const altPage = LETTER_LANDSCAPE;
      const altGrid = factorGrid(product.perSheet, cardW, cardH, altPage);
      const altW = altGrid.cols * cardW;
      const altH = altGrid.rows * cardH;
      if (altW <= altPage.width && altH <= altPage.height) {
        page = altPage;
        cols = altGrid.cols;
        rows = altGrid.rows;
      }
    }

    const scale = Math.min(
      (page.width / (cols * cardW)) * 0.98,
      (page.height / (rows * cardH)) * 0.98,
      1
    );
    cardW *= scale;
    cardH *= scale;
  }

  // Equal gutters around and between cells
  const remainingW = page.width - cols * cardW;
  const remainingH = page.height - rows * cardH;
  const gapX = cols > 0 ? remainingW / (cols + 1) : 0;
  const gapY = rows > 0 ? remainingH / (rows + 1) : 0;
  const marginX = gapX;
  const marginY = gapY;

  return { page, cols, rows, cardW, cardH, marginX, marginY, gapX, gapY, fold };
}

function gridPositions(layout) {
  const { page, cols, rows, cardW, cardH, marginX, marginY, gapX, gapY } = layout;
  const cellW = cardW;
  const cellH = cardH;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: marginX + c * (cardW + gapX),
        y: marginY + r * (cardH + gapY),
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

function drawFoldLine(doc, box, fold) {
  if (!fold) return;
  doc.save();
  doc.lineWidth(0.75);
  doc.dash(2, { space: 2 });
  doc.strokeColor("#9ca3af");

  if (fold.axis === "horizontal") {
    const y = box.y + inches(fold.atInches);
    doc.moveTo(box.x, y).lineTo(box.x + box.w, y).stroke();
  } else if (fold.axis === "vertical") {
    const x = box.x + inches(fold.atInches);
    doc.moveTo(x, box.y).lineTo(x, box.y + box.h).stroke();
  }
  doc.undash();
  doc.restore();
}

function drawCenteredText(doc, text, box, opts = {}) {
  const {
    font = "Times-Bold",
    size = 22,
    color = "#1E3A5F",
    rotate = 0,
  } = opts;

  doc.save();
  doc.fillColor(color);
  doc.font(font).fontSize(size);

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  if (rotate) {
    doc.rotate(rotate, { origin: [cx, cy] });
  }
  doc.text(String(text), box.x + 10, cy - size / 1.6, {
    width: box.w - 20,
    align: "center",
  });
  doc.restore();
}

function drawPlaceCard(doc, box, name, context) {
  drawCropBox(doc, box);
  const title = context?.eventTitle ? String(context.eventTitle) : "";

  drawCenteredText(doc, name, box, { font: "Times-Bold", size: 22, color: "#1E3A5F" });

  if (title) {
    doc.save();
    doc.fillColor("#6b7280");
    doc.font("Times-Roman").fontSize(10);
    doc.text(title, box.x + 10, box.y + box.h - 22, {
      width: box.w - 20,
      align: "center",
    });
    doc.restore();
  }
}

function drawTentPlaceCard(doc, box, name, context, fold) {
  // Unfolded card: print the name on both halves so both sides read after folding.
  drawCropBox(doc, box);
  drawFoldLine(doc, box, fold);

  const title = context?.eventTitle ? String(context.eventTitle) : "";

  if (fold?.axis === "horizontal") {
    const halfH = box.h / 2;
    const top = { x: box.x, y: box.y, w: box.w, h: halfH };
    const bottom = { x: box.x, y: box.y + halfH, w: box.w, h: halfH };
    drawCenteredText(doc, name, top, { rotate: 0 });
    drawCenteredText(doc, name, bottom, { rotate: 180 });
    if (title) {
      // Put title near the outer edge of each half
      doc.save();
      doc.fillColor("#6b7280");
      doc.font("Times-Roman").fontSize(10);
      doc.text(title, top.x + 10, top.y + top.h - 18, { width: top.w - 20, align: "center" });
      doc.rotate(180, { origin: [bottom.x + bottom.w / 2, bottom.y + bottom.h / 2] });
      doc.text(title, bottom.x + 10, bottom.y + 6, { width: bottom.w - 20, align: "center" });
      doc.restore();
    }
  } else if (fold?.axis === "vertical") {
    const halfW = box.w / 2;
    const left = { x: box.x, y: box.y, w: halfW, h: box.h };
    const right = { x: box.x + halfW, y: box.y, w: halfW, h: box.h };
    drawCenteredText(doc, name, left, { rotate: 0 });
    drawCenteredText(doc, name, right, { rotate: 180 });
    if (title) {
      doc.save();
      doc.fillColor("#6b7280");
      doc.font("Times-Roman").fontSize(10);
      doc.text(title, left.x + 6, left.y + left.h - 18, { width: left.w - 12, align: "center" });
      doc.rotate(180, { origin: [right.x + right.w / 2, right.y + right.h / 2] });
      doc.text(title, right.x + 6, right.y + 8, { width: right.w - 12, align: "center" });
      doc.restore();
    }
  } else {
    // Fallback: treat as flat.
    drawPlaceCard(doc, box, name, context);
  }
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

async function generatePrintPdf({ type, sku, product, cookbook }) {
  const layout = buildLayoutFromProduct({ type, sku, product });
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
        if (layout.fold) {
          drawTentPlaceCard(doc, positions[i], items[idx], context, layout.fold);
        } else {
          drawPlaceCard(doc, positions[i], items[idx], context);
        }
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


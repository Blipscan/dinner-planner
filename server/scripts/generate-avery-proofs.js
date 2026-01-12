/* eslint-disable no-console */
// Generates Avery proof PDFs (outlines + text) for printing on plain paper.

const fs = require("fs");
const path = require("path");

const { generatePrintPdf } = require("../pdf");
const { AVERY_PRODUCTS, DEMO_MENUS } = require("../data");

async function main() {
  const outDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "..", "docs", "avery-proofs");

  fs.mkdirSync(outDir, { recursive: true });

  const cookbook = {
    context: {
      eventTitle: "Dinner Party (Proof Print)",
      eventDate: "2026-01-12",
      serviceTime: "7:00 PM",
      guestCount: 6,
      guestList: ["Alice", "Bob", "Cara", "Dan", "Eve", "Frank"].join("\n"),
    },
    menu: DEMO_MENUS[0],
  };

  const samples = [
    // Place cards
    { type: "placeCards", sku: "5302" },
    { type: "placeCards", sku: "3328" },
    { type: "placeCards", sku: "35701" },
    { type: "placeCards", sku: "5309" },

    // Menu cards
    { type: "menuCards", sku: "8315" },
    { type: "menuCards", sku: "3265" },
    { type: "menuCards", sku: "3263" },

    // Invitations
    { type: "invitations", sku: "8315" },
    { type: "invitations", sku: "3379" },
    { type: "invitations", sku: "8317" },
  ];

  for (const s of samples) {
    const product = (AVERY_PRODUCTS[s.type] || []).find((p) => p.sku === s.sku);
    if (!product) {
      console.warn("Skipping unknown product", s);
      // eslint-disable-next-line no-continue
      continue;
    }
    const buf = await generatePrintPdf({ ...s, product, cookbook });
    const filename = `Avery_${s.sku}_${s.type}_PROOF.pdf`;
    const fp = path.join(outDir, filename);
    fs.writeFileSync(fp, buf);
    console.log("Wrote", fp, `(${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


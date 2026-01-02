// ============================================================
// DINNER PARTY PLANNER - ULTIMATE EDITION (16-PAGE COOKBOOK)
// ============================================================

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, PageBreak, ShadingType, PageNumber } = require('docx');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN2024';
const ACCESS_CODES = (process.env.ACCESS_CODES || 'BETA001,BETA002,BETA003').split(',').map(c => c.trim());
const BETA_EXPIRY = process.env.BETA_EXPIRY || '2026-02-01';
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || '50');
const usageStats = {};

const DEMO_MENUS = [
  { title: "Modern European Steakhouse", foodCost: "$55-65/person", wineCost: "$150", courses: [
    { type: "Amuse-Bouche", name: "Steak Tartare on Crispy Potato Rounds with Dijon Aioli" },
    { type: "First Course", name: "Roasted Beet & Goat Cheese Salad with Candied Walnuts" },
    { type: "Second Course", name: "Wild Mushroom Bisque with White Truffle Oil" },
    { type: "Main Course", name: "Pan-Seared Filet Mignon with Red Wine Reduction" },
    { type: "Dessert", name: "Molten Chocolate Lava Cake with Vanilla Bean Ice Cream" }
  ]},
  { title: "Elegant Seafood Soirée", foodCost: "$50-60/person", wineCost: "$130", courses: [
    { type: "Amuse-Bouche", name: "Smoked Salmon on Cucumber Rounds with Crème Fraîche" },
    { type: "First Course", name: "Classic Lobster Bisque with Cognac Cream" },
    { type: "Second Course", name: "Baby Spinach Salad with Warm Bacon Vinaigrette" },
    { type: "Main Course", name: "Pan-Seared Scallops with Cauliflower Purée" },
    { type: "Dessert", name: "Classic Lemon Tart with Raspberry Coulis" }
  ]},
  { title: "Mediterranean Garden Party", foodCost: "$45-55/person", wineCost: "$120", courses: [
    { type: "Amuse-Bouche", name: "Marinated Olives & Manchego with Honey Drizzle" },
    { type: "First Course", name: "Grilled Halloumi with Fig Jam & Arugula" },
    { type: "Second Course", name: "Greek Salad with Creamy Feta Dressing" },
    { type: "Main Course", name: "Herb-Crusted Lamb Chops with Roasted Vegetables" },
    { type: "Dessert", name: "Honey Baklava with Pistachio Ice Cream" }
  ]},
  { title: "Asian Fusion Experience", foodCost: "$55-65/person", wineCost: "$140", courses: [
    { type: "Amuse-Bouche", name: "Tuna Tartare on Wonton Crisps with Wasabi Cream" },
    { type: "First Course", name: "Miso Soup with Silken Tofu & Wakame" },
    { type: "Second Course", name: "Seaweed Salad with Sesame Dressing" },
    { type: "Main Course", name: "Miso-Glazed Black Cod with Bok Choy" },
    { type: "Dessert", name: "Matcha Panna Cotta with Red Bean & Mochi" }
  ]},
  { title: "Classic French Bistro", foodCost: "$50-60/person", wineCost: "$135", courses: [
    { type: "Amuse-Bouche", name: "Gougères (Warm Cheese Puffs)" },
    { type: "First Course", name: "Soupe à l'Oignon Gratinée" },
    { type: "Second Course", name: "Salade Lyonnaise with Frisée & Lardons" },
    { type: "Main Course", name: "Coq au Vin with Buttered Egg Noodles" },
    { type: "Dessert", name: "Tarte Tatin with Crème Fraîche" }
  ]}
];

const STAFFING_OPTIONS = [
  { id: 'solo', name: 'Solo Cook', activeMin: 185 },
  { id: 'helper1', name: 'With 1 Helper', activeMin: 95 },
  { id: 'helper2', name: 'With 2 Helpers', activeMin: 65 },
  { id: 'chef', name: 'Hired Chef', activeMin: 25 }
];

// API Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '5.0-ultimate', hasApiKey: !!ANTHROPIC_API_KEY }));

app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  const upperCode = code.toUpperCase().trim();
  if (ACCESS_CODES.includes(upperCode) || upperCode === ADMIN_CODE) {
    if (new Date() > new Date(BETA_EXPIRY)) return res.status(403).json({ error: 'Beta period ended' });
    if (!usageStats[upperCode]) usageStats[upperCode] = { count: 0, lastUsed: null };
    if (usageStats[upperCode].count >= MAX_GENERATIONS && upperCode !== ADMIN_CODE) return res.status(403).json({ error: 'Usage limit reached' });
    return res.json({ valid: true, isAdmin: upperCode === ADMIN_CODE });
  }
  res.status(401).json({ error: 'Invalid access code' });
});

app.get('/api/staffing-options', (req, res) => res.json({ staffing: STAFFING_OPTIONS }));

app.post('/api/generate-menus', async (req, res) => {
  const { code, preferences } = req.body;
  const upperCode = (code || '').toUpperCase().trim();
  if (usageStats[upperCode]) { usageStats[upperCode].count++; usageStats[upperCode].lastUsed = new Date().toISOString(); }
  if (!ANTHROPIC_API_KEY) return res.json({ menus: DEMO_MENUS, source: 'demo' });
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: `Create 5 dinner party menus as JSON array. Each needs: title, foodCost, wineCost, courses (5 items with type and name). Preferences: ${JSON.stringify(preferences)}` }]
    });
    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    res.json({ menus: jsonMatch ? JSON.parse(jsonMatch[0]) : DEMO_MENUS, source: 'ai' });
  } catch (error) { res.json({ menus: DEMO_MENUS, source: 'demo', error: 'AI unavailable' }); }
});

app.post('/api/generate-docx', async (req, res) => {
  try {
    const { eventDetails, selectedMenu, staffingId } = req.body;
    const buffer = await generateCookbookDocx(eventDetails, selectedMenu, staffingId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(eventDetails.title || 'Cookbook').replace(/[^a-z0-9]/gi, '_')}_Cookbook.docx"`);
    res.send(buffer);
  } catch (error) { console.error('DOCX error:', error); res.status(500).json({ error: 'Failed to generate cookbook' }); }
});

app.get('/api/admin/stats', (req, res) => {
  if (req.headers['x-admin-code'] !== ADMIN_CODE) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ usageStats, accessCodes: ACCESS_CODES.length, betaExpiry: BETA_EXPIRY });
});

// DOCX GENERATION - 16 PAGES
async function generateCookbookDocx(eventDetails, menu, staffingId) {
  const staff = STAFFING_OPTIONS.find(s => s.id === staffingId) || STAFFING_OPTIONS[0];
  const guests = parseInt(eventDetails.guests) || 6;
  const dateStr = eventDetails.date ? new Date(eventDetails.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Date TBD';
  const timeStr = eventDetails.time || '7:00 PM';
  const navy = '1E3A5F', gold = 'C9A227', green = '2D6A4F', gray = '6B7C85', wine = '722F37';
  const children = [];

  // Helper function for section headers
  const addSectionHeader = (text, emoji = '') => {
    children.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun({ text: `${emoji} ${text}`, bold: true, size: 36, color: navy, font: 'Georgia' })] }));
  };
  
  const addSubHeader = (text) => {
    children.push(new Paragraph({ spacing: { before: 250, after: 150 }, children: [new TextRun({ text: text, bold: true, size: 28, color: green, font: 'Georgia' })] }));
  };
  
  const addCheckItem = (text) => {
    children.push(new Paragraph({ spacing: { after: 100 }, indent: { left: 360 }, children: [new TextRun({ text: `☐  ${text}`, size: 22, font: 'Georgia' })] }));
  };
  
  const addTipBox = (text, bgColor = 'FFF9E6') => {
    children.push(new Paragraph({ shading: { fill: bgColor, type: ShadingType.CLEAR }, spacing: { before: 200, after: 200 }, indent: { left: 200, right: 200 }, children: [new TextRun({ text: text, size: 20, font: 'Georgia' })] }));
  };
  
  const addPageBreak = () => children.push(new Paragraph({ children: [new PageBreak()] }));

  // PAGE 1: COVER
  children.push(
    new Paragraph({ spacing: { before: 1500 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '🍽️', size: 96 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 300 }, children: [new TextRun({ text: eventDetails.title || 'Dinner Party', bold: true, size: 72, color: navy, font: 'Georgia' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 150 }, children: [new TextRun({ text: 'A Complete Cookbook & Planning Guide', size: 28, color: gray, font: 'Georgia', italics: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: dateStr, size: 28, color: navy, font: 'Georgia' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${timeStr} • ${guests} Guests`, size: 24, color: gray, font: 'Georgia' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 500 }, children: [new TextRun({ text: menu.title, bold: true, size: 36, color: green, font: 'Georgia' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [new TextRun({ text: `${menu.foodCost} food • ${menu.wineCost} wine`, size: 22, color: gray, font: 'Georgia' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: `Kitchen Team: ${staff.name} (~${staff.activeMin} min)`, size: 24, color: gold, font: 'Georgia' })] })
  );
  addPageBreak();

  // PAGE 2: TABLE OF CONTENTS
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 }, children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, color: navy, font: 'Georgia' })] }));
  const tocItems = ['The Menu', 'Wine & Beverage Pairings', 'Complete Shopping List', 'Recipe Cards & Techniques', 'Day-Before Preparation', 'Day-Of Timeline', 'Table Settings & Decor', 'Plating Guide', 'Tips & Emergency Fixes', 'AI Image Prompts', 'Final Checklist', 'Notes & Reflections'];
  tocItems.forEach((item, i) => {
    children.push(new Paragraph({ spacing: { before: 150, after: 150 }, children: [
      new TextRun({ text: `${i+1}. `, bold: true, size: 24, color: gold, font: 'Georgia' }),
      new TextRun({ text: `${item} ....................................... ${i+3}`, size: 24, font: 'Georgia' })
    ]}));
  });
  addPageBreak();

  // PAGE 3: THE MENU
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 400 }, children: [new TextRun({ text: '~ The Menu ~', bold: true, size: 40, color: navy, font: 'Georgia' })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: menu.title, size: 28, color: green, font: 'Georgia', italics: true })] }));
  menu.courses.forEach(course => {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300, after: 80 }, children: [new TextRun({ text: course.type.toUpperCase(), bold: true, size: 18, color: gold, font: 'Georgia' })] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: course.name, size: 26, font: 'Georgia' })] }));
  });
  addTipBox(`💰 Estimated Food Cost: ${menu.foodCost}`);
  addPageBreak();

  // PAGE 4: WINE PAIRINGS
  addSectionHeader('Wine & Beverage Pairings', '🍷');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `Recommended Budget: ${menu.wineCost}`, size: 22, font: 'Georgia', italics: true })] }));
  const wines = [
    { course: 'Amuse-Bouche', wine: 'Champagne or Crémant', notes: 'Crisp bubbles awaken the palate • Serve at 45°F' },
    { course: 'First Course', wine: 'Sancerre or Sauvignon Blanc', notes: 'Bright acidity pairs with lighter fare • Serve at 48°F' },
    { course: 'Second Course', wine: 'Chablis or Unoaked Chardonnay', notes: 'Mineral notes complement the dish • Serve at 50°F' },
    { course: 'Main Course', wine: 'Côtes du Rhône or Pinot Noir', notes: 'Medium body with earthy undertones • Serve at 60-65°F' },
    { course: 'Dessert', wine: 'Sauternes or Late Harvest Riesling', notes: 'Sweet but balanced • Serve at 45°F' }
  ];
  wines.forEach(w => {
    children.push(new Paragraph({ spacing: { before: 250, after: 50 }, children: [new TextRun({ text: w.course, bold: true, size: 24, color: wine, font: 'Georgia' })] }));
    children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: w.wine, size: 22, font: 'Georgia', bold: true })] }));
    children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 150 }, children: [new TextRun({ text: w.notes, size: 20, color: gray, font: 'Georgia', italics: true })] }));
  });
  addTipBox('🥂 Non-Alcoholic: Sparkling water with citrus, craft mocktails, or premium sodas.');
  addPageBreak();

  // PAGES 5-6: SHOPPING LIST
  addSectionHeader('Complete Shopping List', '🛒');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `Scaled for ${guests} guests (includes 15% buffer)`, size: 22, font: 'Georgia', italics: true })] }));
  
  addSubHeader('🥩 Proteins');
  [`Main protein - ${Math.ceil(guests * 8)} oz (${(guests * 8 / 16).toFixed(1)} lbs)`, `Seafood for courses - ${Math.ceil(guests * 4)} oz`, 'Unsalted butter - 2 lbs', `Bacon/Lardons - ${Math.ceil(guests * 2)} oz`].forEach(addCheckItem);
  
  addSubHeader('🥬 Produce');
  [`Mixed greens - ${Math.ceil(guests * 2)} oz`, 'Seasonal vegetables - assorted', 'Fresh herbs (parsley, thyme, rosemary) - 2 bunches each', `Lemons - ${Math.ceil(guests * 1.5)}`, 'Shallots - 6', 'Garlic - 2 heads', 'Microgreens for garnish - 2 oz'].forEach(addCheckItem);
  
  addSubHeader('🧀 Dairy');
  [`Heavy cream - ${Math.ceil(guests * 4)} oz`, 'Crème fraîche - 8 oz', 'Parmesan - 4 oz wedge', 'Eggs - 1 dozen'].forEach(addCheckItem);
  
  addSubHeader('🫙 Pantry');
  ['Extra virgin olive oil', 'Balsamic vinegar (aged)', 'Chicken/vegetable stock - 2 quarts', 'Demi-glace - 8 oz', 'Dijon mustard', 'Honey', 'Flour, sugar', 'Flaky sea salt', 'Black pepper'].forEach(addCheckItem);
  addPageBreak();
  
  addSubHeader('✨ Specialty Items');
  ['White truffle oil (small bottle)', 'Quality chocolate 70%+ (8 oz)', 'Vanilla beans or extract', 'Specialty cheese', 'Edible flowers (optional)'].forEach(addCheckItem);
  
  addSubHeader('🍷 Wine & Beverages');
  [`Champagne/Sparkling - ${Math.ceil(guests / 3)} bottles`, `White wine - ${Math.ceil(guests / 2)} bottles`, `Red wine - ${Math.ceil(guests / 2)} bottles`, 'Dessert wine - 1 bottle', 'Sparkling & still water'].forEach(addCheckItem);
  
  addSubHeader('🧊 Day-Of Pickups');
  ['Fresh bread/rolls from bakery', 'Fresh flowers for table', 'Ice - 2 bags'].forEach(addCheckItem);
  addTipBox('💡 Pro Tip: Shop 2-3 days ahead for non-perishables, day-before for proteins, day-of for bread and flowers only.');
  addPageBreak();

  // PAGES 7-8: RECIPE CARDS
  addSectionHeader('Recipe Cards & Techniques', '📝');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: 'Key techniques and timing for each course', size: 22, font: 'Georgia', italics: true })] }));
  
  const techniques = {
    'Amuse-Bouche': 'Precise portioning. Assembly just before serving.',
    'First Course': 'Balance temperatures and textures. Sauce placement matters.',
    'Second Course': 'Season soups slightly under when hot - they intensify.',
    'Main Course': 'Rest proteins! Internal temp rises 5-10°F while resting.',
    'Dessert': 'Temperature contrast is key. Serve immediately after assembly.'
  };
  
  menu.courses.forEach(course => {
    children.push(new Paragraph({ shading: { fill: 'F0F4F8', type: ShadingType.CLEAR }, spacing: { before: 300, after: 100 }, children: [new TextRun({ text: course.type.toUpperCase(), bold: true, size: 24, color: navy, font: 'Georgia' })] }));
    children.push(new Paragraph({ spacing: { after: 50 }, indent: { left: 200 }, children: [new TextRun({ text: course.name, bold: true, size: 22, font: 'Georgia' })] }));
    children.push(new Paragraph({ spacing: { after: 50 }, indent: { left: 200 }, children: [new TextRun({ text: `Serves: ${guests} | Prep: 15-20 min | Cook: 10-15 min`, size: 18, color: gray, font: 'Georgia' })] }));
    children.push(new Paragraph({ spacing: { after: 200 }, indent: { left: 200 }, children: [
      new TextRun({ text: 'Key Technique: ', bold: true, size: 18, color: green, font: 'Georgia' }),
      new TextRun({ text: techniques[course.type] || 'Focus on timing and presentation.', size: 18, font: 'Georgia' })
    ]}));
  });
  addTipBox('⚠️ Critical Temps: Beef 130°F (med-rare), Chicken 165°F, Fish 145°F, Pork 145°F', 'FFF0F0');
  addPageBreak();
  
  addSubHeader('🔪 Essential Equipment');
  ['Large sauté pan (12")', 'Medium saucepan', 'Sheet pans (2-3)', 'Instant-read thermometer', 'Sharp chef\'s knife', 'Microplane zester', 'Fine mesh strainer', 'Mixing bowls', 'Tongs and spatulas', 'Timer', 'Clean towels'].forEach(addCheckItem);
  
  addSubHeader('📝 Cooking Notes');
  for (let i = 0; i < 6; i++) {
    children.push(new Paragraph({ spacing: { before: 100, after: 100 }, border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } }, children: [new TextRun({ text: ' ', size: 24 })] }));
  }
  addPageBreak();

  // PAGE 9: DAY-BEFORE PREP
  addSectionHeader('Day-Before Preparation', '📅');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: 'The secret to stress-free hosting: do 70% of work today!', size: 22, font: 'Georgia', italics: true })] }));
  
  const dayBefore = [
    { task: 'Review all recipes and timeline', time: 15 },
    { task: 'Make soup/bisque base', time: 25 },
    { task: 'Prepare marinades and marinate protein', time: 15 },
    { task: 'Wash and prep all vegetables', time: 30 },
    { task: 'Make purées, sauces, and dressings', time: 25 },
    { task: 'Prepare dessert components', time: 30 },
    { task: 'Set out serving dishes (label with sticky notes)', time: 10 },
    { task: 'Set the table if possible', time: 20 },
    { task: 'Chill wines and beverages', time: 5 }
  ];
  
  let totalTime = 0;
  dayBefore.forEach(item => {
    totalTime += item.time;
    children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [
      new TextRun({ text: `☐  ${item.task}`, bold: true, size: 22, font: 'Georgia' }),
      new TextRun({ text: `  (${item.time} min)`, size: 20, color: gold, font: 'Georgia' })
    ]}));
  });
  addTipBox(`✅ Total Day-Before Time: ~${totalTime} minutes (${(totalTime/60).toFixed(1)} hours)`, 'ECFDF5');
  addPageBreak();

  // PAGE 10: DAY-OF TIMELINE
  addSectionHeader('Day-Of Timeline', '⏰');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `Service Time: ${timeStr} — Work backward from this moment`, size: 22, font: 'Georgia', italics: true })] }));
  
  const timeline = [
    { time: '5+ hours before', label: 'MORNING', tasks: ['Final grocery run (bread, flowers)', 'Review timeline', 'Mise en place'] },
    { time: '4 hours before', label: 'EARLY AFTERNOON', tasks: ['Remove proteins from fridge', 'Final vegetable prep', 'Prep garnishes'] },
    { time: '3 hours before', label: 'MID-AFTERNOON', tasks: ['Complete table setting', 'Chill wines', 'Set up bar station', 'Coffee/tea setup'] },
    { time: '2 hours before', label: 'LATE AFTERNOON', tasks: ['Start long-cooking items', 'Reheat soups gently', 'Begin dessert assembly'] },
    { time: '1 hour before', label: 'CRUNCH TIME', tasks: ['Sear/start proteins', 'Final sauce adjustments', 'Warm plates', 'Open red wine'] },
    { time: '30 min before', label: 'FINAL PREP', tasks: ['Finish cooking', 'Rest proteins', 'Light candles', 'Start music', 'Final cleanup'] },
    { time: 'Guest arrival', label: 'SHOWTIME', tasks: ['Pour welcome drinks', 'Plate amuse-bouche', 'Enjoy!'] }
  ];
  
  timeline.forEach(block => {
    children.push(new Paragraph({ spacing: { before: 200, after: 100 }, shading: { fill: 'F0F4F8', type: ShadingType.CLEAR }, children: [
      new TextRun({ text: `⏰ ${block.time.toUpperCase()}`, bold: true, size: 22, color: navy, font: 'Georgia' }),
      new TextRun({ text: ` — ${block.label}`, size: 20, color: gold, font: 'Georgia' })
    ]}));
    block.tasks.forEach(task => {
      children.push(new Paragraph({ indent: { left: 400 }, spacing: { after: 60 }, children: [new TextRun({ text: `☐  ${task}`, size: 20, font: 'Georgia' })] }));
    });
  });
  addPageBreak();

  // PAGE 11: TABLE SETTINGS
  addSectionHeader('Table Settings & Decor', '🍽️');
  addSubHeader('🍴 Formal Place Setting');
  ['Dinner plate centered 1" from edge', 'Forks left (dinner inside, salad outside)', 'Knife and spoon right (blade facing plate)', 'Dessert utensils above plate horizontally', 'Water glass above knife', 'Wine glasses to the right', 'Napkin on plate or left of forks', 'Bread plate upper left'].forEach(item => {
    children.push(new Paragraph({ spacing: { after: 100 }, indent: { left: 300 }, children: [new TextRun({ text: `• ${item}`, size: 20, font: 'Georgia' })] }));
  });
  
  addSubHeader('🕯️ Ambiance Checklist');
  ['Candlelight at varying heights', 'Low flower arrangements', 'Dimmed overhead lighting', 'Curated music playlist', 'Comfortable temperature', 'Subtle scent (not competing with food)'].forEach(addCheckItem);
  addPageBreak();

  // PAGE 12: PLATING GUIDE
  addSectionHeader('Plating Guide', '🎨');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: 'Restaurant-quality presentation for each course', size: 22, font: 'Georgia', italics: true })] }));
  
  const plating = [
    { course: 'Amuse-Bouche', tips: 'Small elegant vessels. Odd numbers. Height adds drama. Micro herb garnish.' },
    { course: 'First Course', tips: 'Negative space. Sauce underneath or to side. Protein at 6 o\'clock. Garnish at 11.' },
    { course: 'Soup', tips: 'Pour tableside. Warm bowls. Float garnish last. Drizzle oil elegantly.' },
    { course: 'Main Course', tips: 'Protein front center. Starch at 10, veg at 2. Sauce around, not over. Clean edges!' },
    { course: 'Dessert', tips: 'Temperature contrast. Textural contrast. Height variation. Dust through strainer.' }
  ];
  
  plating.forEach(p => {
    children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: p.course, bold: true, size: 24, color: wine, font: 'Georgia' })] }));
    children.push(new Paragraph({ spacing: { after: 150 }, indent: { left: 300 }, children: [new TextRun({ text: p.tips, size: 20, font: 'Georgia' })] }));
  });
  addTipBox('🎯 Golden Rule: Wipe every plate edge before serving. This single step elevates home cooking to restaurant quality.');
  addPageBreak();

  // PAGE 13: TIPS & EMERGENCY FIXES
  addSectionHeader('Tips & Emergency Fixes', '🆘');
  const fixes = [
    { problem: 'Sauce too salty', fix: 'Add acid (lemon), sugar, or dilute with unsalted stock' },
    { problem: 'Sauce too thin', fix: 'Reduce over high heat, or add cornstarch slurry' },
    { problem: 'Sauce broken', fix: 'Start fresh with cream in clean pan, whisk in slowly' },
    { problem: 'Meat overcooked', fix: 'Slice thin, serve with plenty of sauce' },
    { problem: 'Meat undercooked', fix: 'Slice and flash-sear in hot pan' },
    { problem: 'Vegetables mushy', fix: 'Purée them! Add cream and butter' },
    { problem: 'Dessert didn\'t set', fix: 'Serve as "deconstructed" in glasses' },
    { problem: 'Burned bottom', fix: 'Transfer to new pan without scraping' },
    { problem: 'Running behind', fix: 'Extend cocktail hour with more appetizers' }
  ];
  
  fixes.forEach(f => {
    children.push(new Paragraph({ spacing: { before: 150, after: 50 }, children: [new TextRun({ text: `❌ ${f.problem}`, bold: true, size: 22, color: wine, font: 'Georgia' })] }));
    children.push(new Paragraph({ spacing: { after: 100 }, indent: { left: 400 }, children: [new TextRun({ text: `✅ ${f.fix}`, size: 20, color: green, font: 'Georgia' })] }));
  });
  addTipBox('🍷 Remember: Guests are there for your company, not perfection. Pour more wine and laugh it off!');
  addPageBreak();

  // PAGE 14: AI IMAGE PROMPTS
  addSectionHeader('AI Image Prompts', '🎨');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: 'Generate custom visuals with DALL-E, Midjourney, etc.', size: 22, font: 'Georgia', italics: true })] }));
  
  const prompts = [
    { use: 'Menu Card', prompt: `Elegant watercolor of "${menu.title}" dinner setting, gold and navy, fine dining, white background` },
    { use: 'Invitation', prompt: `Luxurious dinner party invitation, ${menu.title.toLowerCase()} inspiration, champagne ambiance, warm tones` },
    { use: 'Social Media', prompt: `Instagram dinner party flat lay, beautiful table setting, natural lighting, overhead shot` },
    { use: 'Thank You Card', prompt: `Sophisticated thank you card, post-dinner theme, coffee cups, candlelight glow` }
  ];
  
  prompts.forEach(p => {
    children.push(new Paragraph({ spacing: { before: 250, after: 80 }, children: [new TextRun({ text: `📷 ${p.use}`, bold: true, size: 24, color: navy, font: 'Georgia' })] }));
    children.push(new Paragraph({ spacing: { after: 150 }, shading: { fill: 'F8F8F8', type: ShadingType.CLEAR }, indent: { left: 200, right: 200 }, children: [new TextRun({ text: p.prompt, size: 18, font: 'Georgia', italics: true })] }));
  });
  addPageBreak();

  // PAGE 15: FINAL CHECKLIST
  addSectionHeader('Final Checklist', '✅');
  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: 'Last 30 minutes before guests arrive', size: 22, font: 'Georgia', italics: true })] }));
  
  addSubHeader('👨‍🍳 Kitchen');
  ['All ingredients ready', 'Proteins resting', 'Sauces warm', 'Plates warming', 'Garnishes ready', 'Clean workspace', 'Trash emptied'].forEach(addCheckItem);
  
  addSubHeader('🍽️ Dining Room');
  ['Table fully set', 'Candles lit', 'Flowers fresh', 'Water poured', 'Wine ready', 'Place cards set'].forEach(addCheckItem);
  
  addSubHeader('🏠 Atmosphere');
  ['Music playing', 'Lighting dimmed', 'Temp comfortable', 'Bathroom stocked', 'Entry welcoming'].forEach(addCheckItem);
  
  addSubHeader('👤 You');
  ['Changed and ready', 'Apron off!', 'Breath freshener', 'Calm and happy', 'Drink in hand to greet'].forEach(addCheckItem);
  addPageBreak();

  // PAGE 16: NOTES
  addSectionHeader('Notes & Reflections', '📝');
  children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Record your thoughts for future reference', size: 22, font: 'Georgia', italics: true })] }));
  
  addSubHeader('What worked well:');
  for (let i = 0; i < 4; i++) children.push(new Paragraph({ spacing: { before: 100, after: 100 }, border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } }, children: [new TextRun({ text: ' ', size: 24 })] }));
  
  addSubHeader('What to improve:');
  for (let i = 0; i < 4; i++) children.push(new Paragraph({ spacing: { before: 100, after: 100 }, border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } }, children: [new TextRun({ text: ' ', size: 24 })] }));
  
  addSubHeader('Memorable moments:');
  for (let i = 0; i < 4; i++) children.push(new Paragraph({ spacing: { before: 100, after: 100 }, border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } }, children: [new TextRun({ text: ' ', size: 24 })] }));
  
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, shading: { fill: 'F0F4F8', type: ShadingType.CLEAR }, children: [new TextRun({ text: '🍽️ Thank you for using Dinner Party Planner! Enjoy your evening!', size: 22, font: 'Georgia' })] }));

  // CREATE DOCUMENT
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Georgia', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: eventDetails.title || 'Dinner Party', size: 18, color: gray, font: 'Georgia', italics: true })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Page ', size: 18, color: gray, font: 'Georgia' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: gray, font: 'Georgia' }),
        new TextRun({ text: ' of ', size: 18, color: gray, font: 'Georgia' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: gray, font: 'Georgia' })
      ]})] }) },
      children: children
    }]
  });
  
  return await Packer.toBuffer(doc);
}

app.listen(PORT, () => console.log(`🍽️ Dinner Party Planner running on port ${PORT}`));

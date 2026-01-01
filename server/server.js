/**
 * Dinner Party Planner - Beta Server v4
 * Full elegant frontend + fixed DOCX generation
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

const usageTracker = new Map();
const validAccessCodes = (process.env.ACCESS_CODES || '').split(',').filter(c => c.trim());
if (process.env.ADMIN_CODE) validAccessCodes.push(process.env.ADMIN_CODE);

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

function validateBeta(req, res, next) {
  const endDate = new Date(process.env.BETA_EXPIRY || process.env.BETA_END_DATE || '2099-12-31');
  if (new Date() > endDate) return res.status(403).json({ error: 'Beta period has ended' });
  const accessCode = req.headers['x-access-code'] || req.body.accessCode;
  if (!accessCode || !validAccessCodes.includes(accessCode)) return res.status(401).json({ error: 'Invalid access code' });
  if (accessCode !== process.env.ADMIN_CODE) {
    const usage = usageTracker.get(accessCode) || { generations: 0 };
    if (usage.generations >= (parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50)) 
      return res.status(403).json({ error: 'Generation limit reached' });
  }
  req.accessCode = accessCode;
  next();
}

function trackUsage(code) {
  const u = usageTracker.get(code) || { generations: 0 };
  u.generations++;
  usageTracker.set(code, u);
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', codes: validAccessCodes.length }));

// Validate code
app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode || !validAccessCodes.includes(accessCode)) 
    return res.status(401).json({ valid: false, message: 'Invalid access code' });
  const usage = usageTracker.get(accessCode) || { generations: 0 };
  const max = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
  res.json({ valid: true, remaining: accessCode === process.env.ADMIN_CODE ? 'unlimited' : (max - usage.generations) });
});

// Generate menus
app.post('/api/generate-menus', validateBeta, async (req, res) => {
  try {
    const { preferences } = req.body;
    const p = preferences || {};
    const prompt = `You are an expert culinary consultant combining the skills of a James Beard Award-winning chef, Master Sommelier, and CIA instructor.

Generate 5 complete dinner party menu options for ${p.guestCount || 6} guests with a food budget of ${p.budget || '$150-200'}.

Cuisine style: ${p.cuisineStyle || "Chef's choice"}
Occasion: ${p.occasion || 'Dinner party'}
Host skill level: ${p.skillLevel || 'Intermediate'}
Likes: ${p.likes || 'Not specified'}
Dislikes: ${p.dislikes || 'Not specified'}
Dietary restrictions: ${(p.dietaryRestrictions && p.dietaryRestrictions.join(', ')) || 'None'}

Return ONLY a JSON array with exactly 5 menu objects. No other text. Each menu:
{
  "name": "Creative menu name",
  "description": "2-3 sentence description",
  "courses": [
    { "course": "Amuse-Bouche", "dish": "Dish name", "description": "Brief description" },
    { "course": "First Course", "dish": "Dish name", "description": "Brief description" },
    { "course": "Main Course", "dish": "Dish name", "description": "Brief description" },
    { "course": "Dessert", "dish": "Dish name", "description": "Brief description" }
  ],
  "estimatedCost": "$XX-$XX",
  "difficulty": "Easy|Intermediate|Advanced",
  "prepTime": "X hours",
  "wineStyle": "Suggested wine style"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, temperature: 0.95, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) return res.status(500).json({ error: 'Menu generation failed' });
    const data = await response.json();
    const jsonMatch = data.content[0].text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse response' });
    trackUsage(req.accessCode);
    res.json({ menus: JSON.parse(jsonMatch[0]) });
  } catch (e) {
    console.error('Generate menus error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Build cookbook
app.post('/api/build-cookbook', validateBeta, async (req, res) => {
  try {
    const { menu, guestCount, serviceTime } = req.body;
    const courses = menu && menu.courses ? menu.courses.map(c => c.course + ': ' + c.dish).join(', ') : '';
    const prompt = `You are an expert culinary team. Create a complete cookbook for ${guestCount || 6} guests, service ${serviceTime || '7:00 PM'}.
Menu: ${menu && menu.name ? menu.name : 'Dinner'}
Courses: ${courses}

Return ONLY a JSON object:
{
  "recipes": [{ "course": "", "dish": "", "servings": "${guestCount || 6}", "ingredients": ["1 lb item"], "instructions": ["Step 1"], "chefTips": ["Tip"], "prepTime": "20 min", "cookTime": "30 min", "makeAhead": "Notes" }],
  "shoppingList": { "proteins": [], "produce": [], "dairy": [], "pantry": [], "herbsSpices": [], "specialty": [] },
  "dayBeforePrep": [{ "task": "", "duration": "", "notes": "" }],
  "dayOfTimeline": [{ "time": "3:00 PM", "task": "", "duration": "" }],
  "winePairings": [{ "course": "", "wine": "", "price": "", "notes": "", "alternative": "" }],
  "tableSettings": { "style": "", "placeSetting": [], "centerpiece": "", "lighting": "", "musicSuggestion": "" },
  "platingGuides": [{ "course": "", "plateType": "", "composition": "", "garnish": "", "proTip": "" }],
  "chefSecrets": { "timing": [], "temperature": [], "lastMinute": [] },
  "finalChecklist": { "kitchen": [], "diningRoom": [], "mental": [] },
  "imagePrompts": { "tablescape": "", "mainCourse": "" }
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) return res.status(500).json({ error: 'Cookbook generation failed' });
    const data = await response.json();
    const jsonMatch = data.content[0].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse response' });
    res.json({ cookbook: JSON.parse(jsonMatch[0]) });
  } catch (e) {
    console.error('Build cookbook error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Generate DOCX
app.post('/api/generate-docx', validateBeta, async (req, res) => {
  try {
    const { eventTitle, eventDate, guestCount, menu, cookbook } = req.body;
    const docx = require('docx');
    const buffer = await buildDocx(docx, { eventTitle, eventDate, guestCount, menu, cookbook });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (eventTitle || 'Cookbook').replace(/[^a-z0-9]/gi, '_') + '_Cookbook.docx"');
    res.send(buffer);
  } catch (e) {
    console.error('DOCX error:', e);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Admin stats
app.get('/api/admin/stats', (req, res) => {
  if (req.headers['x-access-code'] !== process.env.ADMIN_CODE) return res.status(403).json({ error: 'Admin required' });
  const stats = {};
  usageTracker.forEach((v, k) => { stats[k] = v; });
  res.json({ codes: validAccessCodes.length - 1, active: usageTracker.size, usage: stats });
});

// DOCX Builder - Safe string helper
function s(v) { return v ? String(v) : ''; }

async function buildDocx(docx, data) {
  const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageNumber, PageBreak, LevelFormat } = docx;
  const { eventTitle, eventDate, guestCount, menu, cookbook } = data;
  const cb = cookbook || {};
  const content = [];

  // Cover
  content.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
  content.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(s(eventTitle) || "Dinner Party Cookbook")] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: s(eventDate) || new Date().toLocaleDateString(), size: 32, color: "666666" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: (guestCount || 6) + " Guests", size: 28, color: "666666" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: menu && menu.name ? s(menu.name) : "Custom Menu", size: 36, italics: true, color: "1a3a5c" })] }));
  if (menu && menu.description) content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: s(menu.description), size: 24, color: "666666" })] }));

  // Menu
  content.push(new Paragraph({ children: [new PageBreak()] }));
  content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("The Menu")] }));
  if (menu && menu.courses && Array.isArray(menu.courses)) {
    menu.courses.forEach(function(c) {
      if (c && c.course) {
        content.push(new Paragraph({ spacing: { before: 250 }, children: [new TextRun({ text: s(c.course), bold: true, size: 26, color: "1a3a5c" })] }));
        content.push(new Paragraph({ children: [new TextRun({ text: s(c.dish), size: 28 })] }));
        if (c.description) content.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: s(c.description), italics: true, size: 22, color: "666666" })] }));
      }
    });
  }

  // Wine
  if (cb.winePairings && Array.isArray(cb.winePairings) && cb.winePairings.length) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Wine Pairings")] }));
    cb.winePairings.forEach(function(p) {
      if (p && p.course) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: s(p.course) + ": ", bold: true, size: 24 }), new TextRun({ text: s(p.wine), size: 24 }), new TextRun({ text: p.price ? " (" + s(p.price) + ")" : "", size: 22, color: "666666" })] }));
        if (p.notes) content.push(new Paragraph({ children: [new TextRun({ text: s(p.notes), italics: true, size: 22, color: "666666" })] }));
        if (p.alternative) content.push(new Paragraph({ children: [new TextRun({ text: "Budget option: " + s(p.alternative), size: 20, color: "888888" })] }));
      }
    });
  }

  // Shopping
  if (cb.shoppingList) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Shopping List")] }));
    var cats = { proteins: "Proteins & Seafood", produce: "Produce", dairy: "Dairy & Eggs", pantry: "Pantry Staples", herbsSpices: "Herbs & Spices", specialty: "Specialty Items" };
    Object.keys(cats).forEach(function(cat) {
      var items = cb.shoppingList[cat];
      if (items && Array.isArray(items) && items.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: cats[cat], bold: true, size: 24, color: "2c5282" })] }));
        items.forEach(function(item) { if (item) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(item), size: 22 })] })); });
      }
    });
  }

  // Recipes
  if (cb.recipes && Array.isArray(cb.recipes) && cb.recipes.length) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Complete Recipes")] }));
    cb.recipes.forEach(function(r, idx) {
      if (!r) return;
      if (idx > 0) content.push(new Paragraph({ children: [new PageBreak()] }));
      content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s(r.course) + ": " + s(r.dish))] }));
      var times = [];
      if (r.prepTime) times.push("Prep: " + s(r.prepTime));
      if (r.cookTime) times.push("Cook: " + s(r.cookTime));
      if (r.servings) times.push("Serves: " + s(r.servings));
      if (times.length) content.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: times.join(" | "), italics: true, size: 22, color: "666666" })] }));
      if (r.makeAhead) content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Make Ahead: " + s(r.makeAhead), italics: true, size: 22, color: "996600" })] }));
      if (r.ingredients && Array.isArray(r.ingredients) && r.ingredients.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Ingredients", bold: true, size: 24 })] }));
        r.ingredients.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
      }
      if (r.instructions && Array.isArray(r.instructions) && r.instructions.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Instructions", bold: true, size: 24 })] }));
        r.instructions.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
      }
      if (r.chefTips && Array.isArray(r.chefTips) && r.chefTips.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Chef's Tips", bold: true, size: 24, color: "c9a959" })] }));
        r.chefTips.forEach(function(t) { if (t) content.push(new Paragraph({ children: [new TextRun({ text: "• " + s(t), italics: true, size: 22 })] })); });
      }
    });
  }

  // Day Before
  if (cb.dayBeforePrep && Array.isArray(cb.dayBeforePrep) && cb.dayBeforePrep.length) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Day-Before Preparation")] }));
    content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Complete these tasks ahead for a stress-free dinner party.", italics: true, size: 22, color: "666666" })] }));
    cb.dayBeforePrep.forEach(function(t) {
      if (t && t.task) {
        content.push(new Paragraph({ spacing: { before: 150 }, numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(t.task), bold: true, size: 22 }), new TextRun({ text: t.duration ? " (" + s(t.duration) + ")" : "", size: 22, color: "666666" })] }));
        if (t.notes) content.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: s(t.notes), italics: true, size: 20, color: "888888" })] }));
      }
    });
  }

  // Day Of
  if (cb.dayOfTimeline && Array.isArray(cb.dayOfTimeline) && cb.dayOfTimeline.length) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Day-Of Timeline")] }));
    content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Follow this schedule for perfect timing.", italics: true, size: 22, color: "666666" })] }));
    cb.dayOfTimeline.forEach(function(t) {
      if (t && t.time) {
        content.push(new Paragraph({ spacing: { before: 150 }, numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(t.time) + ": ", bold: true, size: 24, color: "1a3a5c" }), new TextRun({ text: s(t.task), size: 22 }), new TextRun({ text: t.duration ? " (" + s(t.duration) + ")" : "", size: 20, color: "888888" })] }));
      }
    });
  }

  // Table
  if (cb.tableSettings) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table Setting Guide")] }));
    if (cb.tableSettings.style) content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: s(cb.tableSettings.style), italics: true, size: 24, color: "666666" })] }));
    if (cb.tableSettings.placeSetting && Array.isArray(cb.tableSettings.placeSetting) && cb.tableSettings.placeSetting.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Place Setting", bold: true, size: 24, color: "2c5282" })] }));
      cb.tableSettings.placeSetting.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
    if (cb.tableSettings.centerpiece) content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "Centerpiece: ", bold: true, size: 22 }), new TextRun({ text: s(cb.tableSettings.centerpiece), size: 22 })] }));
    if (cb.tableSettings.lighting) content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Lighting: ", bold: true, size: 22 }), new TextRun({ text: s(cb.tableSettings.lighting), size: 22 })] }));
    if (cb.tableSettings.musicSuggestion) content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Music: ", bold: true, size: 22 }), new TextRun({ text: s(cb.tableSettings.musicSuggestion), size: 22 })] }));
  }

  // Plating
  if (cb.platingGuides && Array.isArray(cb.platingGuides) && cb.platingGuides.length) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Plating Guide")] }));
    cb.platingGuides.forEach(function(p) {
      if (p && p.course) {
        content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s(p.course))] }));
        if (p.plateType) content.push(new Paragraph({ children: [new TextRun({ text: "Plate: ", bold: true, size: 22 }), new TextRun({ text: s(p.plateType), size: 22 })] }));
        if (p.composition) content.push(new Paragraph({ children: [new TextRun({ text: "Composition: ", bold: true, size: 22 }), new TextRun({ text: s(p.composition), size: 22 })] }));
        if (p.garnish) content.push(new Paragraph({ children: [new TextRun({ text: "Garnish: ", bold: true, size: 22 }), new TextRun({ text: s(p.garnish), size: 22 })] }));
        if (p.proTip) content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Pro Tip: " + s(p.proTip), italics: true, size: 22, color: "996600" })] }));
      }
    });
  }

  // Chef Secrets
  if (cb.chefSecrets) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Chef's Tips & Secrets")] }));
    if (cb.chefSecrets.timing && Array.isArray(cb.chefSecrets.timing) && cb.chefSecrets.timing.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Timing Tips", bold: true, size: 24, color: "2c5282" })] }));
      cb.chefSecrets.timing.forEach(function(t) { if (t) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(t), size: 22 })] })); });
    }
    if (cb.chefSecrets.temperature && Array.isArray(cb.chefSecrets.temperature) && cb.chefSecrets.temperature.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Temperature Tips", bold: true, size: 24, color: "2c5282" })] }));
      cb.chefSecrets.temperature.forEach(function(t) { if (t) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(t), size: 22 })] })); });
    }
    if (cb.chefSecrets.lastMinute && Array.isArray(cb.chefSecrets.lastMinute) && cb.chefSecrets.lastMinute.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Last-Minute Success", bold: true, size: 24, color: "2c5282" })] }));
      cb.chefSecrets.lastMinute.forEach(function(t) { if (t) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(t), size: 22 })] })); });
    }
  }

  // Checklist
  if (cb.finalChecklist) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Final Checklist")] }));
    if (cb.finalChecklist.kitchen && Array.isArray(cb.finalChecklist.kitchen) && cb.finalChecklist.kitchen.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Kitchen", bold: true, size: 24, color: "2c5282" })] }));
      cb.finalChecklist.kitchen.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
    if (cb.finalChecklist.diningRoom && Array.isArray(cb.finalChecklist.diningRoom) && cb.finalChecklist.diningRoom.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Dining Room", bold: true, size: 24, color: "2c5282" })] }));
      cb.finalChecklist.diningRoom.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
    if (cb.finalChecklist.mental && Array.isArray(cb.finalChecklist.mental) && cb.finalChecklist.mental.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Mental Prep", bold: true, size: 24, color: "2c5282" })] }));
      cb.finalChecklist.mental.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
  }

  // Image Prompts
  if (cb.imagePrompts) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("AI Image Prompts")] }));
    content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Use with Midjourney, DALL-E, or other AI image generators.", italics: true, size: 22, color: "666666" })] }));
    if (cb.imagePrompts.tablescape) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Tablescape Shot", bold: true, size: 24, color: "2c5282" })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.imagePrompts.tablescape), size: 20, font: "Courier New" })] }));
    }
    if (cb.imagePrompts.mainCourse) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Main Course Shot", bold: true, size: 24, color: "2c5282" })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.imagePrompts.mainCourse), size: 20, font: "Courier New" })] }));
    }
  }

  // Closing
  content.push(new Paragraph({ children: [new PageBreak()] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [new TextRun({ text: "Bon Appétit!", size: 48, bold: true, color: "1a3a5c" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: "This cookbook was generated by AI Deep Study", italics: true, size: 20, color: "999999" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Dinner Party Planner Beta", size: 20, color: "999999" })] }));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Georgia", size: 24 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { size: 56, bold: true, color: "1a3a5c", font: "Georgia" }, paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, color: "1a3a5c", font: "Georgia" }, paragraph: { spacing: { before: 400, after: 200 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, color: "2c5282", font: "Georgia" }, paragraph: { spacing: { before: 300, after: 150 } } }
      ]
    },
    numbering: {
      config: [
        { reference: "checkbox", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2610", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "bullet", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "numbered", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
      ]
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: s(eventTitle) || "Cookbook", italics: true, size: 20, color: "666666" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", size: 20 }), new TextRun({ children: [PageNumber.CURRENT], size: 20 }), new TextRun({ text: " of ", size: 20 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20 })] })] }) },
      children: content
    }]
  });
  return Packer.toBuffer(doc);
}

// Full elegant client HTML
const CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dinner Party Planner - Beta</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy: #1a3a5c;
      --navy-dark: #0f2438;
      --gold: #c9a959;
      --gold-light: #e8d5a3;
      --cream: #faf8f3;
      --cream-dark: #f0ebe0;
      --text: #2c3e50;
      --text-light: #5a6c7d;
      --success: #2d6a4f;
      --error: #c0392b;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Lora', Georgia, serif;
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      min-height: 100vh;
      padding: 20px;
      color: var(--text);
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      background: var(--cream);
      border-radius: 20px;
      box-shadow: 0 30px 100px rgba(0,0,0,0.5);
      overflow: hidden;
    }
    
    /* Header */
    .header {
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      color: var(--cream);
      padding: 50px 40px;
      text-align: center;
      position: relative;
      border-bottom: 5px solid var(--gold);
    }
    .header::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L35 25H55L39 37L44 57L30 45L16 57L21 37L5 25H25L30 5Z' fill='%23c9a959' fill-opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
    }
    .header h1 {
      font-family: 'Playfair Display', serif;
      font-size: 3rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
      position: relative;
    }
    .header .subtitle {
      color: var(--gold);
      font-size: 0.85rem;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      position: relative;
    }
    .header .beta-badge {
      display: inline-block;
      background: var(--gold);
      color: var(--navy);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 600;
      margin-top: 15px;
      letter-spacing: 0.1em;
    }
    
    /* Content */
    .content { padding: 50px; }
    
    /* Progress Steps */
    .progress {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 15px;
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 1px solid var(--cream-dark);
    }
    .progress-step {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .progress-dot {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--cream-dark);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Playfair Display', serif;
      font-weight: 600;
      color: var(--text-light);
      transition: all 0.3s;
    }
    .progress-dot.active {
      background: var(--gold);
      color: var(--navy);
      transform: scale(1.1);
    }
    .progress-dot.done {
      background: var(--navy);
      color: var(--cream);
    }
    .progress-label {
      font-size: 0.85rem;
      color: var(--text-light);
      display: none;
    }
    @media (min-width: 600px) { .progress-label { display: block; } }
    .progress-line {
      width: 40px;
      height: 2px;
      background: var(--cream-dark);
    }
    
    /* Sections */
    .section { display: none; }
    .section.active { display: block; animation: fadeIn 0.4s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    /* Form Elements */
    h2 {
      font-family: 'Playfair Display', serif;
      font-size: 1.8rem;
      color: var(--navy);
      margin-bottom: 10px;
    }
    .section-desc {
      color: var(--text-light);
      margin-bottom: 30px;
      font-size: 1rem;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin-bottom: 25px;
    }
    @media (min-width: 600px) { .form-row.two { grid-template-columns: 1fr 1fr; } }
    .form-group { margin-bottom: 0; }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--navy);
      font-size: 0.95rem;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 14px 18px;
      border: 2px solid var(--cream-dark);
      border-radius: 10px;
      font-family: inherit;
      font-size: 1rem;
      color: var(--text);
      background: white;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--gold);
      box-shadow: 0 0 0 3px rgba(201,169,89,0.15);
    }
    .form-group textarea { min-height: 100px; resize: vertical; }
    
    /* Checkboxes */
    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 15px;
      background: white;
      border: 2px solid var(--cream-dark);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .checkbox-item:hover { border-color: var(--gold); }
    .checkbox-item input { width: auto; margin: 0; }
    .checkbox-item.checked { border-color: var(--gold); background: rgba(201,169,89,0.1); }
    
    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px 32px;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      color: var(--cream);
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(26,58,92,0.3); }
    .btn-secondary {
      background: var(--gold);
      color: var(--navy);
    }
    .btn-secondary:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(201,169,89,0.3); }
    .btn-outline {
      background: transparent;
      color: var(--navy);
      border: 2px solid var(--navy);
    }
    .btn-outline:hover { background: var(--navy); color: var(--cream); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
    .btn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
      margin-top: 40px;
      padding-top: 30px;
      border-top: 1px solid var(--cream-dark);
      flex-wrap: wrap;
    }
    
    /* Menu Cards */
    .menu-grid { display: grid; gap: 20px; }
    .menu-card {
      background: white;
      border: 2px solid var(--cream-dark);
      border-radius: 16px;
      padding: 28px;
      cursor: pointer;
      transition: all 0.3s;
      position: relative;
    }
    .menu-card:hover { border-color: var(--gold); box-shadow: 0 8px 30px rgba(201,169,89,0.15); transform: translateY(-3px); }
    .menu-card.selected { border-color: var(--navy); box-shadow: 0 8px 30px rgba(26,58,92,0.2); }
    .menu-card.selected::after {
      content: '✓';
      position: absolute;
      top: 15px; right: 15px;
      width: 28px; height: 28px;
      background: var(--navy);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .menu-card h3 {
      font-family: 'Playfair Display', serif;
      font-size: 1.4rem;
      color: var(--navy);
      margin-bottom: 8px;
    }
    .menu-card .desc {
      color: var(--text-light);
      font-size: 0.95rem;
      margin-bottom: 18px;
      line-height: 1.5;
    }
    .menu-card .courses {
      margin-bottom: 18px;
    }
    .menu-card .course {
      padding: 10px 0;
      border-bottom: 1px solid var(--cream-dark);
    }
    .menu-card .course:last-child { border-bottom: none; }
    .menu-card .course-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--gold);
      font-weight: 600;
    }
    .menu-card .course-name {
      font-weight: 600;
      color: var(--navy);
      margin: 3px 0;
    }
    .menu-card .course-desc {
      font-size: 0.85rem;
      color: var(--text-light);
      font-style: italic;
    }
    .menu-card .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      padding-top: 15px;
      border-top: 1px solid var(--cream-dark);
    }
    .menu-card .meta-item {
      font-size: 0.8rem;
      color: var(--text-light);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .menu-card .meta-item strong { color: var(--text); }
    
    /* Loading */
    .loading {
      text-align: center;
      padding: 60px 20px;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid var(--cream-dark);
      border-top-color: var(--gold);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading p {
      color: var(--text-light);
      font-size: 1.1rem;
    }
    
    /* Cookbook Preview */
    .cookbook-preview {
      background: white;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 25px;
      border: 2px solid var(--cream-dark);
    }
    .cookbook-preview h3 {
      font-family: 'Playfair Display', serif;
      font-size: 1.5rem;
      color: var(--navy);
      margin-bottom: 15px;
    }
    .cookbook-preview .ready-msg {
      color: var(--success);
      font-weight: 500;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cookbook-preview ul {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .cookbook-preview li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 15px;
      background: var(--cream);
      border-radius: 8px;
      font-size: 0.9rem;
    }
    .cookbook-preview li::before {
      content: '✓';
      color: var(--success);
      font-weight: bold;
    }
    
    /* Error */
    .error {
      color: var(--error);
      margin-top: 15px;
      padding: 15px;
      background: rgba(192,57,43,0.1);
      border-radius: 8px;
    }
    
    /* Login */
    .login-box {
      max-width: 400px;
      margin: 0 auto;
      text-align: center;
    }
    .login-box h2 { margin-bottom: 10px; }
    .login-box .welcome {
      color: var(--text-light);
      margin-bottom: 30px;
    }
    .login-box .form-group { text-align: left; margin-bottom: 20px; }
    .login-box .btn { width: 100%; }
    
    /* Footer */
    .footer {
      text-align: center;
      padding: 30px;
      color: var(--text-light);
      font-size: 0.85rem;
      border-top: 1px solid var(--cream-dark);
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Dinner Party Planner</h1>
      <div class="subtitle">Create Memorable Culinary Experiences</div>
      <div class="beta-badge">BETA</div>
    </div>
    
    <div class="content">
      <!-- Login -->
      <div class="section active" id="loginSection">
        <div class="login-box">
          <h2>Welcome, Beta Tester!</h2>
          <p class="welcome">Enter your access code to begin planning your perfect dinner party.</p>
          <div class="form-group">
            <label for="accessCode">Access Code</label>
            <input type="text" id="accessCode" placeholder="Enter your beta access code" autocomplete="off">
          </div>
          <button class="btn btn-primary" onclick="validateCode()">Begin Planning</button>
          <div id="loginError" class="error" style="display:none"></div>
        </div>
      </div>
      
      <!-- App -->
      <div class="section" id="appSection">
        <div class="progress" id="progress"></div>
        
        <!-- Step 1: Preferences -->
        <div class="section active" id="step1">
          <h2>Tell Us About Your Dinner Party</h2>
          <p class="section-desc">Share the details so we can craft the perfect menu for your occasion.</p>
          
          <div class="form-row two">
            <div class="form-group">
              <label for="eventTitle">Event Name</label>
              <input type="text" id="eventTitle" placeholder="e.g., Spring Garden Dinner">
            </div>
            <div class="form-group">
              <label for="eventDate">Date</label>
              <input type="date" id="eventDate">
            </div>
          </div>
          
          <div class="form-row two">
            <div class="form-group">
              <label for="guestCount">Number of Guests</label>
              <input type="number" id="guestCount" min="2" max="24" value="6">
            </div>
            <div class="form-group">
              <label for="budget">Food Budget</label>
              <select id="budget">
                <option value="$50-75">$50-75 (Simple)</option>
                <option value="$75-100">$75-100</option>
                <option value="$100-150">$100-150</option>
                <option value="$150-200" selected>$150-200</option>
                <option value="$200-300">$200-300</option>
                <option value="$300-400">$300-400</option>
                <option value="$400+">$400+ (Luxury)</option>
              </select>
            </div>
          </div>
          
          <div class="form-row two">
            <div class="form-group">
              <label for="cuisineStyle">Cuisine Style</label>
              <select id="cuisineStyle">
                <option value="Chef's Choice">Chef's Choice</option>
                <option value="French Bistro">French Bistro</option>
                <option value="Italian">Italian</option>
                <option value="Mediterranean">Mediterranean</option>
                <option value="Modern American">Modern American</option>
                <option value="New England Coastal">New England Coastal</option>
                <option value="Asian Fusion">Asian Fusion</option>
                <option value="Spanish Tapas">Spanish Tapas</option>
                <option value="Farm-to-Table">Farm-to-Table</option>
                <option value="Steakhouse">Steakhouse</option>
              </select>
            </div>
            <div class="form-group">
              <label for="occasion">Occasion</label>
              <select id="occasion">
                <option value="Casual dinner party">Casual Dinner Party</option>
                <option value="Romantic dinner">Romantic Dinner</option>
                <option value="Birthday celebration">Birthday Celebration</option>
                <option value="Anniversary">Anniversary</option>
                <option value="Holiday gathering">Holiday Gathering</option>
                <option value="Business dinner">Business Dinner</option>
                <option value="Special celebration">Special Celebration</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label for="skillLevel">Your Cooking Skill Level</label>
            <select id="skillLevel">
              <option value="Beginner">Beginner - Keep it simple</option>
              <option value="Intermediate" selected>Intermediate - Comfortable with most techniques</option>
              <option value="Advanced">Advanced - Bring on the challenge</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Dietary Restrictions</label>
            <div class="checkbox-grid">
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Gluten-free"> Gluten-free</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Dairy-free"> Dairy-free</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Vegetarian"> Vegetarian</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Vegan"> Vegan</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Nut allergy"> Nut Allergy</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Shellfish allergy"> Shellfish Allergy</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Low sodium"> Low Sodium</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Kosher"> Kosher</label>
            </div>
          </div>
          
          <div class="form-row two">
            <div class="form-group">
              <label for="likes">Ingredients You Love</label>
              <input type="text" id="likes" placeholder="e.g., seafood, mushrooms, chocolate">
            </div>
            <div class="form-group">
              <label for="dislikes">Ingredients to Avoid</label>
              <input type="text" id="dislikes" placeholder="e.g., cilantro, olives, blue cheese">
            </div>
          </div>
          
          <div class="btn-row">
            <div></div>
            <button class="btn btn-primary" onclick="generateMenus()">Generate Menu Options →</button>
          </div>
        </div>
        
        <!-- Step 2: Menu Selection -->
        <div class="section" id="step2">
          <h2>Choose Your Menu</h2>
          <p class="section-desc">Select the menu that best fits your vision for the evening.</p>
          
          <div id="menuLoading" class="loading" style="display:none">
            <div class="spinner"></div>
            <p>Our AI chefs are crafting your personalized menus...</p>
          </div>
          
          <div id="menuGrid" class="menu-grid"></div>
          <div id="menuError" class="error" style="display:none"></div>
          
          <div class="btn-row">
            <button class="btn btn-outline" onclick="goToStep(1)">← Back</button>
            <button class="btn btn-primary" id="selectMenuBtn" onclick="selectMenu()" disabled>Continue with Selected Menu →</button>
          </div>
        </div>
        
        <!-- Step 3: Cookbook -->
        <div class="section" id="step3">
          <h2>Your Complete Cookbook</h2>
          <p class="section-desc">Your personalized dinner party guide is ready to download.</p>
          
          <div id="cookbookLoading" class="loading" style="display:none">
            <div class="spinner"></div>
            <p>Creating your complete cookbook with recipes, timeline, and tips...</p>
          </div>
          
          <div id="cookbookPreview"></div>
          <div id="cookbookError" class="error" style="display:none"></div>
          
          <div class="btn-row">
            <button class="btn btn-outline" onclick="goToStep(2)">← Back to Menus</button>
            <button class="btn btn-secondary" id="downloadBtn" onclick="downloadDocx()" disabled>Download Cookbook (DOCX)</button>
          </div>
        </div>
      </div>
      
      <div class="footer">
        <p>Dinner Party Planner Beta • Powered by AI Deep Study</p>
      </div>
    </div>
  </div>
  
  <script>
    let accessCode = '';
    let currentStep = 1;
    let selectedMenu = null;
    let cookbook = null;
    let menus = [];
    
    document.getElementById('eventDate').valueAsDate = new Date();
    
    // Checkbox styling
    document.querySelectorAll('.checkbox-item input').forEach(cb => {
      cb.addEventListener('change', function() {
        this.closest('.checkbox-item').classList.toggle('checked', this.checked);
      });
    });
    
    function updateProgress() {
      const p = document.getElementById('progress');
      p.innerHTML = [
        { n: 1, label: 'Preferences' },
        { n: 2, label: 'Menu Selection' },
        { n: 3, label: 'Cookbook' }
      ].map((s, i, arr) => {
        const dot = '<div class="progress-step"><div class="progress-dot ' + 
          (s.n < currentStep ? 'done' : '') + (s.n === currentStep ? 'active' : '') + 
          '">' + s.n + '</div><span class="progress-label">' + s.label + '</span></div>';
        return dot + (i < arr.length - 1 ? '<div class="progress-line"></div>' : '');
      }).join('');
    }
    
    function goToStep(step) {
      document.querySelectorAll('#appSection > .section').forEach(s => s.classList.remove('active'));
      document.getElementById('step' + step).classList.add('active');
      currentStep = step;
      updateProgress();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    function esc(t) {
      if (!t) return '';
      const d = document.createElement('div');
      d.textContent = t;
      return d.innerHTML;
    }
    
    async function validateCode() {
      const code = document.getElementById('accessCode').value.trim();
      const err = document.getElementById('loginError');
      err.style.display = 'none';
      
      if (!code) {
        err.textContent = 'Please enter an access code';
        err.style.display = 'block';
        return;
      }
      
      try {
        const res = await fetch('/api/validate-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode: code })
        });
        const data = await res.json();
        
        if (data.valid) {
          accessCode = code;
          document.getElementById('loginSection').classList.remove('active');
          document.getElementById('appSection').classList.add('active');
          updateProgress();
        } else {
          err.textContent = data.message || 'Invalid access code';
          err.style.display = 'block';
        }
      } catch (e) {
        err.textContent = 'Connection error. Please try again.';
        err.style.display = 'block';
      }
    }
    
    async function generateMenus() {
      goToStep(2);
      const loading = document.getElementById('menuLoading');
      const grid = document.getElementById('menuGrid');
      const err = document.getElementById('menuError');
      
      loading.style.display = 'block';
      grid.innerHTML = '';
      err.style.display = 'none';
      selectedMenu = null;
      document.getElementById('selectMenuBtn').disabled = true;
      
      const dietary = Array.from(document.querySelectorAll('input[name="dietary"]:checked')).map(c => c.value);
      
      const prefs = {
        guestCount: document.getElementById('guestCount').value,
        budget: document.getElementById('budget').value,
        cuisineStyle: document.getElementById('cuisineStyle').value,
        occasion: document.getElementById('occasion').value,
        skillLevel: document.getElementById('skillLevel').value,
        dietaryRestrictions: dietary,
        likes: document.getElementById('likes').value,
        dislikes: document.getElementById('dislikes').value
      };
      
      try {
        const res = await fetch('/api/generate-menus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-access-code': accessCode },
          body: JSON.stringify({ preferences: prefs })
        });
        
        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error || 'Failed to generate menus');
        }
        
        const data = await res.json();
        loading.style.display = 'none';
        menus = data.menus || [];
        
        if (menus.length) {
          grid.innerHTML = menus.map((m, i) => 
            '<div class="menu-card" onclick="pickMenu(' + i + ')" id="menu' + i + '">' +
              '<h3>' + esc(m.name) + '</h3>' +
              '<p class="desc">' + esc(m.description) + '</p>' +
              '<div class="courses">' +
                (m.courses || []).map(c =>
                  '<div class="course">' +
                    '<div class="course-label">' + esc(c.course) + '</div>' +
                    '<div class="course-name">' + esc(c.dish) + '</div>' +
                    (c.description ? '<div class="course-desc">' + esc(c.description) + '</div>' : '') +
                  '</div>'
                ).join('') +
              '</div>' +
              '<div class="meta">' +
                '<div class="meta-item"><strong>Cost:</strong> ' + esc(m.estimatedCost) + '</div>' +
                '<div class="meta-item"><strong>Prep:</strong> ' + esc(m.prepTime) + '</div>' +
                '<div class="meta-item"><strong>Level:</strong> ' + esc(m.difficulty) + '</div>' +
              '</div>' +
            '</div>'
          ).join('');
        }
      } catch (e) {
        loading.style.display = 'none';
        err.textContent = e.message;
        err.style.display = 'block';
      }
    }
    
    function pickMenu(i) {
      document.querySelectorAll('.menu-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('menu' + i).classList.add('selected');
      selectedMenu = menus[i];
      document.getElementById('selectMenuBtn').disabled = false;
    }
    
    async function selectMenu() {
      if (!selectedMenu) return;
      
      goToStep(3);
      const loading = document.getElementById('cookbookLoading');
      const preview = document.getElementById('cookbookPreview');
      const err = document.getElementById('cookbookError');
      
      loading.style.display = 'block';
      preview.innerHTML = '';
      err.style.display = 'none';
      document.getElementById('downloadBtn').disabled = true;
      
      try {
        const res = await fetch('/api/build-cookbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-access-code': accessCode },
          body: JSON.stringify({
            menu: selectedMenu,
            guestCount: document.getElementById('guestCount').value,
            serviceTime: '7:00 PM'
          })
        });
        
        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error || 'Failed to generate cookbook');
        }
        
        const data = await res.json();
        cookbook = data.cookbook;
        loading.style.display = 'none';
        
        preview.innerHTML = 
          '<div class="cookbook-preview">' +
            '<h3>' + esc(selectedMenu.name) + '</h3>' +
            '<p class="ready-msg">✓ Your complete dinner party guide is ready!</p>' +
            '<ul>' +
              '<li><strong>Recipes</strong> (' + (cookbook.recipes?.length || 0) + ' dishes)</li>' +
              '<li><strong>Shopping List</strong></li>' +
              '<li><strong>Day-Before Prep</strong></li>' +
              '<li><strong>Day-Of Timeline</strong></li>' +
              '<li><strong>Wine Pairings</strong></li>' +
              '<li><strong>Table Settings</strong></li>' +
              '<li><strong>Plating Guide</strong></li>' +
              '<li><strong>Chef\\'s Secrets</strong></li>' +
              '<li><strong>Final Checklist</strong></li>' +
              '<li><strong>AI Image Prompts</strong></li>' +
            '</ul>' +
          '</div>';
        
        document.getElementById('downloadBtn').disabled = false;
        
      } catch (e) {
        loading.style.display = 'none';
        err.textContent = e.message;
        err.style.display = 'block';
      }
    }
    
    async function downloadDocx() {
      const btn = document.getElementById('downloadBtn');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      
      try {
        const res = await fetch('/api/generate-docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-access-code': accessCode },
          body: JSON.stringify({
            eventTitle: document.getElementById('eventTitle').value || selectedMenu.name,
            eventDate: document.getElementById('eventDate').value,
            guestCount: document.getElementById('guestCount').value,
            menu: selectedMenu,
            cookbook: cookbook
          })
        });
        
        if (!res.ok) throw new Error('Failed to generate document');
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (document.getElementById('eventTitle').value || selectedMenu.name).replace(/[^a-z0-9]/gi, '_') + '_Cookbook.docx';
        a.click();
        URL.revokeObjectURL(url);
        
      } catch (e) {
        document.getElementById('cookbookError').textContent = e.message;
        document.getElementById('cookbookError').style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Download Cookbook (DOCX)';
      }
    }
    
    document.getElementById('accessCode').addEventListener('keypress', e => {
      if (e.key === 'Enter') validateCode();
    });
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(CLIENT_HTML);
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Dinner Party Planner - Beta v4       ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║  Port: ' + PORT + '                             ║');
  console.log('║  Codes: ' + validAccessCodes.length + '                              ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});

/**
 * Dinner Party Planner - Beta API Server v3
 * Simplified DOCX generation - no Tables, safer null handling
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

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } });
app.use('/api/', limiter);

function validateBeta(req, res, next) {
  const endDate = new Date(process.env.BETA_EXPIRY || process.env.BETA_END_DATE || '2099-12-31');
  if (new Date() > endDate) return res.status(403).json({ error: 'Beta period has ended' });
  const accessCode = req.headers['x-access-code'] || req.body.accessCode;
  if (!accessCode || !validAccessCodes.includes(accessCode)) return res.status(401).json({ error: 'Invalid access code' });
  if (accessCode !== process.env.ADMIN_CODE) {
    const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
    const maxGen = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
    if (usage.generations >= maxGen) return res.status(403).json({ error: 'Generation limit reached' });
  }
  req.accessCode = accessCode;
  next();
}

function trackUsage(accessCode) {
  const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
  usage.generations++;
  usage.lastUsed = new Date();
  usageTracker.set(accessCode, usage);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', accessCodesLoaded: validAccessCodes.length });
});

app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode || !validAccessCodes.includes(accessCode)) return res.status(401).json({ valid: false, message: 'Invalid access code' });
  res.json({ valid: true });
});

app.post('/api/generate-menus', validateBeta, async (req, res) => {
  try {
    const { preferences } = req.body;
    const prompt = buildMenuPrompt(preferences);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, temperature: 0.95, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) return res.status(500).json({ error: 'Menu generation failed' });
    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse menu response' });
    const menus = JSON.parse(jsonMatch[0]);
    trackUsage(req.accessCode);
    res.json({ menus, source: 'ai-generated' });
  } catch (error) {
    console.error('Generate menus error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/build-cookbook', validateBeta, async (req, res) => {
  try {
    const { menu, guestCount, serviceTime } = req.body;
    const prompt = buildCookbookPrompt(menu, guestCount, serviceTime);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) return res.status(500).json({ error: 'Cookbook generation failed' });
    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse cookbook' });
    const cookbook = JSON.parse(jsonMatch[0]);
    res.json({ cookbook, source: 'ai-generated' });
  } catch (error) {
    console.error('Build cookbook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/generate-docx', validateBeta, async (req, res) => {
  try {
    const { eventTitle, eventDate, guestCount, menu, cookbook } = req.body;
    const docx = require('docx');
    const buffer = await generateDocxBuffer(docx, { eventTitle, eventDate, guestCount, menu, cookbook });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (eventTitle || 'Cookbook').replace(/[^a-z0-9]/gi, '_') + '.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Generate DOCX error:', error);
    res.status(500).json({ error: 'Failed to generate document: ' + error.message });
  }
});

function buildMenuPrompt(p) {
  return 'You are an expert culinary consultant. Generate 5 dinner party menu options for ' + (p.guestCount || 6) + ' guests, budget ' + (p.budget || '$150-200') + '. Cuisine: ' + (p.cuisineStyle || "Chef\'s choice") + '. Occasion: ' + (p.occasion || "Dinner party") + '. Skill: ' + (p.skillLevel || "Intermediate") + '. Likes: ' + (p.likes || "Not specified") + '. Dislikes: ' + (p.dislikes || "Not specified") + '. Dietary: ' + ((p.dietaryRestrictions && p.dietaryRestrictions.join(", ")) || "None") + '. Return ONLY a JSON array with 5 menus: [{ "name": "Menu name", "description": "Description", "courses": [{ "course": "Amuse-Bouche", "dish": "Dish", "description": "Desc" }, { "course": "First Course", "dish": "", "description": "" }, { "course": "Main Course", "dish": "", "description": "" }, { "course": "Dessert", "dish": "", "description": "" }], "estimatedCost": "$XX", "difficulty": "Easy/Intermediate/Advanced", "prepTime": "X hours", "wineStyle": "Wine suggestion" }]';
}

function buildCookbookPrompt(menu, guestCount, serviceTime) {
  var courses = menu && menu.courses ? menu.courses.map(function(c) { return c.course + ": " + c.dish; }).join(", ") : "4 courses";
  return 'Create a cookbook for ' + (guestCount || 6) + ' guests, service ' + (serviceTime || "7:00 PM") + '. Menu: ' + (menu && menu.name ? menu.name : "Dinner") + '. Courses: ' + courses + '. Return ONLY JSON: { "recipes": [{ "course": "", "dish": "", "ingredients": ["1 lb item"], "instructions": ["Step 1"], "chefTips": ["Tip"], "prepTime": "20 min", "cookTime": "30 min", "makeAhead": "" }], "shoppingList": { "proteins": [], "produce": [], "dairy": [], "pantry": [], "herbsSpices": [], "specialty": [] }, "dayBeforePrep": [{ "task": "", "duration": "", "notes": "" }], "dayOfTimeline": [{ "time": "3:00 PM", "task": "" }], "winePairings": [{ "course": "", "wine": "", "price": "", "notes": "" }], "tableSettings": { "style": "", "placeSetting": [], "centerpiece": "", "lighting": "", "musicSuggestion": "" }, "platingGuides": [{ "course": "", "composition": "", "garnish": "", "proTip": "" }], "chefSecrets": { "timing": [], "temperature": [], "lastMinute": [] }, "finalChecklist": { "kitchen": [], "diningRoom": [], "mental": [] }, "imagePrompts": { "tablescape": "", "mainCourse": "" } }';
}

async function generateDocxBuffer(docx, data) {
  const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageNumber, PageBreak, LevelFormat } = docx;
  const { eventTitle, eventDate, guestCount, menu, cookbook } = data;
  const cb = cookbook || {};
  
  // Safe string helper
  function s(val) { return val ? String(val) : ''; }
  
  const content = [];
  
  // Cover
  content.push(
    new Paragraph({ spacing: { before: 1200 }, children: [] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(s(eventTitle) || "Dinner Party Cookbook")] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: s(eventDate) || new Date().toLocaleDateString(), size: 32, color: "666666" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: (guestCount || 6) + " Guests", size: 28, color: "666666" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: menu && menu.name ? s(menu.name) : "Custom Menu", size: 36, italics: true, color: "1a3a5c" })] })
  );

  // Menu
  content.push(new Paragraph({ children: [new PageBreak()] }));
  content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("The Menu")] }));
  if (menu && menu.courses && Array.isArray(menu.courses)) {
    menu.courses.forEach(function(c) {
      if (c && c.course) {
        content.push(new Paragraph({ spacing: { before: 250 }, children: [new TextRun({ text: s(c.course), bold: true, size: 26, color: "1a3a5c" })] }));
        content.push(new Paragraph({ children: [new TextRun({ text: s(c.dish), size: 28 })] }));
        if (c.description) {
          content.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: s(c.description), italics: true, size: 22, color: "666666" })] }));
        }
      }
    });
  }

  // Wine Pairings
  if (cb.winePairings && Array.isArray(cb.winePairings) && cb.winePairings.length > 0) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Wine Pairings")] }));
    cb.winePairings.forEach(function(p) {
      if (p && p.course) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [
          new TextRun({ text: s(p.course) + ": ", bold: true, size: 24 }),
          new TextRun({ text: s(p.wine), size: 24 }),
          new TextRun({ text: p.price ? " (" + s(p.price) + ")" : "", size: 22, color: "666666" })
        ]}));
        if (p.notes) {
          content.push(new Paragraph({ children: [new TextRun({ text: s(p.notes), italics: true, size: 22, color: "666666" })] }));
        }
      }
    });
  }

  // Shopping List
  if (cb.shoppingList) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Shopping List")] }));
    var cats = { proteins: "Proteins", produce: "Produce", dairy: "Dairy", pantry: "Pantry", herbsSpices: "Herbs & Spices", specialty: "Specialty" };
    Object.keys(cats).forEach(function(cat) {
      var items = cb.shoppingList[cat];
      if (items && Array.isArray(items) && items.length > 0) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: cats[cat], bold: true, size: 24, color: "2c5282" })] }));
        items.forEach(function(item) {
          if (item) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(item), size: 22 })] }));
        });
      }
    });
  }

  // Recipes
  if (cb.recipes && Array.isArray(cb.recipes) && cb.recipes.length > 0) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Recipes")] }));
    cb.recipes.forEach(function(r, idx) {
      if (!r) return;
      if (idx > 0) content.push(new Paragraph({ children: [new PageBreak()] }));
      content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s(r.course) + ": " + s(r.dish))] }));
      
      var times = [];
      if (r.prepTime) times.push("Prep: " + s(r.prepTime));
      if (r.cookTime) times.push("Cook: " + s(r.cookTime));
      if (times.length > 0) {
        content.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: times.join(" | "), italics: true, size: 22, color: "666666" })] }));
      }
      
      if (r.makeAhead) {
        content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Make Ahead: " + s(r.makeAhead), italics: true, size: 22, color: "996600" })] }));
      }
      
      if (r.ingredients && Array.isArray(r.ingredients) && r.ingredients.length > 0) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Ingredients", bold: true, size: 24 })] }));
        r.ingredients.forEach(function(ing) {
          if (ing) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(ing), size: 22 })] }));
        });
      }
      
      if (r.instructions && Array.isArray(r.instructions) && r.instructions.length > 0) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Instructions", bold: true, size: 24 })] }));
        r.instructions.forEach(function(step) {
          if (step) content.push(new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: s(step), size: 22 })] }));
        });
      }
      
      if (r.chefTips && Array.isArray(r.chefTips) && r.chefTips.length > 0) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Chef's Tips", bold: true, size: 24, color: "c9a959" })] }));
        r.chefTips.forEach(function(tip) {
          if (tip) content.push(new Paragraph({ children: [new TextRun({ text: "• " + s(tip), italics: true, size: 22 })] }));
        });
      }
    });
  }

  // Day Before
  if (cb.dayBeforePrep && Array.isArray(cb.dayBeforePrep) && cb.dayBeforePrep.length > 0) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Day-Before Prep")] }));
    cb.dayBeforePrep.forEach(function(t) {
      if (t && t.task) {
        content.push(new Paragraph({ spacing: { before: 150 }, numbering: { reference: "checkbox", level: 0 }, children: [
          new TextRun({ text: s(t.task), bold: true, size: 22 }),
          new TextRun({ text: t.duration ? " (" + s(t.duration) + ")" : "", size: 22, color: "666666" })
        ]}));
        if (t.notes) content.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: s(t.notes), italics: true, size: 20, color: "888888" })] }));
      }
    });
  }

  // Day Of Timeline
  if (cb.dayOfTimeline && Array.isArray(cb.dayOfTimeline) && cb.dayOfTimeline.length > 0) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Day-Of Timeline")] }));
    cb.dayOfTimeline.forEach(function(t) {
      if (t && t.time) {
        content.push(new Paragraph({ spacing: { before: 150 }, numbering: { reference: "checkbox", level: 0 }, children: [
          new TextRun({ text: s(t.time) + ": ", bold: true, size: 24, color: "1a3a5c" }),
          new TextRun({ text: s(t.task), size: 22 })
        ]}));
      }
    });
  }

  // Table Settings
  if (cb.tableSettings) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table Setting Guide")] }));
    if (cb.tableSettings.style) content.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: s(cb.tableSettings.style), italics: true, size: 24, color: "666666" })] }));
    if (cb.tableSettings.placeSetting && Array.isArray(cb.tableSettings.placeSetting)) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Place Setting", bold: true, size: 24, color: "2c5282" })] }));
      cb.tableSettings.placeSetting.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
    if (cb.tableSettings.centerpiece) { content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Centerpiece: ", bold: true, size: 22 }), new TextRun({ text: s(cb.tableSettings.centerpiece), size: 22 })] })); }
    if (cb.tableSettings.lighting) { content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Lighting: ", bold: true, size: 22 }), new TextRun({ text: s(cb.tableSettings.lighting), size: 22 })] })); }
    if (cb.tableSettings.musicSuggestion) { content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Music: ", bold: true, size: 22 }), new TextRun({ text: s(cb.tableSettings.musicSuggestion), size: 22 })] })); }
  }

  // Plating
  if (cb.platingGuides && Array.isArray(cb.platingGuides) && cb.platingGuides.length > 0) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Plating Guide")] }));
    cb.platingGuides.forEach(function(p) {
      if (p && p.course) {
        content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s(p.course))] }));
        if (p.composition) content.push(new Paragraph({ children: [new TextRun({ text: "Composition: ", bold: true, size: 22 }), new TextRun({ text: s(p.composition), size: 22 })] }));
        if (p.garnish) content.push(new Paragraph({ children: [new TextRun({ text: "Garnish: ", bold: true, size: 22 }), new TextRun({ text: s(p.garnish), size: 22 })] }));
        if (p.proTip) content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Pro Tip: " + s(p.proTip), italics: true, size: 22, color: "996600" })] }));
      }
    });
  }

  // Chef Secrets
  if (cb.chefSecrets) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Chef's Secrets")] }));
    if (cb.chefSecrets.timing && Array.isArray(cb.chefSecrets.timing) && cb.chefSecrets.timing.length > 0) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Timing", bold: true, size: 24, color: "2c5282" })] }));
      cb.chefSecrets.timing.forEach(function(t) { if (t) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(t), size: 22 })] })); });
    }
    if (cb.chefSecrets.temperature && Array.isArray(cb.chefSecrets.temperature) && cb.chefSecrets.temperature.length > 0) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Temperature", bold: true, size: 24, color: "2c5282" })] }));
      cb.chefSecrets.temperature.forEach(function(t) { if (t) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(t), size: 22 })] })); });
    }
    if (cb.chefSecrets.lastMinute && Array.isArray(cb.chefSecrets.lastMinute) && cb.chefSecrets.lastMinute.length > 0) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Last Minute", bold: true, size: 24, color: "2c5282" })] }));
      cb.chefSecrets.lastMinute.forEach(function(t) { if (t) content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(t), size: 22 })] })); });
    }
  }

  // Final Checklist
  if (cb.finalChecklist) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Final Checklist")] }));
    if (cb.finalChecklist.kitchen && Array.isArray(cb.finalChecklist.kitchen) && cb.finalChecklist.kitchen.length > 0) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Kitchen", bold: true, size: 24, color: "2c5282" })] }));
      cb.finalChecklist.kitchen.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
    if (cb.finalChecklist.diningRoom && Array.isArray(cb.finalChecklist.diningRoom) && cb.finalChecklist.diningRoom.length > 0) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Dining Room", bold: true, size: 24, color: "2c5282" })] }));
      cb.finalChecklist.diningRoom.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
    if (cb.finalChecklist.mental && Array.isArray(cb.finalChecklist.mental) && cb.finalChecklist.mental.length > 0) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Mental Prep", bold: true, size: 24, color: "2c5282" })] }));
      cb.finalChecklist.mental.forEach(function(i) { if (i) content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })); });
    }
  }

  // Image Prompts
  if (cb.imagePrompts) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("AI Image Prompts")] }));
    if (cb.imagePrompts.tablescape) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Tablescape:", bold: true, size: 22 })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.imagePrompts.tablescape), size: 20, font: "Courier New" })] }));
    }
    if (cb.imagePrompts.mainCourse) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Main Course:", bold: true, size: 22 })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.imagePrompts.mainCourse), size: 20, font: "Courier New" })] }));
    }
  }

  // Closing
  content.push(new Paragraph({ children: [new PageBreak()] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [new TextRun({ text: "Bon Appetit!", size: 48, bold: true, color: "1a3a5c" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: "Generated by AI Deep Study", italics: true, size: 20, color: "999999" })] }));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Georgia", size: 24 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { size: 56, bold: true, color: "1a3a5c", font: "Georgia" }, paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, color: "1a3a5c", font: "Georgia" }, paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, color: "2c5282", font: "Georgia" }, paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } }
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

const CLIENT_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Dinner Party Planner</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;background:linear-gradient(135deg,#1a3a5c,#0f2438);min-height:100vh;padding:20px}.container{max-width:900px;margin:0 auto;background:#faf8f3;border-radius:16px;box-shadow:0 25px 80px rgba(0,0,0,0.4)}.header{text-align:center;padding:40px;background:linear-gradient(135deg,#1a3a5c,#0f2438);color:#faf8f3;border-bottom:4px solid #c9a959}.header h1{font-size:2.4rem;margin-bottom:8px}.header .subtitle{color:#c9a959;letter-spacing:0.2em;font-size:0.75rem;text-transform:uppercase}.content{padding:40px}.section{display:none}.section.active{display:block}.form-group{margin-bottom:20px}.form-group label{display:block;margin-bottom:8px;font-weight:500;color:#1a3a5c}.form-group input,.form-group select{width:100%;padding:12px;border:2px solid #e0ddd5;border-radius:8px;font-family:inherit;font-size:1rem}.form-group input:focus,.form-group select:focus{outline:none;border-color:#c9a959}.btn{display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#1a3a5c,#0f2438);color:#faf8f3;border:none;border-radius:8px;font-size:1rem;cursor:pointer}.btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(26,58,92,0.3)}.btn:disabled{opacity:0.6;cursor:not-allowed;transform:none}.btn-secondary{background:#c9a959;color:#1a3a5c}.error{color:#c0392b;margin-top:10px}.menu-card{background:white;border:2px solid #e0ddd5;border-radius:12px;padding:24px;margin-bottom:20px;cursor:pointer}.menu-card:hover{border-color:#c9a959}.menu-card.selected{border-color:#1a3a5c;box-shadow:0 4px 12px rgba(26,58,92,0.3)}.menu-card h3{color:#1a3a5c;margin-bottom:8px}.menu-card p{color:#666;margin-bottom:12px}.menu-card .meta{display:flex;gap:16px;margin-top:12px;font-size:0.85rem;color:#888;flex-wrap:wrap}.loading{text-align:center;padding:40px}.spinner{width:40px;height:40px;border:3px solid #e0ddd5;border-top-color:#c9a959;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}.steps{display:flex;justify-content:center;gap:8px;margin-bottom:30px}.step-dot{width:12px;height:12px;border-radius:50%;background:#e0ddd5}.step-dot.active{background:#c9a959}.step-dot.done{background:#1a3a5c}.checkboxes{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.checkboxes label{display:flex;align-items:center;gap:8px}.checkboxes input{width:auto}.nav{display:flex;justify-content:space-between;margin-top:30px;gap:10px;flex-wrap:wrap}h2{color:#1a3a5c;margin-bottom:20px}.preview{background:#f9f9f7;border-radius:12px;padding:24px;margin-bottom:20px}.preview h4{color:#1a3a5c;margin-bottom:12px}.preview ul{margin-left:20px;color:#555}.preview li{margin-bottom:6px}</style></head><body><div class="container"><div class="header"><h1>Dinner Party Planner</h1><div class="subtitle">Beta</div></div><div class="content"><div class="section active" id="login"><h2>Welcome!</h2><p style="margin-bottom:20px;color:#666">Enter your access code.</p><div class="form-group"><label>Access Code</label><input type="text" id="code" placeholder="Enter code"></div><button class="btn" onclick="login()">Enter</button><div id="loginErr" class="error"></div></div><div class="section" id="app"><div class="steps" id="steps"></div><div class="section active" id="s1"><h2>Your Dinner Party</h2><div class="form-group"><label>Event Name</label><input type="text" id="title" placeholder="Spring Dinner"></div><div class="form-group"><label>Date</label><input type="date" id="date"></div><div class="form-group"><label>Guests</label><input type="number" id="guests" min="2" max="20" value="6"></div><div class="form-group"><label>Budget</label><select id="budget"><option>$75-100</option><option>$100-150</option><option selected>$150-200</option><option>$200-300</option><option>$300+</option></select></div><div class="form-group"><label>Cuisine</label><select id="cuisine"><option>Chef Choice</option><option>French</option><option>Italian</option><option>Mediterranean</option><option>American</option><option>Asian Fusion</option><option>New England</option></select></div><div class="form-group"><label>Occasion</label><select id="occasion"><option>Casual dinner</option><option>Romantic</option><option>Birthday</option><option>Anniversary</option><option>Holiday</option></select></div><div class="form-group"><label>Skill</label><select id="skill"><option>Beginner</option><option selected>Intermediate</option><option>Advanced</option></select></div><div class="form-group"><label>Dietary</label><div class="checkboxes"><label><input type="checkbox" name="diet" value="Gluten-free">Gluten-free</label><label><input type="checkbox" name="diet" value="Dairy-free">Dairy-free</label><label><input type="checkbox" name="diet" value="Vegetarian">Vegetarian</label><label><input type="checkbox" name="diet" value="Vegan">Vegan</label><label><input type="checkbox" name="diet" value="Nut allergy">Nut allergy</label></div></div><div class="form-group"><label>Likes</label><input type="text" id="likes" placeholder="seafood, chocolate"></div><div class="form-group"><label>Dislikes</label><input type="text" id="dislikes" placeholder="cilantro, olives"></div><div class="nav"><div></div><button class="btn" onclick="genMenus()">Generate Menus</button></div></div><div class="section" id="s2"><h2>Choose Menu</h2><div id="menuLoad" class="loading" style="display:none"><div class="spinner"></div><p>Creating menus...</p></div><div id="menus"></div><div id="menuErr" class="error"></div><div class="nav"><button class="btn btn-secondary" onclick="go(1)">Back</button><button class="btn" id="selBtn" onclick="selMenu()" disabled>Select</button></div></div><div class="section" id="s3"><h2>Cookbook</h2><div id="cbLoad" class="loading" style="display:none"><div class="spinner"></div><p>Creating cookbook...</p></div><div id="cbPrev"></div><div id="cbErr" class="error"></div><div class="nav"><button class="btn btn-secondary" onclick="go(2)">Back</button><button class="btn" id="dlBtn" onclick="dl()" disabled>Download DOCX</button></div></div></div></div></div><script>var code="",step=1,sel=null,cb=null;document.getElementById("date").valueAsDate=new Date();function dots(){document.getElementById("steps").innerHTML=[1,2,3].map(n=>"<div class=\\"step-dot"+(n<step?" done":"")+(n==step?" active":"")+"\\"></div>").join("")}function go(s){document.querySelectorAll("#app .section").forEach(e=>e.classList.remove("active"));document.getElementById("s"+s).classList.add("active");step=s;dots();window.scrollTo({top:0,behavior:"smooth"})}function esc(t){if(!t)return"";var d=document.createElement("div");d.textContent=t;return d.innerHTML}async function login(){var c=document.getElementById("code").value.trim(),e=document.getElementById("loginErr");e.textContent="";if(!c){e.textContent="Enter code";return}try{var r=await fetch("/api/validate-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accessCode:c})});var d=await r.json();if(d.valid){code=c;document.getElementById("login").classList.remove("active");document.getElementById("app").classList.add("active");dots()}else e.textContent=d.message||"Invalid"}catch(x){e.textContent="Error"}}async function genMenus(){var l=document.getElementById("menuLoad"),o=document.getElementById("menus"),e=document.getElementById("menuErr");go(2);l.style.display="block";o.innerHTML="";e.textContent="";sel=null;document.getElementById("selBtn").disabled=true;var diet=Array.from(document.querySelectorAll("input[name=diet]:checked")).map(c=>c.value);var p={guestCount:document.getElementById("guests").value,budget:document.getElementById("budget").value,cuisineStyle:document.getElementById("cuisine").value,occasion:document.getElementById("occasion").value,skillLevel:document.getElementById("skill").value,dietaryRestrictions:diet,likes:document.getElementById("likes").value,dislikes:document.getElementById("dislikes").value};try{var r=await fetch("/api/generate-menus",{method:"POST",headers:{"Content-Type":"application/json","x-access-code":code},body:JSON.stringify({preferences:p})});if(!r.ok)throw new Error((await r.json()).error||"Failed");var d=await r.json();l.style.display="none";if(d.menus&&d.menus.length){o.innerHTML=d.menus.map((m,i)=>"<div class=\\"menu-card\\" onclick=\\"pick("+i+")\\" id=\\"m"+i+"\\"><h3>"+esc(m.name)+"</h3><p>"+esc(m.description)+"</p><div>"+m.courses.map(c=>"<div><b>"+esc(c.course)+":</b> "+esc(c.dish)+"</div>").join("")+"</div><div class=\\"meta\\"><span>"+esc(m.estimatedCost)+"</span><span>"+esc(m.prepTime)+"</span><span>"+esc(m.difficulty)+"</span></div></div>").join("");window.menus=d.menus}}catch(x){l.style.display="none";e.textContent=x.message}}function pick(i){document.querySelectorAll(".menu-card").forEach(c=>c.classList.remove("selected"));document.getElementById("m"+i).classList.add("selected");sel=window.menus[i];document.getElementById("selBtn").disabled=false}async function selMenu(){if(!sel)return;var l=document.getElementById("cbLoad"),p=document.getElementById("cbPrev"),e=document.getElementById("cbErr");go(3);l.style.display="block";p.innerHTML="";e.textContent="";document.getElementById("dlBtn").disabled=true;try{var r=await fetch("/api/build-cookbook",{method:"POST",headers:{"Content-Type":"application/json","x-access-code":code},body:JSON.stringify({menu:sel,guestCount:document.getElementById("guests").value,serviceTime:"7:00 PM"})});if(!r.ok)throw new Error((await r.json()).error||"Failed");var d=await r.json();cb=d.cookbook;l.style.display="none";p.innerHTML="<div class=\\"preview\\"><h4>"+esc(sel.name)+" Cookbook</h4><p style=\\"color:#666\\">Ready to download!</p><ul><li>Recipes: "+(cb.recipes?.length||0)+"</li><li>Shopping List</li><li>Day-Before Prep</li><li>Day-Of Timeline</li><li>Wine Pairings</li><li>Table Settings</li><li>Plating Guide</li><li>Chef Secrets</li><li>Checklist</li><li>Image Prompts</li></ul></div>";document.getElementById("dlBtn").disabled=false}catch(x){l.style.display="none";e.textContent=x.message}}async function dl(){var b=document.getElementById("dlBtn");b.disabled=true;b.textContent="...";try{var r=await fetch("/api/generate-docx",{method:"POST",headers:{"Content-Type":"application/json","x-access-code":code},body:JSON.stringify({eventTitle:document.getElementById("title").value||sel.name,eventDate:document.getElementById("date").value,guestCount:document.getElementById("guests").value,menu:sel,cookbook:cb})});if(!r.ok)throw new Error("Failed");var blob=await r.blob();var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=(document.getElementById("title").value||sel.name).replace(/[^a-z0-9]/gi,"_")+".docx";a.click();URL.revokeObjectURL(url)}catch(x){document.getElementById("cbErr").textContent=x.message}finally{b.disabled=false;b.textContent="Download DOCX"}}document.getElementById("code").addEventListener("keypress",e=>{if(e.key=="Enter")login()})</script></body></html>';

app.get('/', function(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.send(CLIENT_HTML);
});

app.listen(PORT, function() {
  console.log('Dinner Party Planner v3');
  console.log('Port: ' + PORT);
  console.log('Codes: ' + validAccessCodes.length);
});

/**
 * Dinner Party Planner - Beta Server v5 (Cadillac Edition)
 * Full features: Personas, Staffing Levels, Timeline Selection, Role-Based Checklists
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

// ============================================================
// PERSONAS - "Rules constrain; personas unlock"
// ============================================================
const PERSONAS = {
  menuGenerator: "You are a James Beard Award-winning chef known for seasonal, ingredient-driven menus. Each course builds on the last with flavors that echo and contrast.",
  recipeBuilder: "You are a Culinary Institute of America instructor. Your recipes are precise with exact measurements and the 'why' behind each step. Use Cook's Country format: WHY IT WORKS, MAKE AHEAD, organized ingredients, numbered instructions.",
  shoppingList: "You are a Bon Appetit food writer. Organize by store section, note substitutions, include visual cues for quality. Specify exact quantities with 15% buffer.",
  prepTimeline: "You are an executive chef who runs flawless service. Backward-schedule from service time, identify dependencies, build in buffer time.",
  winePairings: "You are a Master Sommelier. Give SPECIFIC bottles with producers, not generic varietals. Recommend across price tiers.",
  tableSettings: "You are an Architectural Digest event designer. You understand scale, proportion, sight lines, and the details that elevate a table.",
  platingInstructions: "You are a culinary artist trained in kaiseki. Every plate is a composition—negative space matters, height creates drama.",
  imagePromptDesigner: "You are a commercial food photographer. Think about lighting direction, camera angles, and the story the image tells."
};

// ============================================================
// STAFFING CONFIGURATIONS
// ============================================================
const STAFFING_LEVELS = {
  solo: { id: 'solo', name: 'Solo Cook', icon: '👨‍🍳', description: 'All tasks on you', roles: ['cook'], philosophy: 'Front-load everything. Day-of = assembly only.' },
  helper1: { id: 'helper1', name: '+1 Helper', icon: '👥', description: 'You + helper', roles: ['cook', 'helper'], philosophy: 'Divide and conquer. Helper handles prep and plating.' },
  helper2: { id: 'helper2', name: '+2 Helpers', icon: '👥👤', description: 'Full team', roles: ['cook', 'helper1', 'helper2'], philosophy: 'True team cooking. Dramatically reduced timeline.' },
  chef: { id: 'chef', name: 'Hired Chef', icon: '👨‍🍳⭐', description: 'You host only', roles: ['host', 'chef', 'staff'], philosophy: 'You are the HOST, not the cook.' }
};

// ============================================================
// FRENCH PORTION STANDARDS
// ============================================================
const PORTIONS = {
  amuse: { protein: 1.5, total: 2 },
  first: { protein: 2.5 },
  second: { protein: 3 },
  main: { protein: 4, starch: 3, veg: 2 },
  dessert: { total: 3.5 }
};

// ============================================================
// MIDDLEWARE
// ============================================================
function validateBeta(req, res, next) {
  const endDate = new Date(process.env.BETA_EXPIRY || '2099-12-31');
  if (new Date() > endDate) return res.status(403).json({ error: 'Beta period has ended' });
  const accessCode = req.headers['x-access-code'] || req.body.accessCode;
  if (!accessCode || !validAccessCodes.includes(accessCode)) return res.status(401).json({ error: 'Invalid access code' });
  if (accessCode !== process.env.ADMIN_CODE) {
    const usage = usageTracker.get(accessCode) || { generations: 0 };
    if (usage.generations >= 50) return res.status(403).json({ error: 'Generation limit reached' });
  }
  req.accessCode = accessCode;
  next();
}

function trackUsage(code) {
  const u = usageTracker.get(code) || { generations: 0 };
  u.generations++;
  usageTracker.set(code, u);
}

// ============================================================
// API ROUTES
// ============================================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', codes: validAccessCodes.length }));

app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode || !validAccessCodes.includes(accessCode)) 
    return res.status(401).json({ valid: false, message: 'Invalid access code' });
  const usage = usageTracker.get(accessCode) || { generations: 0 };
  res.json({ valid: true, remaining: accessCode === process.env.ADMIN_CODE ? 'unlimited' : (50 - usage.generations) });
});

app.get('/api/staffing-options', (req, res) => {
  res.json({ staffingLevels: Object.values(STAFFING_LEVELS), portions: PORTIONS });
});

// Generate menus with persona
app.post('/api/generate-menus', validateBeta, async (req, res) => {
  try {
    const { preferences } = req.body;
    const p = preferences || {};
    
    const prompt = `${PERSONAS.menuGenerator}

Generate 5 dinner party menus for ${p.guestCount || 6} guests, budget ${p.budget || '$150-200'}.
Cuisine: ${p.cuisineStyle || "Chef's choice"} | Skill: ${p.skillLevel || 'Intermediate'}
Likes: ${p.likes || 'Not specified'} | Dislikes: ${p.dislikes || 'Not specified'}
Dietary: ${(p.dietaryRestrictions && p.dietaryRestrictions.join(', ')) || 'None'}

FRENCH PORTIONS: Amuse ${PORTIONS.amuse.total}oz, First ${PORTIONS.first.protein}oz, Second ${PORTIONS.second.protein}oz, Main ${PORTIONS.main.protein}oz protein, Dessert ${PORTIONS.dessert.total}oz

Return ONLY a JSON array with 5 menus:
[{
  "name": "Menu name",
  "description": "2-3 sentences about the arc of this menu",
  "courses": [
    { "course": "Amuse-Bouche", "dish": "Name", "description": "Brief", "portion": "2 oz" },
    { "course": "First Course", "dish": "Name", "description": "Brief", "portion": "2.5 oz" },
    { "course": "Second Course", "dish": "Name", "description": "Brief", "portion": "3 oz" },
    { "course": "Main Course", "dish": "Name", "description": "Brief", "portion": "4 oz" },
    { "course": "Dessert", "dish": "Name", "description": "Brief", "portion": "3.5 oz" }
  ],
  "estimatedCost": "$XX-$XX",
  "difficulty": "Easy|Intermediate|Advanced",
  "prepTimeEstimate": { "solo": "X hours", "withHelper": "X hours" },
  "wineStyle": "Wine direction"
}]`;

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

// Generate timeline based on staffing level
app.post('/api/generate-timeline', validateBeta, async (req, res) => {
  try {
    const { menu, guestCount, serviceTime, staffingLevel } = req.body;
    const staffing = STAFFING_LEVELS[staffingLevel] || STAFFING_LEVELS.solo;
    const courses = menu?.courses?.map(c => c.course + ': ' + c.dish).join(', ') || '';
    
    const prompt = `${PERSONAS.prepTimeline}

Create prep timeline for ${guestCount || 6} guests, service ${serviceTime || '7:00 PM'}.
STAFFING: ${staffing.name} | ROLES: ${staffing.roles.join(', ')}
PHILOSOPHY: ${staffing.philosophy}
MENU: ${courses}

Structure to MAXIMIZE PREP-AHEAD:
- 2 DAYS BEFORE: Reductions, marinades, doughs
- 1 DAY BEFORE: Main prep (soups, sauces, veg prep)  
- MORNING OF: Final components, then BREAK
- 2 HOURS BEFORE: Active cooking
- 1 HOUR BEFORE: Final touches
- 30 MIN BEFORE: Plating, ambiance

${staffing.roles.length > 1 ? 'For each time block, separate tasks by role.' : ''}

Return ONLY JSON:
{
  "staffingLevel": "${staffingLevel}",
  "serviceTime": "${serviceTime || '7:00 PM'}",
  "philosophy": "${staffing.philosophy}",
  "timeline": {
    "twoDaysBefore": { "title": "2 Days Before", "duration": "XX min", "tasks": [{ "task": "Name", "duration": "XX min", "role": "cook", "notes": "" }] },
    "oneDayBefore": { "title": "1 Day Before", "duration": "XX", "tasks": [...] },
    "morningOf": { "title": "Morning Of", "duration": "XX", "note": "Then BREAK", "tasks": [...] },
    "twoHoursBefore": { "title": "2 Hours Before", "tasks": [...] },
    "oneHourBefore": { "title": "1 Hour Before", "tasks": [...] },
    "thirtyMinBefore": { "title": "30 Min Before", "tasks": [...] },
    "duringService": { "courseTiming": [{ "course": "Amuse", "serveAt": "7:00 PM", "notes": "" }] }
  },
  "roleChecklists": { "${staffing.roles[0]}": [{ "timeBlock": "2 Days Before", "tasks": ["Task 1"] }] },
  "totalPrepTime": { "beforeDayOf": "X hours", "dayOf": "X hours" }
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 6000, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) return res.status(500).json({ error: 'Timeline generation failed' });
    const data = await response.json();
    const jsonMatch = data.content[0].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse response' });
    res.json({ timeline: JSON.parse(jsonMatch[0]) });
  } catch (e) {
    console.error('Generate timeline error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Build cookbook with all personas
app.post('/api/build-cookbook', validateBeta, async (req, res) => {
  try {
    const { menu, guestCount, serviceTime, staffingLevel } = req.body;
    const courses = menu?.courses?.map(c => c.course + ': ' + c.dish).join('\n') || '';
    const staffing = STAFFING_LEVELS[staffingLevel] || STAFFING_LEVELS.solo;
    
    const prompt = `You are a team of culinary experts creating a cookbook.
EVENT: ${menu?.name || 'Dinner Party'} | GUESTS: ${guestCount || 6} | SERVICE: ${serviceTime || '7:00 PM'}
STAFFING: ${staffing.name}
MENU:
${courses}

Channel each expert. Return ONLY JSON:
{
  "recipes": {
    "dishes": [{
      "course": "Course", "dish": "Name", "servings": "${guestCount}",
      "timing": { "prep": "XX min", "cook": "XX min" },
      "whyItWorks": "2-3 sentences on technique",
      "makeAhead": "What can be done early",
      "ingredients": [{ "item": "Item", "amount": "X oz", "prep": "diced", "notes": "" }],
      "instructions": [{ "step": 1, "action": "Do this", "timing": "X min", "checkpoint": "Should look like" }],
      "chefTips": ["Pro tip"]
    }]
  },
  "wines": {
    "aperitif": { "name": "Specific Producer Wine", "price": "$XX", "notes": "Why" },
    "dinner": [{ "course": "Course", "wine": "Producer Wine", "price": "$XX", "notes": "" }],
    "dessert": { "name": "Wine", "price": "$XX" },
    "estimatedCost": "$XX-$XX"
  },
  "cocktail": {
    "name": "Cocktail Name", "description": "Why it works",
    "ingredients": ["2 oz spirit"], "instructions": "Method",
    "batchRecipe": "For ${guestCount} guests"
  },
  "shopping": {
    "proteins": [{ "item": "Cut", "qty": "Amount", "notes": "What to look for" }],
    "seafood": [], "produce": [], "dairy": [], "pantry": [], "specialty": [],
    "estimatedCost": "$XX-$XX"
  },
  "tableSettings": {
    "style": "Aesthetic",
    "placeSetting": { "left": [], "right": [], "above": [], "glasses": [] },
    "centerpiece": "", "lighting": "", "proTip": ""
  },
  "plating": {
    "courses": [{ "course": "Course", "vessel": "Plate type", "composition": "Where elements go", "sauce": "Application", "garnish": "", "principle": "Visual principle" }]
  },
  "imagePrompts": { "tablescape": "Detailed prompt", "mainCourse": "Detailed prompt" },
  "finalChecklist": { "tableAndAmbiance": [], "kitchen": [], "drinks": [], "host": [] }
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
    const { eventTitle, eventDate, guestCount, menu, cookbook, timeline, staffingLevel } = req.body;
    const docx = require('docx');
    const buffer = await buildDocx(docx, { eventTitle, eventDate, guestCount, menu, cookbook, timeline, staffingLevel });
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

// ============================================================
// DOCX BUILDER
// ============================================================
function s(v) { return v ? String(v) : ''; }

async function buildDocx(docx, data) {
  const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageNumber, PageBreak, LevelFormat } = docx;
  const { eventTitle, eventDate, guestCount, menu, cookbook, timeline, staffingLevel } = data;
  const cb = cookbook || {};
  const staffing = STAFFING_LEVELS[staffingLevel] || STAFFING_LEVELS.solo;
  const content = [];

  // Cover
  content.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
  content.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(s(eventTitle) || "Dinner Party Cookbook")] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: s(eventDate) || new Date().toLocaleDateString(), size: 32, color: "666666" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: (guestCount || 6) + " Guests", size: 28, color: "666666" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: menu?.name || "Custom Menu", size: 36, italics: true, color: "1a3a5c" })] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: staffing.icon + " " + staffing.name, size: 24, color: "1a3a5c" })] }));

  // Menu
  content.push(new Paragraph({ children: [new PageBreak()] }));
  content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("The Menu")] }));
  if (menu?.courses) {
    menu.courses.forEach(c => {
      if (c?.course) {
        content.push(new Paragraph({ spacing: { before: 250 }, children: [new TextRun({ text: s(c.course), bold: true, size: 26, color: "1a3a5c" })] }));
        content.push(new Paragraph({ children: [new TextRun({ text: s(c.dish), size: 28 })] }));
        if (c.description) content.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: s(c.description), italics: true, size: 22, color: "666666" })] }));
      }
    });
  }

  // Wines
  if (cb.wines) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Wine Pairings")] }));
    if (cb.wines.aperitif) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Apéritif: ", bold: true }), new TextRun(s(cb.wines.aperitif.name) + " (" + s(cb.wines.aperitif.price) + ")")] }));
      if (cb.wines.aperitif.notes) content.push(new Paragraph({ children: [new TextRun({ text: s(cb.wines.aperitif.notes), italics: true, size: 22, color: "666666" })] }));
    }
    if (cb.wines.dinner) {
      cb.wines.dinner.forEach(w => {
        content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: s(w.course) + ": ", bold: true }), new TextRun(s(w.wine) + " (" + s(w.price) + ")")] }));
        if (w.notes) content.push(new Paragraph({ children: [new TextRun({ text: s(w.notes), italics: true, size: 22, color: "666666" })] }));
      });
    }
    if (cb.wines.dessert) {
      content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "Dessert: ", bold: true }), new TextRun(s(cb.wines.dessert.name) + " (" + s(cb.wines.dessert.price) + ")")] }));
    }
    if (cb.wines.estimatedCost) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Estimated Wine Budget: " + s(cb.wines.estimatedCost), bold: true, color: "2c5282" })] }));
    }
  }

  // Signature Cocktail
  if (cb.cocktail) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Signature Cocktail")] }));
    content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: s(cb.cocktail.name), bold: true, size: 28, color: "1a3a5c" })] }));
    if (cb.cocktail.description) content.push(new Paragraph({ children: [new TextRun({ text: s(cb.cocktail.description), italics: true, color: "666666" })] }));
    if (cb.cocktail.ingredients?.length) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Ingredients:", bold: true })] }));
      cb.cocktail.ingredients.forEach(i => content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })));
    }
    if (cb.cocktail.instructions) content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "Method: ", bold: true }), new TextRun(s(cb.cocktail.instructions))] }));
    if (cb.cocktail.batchRecipe) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Batch Recipe:", bold: true, color: "2c5282" })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.cocktail.batchRecipe), size: 22 })] }));
    }
  }

  // Shopping
  if (cb.shopping) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Shopping List")] }));
    ['proteins', 'seafood', 'produce', 'dairy', 'pantry', 'specialty'].forEach(cat => {
      const items = cb.shopping[cat];
      if (items?.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: cat.charAt(0).toUpperCase() + cat.slice(1), bold: true, size: 24, color: "2c5282" })] }));
        items.forEach(item => {
          const text = item.item ? s(item.item) + " — " + s(item.qty) : s(item);
          content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text, size: 22 })] }));
        });
      }
    });
  }

  // Recipes
  if (cb.recipes?.dishes) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Complete Recipes")] }));
    cb.recipes.dishes.forEach((r, idx) => {
      if (!r) return;
      if (idx > 0) content.push(new Paragraph({ children: [new PageBreak()] }));
      content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s(r.course) + ": " + s(r.dish))] }));
      
      if (r.timing) {
        content.push(new Paragraph({ children: [new TextRun({ text: "Prep: " + s(r.timing.prep) + " | Cook: " + s(r.timing.cook), italics: true, size: 22, color: "666666" })] }));
      }
      if (r.whyItWorks) {
        content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "WHY IT WORKS: ", bold: true, color: "2c5282" }), new TextRun(s(r.whyItWorks))] }));
      }
      if (r.makeAhead) {
        content.push(new Paragraph({ children: [new TextRun({ text: "MAKE AHEAD: ", bold: true, color: "996600" }), new TextRun({ text: s(r.makeAhead), italics: true })] }));
      }
      if (r.ingredients?.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Ingredients", bold: true, size: 24 })] }));
        r.ingredients.forEach(i => {
          const text = i.item ? s(i.amount) + " " + s(i.item) + (i.prep ? ", " + s(i.prep) : "") : s(i);
          content.push(new Paragraph({ numbering: { reference: "bullet", level: 0 }, children: [new TextRun({ text, size: 22 })] }));
        });
      }
      if (r.instructions?.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Instructions", bold: true, size: 24 })] }));
        r.instructions.forEach(i => {
          const text = i.action ? s(i.action) + (i.timing ? " (" + s(i.timing) + ")" : "") : s(i);
          content.push(new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text, size: 22 })] }));
        });
      }
    });
  }

  // Timeline
  if (timeline?.timeline) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Prep Timeline")] }));
    content.push(new Paragraph({ children: [new TextRun({ text: staffing.philosophy, italics: true, size: 22, color: "666666" })] }));
    
    ['twoDaysBefore', 'oneDayBefore', 'morningOf', 'twoHoursBefore', 'oneHourBefore', 'thirtyMinBefore'].forEach(block => {
      const tb = timeline.timeline[block];
      if (tb?.tasks?.length) {
        content.push(new Paragraph({ spacing: { before: 250 }, children: [new TextRun({ text: s(tb.title), bold: true, size: 26, color: "1a3a5c" })] }));
        tb.tasks.forEach(t => {
          const role = t.role && staffing.roles.length > 1 ? "[" + s(t.role).toUpperCase() + "] " : "";
          content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: role + s(t.task) + (t.duration ? " (" + s(t.duration) + ")" : ""), size: 22 })] }));
        });
      }
    });
  }

  // Final Checklist
  if (cb.finalChecklist) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Final Checklist")] }));
    ['tableAndAmbiance', 'kitchen', 'drinks', 'host'].forEach(cat => {
      const items = cb.finalChecklist[cat];
      if (items?.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: cat.replace(/([A-Z])/g, ' $1').trim(), bold: true, size: 24, color: "2c5282" })] }));
        items.forEach(i => content.push(new Paragraph({ numbering: { reference: "checkbox", level: 0 }, children: [new TextRun({ text: s(i), size: 22 })] })));
      }
    });
  }

  // Table Settings
  if (cb.tableSettings) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table Setting Guide")] }));
    if (cb.tableSettings.style) content.push(new Paragraph({ children: [new TextRun({ text: s(cb.tableSettings.style), italics: true, size: 24, color: "666666" })] }));
    if (cb.tableSettings.placeSetting) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Place Setting", bold: true, size: 24, color: "2c5282" })] }));
      const ps = cb.tableSettings.placeSetting;
      if (ps.left?.length) content.push(new Paragraph({ children: [new TextRun({ text: "Left: ", bold: true }), new TextRun(ps.left.join(", "))] }));
      if (ps.right?.length) content.push(new Paragraph({ children: [new TextRun({ text: "Right: ", bold: true }), new TextRun(ps.right.join(", "))] }));
      if (ps.above?.length) content.push(new Paragraph({ children: [new TextRun({ text: "Above: ", bold: true }), new TextRun(ps.above.join(", "))] }));
      if (ps.glasses?.length) content.push(new Paragraph({ children: [new TextRun({ text: "Glasses: ", bold: true }), new TextRun(ps.glasses.join(", "))] }));
    }
    if (cb.tableSettings.centerpiece) content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "Centerpiece: ", bold: true }), new TextRun(s(cb.tableSettings.centerpiece))] }));
    if (cb.tableSettings.lighting) content.push(new Paragraph({ children: [new TextRun({ text: "Lighting: ", bold: true }), new TextRun(s(cb.tableSettings.lighting))] }));
    if (cb.tableSettings.proTip) content.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "Pro Tip: " + s(cb.tableSettings.proTip), italics: true, color: "996600" })] }));
  }

  // Plating Guide
  if (cb.plating?.courses?.length) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Plating Guide")] }));
    cb.plating.courses.forEach(p => {
      if (p?.course) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: s(p.course), bold: true, size: 26, color: "1a3a5c" })] }));
        if (p.vessel) content.push(new Paragraph({ children: [new TextRun({ text: "Plate: ", bold: true }), new TextRun(s(p.vessel))] }));
        if (p.composition) content.push(new Paragraph({ children: [new TextRun({ text: "Composition: ", bold: true }), new TextRun(s(p.composition))] }));
        if (p.sauce) content.push(new Paragraph({ children: [new TextRun({ text: "Sauce: ", bold: true }), new TextRun(s(p.sauce))] }));
        if (p.garnish) content.push(new Paragraph({ children: [new TextRun({ text: "Garnish: ", bold: true }), new TextRun(s(p.garnish))] }));
        if (p.principle) content.push(new Paragraph({ children: [new TextRun({ text: "Visual Principle: " + s(p.principle), italics: true, color: "996600" })] }));
      }
    });
  }

  // AI Image Prompts
  if (cb.imagePrompts) {
    content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("AI Image Prompts")] }));
    content.push(new Paragraph({ children: [new TextRun({ text: "Use with Midjourney, DALL-E, or other AI image generators.", italics: true, color: "666666" })] }));
    if (cb.imagePrompts.tablescape) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Tablescape Shot", bold: true, color: "2c5282" })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.imagePrompts.tablescape), size: 20 })] }));
    }
    if (cb.imagePrompts.mainCourse) {
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Main Course Shot", bold: true, color: "2c5282" })] }));
      content.push(new Paragraph({ children: [new TextRun({ text: s(cb.imagePrompts.mainCourse), size: 20 })] }));
    }
  }

  // Closing
  content.push(new Paragraph({ children: [new PageBreak()] }));
  content.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [new TextRun({ text: "Bon Appétit!", size: 48, bold: true, color: "1a3a5c" })] }));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Georgia", size: 24 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { size: 56, bold: true, color: "1a3a5c" }, paragraph: { alignment: AlignmentType.CENTER } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", run: { size: 36, bold: true, color: "1a3a5c" }, paragraph: { spacing: { before: 400, after: 200 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", run: { size: 28, bold: true, color: "2c5282" }, paragraph: { spacing: { before: 300, after: 150 } } }
      ]
    },
    numbering: {
      config: [
        { reference: "checkbox", levels: [{ level: 0, format: LevelFormat.BULLET, text: "☐", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "bullet", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
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

// ============================================================
// CLIENT HTML
// ============================================================
const CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dinner Party Planner - Beta</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Lora:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --navy: #1a3a5c; --gold: #c9a959; --cream: #faf8f3; --text: #2c3e50; --text-light: #5a6c7d; --success: #2d6a4f; --error: #c0392b; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Lora', serif; background: linear-gradient(135deg, var(--navy) 0%, #0f2438 100%); min-height: 100vh; padding: 20px; color: var(--text); }
    .container { max-width: 900px; margin: 0 auto; background: var(--cream); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); overflow: hidden; }
    .header { background: var(--navy); color: var(--cream); padding: 40px; text-align: center; border-bottom: 4px solid var(--gold); }
    .header h1 { font-family: 'Playfair Display', serif; font-size: 2rem; margin-bottom: 8px; }
    .header .subtitle { color: var(--gold); font-size: 0.8rem; letter-spacing: 0.2em; text-transform: uppercase; }
    .content { padding: 35px; }
    .progress { display: flex; justify-content: center; gap: 10px; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #e0dcd4; flex-wrap: wrap; }
    .progress-step { display: flex; align-items: center; gap: 6px; }
    .progress-dot { width: 28px; height: 28px; border-radius: 50%; background: #e0dcd4; display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display'; font-weight: 600; font-size: 0.85rem; color: var(--text-light); }
    .progress-dot.active { background: var(--gold); color: var(--navy); transform: scale(1.1); }
    .progress-dot.done { background: var(--navy); color: var(--cream); }
    .progress-label { font-size: 0.7rem; color: var(--text-light); }
    .progress-line { width: 25px; height: 2px; background: #e0dcd4; }
    .section { display: none; animation: fadeIn 0.3s; }
    .section.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    h2 { font-family: 'Playfair Display'; font-size: 1.5rem; color: var(--navy); margin-bottom: 8px; }
    .section-desc { color: var(--text-light); margin-bottom: 20px; font-size: 0.9rem; }
    .form-row { display: grid; gap: 15px; margin-bottom: 15px; }
    @media (min-width: 600px) { .form-row.two { grid-template-columns: 1fr 1fr; } .form-row.three { grid-template-columns: 1fr 1fr 1fr; } }
    .form-group label { display: block; margin-bottom: 5px; font-weight: 500; color: var(--navy); font-size: 0.85rem; }
    .form-group input, .form-group select { width: 100%; padding: 10px 12px; border: 2px solid #e0dcd4; border-radius: 6px; font-family: inherit; font-size: 0.9rem; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: var(--gold); }
    .checkbox-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
    .checkbox-item { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: white; border: 2px solid #e0dcd4; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
    .checkbox-item:hover { border-color: var(--gold); }
    .checkbox-item.checked { border-color: var(--gold); background: rgba(201,169,89,0.1); }
    .staffing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 15px; }
    .staffing-card { background: white; border: 2px solid #e0dcd4; border-radius: 10px; padding: 15px; cursor: pointer; text-align: center; }
    .staffing-card:hover { border-color: var(--gold); }
    .staffing-card.selected { border-color: var(--navy); background: rgba(26,58,92,0.05); }
    .staffing-card .icon { font-size: 1.5rem; margin-bottom: 5px; }
    .staffing-card .name { font-weight: 600; color: var(--navy); font-size: 0.9rem; }
    .staffing-card .desc { font-size: 0.75rem; color: var(--text-light); }
    .btn { padding: 12px 24px; border: none; border-radius: 6px; font-family: inherit; font-size: 0.9rem; font-weight: 500; cursor: pointer; }
    .btn-primary { background: var(--navy); color: var(--cream); }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: var(--gold); color: var(--navy); }
    .btn-outline { background: transparent; color: var(--navy); border: 2px solid var(--navy); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-row { display: flex; justify-content: space-between; gap: 10px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e0dcd4; flex-wrap: wrap; }
    .menu-grid { display: grid; gap: 12px; }
    .menu-card { background: white; border: 2px solid #e0dcd4; border-radius: 10px; padding: 18px; cursor: pointer; position: relative; }
    .menu-card:hover { border-color: var(--gold); }
    .menu-card.selected { border-color: var(--navy); }
    .menu-card.selected::after { content: '✓'; position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; background: var(--navy); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    .menu-card h3 { font-family: 'Playfair Display'; font-size: 1.1rem; color: var(--navy); margin-bottom: 5px; }
    .menu-card .desc { color: var(--text-light); font-size: 0.85rem; margin-bottom: 12px; }
    .menu-card .course { padding: 6px 0; border-bottom: 1px solid #e0dcd4; }
    .menu-card .course:last-child { border-bottom: none; }
    .menu-card .course-label { font-size: 0.6rem; text-transform: uppercase; color: var(--gold); font-weight: 600; }
    .menu-card .course-name { font-weight: 600; color: var(--navy); font-size: 0.9rem; }
    .menu-card .meta { display: flex; gap: 10px; padding-top: 10px; border-top: 1px solid #e0dcd4; font-size: 0.7rem; color: var(--text-light); flex-wrap: wrap; }
    .timeline-preview { background: white; border: 2px solid #e0dcd4; border-radius: 10px; padding: 20px; margin-bottom: 15px; }
    .timeline-preview h3 { font-family: 'Playfair Display'; font-size: 1.2rem; color: var(--navy); margin-bottom: 5px; }
    .timeline-preview .philosophy { color: var(--text-light); font-style: italic; margin-bottom: 15px; font-size: 0.85rem; }
    .time-block { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e0dcd4; }
    .time-block:last-child { border-bottom: none; }
    .time-block-title { font-weight: 600; color: var(--navy); font-size: 0.9rem; margin-bottom: 5px; }
    .time-block-tasks { font-size: 0.8rem; color: var(--text-light); }
    .loading { text-align: center; padding: 40px; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e0dcd4; border-top-color: var(--gold); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .cookbook-preview { background: white; border-radius: 10px; padding: 20px; margin-bottom: 15px; border: 2px solid #e0dcd4; }
    .cookbook-preview h3 { font-family: 'Playfair Display'; font-size: 1.2rem; color: var(--navy); margin-bottom: 10px; }
    .cookbook-preview .ready-msg { color: var(--success); font-weight: 500; margin-bottom: 12px; }
    .cookbook-preview ul { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
    .cookbook-preview li { padding: 8px 10px; background: var(--cream); border-radius: 5px; font-size: 0.8rem; }
    .cookbook-preview li::before { content: '✓ '; color: var(--success); }
    .error { color: var(--error); margin-top: 12px; padding: 10px; background: rgba(192,57,43,0.1); border-radius: 5px; font-size: 0.85rem; }
    .login-box { max-width: 350px; margin: 0 auto; text-align: center; }
    .login-box .form-group { text-align: left; margin-bottom: 15px; }
    .login-box .btn { width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Dinner Party Planner</h1>
      <div class="subtitle">Create Memorable Culinary Experiences • BETA</div>
    </div>
    <div class="content">
      <div class="section active" id="loginSection">
        <div class="login-box">
          <h2>Welcome!</h2>
          <p class="section-desc">Enter your access code to begin.</p>
          <div class="form-group">
            <label>Access Code</label>
            <input type="text" id="accessCode" placeholder="Enter code">
          </div>
          <button class="btn btn-primary" onclick="validateCode()">Begin</button>
          <div id="loginError" class="error" style="display:none"></div>
        </div>
      </div>
      <div class="section" id="appSection">
        <div class="progress" id="progress"></div>
        <div class="section active" id="step1">
          <h2>Event Details</h2>
          <p class="section-desc">Tell us about your dinner party.</p>
          <div class="form-row two">
            <div class="form-group"><label>Event Name</label><input type="text" id="eventTitle" placeholder="Spring Garden Dinner"></div>
            <div class="form-group"><label>Date</label><input type="date" id="eventDate"></div>
          </div>
          <div class="form-row three">
            <div class="form-group"><label>Guests</label><input type="number" id="guestCount" min="2" max="24" value="6"></div>
            <div class="form-group"><label>Service Time</label><select id="serviceTime"><option>6:00 PM</option><option>6:30 PM</option><option selected>7:00 PM</option><option>7:30 PM</option><option>8:00 PM</option></select></div>
            <div class="form-group"><label>Budget</label><select id="budget"><option>$75-100</option><option>$100-150</option><option selected>$150-200</option><option>$200-300</option><option>$300+</option></select></div>
          </div>
          <div class="form-row two">
            <div class="form-group"><label>Cuisine</label><select id="cuisineStyle"><option>Chef's Choice</option><option>French Bistro</option><option>Italian</option><option>Mediterranean</option><option>Modern American</option><option>New England</option><option>Asian Fusion</option></select></div>
            <div class="form-group"><label>Skill Level</label><select id="skillLevel"><option>Beginner</option><option selected>Intermediate</option><option>Advanced</option></select></div>
          </div>
          <div class="form-group">
            <label>Dietary Restrictions</label>
            <div class="checkbox-grid">
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Gluten-free"> Gluten-free</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Dairy-free"> Dairy-free</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Vegetarian"> Vegetarian</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Nut allergy"> Nut Allergy</label>
            </div>
          </div>
          <div class="form-row two">
            <div class="form-group"><label>Likes</label><input type="text" id="likes" placeholder="seafood, mushrooms"></div>
            <div class="form-group"><label>Dislikes</label><input type="text" id="dislikes" placeholder="cilantro, olives"></div>
          </div>
          <div class="btn-row"><div></div><button class="btn btn-primary" onclick="generateMenus()">Generate Menus →</button></div>
        </div>
        <div class="section" id="step2">
          <h2>Choose Your Menu</h2>
          <p class="section-desc">Select the menu that fits your vision.</p>
          <div id="menuLoading" class="loading" style="display:none"><div class="spinner"></div><p>Creating menus...</p></div>
          <div id="menuGrid" class="menu-grid"></div>
          <div id="menuError" class="error" style="display:none"></div>
          <div class="btn-row"><button class="btn btn-outline" onclick="goToStep(1)">← Back</button><button class="btn btn-primary" id="selectMenuBtn" onclick="goToStep(3)" disabled>Choose Staffing →</button></div>
        </div>
        <div class="section" id="step3">
          <h2>Staffing & Timeline</h2>
          <p class="section-desc">Select your help level, then review the timeline.</p>
          <div class="staffing-grid" id="staffingGrid"></div>
          <div id="timelineLoading" class="loading" style="display:none"><div class="spinner"></div><p>Building timeline...</p></div>
          <div id="timelinePreview"></div>
          <div id="timelineError" class="error" style="display:none"></div>
          <div class="btn-row"><button class="btn btn-outline" onclick="goToStep(2)">← Back</button><button class="btn btn-primary" id="acceptTimelineBtn" onclick="acceptTimeline()" disabled>Accept & Build Cookbook →</button></div>
        </div>
        <div class="section" id="step4">
          <h2>Your Cookbook</h2>
          <p class="section-desc">Your complete dinner party guide is ready.</p>
          <div id="cookbookLoading" class="loading" style="display:none"><div class="spinner"></div><p>Creating cookbook...</p></div>
          <div id="cookbookPreview"></div>
          <div id="cookbookError" class="error" style="display:none"></div>
          <div class="btn-row"><button class="btn btn-outline" onclick="goToStep(3)">← Back</button><button class="btn btn-secondary" id="downloadBtn" onclick="downloadDocx()" disabled>Download Cookbook (DOCX)</button></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    let accessCode='', currentStep=1, selectedMenu=null, selectedStaffing='solo', timeline=null, cookbook=null, menus=[];
    const staffingLevels=[{id:'solo',name:'Solo Cook',icon:'👨‍🍳',description:'All tasks on you'},{id:'helper1',name:'+1 Helper',icon:'👥',description:'You + helper'},{id:'helper2',name:'+2 Helpers',icon:'👥👤',description:'Full team'},{id:'chef',name:'Hired Chef',icon:'👨‍🍳⭐',description:'You host only'}];
    document.getElementById('eventDate').valueAsDate=new Date();
    document.querySelectorAll('.checkbox-item input').forEach(cb=>cb.addEventListener('change',function(){this.closest('.checkbox-item').classList.toggle('checked',this.checked)}));
    function updateProgress(){const steps=[{n:1,l:'Details'},{n:2,l:'Menu'},{n:3,l:'Timeline'},{n:4,l:'Cookbook'}];document.getElementById('progress').innerHTML=steps.map((s,i,a)=>'<div class="progress-step"><div class="progress-dot '+(s.n<currentStep?'done':'')+(s.n===currentStep?'active':'')+'">'+s.n+'</div><span class="progress-label">'+s.l+'</span></div>'+(i<a.length-1?'<div class="progress-line"></div>':'')).join('')}
    function goToStep(n){document.querySelectorAll('#appSection>.section').forEach(s=>s.classList.remove('active'));document.getElementById('step'+n).classList.add('active');currentStep=n;updateProgress();if(n===3&&!document.getElementById('staffingGrid').innerHTML)renderStaffingOptions();window.scrollTo({top:0,behavior:'smooth'})}
    function esc(t){if(!t)return'';const d=document.createElement('div');d.textContent=t;return d.innerHTML}
    async function validateCode(){const code=document.getElementById('accessCode').value.trim(),err=document.getElementById('loginError');err.style.display='none';if(!code){err.textContent='Enter code';err.style.display='block';return}try{const r=await fetch('/api/validate-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode:code})});const d=await r.json();if(d.valid){accessCode=code;document.getElementById('loginSection').classList.remove('active');document.getElementById('appSection').classList.add('active');updateProgress()}else{err.textContent=d.message||'Invalid';err.style.display='block'}}catch(e){err.textContent='Error';err.style.display='block'}}
    async function generateMenus(){goToStep(2);const load=document.getElementById('menuLoading'),grid=document.getElementById('menuGrid'),err=document.getElementById('menuError');load.style.display='block';grid.innerHTML='';err.style.display='none';selectedMenu=null;document.getElementById('selectMenuBtn').disabled=true;const dietary=Array.from(document.querySelectorAll('input[name="dietary"]:checked')).map(c=>c.value);const prefs={guestCount:document.getElementById('guestCount').value,budget:document.getElementById('budget').value,cuisineStyle:document.getElementById('cuisineStyle').value,skillLevel:document.getElementById('skillLevel').value,dietaryRestrictions:dietary,likes:document.getElementById('likes').value,dislikes:document.getElementById('dislikes').value};try{const r=await fetch('/api/generate-menus',{method:'POST',headers:{'Content-Type':'application/json','x-access-code':accessCode},body:JSON.stringify({preferences:prefs})});if(!r.ok)throw new Error((await r.json()).error||'Failed');const d=await r.json();load.style.display='none';menus=d.menus||[];if(menus.length)grid.innerHTML=menus.map((m,i)=>'<div class="menu-card" onclick="pickMenu('+i+')" id="menu'+i+'"><h3>'+esc(m.name)+'</h3><p class="desc">'+esc(m.description)+'</p><div class="courses">'+(m.courses||[]).map(c=>'<div class="course"><div class="course-label">'+esc(c.course)+'</div><div class="course-name">'+esc(c.dish)+'</div></div>').join('')+'</div><div class="meta"><span><b>Cost:</b> '+esc(m.estimatedCost)+'</span><span><b>Prep:</b> '+(m.prepTimeEstimate?.solo||m.prepTime||'')+'</span></div></div>').join('')}catch(e){load.style.display='none';err.textContent=e.message;err.style.display='block'}}
    function pickMenu(i){document.querySelectorAll('.menu-card').forEach(c=>c.classList.remove('selected'));document.getElementById('menu'+i).classList.add('selected');selectedMenu=menus[i];document.getElementById('selectMenuBtn').disabled=false}
    function renderStaffingOptions(){document.getElementById('staffingGrid').innerHTML=staffingLevels.map(s=>'<div class="staffing-card'+(s.id===selectedStaffing?' selected':'')+'" onclick="selectStaffing(\\\''+s.id+'\\\')"><div class="icon">'+s.icon+'</div><div class="name">'+s.name+'</div><div class="desc">'+s.description+'</div></div>').join('')}
    async function selectStaffing(id){selectedStaffing=id;renderStaffingOptions();const load=document.getElementById('timelineLoading'),preview=document.getElementById('timelinePreview'),err=document.getElementById('timelineError');load.style.display='block';preview.innerHTML='';err.style.display='none';document.getElementById('acceptTimelineBtn').disabled=true;try{const r=await fetch('/api/generate-timeline',{method:'POST',headers:{'Content-Type':'application/json','x-access-code':accessCode},body:JSON.stringify({menu:selectedMenu,guestCount:document.getElementById('guestCount').value,serviceTime:document.getElementById('serviceTime').value,staffingLevel:selectedStaffing})});if(!r.ok)throw new Error((await r.json()).error||'Failed');const d=await r.json();timeline=d.timeline;load.style.display='none';const tl=timeline.timeline;preview.innerHTML='<div class="timeline-preview"><h3>'+esc(timeline.staffingLevel)+' Timeline</h3><p class="philosophy">'+esc(timeline.philosophy)+'</p>'+['twoDaysBefore','oneDayBefore','morningOf','twoHoursBefore','oneHourBefore','thirtyMinBefore'].filter(b=>tl[b]?.tasks?.length).map(b=>'<div class="time-block"><div class="time-block-title">'+esc(tl[b].title)+'</div><div class="time-block-tasks">'+tl[b].tasks.slice(0,3).map(t=>esc(t.task||t)).join(' • ')+(tl[b].tasks.length>3?' ...':'')+'</div></div>').join('')+'</div>';document.getElementById('acceptTimelineBtn').disabled=false}catch(e){load.style.display='none';err.textContent=e.message;err.style.display='block'}}
    async function acceptTimeline(){goToStep(4);const load=document.getElementById('cookbookLoading'),preview=document.getElementById('cookbookPreview'),err=document.getElementById('cookbookError');load.style.display='block';preview.innerHTML='';err.style.display='none';document.getElementById('downloadBtn').disabled=true;try{const r=await fetch('/api/build-cookbook',{method:'POST',headers:{'Content-Type':'application/json','x-access-code':accessCode},body:JSON.stringify({menu:selectedMenu,guestCount:document.getElementById('guestCount').value,serviceTime:document.getElementById('serviceTime').value,staffingLevel:selectedStaffing})});if(!r.ok)throw new Error((await r.json()).error||'Failed');const d=await r.json();cookbook=d.cookbook;load.style.display='none';preview.innerHTML='<div class="cookbook-preview"><h3>'+esc(selectedMenu.name)+'</h3><p class="ready-msg">✓ Your cookbook is ready!</p><ul><li>Recipes ('+(cookbook.recipes?.dishes?.length||0)+')</li><li>Wine Pairings</li><li>Shopping List</li><li>Timeline</li><li>Table Settings</li><li>Plating Guide</li><li>Final Checklist</li></ul></div>';document.getElementById('downloadBtn').disabled=false}catch(e){load.style.display='none';err.textContent=e.message;err.style.display='block'}}
    async function downloadDocx(){const btn=document.getElementById('downloadBtn');btn.disabled=true;btn.textContent='Generating...';try{const r=await fetch('/api/generate-docx',{method:'POST',headers:{'Content-Type':'application/json','x-access-code':accessCode},body:JSON.stringify({eventTitle:document.getElementById('eventTitle').value||selectedMenu.name,eventDate:document.getElementById('eventDate').value,guestCount:document.getElementById('guestCount').value,menu:selectedMenu,cookbook:cookbook,timeline:timeline,staffingLevel:selectedStaffing})});if(!r.ok)throw new Error('Failed');const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(document.getElementById('eventTitle').value||selectedMenu.name).replace(/[^a-z0-9]/gi,'_')+'_Cookbook.docx';a.click();URL.revokeObjectURL(url)}catch(e){document.getElementById('cookbookError').textContent=e.message;document.getElementById('cookbookError').style.display='block'}finally{btn.disabled=false;btn.textContent='Download Cookbook (DOCX)'}}
    document.getElementById('accessCode').addEventListener('keypress',e=>{if(e.key==='Enter')validateCode()});
  </script>
</body>
</html>`;

app.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(CLIENT_HTML); });

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Dinner Party Planner - Beta v5       ║');
  console.log('║   Cadillac Edition                     ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║  Port: ' + PORT + '                             ║');
  console.log('║  Codes: ' + validAccessCodes.length + '                              ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});

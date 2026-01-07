const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, PageBreak, LevelFormat } = require('docx');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN2024';
const ACCESS_CODES = (process.env.ACCESS_CODES || 'BETA001,BETA002,BETA003').split(',').map(c => c.trim());
const BETA_EXPIRY = process.env.BETA_EXPIRY || '2026-03-01';
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || '50');

const usageStats = {};
global.cookbooks = {};

// Data
const CUISINES = {
  american: { label: 'American', regions: ['Southern', 'New England', 'Pacific Northwest', 'California', 'Midwest', 'Southwest'], styles: ['BBQ', 'Soul Food', 'Tex-Mex', 'Cajun/Creole', 'Farm-to-Table'] },
  european: { label: 'European', countries: { france: { label: 'France', regions: ['Provence', 'Burgundy', 'Lyon', 'Paris Bistro'] }, italy: { label: 'Italy', regions: ['Tuscany', 'Sicily', 'Piedmont', 'Rome'] }, spain: { label: 'Spain', regions: ['Basque', 'Catalonia', 'Andalusia'] } } },
  asian: { label: 'Asian', countries: { china: { label: 'Chinese', regions: ['Cantonese', 'Sichuan', 'Shanghai'] }, japan: { label: 'Japanese', regions: ['Tokyo', 'Osaka', 'Kaiseki'] }, thailand: { label: 'Thai', regions: ['Bangkok', 'Northern', 'Southern'] } } },
  mexican: { label: 'Mexican', regions: ['Oaxaca', 'Yucatan', 'Mexico City'], styles: ['Traditional', 'Contemporary'] },
  middleEastern: { label: 'Middle Eastern', regions: ['Lebanese', 'Persian', 'Moroccan', 'Turkish'] },
  mediterranean: { label: 'Mediterranean', regions: ['Greek Isles', 'Coastal Italian', 'Southern French'] }
};

const MENU_INSPIRATIONS = [
  { id: 'chefs-tasting', icon: '👨‍🍳', title: "Chef's Tasting", desc: 'Elegant multi-course' },
  { id: 'adventurous', icon: '🌍', title: 'Adventurous', desc: 'Bold global flavors' },
  { id: 'garden', icon: '🥗', title: 'Garden to Table', desc: 'Fresh, seasonal' },
  { id: 'comfort', icon: '🏠', title: 'What Mom Made', desc: 'Comfort elevated' },
  { id: 'seasonal', icon: '🌱', title: "What's In Season", desc: 'Peak freshness' },
  { id: 'restaurant', icon: '🍽️', title: 'From Restaurants', desc: 'Recreate favorites' },
  { id: 'michelin', icon: '⭐', title: 'Michelin Inspired', desc: 'Fine dining at home' },
  { id: 'holiday', icon: '🎄', title: 'Holiday Traditional', desc: 'Festive celebrations' }
];

const MENU_STYLES = [
  { id: 'classic', name: 'Classic Formal', desc: 'Timeless elegance' },
  { id: 'modern', name: 'Modern Minimalist', desc: 'Clean, contemporary' },
  { id: 'romantic', name: 'Romantic Elegance', desc: 'Soft, intimate' },
  { id: 'rustic', name: 'Rustic Elegant', desc: 'Natural warmth' },
  { id: 'coastal', name: 'Coastal Elegance', desc: 'Nautical sophistication' }
];

const STAFFING = [
  { id: 'solo', name: 'Solo Cook', icon: '👨‍🍳', desc: 'All tasks on you', activeMin: 185 },
  { id: 'helper1', name: '+1 Helper', icon: '👥', desc: 'You lead, helper preps', activeMin: 95 },
  { id: 'helper2', name: '+2 Helpers', icon: '👥👤', desc: 'Parallel prep', activeMin: 65 },
  { id: 'chef', name: 'Hired Chef', icon: '👨‍🍳⭐', desc: 'Professionals handle it', activeMin: 15 }
];

const AVERY_PRODUCTS = {
  placeCards: [{ sku: '5302', name: 'Small Tent Cards', size: '2" x 3.5"', perSheet: 4 }, { sku: '5309', name: 'Large Tent Cards', size: '3.5" x 11"', perSheet: 1 }],
  menuCards: [{ sku: '8315', name: 'Note Cards', size: '4.25" x 5.5"', perSheet: 2 }, { sku: '3265', name: 'Half-Fold Cards', size: '5.5" x 8.5"', perSheet: 1 }],
  invitations: [{ sku: '8315', name: 'Note Cards', size: '4.25" x 5.5"', perSheet: 2 }]
};

const PERSONAS = {
  chef: { name: 'The Chef', icon: '👨‍🍳', systemPrompt: 'You are a James Beard Award-winning chef helping plan a dinner party. Be passionate and knowledgeable about seasonal ingredients.' },
  sommelier: { name: 'The Sommelier', icon: '🍷', systemPrompt: 'You are a Master Sommelier helping plan wine pairings. Be knowledgeable but approachable.' },
  instructor: { name: 'The Instructor', icon: '📚', systemPrompt: 'You are a CIA culinary instructor helping with execution and timing. Be precise and practical.' },
  all: { name: 'The Team', icon: '👨‍🍳🍷📚', systemPrompt: 'You are a team of Chef, Sommelier, and Instructor. Use their titles when switching voices.' }
};

const DEMO_MENUS = [
  { id: 1, title: "Spring Garden Elegance", personality: "Light, seasonal, farm-to-table", foodCost: "$45-55/person", wineCost: "$120 total", courses: [{ type: "Amuse-Bouche", name: "Chive Blossoms with Lemon Crème Fraîche", wine: null }, { type: "First Course", name: "Chilled English Pea Soup with Mint Oil", wine: "Sancerre" }, { type: "Second Course", name: "Butter Lettuce Salad with Shaved Radish", wine: null }, { type: "Main Course", name: "Herb-Crusted Rack of Lamb", wine: "Châteauneuf-du-Pape" }, { type: "Dessert", name: "Meyer Lemon Posset", wine: "Moscato d'Asti" }] },
  { id: 2, title: "Tuscan Summer Evening", personality: "Rustic Italian warmth", foodCost: "$50-60/person", wineCost: "$140 total", courses: [{ type: "Amuse-Bouche", name: "Burrata with San Marzano Tomato", wine: null }, { type: "First Course", name: "Wild Mushroom Risotto", wine: "Vernaccia" }, { type: "Second Course", name: "Arugula & Shaved Parmesan", wine: null }, { type: "Main Course", name: "Bistecca alla Fiorentina", wine: "Brunello" }, { type: "Dessert", name: "Panna Cotta with Berries", wine: "Vin Santo" }] },
  { id: 3, title: "French Bistro Classic", personality: "Timeless Parisian elegance", foodCost: "$55-65/person", wineCost: "$150 total", courses: [{ type: "Amuse-Bouche", name: "Gougères", wine: null }, { type: "First Course", name: "French Onion Soup", wine: "Côtes du Rhône" }, { type: "Second Course", name: "Salade Lyonnaise", wine: null }, { type: "Main Course", name: "Coq au Vin", wine: "Burgundy" }, { type: "Dessert", name: "Tarte Tatin", wine: "Sauternes" }] },
  { id: 4, title: "New England Coastal", personality: "Fresh Atlantic seafood", foodCost: "$60-75/person", wineCost: "$150 total", courses: [{ type: "Amuse-Bouche", name: "Oysters with Mignonette", wine: null }, { type: "First Course", name: "Lobster Bisque", wine: "Chablis" }, { type: "Second Course", name: "Baby Spinach Salad", wine: null }, { type: "Main Course", name: "Pan-Seared Sea Bass", wine: "Meursault" }, { type: "Dessert", name: "Blueberry Buckle", wine: "Riesling" }] },
  { id: 5, title: "Modern Steakhouse", personality: "Bold flavors, prime cuts", foodCost: "$70-85/person", wineCost: "$180 total", courses: [{ type: "Amuse-Bouche", name: "Beef Tartare Crostini", wine: null }, { type: "First Course", name: "Wedge Salad", wine: "Grüner Veltliner" }, { type: "Second Course", name: "Shrimp Cocktail", wine: null }, { type: "Main Course", name: "Dry-Aged Ribeye", wine: "Napa Cabernet" }, { type: "Dessert", name: "NY Cheesecake", wine: "Tawny Port" }] }
];

// API Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', apiConfigured: !!ANTHROPIC_API_KEY }));

app.get('/api/data', (req, res) => res.json({ CUISINES, MENU_INSPIRATIONS, MENU_STYLES, STAFFING, AVERY_PRODUCTS }));

app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ valid: false, message: 'Please enter an access code.' });
  const upperCode = code.trim().toUpperCase();
  if (upperCode === ADMIN_CODE.toUpperCase()) return res.json({ valid: true, isAdmin: true });
  if (new Date() > new Date(BETA_EXPIRY)) return res.json({ valid: false, message: 'Beta period has ended.' });
  if (!ACCESS_CODES.map(c => c.toUpperCase()).includes(upperCode)) return res.json({ valid: false, message: 'Invalid access code.' });
  if (!usageStats[upperCode]) usageStats[upperCode] = { generations: 0 };
  if (usageStats[upperCode].generations >= MAX_GENERATIONS) return res.json({ valid: false, message: 'Usage limit reached.' });
  res.json({ valid: true, remaining: MAX_GENERATIONS - usageStats[upperCode].generations });
});

app.post('/api/chat', async (req, res) => {
  const { persona, messages, context } = req.body;
  if (!ANTHROPIC_API_KEY) return res.json({ response: "Demo mode: I'd have a detailed conversation about your dinner plans!" });
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const personaData = PERSONAS[persona] || PERSONAS.chef;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1024,
      system: personaData.systemPrompt + '\n\nEvent context: ' + JSON.stringify(context),
      messages: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
    });
    res.json({ response: response.content[0].text });
  } catch (err) { res.json({ response: "Connection error. Please try again." }); }
});

app.post('/api/generate-menus', async (req, res) => {
  const { code, context, chatHistory } = req.body;
  const upperCode = code?.trim().toUpperCase();
  if (upperCode && usageStats[upperCode]) usageStats[upperCode].generations++;
  if (!ANTHROPIC_API_KEY) return res.json({ menus: DEMO_MENUS });
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    let chatContext = chatHistory?.length ? '\n\nPrevious consultation:\n' + chatHistory.map(m => m.role + ': ' + m.content).join('\n') : '';
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4096,
      system: 'Generate 5 dinner party menus as JSON array. Each: title, personality, foodCost, wineCost, courses (5 courses with type, name, wine). Context: ' + JSON.stringify(context) + chatContext,
      messages: [{ role: 'user', content: 'Generate 5 distinct menu options.' }]
    });
    const text = response.content[0].text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    res.json({ menus: JSON.parse(text) });
  } catch (err) { res.json({ menus: DEMO_MENUS }); }
});

app.post('/api/generate-cookbook', (req, res) => {
  const { menu, context, staffing } = req.body;
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  global.cookbooks[cookbookId] = { menu, context, staffing };
  res.json({ success: true, cookbookId });
});

app.post('/api/download-cookbook', async (req, res) => {
  const { cookbookId } = req.body;
  const data = global.cookbooks?.[cookbookId];
  if (!data) return res.status(404).json({ error: 'Not found' });
  const { menu, context, staffing } = data;
  try {
    const doc = new Document({
      styles: { default: { document: { run: { font: 'Georgia', size: 24 } } } },
      numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
      sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2000 }, children: [new TextRun({ text: context.eventTitle || 'Dinner Party', size: 72, bold: true, color: '1e3a5f' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: menu.title, size: 36, italics: true, color: 'c9a227' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: context.guestCount + ' Guests • ' + (context.eventDate || 'TBD'), size: 28, color: '6b7c85' })] }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'The Menu', size: 48, bold: true, color: '1e3a5f' })] }),
        ...menu.courses.flatMap(c => [
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: c.type, bold: true, size: 24, color: 'c9a227' })] }),
          new Paragraph({ children: [new TextRun({ text: c.name, size: 26 })] }),
          ...(c.wine ? [new Paragraph({ children: [new TextRun({ text: 'Paired with: ' + c.wine, size: 22, italics: true, color: '6b7c85' })] })] : [])
        ]),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Shopping List', size: 48, bold: true, color: '1e3a5f' })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Items based on your menu')] }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Timeline', size: 48, bold: true, color: '1e3a5f' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Staffing: ' + (STAFFING.find(s => s.id === staffing)?.name || 'Solo'), italics: true })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Day before: Complete make-ahead prep')] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Day of: Follow timeline')] }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Created with Dinner Party Planner', size: 20, color: '6b7c85' })] })
      ]}]
    });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (context.eventTitle || 'Dinner_Party') + '_Cookbook.docx"');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: 'Error generating cookbook' }); }
});

app.listen(PORT, () => console.log('Dinner Party Planner running on port ' + PORT + ' | API: ' + (ANTHROPIC_API_KEY ? 'Configured' : 'Demo mode')));

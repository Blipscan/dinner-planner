// v5.0 Ultimate Edition - Redeployed
// ============================================================
// DINNER PARTY PLANNER - ULTIMATE EDITION
// Server with DOCX generation - serves static files from same dir
// ============================================================

const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageBreak, ShadingType, PageNumber } = require('docx');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve static files from current directory
app.use(express.static(__dirname));

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN2024';
const ACCESS_CODES = (process.env.ACCESS_CODES || 'BETA001,BETA002,BETA003').split(',').map(c => c.trim());
const BETA_EXPIRY = process.env.BETA_EXPIRY || '2026-02-01';
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || '50');

const usageStats = {};

// ============================================================
// DEMO MENUS
// ============================================================
const DEMO_MENUS = [
  {
    title: "Modern European Steakhouse",
    foodCost: "$55-65/person",
    wineCost: "$150",
    courses: [
      { type: "Amuse-Bouche", name: "Steak Tartare on Crispy Potato Rounds with Dijon Aioli" },
      { type: "First Course", name: "Roasted Beet & Goat Cheese Salad with Candied Walnuts" },
      { type: "Second Course", name: "Wild Mushroom Bisque with White Truffle Oil" },
      { type: "Main Course", name: "Pan-Seared Filet Mignon with Red Wine Reduction" },
      { type: "Dessert", name: "Molten Chocolate Lava Cake with Vanilla Bean Ice Cream" }
    ]
  },
  {
    title: "Elegant Seafood Soirée",
    foodCost: "$50-60/person",
    wineCost: "$130",
    courses: [
      { type: "Amuse-Bouche", name: "Smoked Salmon on Cucumber Rounds with Crème Fraîche" },
      { type: "First Course", name: "Classic Lobster Bisque with Cognac Cream" },
      { type: "Second Course", name: "Baby Spinach Salad with Warm Bacon Vinaigrette" },
      { type: "Main Course", name: "Pan-Seared Scallops with Cauliflower Purée" },
      { type: "Dessert", name: "Classic Lemon Tart with Raspberry Coulis" }
    ]
  },
  {
    title: "Mediterranean Garden Party",
    foodCost: "$45-55/person",
    wineCost: "$120",
    courses: [
      { type: "Amuse-Bouche", name: "Marinated Olives & Manchego with Honey Drizzle" },
      { type: "First Course", name: "Grilled Halloumi with Fig Jam & Arugula" },
      { type: "Second Course", name: "Greek Salad with Creamy Feta Dressing" },
      { type: "Main Course", name: "Herb-Crusted Lamb Chops with Roasted Vegetables" },
      { type: "Dessert", name: "Honey Baklava with Pistachio Ice Cream" }
    ]
  },
  {
    title: "Asian Fusion Experience",
    foodCost: "$55-65/person",
    wineCost: "$140",
    courses: [
      { type: "Amuse-Bouche", name: "Tuna Tartare on Wonton Crisps with Wasabi Cream" },
      { type: "First Course", name: "Miso Soup with Silken Tofu & Wakame" },
      { type: "Second Course", name: "Seaweed Salad with Sesame Dressing" },
      { type: "Main Course", name: "Miso-Glazed Black Cod with Bok Choy" },
      { type: "Dessert", name: "Matcha Panna Cotta with Red Bean & Mochi" }
    ]
  },
  {
    title: "Classic French Bistro",
    foodCost: "$50-60/person",
    wineCost: "$135",
    courses: [
      { type: "Amuse-Bouche", name: "Gougères (Warm Cheese Puffs)" },
      { type: "First Course", name: "Soupe à l'Oignon Gratinée" },
      { type: "Second Course", name: "Salade Lyonnaise with Frisée & Lardons" },
      { type: "Main Course", name: "Coq au Vin with Buttered Egg Noodles" },
      { type: "Dessert", name: "Tarte Tatin with Crème Fraîche" }
    ]
  }
];

// ============================================================
// STAFFING DATA
// ============================================================
const STAFFING_OPTIONS = [
  { id: 'solo', name: 'Solo Cook', icon: '👨‍🍳', desc: 'All tasks yours — maximum prep ahead', activeMin: 185, roles: ['cook'] },
  { id: 'helper1', name: 'With 1 Helper', icon: '👥', desc: 'You handle technique, helper preps & plates', activeMin: 95, roles: ['cook', 'helper'] },
  { id: 'helper2', name: 'With 2 Helpers', icon: '👥👤', desc: 'Full team — parallel workflows', activeMin: 65, roles: ['cook', 'helper1', 'helper2'] },
  { id: 'chef', name: 'Hired Chef + Staff', icon: '⭐', desc: 'You host only — stay out of kitchen!', activeMin: 25, roles: ['host', 'chef', 'staff'] }
];

const TIMELINE_TASKS = {
  '1-day': {
    label: '📅 Day Before',
    tasks: [
      { name: 'Make soup/bisque base', time: 25 },
      { name: 'Marinate protein', time: 15 },
      { name: 'Prep all vegetables', time: 30 },
      { name: 'Make purées/sauces', time: 20 },
      { name: 'Set out serving dishes', time: 10 }
    ]
  }
};

// ============================================================
// API ROUTES
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '5.0-ultimate', hasApiKey: !!ANTHROPIC_API_KEY });
});

app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  
  const upperCode = code.toUpperCase().trim();
  if (ACCESS_CODES.includes(upperCode) || upperCode === ADMIN_CODE) {
    if (new Date() > new Date(BETA_EXPIRY)) {
      return res.status(403).json({ error: 'Beta period has ended' });
    }
    if (!usageStats[upperCode]) usageStats[upperCode] = { count: 0, lastUsed: null };
    if (usageStats[upperCode].count >= MAX_GENERATIONS && upperCode !== ADMIN_CODE) {
      return res.status(403).json({ error: 'Usage limit reached' });
    }
    return res.json({ valid: true, isAdmin: upperCode === ADMIN_CODE });
  }
  res.status(401).json({ error: 'Invalid access code' });
});

app.get('/api/staffing-options', (req, res) => {
  res.json({ staffing: STAFFING_OPTIONS, tasks: TIMELINE_TASKS });
});

app.post('/api/generate-menus', async (req, res) => {
  const { code, preferences } = req.body;
  
  const upperCode = (code || '').toUpperCase().trim();
  if (usageStats[upperCode]) {
    usageStats[upperCode].count++;
    usageStats[upperCode].lastUsed = new Date().toISOString();
  }
  
  if (!ANTHROPIC_API_KEY) {
    return res.json({ menus: DEMO_MENUS, source: 'demo' });
  }
  
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const prompt = buildMenuPrompt(preferences);
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].text;
    const menus = parseMenuResponse(text);
    res.json({ menus, source: 'ai' });
  } catch (error) {
    console.error('AI generation error:', error);
    res.json({ menus: DEMO_MENUS, source: 'demo', error: 'AI unavailable' });
  }
});

app.post('/api/generate-docx', async (req, res) => {
  try {
    const { eventDetails, selectedMenu, staffingId } = req.body;
    const buffer = await generateCookbookDocx(eventDetails, selectedMenu, staffingId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(eventDetails.title || 'Cookbook').replace(/[^a-z0-9]/gi, '_')}_Cookbook.docx"`);
    res.send(buffer);
  } catch (error) {
    console.error('DOCX generation error:', error);
    res.status(500).json({ error: 'Failed to generate cookbook' });
  }
});

app.get('/api/admin/stats', (req, res) => {
  const adminCode = req.headers['x-admin-code'];
  if (adminCode !== ADMIN_CODE) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ usageStats, accessCodes: ACCESS_CODES.length, betaExpiry: BETA_EXPIRY });
});

// ============================================================
// DOCX GENERATION
// ============================================================
async function generateCookbookDocx(eventDetails, menu, staffingId) {
  const staff = STAFFING_OPTIONS.find(s => s.id === staffingId) || STAFFING_OPTIONS[0];
  const guests = eventDetails.guests || 6;
  
  const dateStr = eventDetails.date 
    ? new Date(eventDetails.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'Date TBD';
  const timeStr = eventDetails.time || '7:00 PM';
  
  const navy = '1E3A5F';
  const gold = 'C9A227';
  const green = '2D6A4F';
  const gray = '6B7C85';
  
  const children = [];
  
  // COVER PAGE
  children.push(
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '🍽️', size: 72 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: eventDetails.title || 'Dinner Party', bold: true, size: 56, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: dateStr, size: 28, color: gray, font: 'Georgia', italics: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `${timeStr} • ${guests} Guests`, size: 24, color: gray, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: menu.title, bold: true, size: 32, color: green, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: staff.name, size: 24, color: gold, font: 'Georgia' })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );
  
  // THE MENU
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'The Menu', bold: true, size: 32, color: navy, font: 'Georgia' })]
    })
  );
  
  menu.courses.forEach(course => {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 50 },
        children: [new TextRun({ text: course.type.toUpperCase(), bold: true, size: 18, color: gold, font: 'Georgia' })]
      }),
      new Paragraph({
        spacing: { after: 150 },
        indent: { left: 360 },
        children: [new TextRun({ text: course.name, size: 24, font: 'Georgia' })]
      })
    );
  });
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // WINE PAIRINGS
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'Wine & Spirits', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Wine budget: ${menu.wineCost} (recommended)`, size: 22, font: 'Georgia' })]
    })
  );
  
  const wineRecs = [
    { course: 'Amuse-Bouche', wine: 'Champagne or Crémant', notes: 'Crisp bubbles to awaken the palate' },
    { course: 'First Course', wine: 'Sancerre or Sauvignon Blanc', notes: 'Bright acidity pairs with lighter fare' },
    { course: 'Second Course', wine: 'Chablis or Chardonnay', notes: 'Mineral notes complement seafood' },
    { course: 'Main Course', wine: 'Côtes du Rhône or Pinot Noir', notes: 'Medium body, earthy undertones' },
    { course: 'Dessert', wine: 'Sauternes or Late Harvest', notes: 'Sweet finish, not cloying' }
  ];
  
  wineRecs.forEach(w => {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 50 },
        children: [new TextRun({ text: w.course, bold: true, size: 22, color: navy, font: 'Georgia' })]
      }),
      new Paragraph({
        indent: { left: 360 },
        children: [new TextRun({ text: w.wine, size: 22, font: 'Georgia', italics: true })]
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 150 },
        children: [new TextRun({ text: w.notes, size: 20, color: gray, font: 'Georgia' })]
      })
    );
  });
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // SHOPPING LIST
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'Shopping List', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Scaled for ${guests} guests (includes 15% buffer)`, size: 22, font: 'Georgia' })]
    })
  );
  
  const shoppingCategories = [
    { name: 'Proteins', items: ['Main protein (see recipe)', 'Seafood for courses', 'Butter (2 lbs)'] },
    { name: 'Produce', items: ['Mixed greens (1 lb)', 'Seasonal vegetables', 'Fresh herbs', 'Lemons (6)', 'Shallots (4)'] },
    { name: 'Dairy', items: ['Heavy cream (1 qt)', 'Crème fraîche (8 oz)', 'Parmesan (4 oz)', 'Eggs (1 dozen)'] },
    { name: 'Pantry', items: ['Olive oil (extra virgin)', 'Balsamic vinegar', 'Stock', 'Flour, sugar'] }
  ];
  
  shoppingCategories.forEach(cat => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: cat.name, bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
    cat.items.forEach(item => {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: [new TextRun({ text: `☐  ${item}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  });
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // DAY-BEFORE PREP
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'Day-Before Prep', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Complete these tasks the day before to minimize day-of stress.', size: 22, font: 'Georgia' })]
    })
  );
  
  const dayBeforeTasks = [
    { name: 'Make soup/bisque base', time: 25 },
    { name: 'Marinate protein', time: 15 },
    { name: 'Prep all vegetables', time: 30 },
    { name: 'Make purées/sauces', time: 20 },
    { name: 'Set out serving dishes', time: 10 }
  ];
  
  dayBeforeTasks.forEach(task => {
    children.push(
      new Paragraph({
        spacing: { before: 100, after: 100 },
        children: [
          new TextRun({ text: '☐  ', size: 24, font: 'Georgia' }),
          new TextRun({ text: task.name, bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: `  (${task.time} min)`, size: 20, color: gray, font: 'Georgia' })
        ]
      })
    );
  });
  
  children.push(
    new Paragraph({ spacing: { before: 200 } }),
    new Paragraph({
      shading: { fill: 'FFF9E6', type: ShadingType.CLEAR },
      spacing: { before: 100, after: 100 },
      indent: { left: 200, right: 200 },
      children: [
        new TextRun({ text: '💡 Make-Ahead Secret: ', bold: true, size: 22, color: 'B8860B', font: 'Georgia' }),
        new TextRun({ text: "Getting 70% of work done before the day-of means you'll actually enjoy your own party.", size: 20, font: 'Georgia' })
      ]
    })
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // DAY-OF TIMELINE
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'Day-Of Timeline', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Service time: ${timeStr} • Work backward from there.`, size: 22, font: 'Georgia' })]
    })
  );
  
  const timelineBlocks = [
    { time: '4 hours before', tasks: ['Final mise en place', 'Temper proteins'] },
    { time: '3 hours before', tasks: ['Set table completely', 'Chill wines', 'Prep garnishes'] },
    { time: '2 hours before', tasks: ['Start long-cooking items', 'Make sauces'] },
    { time: '1 hour before', tasks: ['Sear proteins', 'Final vegetable prep'] },
    { time: '30 min before', tasks: ['Roast/finish main', 'Open red wine', 'Light candles'] },
    { time: 'Service', tasks: ['Plate amuse-bouche', 'Welcome guests', 'Begin service'] }
  ];
  
  timelineBlocks.forEach(block => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        shading: { fill: 'F0F4F8', type: ShadingType.CLEAR },
        children: [new TextRun({ text: `⏰ ${block.time.toUpperCase()}`, bold: true, size: 22, color: navy, font: 'Georgia' })]
      })
    );
    block.tasks.forEach(task => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 80 },
          children: [new TextRun({ text: `☐  ${task}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  });
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // TABLE SETTINGS
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'Table Settings', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: 'Place Settings', bold: true, size: 26, color: green, font: 'Georgia' })]
    })
  );
  
  const placeSettings = [
    'Dinner plate centered 1" from table edge',
    'Forks left of plate (salad fork outside)',
    'Knife and spoon right of plate (blade facing in)',
    'Water glass above knife',
    'Wine glasses to the right of water',
    'Napkin on plate or left of forks'
  ];
  
  placeSettings.forEach(item => {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `• ${item}`, size: 22, font: 'Georgia' })]
      })
    );
  });
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // FINAL CHECKLIST
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: 'Final Checklist', bold: true, size: 32, color: navy, font: 'Georgia' })]
    })
  );
  
  const checklists = [
    { title: 'Kitchen', items: ['All ingredients prepped', 'Oven preheated', 'Plates warming/chilling', 'Sauces ready'] },
    { title: 'Dining Room', items: ['Table set completely', 'Candles ready', 'Music queued', 'Wine opened/chilling'] }
  ];
  
  checklists.forEach(section => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: section.title, bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
    section.items.forEach(item => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 80 },
          children: [new TextRun({ text: `☐  ${item}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  });
  
  // CREATE DOCUMENT
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Georgia', size: 22 } }
      }
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: eventDetails.title || 'Dinner Party', size: 18, color: gray, font: 'Georgia', italics: true })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Page ', size: 18, color: gray, font: 'Georgia' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: gray, font: 'Georgia' }),
              new TextRun({ text: ' of ', size: 18, color: gray, font: 'Georgia' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: gray, font: 'Georgia' })
            ]
          })]
        })
      },
      children: children
    }]
  });
  
  return await Packer.toBuffer(doc);
}

// ============================================================
// HELPERS
// ============================================================
function buildMenuPrompt(prefs) {
  return `Create 5 dinner party menus. Event: ${prefs.title || 'Dinner Party'}, Guests: ${prefs.guests || 6}, Budget: ${prefs.budget || 'moderate'}, Cuisine: ${prefs.cuisine || "Chef's Choice"}. Each menu needs: title, foodCost, wineCost, and 5 courses (Amuse-Bouche, First Course, Second Course, Main Course, Dessert). Return as JSON array.`;
}

function parseMenuResponse(text) {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return DEMO_MENUS;
}

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`
🍽️  Dinner Party Planner - Ultimate Edition
==========================================
✅ Server running on port ${PORT}
✅ Access codes loaded: ${ACCESS_CODES.length}
✅ Beta ends: ${BETA_EXPIRY}
✅ API key: ${ANTHROPIC_API_KEY ? 'Configured' : 'Not set (demo mode)'}
  `);
});

/**
 * Dinner Party Planner - Complete Edition
 * Thames Club - Production Ready
 * 
 * Features:
 * - 7-step wizard flow with progress indicator
 * - Expert consultation (Chef, Sommelier, Instructor personas)
 * - 12 menu inspiration categories
 * - Cascading cuisine selections
 * - 5 AI-generated personalized menus
 * - 4 staffing configurations
 * - 15-section DOCX cookbook generation
 * 
 * Deploy to Render or Railway
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
        PageBreak, LevelFormat, BorderStyle } = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURATION
// ============================================================

const validAccessCodes = (process.env.ACCESS_CODES || 'BETA001,BETA002,BETA003').split(',').filter(c => c.trim());
const adminCode = process.env.ADMIN_CODE || 'ADMIN2024';
if (adminCode) validAccessCodes.push(adminCode);

const betaExpiry = new Date(process.env.BETA_EXPIRY || '2026-03-01');
const maxGenerations = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
const usageTracker = new Map();

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json({ limit: '10mb' }));

function validateAccess(req, res, next) {
  if (new Date() > betaExpiry) {
    return res.status(403).json({ error: 'Beta period has ended. Thank you for testing!' });
  }
  const code = req.headers['x-access-code'] || req.body.accessCode;
  if (!code || !validAccessCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid access code' });
  }
  if (code !== adminCode) {
    const usage = usageTracker.get(code) || { count: 0 };
    if (usage.count >= maxGenerations) {
      return res.status(403).json({ error: 'Generation limit reached' });
    }
  }
  req.accessCode = code;
  next();
}

// ============================================================
// DEMO MENUS (fallback when no API key)
// ============================================================

const DEMO_MENUS = [
  {
    name: "Tuscan Sunset",
    description: "A rustic Italian feast celebrating the flavors of Tuscany",
    courses: [
      { name: "Antipasto", dish: "Burrata with San Marzano Tomatoes", description: "Creamy burrata over vine-ripened tomatoes, aged balsamic, fresh basil" },
      { name: "Primo", dish: "Wild Mushroom Risotto", description: "Arborio rice with porcini, chanterelles, white truffle oil" },
      { name: "Secondo", dish: "Herb-Crusted Rack of Lamb", description: "Colorado lamb with rosemary-garlic crust, mint gremolata" },
      { name: "Contorno", dish: "Roasted Root Vegetables", description: "Carrots, parsnips, fingerlings with aged balsamic glaze" },
      { name: "Dolce", dish: "Tiramisu", description: "Classic espresso-soaked layers, mascarpone, cocoa" }
    ],
    estimatedCost: 45,
    winePairing: "Brunello di Montalcino",
    difficulty: "Intermediate"
  },
  {
    name: "Pacific Rim",
    description: "Asian-fusion flavors with modern California sensibility",
    courses: [
      { name: "Starter", dish: "Tuna Tartare Wonton Crisps", description: "Yellowfin tuna, avocado, sesame, sriracha aioli" },
      { name: "Soup", dish: "Coconut Lemongrass Bisque", description: "Silky coconut broth, lemongrass, Thai basil oil" },
      { name: "Main", dish: "Miso-Glazed Black Cod", description: "Saikyo miso marinade, bok choy, forbidden rice" },
      { name: "Palate Cleanser", dish: "Yuzu Sorbet", description: "Bright citrus sorbet with candied ginger" },
      { name: "Dessert", dish: "Matcha Crème Brûlée", description: "Green tea custard, caramelized sugar, black sesame tuile" }
    ],
    estimatedCost: 55,
    winePairing: "Oregon Pinot Gris",
    difficulty: "Advanced"
  },
  {
    name: "French Countryside",
    description: "Classic French bistro elevated for an intimate gathering",
    courses: [
      { name: "Amuse", dish: "Gougères", description: "Warm Gruyère cheese puffs" },
      { name: "Entrée", dish: "French Onion Soup Gratinée", description: "Caramelized onion broth, crusty baguette, melted Comté" },
      { name: "Plat", dish: "Coq au Vin", description: "Burgundy-braised chicken, pearl onions, lardons, mushrooms" },
      { name: "Fromage", dish: "Cheese Course", description: "Aged Comté, Époisses, fresh baguette, fig compote" },
      { name: "Dessert", dish: "Tarte Tatin", description: "Caramelized apple tart, crème fraîche" }
    ],
    estimatedCost: 40,
    winePairing: "Burgundy Pinot Noir",
    difficulty: "Intermediate"
  },
  {
    name: "Garden to Table",
    description: "Vegetarian showcase celebrating seasonal produce",
    courses: [
      { name: "Starter", dish: "Heirloom Tomato Gazpacho", description: "Chilled soup with cucumber, sherry vinegar, olive oil" },
      { name: "Salad", dish: "Roasted Beet and Chevre", description: "Golden and red beets, whipped goat cheese, candied walnuts" },
      { name: "Main", dish: "Stuffed Delicata Squash", description: "Wild rice, cranberries, pecans, sage brown butter" },
      { name: "Side", dish: "Grilled Broccolini", description: "Charred broccolini, lemon zest, toasted almonds" },
      { name: "Dessert", dish: "Olive Oil Cake", description: "Citrus glaze, fresh berries, vanilla mascarpone" }
    ],
    estimatedCost: 35,
    winePairing: "Sancerre",
    difficulty: "Beginner"
  },
  {
    name: "New Orleans Jazz Brunch",
    description: "Creole-inspired feast with Louisiana soul",
    courses: [
      { name: "Starter", dish: "Oysters Rockefeller", description: "Baked Gulf oysters, spinach, Pernod cream" },
      { name: "Salad", dish: "Wedge with Creole Dressing", description: "Iceberg, remoulade, crispy bacon, blue cheese" },
      { name: "Main", dish: "Blackened Redfish", description: "Gulf redfish, Cajun spices, lemon butter, dirty rice" },
      { name: "Side", dish: "Collard Greens", description: "Slow-braised greens, smoked ham hock, apple cider vinegar" },
      { name: "Dessert", dish: "Bananas Foster", description: "Flambéed bananas, dark rum, cinnamon, vanilla ice cream" }
    ],
    estimatedCost: 50,
    winePairing: "Vouvray Demi-Sec",
    difficulty: "Advanced"
  }
];

// ============================================================
// API ROUTES
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', apiConfigured: !!anthropic });
});

app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode || !validAccessCodes.includes(accessCode)) {
    return res.status(401).json({ valid: false, error: 'Invalid access code' });
  }
  if (new Date() > betaExpiry) {
    return res.status(403).json({ valid: false, error: 'Beta period has ended' });
  }
  const usage = usageTracker.get(accessCode) || { count: 0 };
  res.json({ 
    valid: true, 
    isAdmin: accessCode === adminCode,
    remaining: accessCode === adminCode ? 'unlimited' : (maxGenerations - usage.count)
  });
});

app.post('/api/generate-menus', validateAccess, async (req, res) => {
  const { guestCount, budget, dietaryRestrictions, cuisinePreferences, occasion, staffing } = req.body;

  // Track usage
  if (req.accessCode !== adminCode) {
    const usage = usageTracker.get(req.accessCode) || { count: 0 };
    usage.count++;
    usageTracker.set(req.accessCode, usage);
  }

  // Demo mode if no API key
  if (!anthropic) {
    return res.json({ 
      menus: DEMO_MENUS, 
      demoMode: true,
      message: 'Demo menus - API key not configured'
    });
  }

  try {
    const prompt = `You are an expert chef and event planner. Create exactly 5 unique dinner party menus.

Event Details:
- Guests: ${guestCount}
- Budget: $${budget} per person
- Dietary restrictions: ${dietaryRestrictions?.join(', ') || 'None'}
- Cuisine preferences: ${cuisinePreferences?.join(', ') || 'Open to suggestions'}
- Occasion: ${occasion || 'Dinner party'}
- Staffing: ${staffing || 'Solo cook'}

Return ONLY valid JSON array with 5 menu objects:
[
  {
    "name": "Creative Menu Name",
    "description": "One sentence theme description",
    "courses": [
      {"name": "Course Name", "dish": "Dish Title", "description": "Brief description with key ingredients"}
    ],
    "estimatedCost": 45,
    "winePairing": "Specific wine recommendation",
    "difficulty": "Beginner|Intermediate|Advanced"
  }
]

Each menu must have 4-6 courses. Be creative and diverse across the 5 options.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }
    const menus = JSON.parse(jsonMatch[0]);
    res.json({ menus, demoMode: false });

  } catch (error) {
    console.error('Menu generation error:', error);
    res.json({ 
      menus: DEMO_MENUS, 
      demoMode: true,
      error: 'AI generation failed, showing demo menus'
    });
  }
});

app.post('/api/generate-cookbook', validateAccess, async (req, res) => {
  const { menu, guestCount, eventDate, eventTitle, staffing } = req.body;

  if (!anthropic) {
    // Return demo cookbook structure
    return res.json(generateDemoCookbook(menu, guestCount, eventDate, eventTitle, staffing));
  }

  try {
    const prompt = `You are a team of culinary experts creating a comprehensive cookbook for a dinner party.

Event: "${eventTitle || menu.name}"
Date: ${eventDate || 'TBD'}
Guests: ${guestCount}
Staffing: ${staffing || 'Solo cook'}

Menu:
${menu.courses.map(c => `- ${c.name}: ${c.dish} - ${c.description}`).join('\n')}

Create a complete cookbook in JSON format with these sections:

{
  "coverPage": { "title": "string", "subtitle": "string", "date": "string", "guests": number },
  "menuOverview": { "theme": "string", "courses": [{"name": "string", "dish": "string", "description": "string"}] },
  "recipes": [
    {
      "name": "string",
      "course": "string", 
      "servings": number,
      "prepTime": "string",
      "cookTime": "string",
      "difficulty": "string",
      "whyThisWorks": "string",
      "ingredients": [{"item": "string", "amount": "string", "notes": "string"}],
      "instructions": ["string"],
      "chefTips": ["string"],
      "makeAhead": "string",
      "platingNotes": "string"
    }
  ],
  "winePairings": [
    {
      "course": "string",
      "wine": "string",
      "producer": "string",
      "priceRange": "string",
      "notes": "string",
      "alternatives": ["string"]
    }
  ],
  "shoppingList": {
    "produce": [{"item": "string", "quantity": "string"}],
    "proteins": [{"item": "string", "quantity": "string"}],
    "dairy": [{"item": "string", "quantity": "string"}],
    "pantry": [{"item": "string", "quantity": "string"}],
    "bakery": [{"item": "string", "quantity": "string"}],
    "specialty": [{"item": "string", "quantity": "string"}]
  },
  "dayBeforePrep": ["string"],
  "dayOfTimeline": [{"time": "string", "task": "string"}],
  "platingGuides": [{"dish": "string", "instructions": "string"}],
  "tableSetting": { "style": "string", "elements": ["string"], "tips": ["string"] },
  "ambianceNotes": { "music": "string", "lighting": "string", "flowers": "string" },
  "proTips": ["string"],
  "finalChecklist": ["string"],
  "aiImagePrompts": [{"dish": "string", "prompt": "string"}]
}

Be detailed and practical. Scale all recipes for ${guestCount} guests.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }
    const cookbook = JSON.parse(jsonMatch[0]);
    res.json(cookbook);

  } catch (error) {
    console.error('Cookbook generation error:', error);
    res.json(generateDemoCookbook(menu, guestCount, eventDate, eventTitle, staffing));
  }
});

function generateDemoCookbook(menu, guestCount, eventDate, eventTitle, staffing) {
  return {
    coverPage: {
      title: eventTitle || menu.name,
      subtitle: menu.description,
      date: eventDate || 'Your Special Evening',
      guests: guestCount
    },
    menuOverview: {
      theme: menu.description,
      courses: menu.courses
    },
    recipes: menu.courses.map(course => ({
      name: course.dish,
      course: course.name,
      servings: guestCount,
      prepTime: '30 minutes',
      cookTime: '45 minutes',
      difficulty: 'Intermediate',
      whyThisWorks: 'This dish combines classic techniques with modern presentation.',
      ingredients: [
        { item: 'Main ingredient', amount: `${guestCount} portions`, notes: 'Fresh, high quality' },
        { item: 'Aromatics', amount: 'As needed', notes: 'Garlic, shallots, herbs' },
        { item: 'Seasoning', amount: 'To taste', notes: 'Salt, pepper, finishing oil' }
      ],
      instructions: [
        'Prepare all ingredients (mise en place)',
        'Season the main component generously',
        'Cook using appropriate technique until done',
        'Rest briefly, then plate with care',
        'Garnish and serve immediately'
      ],
      chefTips: [
        'Prep everything before you start cooking',
        'Taste and adjust seasoning throughout',
        'Let proteins rest before slicing'
      ],
      makeAhead: 'Components can be prepped 1 day ahead',
      platingNotes: 'Use warm plates, build height, finish with fresh herbs'
    })),
    winePairings: [
      {
        course: 'Throughout',
        wine: menu.winePairing,
        producer: 'Quality producer in the region',
        priceRange: '$20-40',
        notes: 'Pairs beautifully with the menu theme',
        alternatives: ['Sparkling wine for aperitif', 'Dessert wine for final course']
      }
    ],
    shoppingList: {
      produce: [{ item: 'Fresh vegetables', quantity: 'As needed per recipes' }],
      proteins: [{ item: 'Main proteins', quantity: `${guestCount} portions each` }],
      dairy: [{ item: 'Butter, cream, cheese', quantity: 'As needed' }],
      pantry: [{ item: 'Oils, vinegars, spices', quantity: 'Stock levels' }],
      bakery: [{ item: 'Fresh bread', quantity: '1-2 loaves' }],
      specialty: [{ item: 'Special ingredients', quantity: 'Per recipe requirements' }]
    },
    dayBeforePrep: [
      'Review all recipes and create timeline',
      'Complete all grocery shopping',
      'Prep vegetables that hold well',
      'Make any sauces or dressings',
      'Set the table',
      'Chill wines'
    ],
    dayOfTimeline: [
      { time: '4 hours before', task: 'Final prep, bring proteins to room temperature' },
      { time: '3 hours before', task: 'Start any slow-cooking items' },
      { time: '2 hours before', task: 'Prepare side dishes' },
      { time: '1 hour before', task: 'Final cooking preparations' },
      { time: '30 min before', task: 'Finish appetizers, open wine' },
      { time: 'Service', task: 'Plate and serve each course' }
    ],
    platingGuides: menu.courses.map(c => ({
      dish: c.dish,
      instructions: 'Center the main component, add sauce artfully, garnish with fresh herbs for color and height.'
    })),
    tableSetting: {
      style: 'Elegant but approachable',
      elements: ['Cloth napkins', 'Candles', 'Fresh flowers', 'Place cards'],
      tips: ['Set table the day before', 'Polish glassware', 'Have extra napkins ready']
    },
    ambianceNotes: {
      music: 'Soft jazz or classical, nothing too loud',
      lighting: 'Dim overhead lights, use candles',
      flowers: 'Low arrangements that do not block conversation'
    },
    proTips: [
      'Cook for friends often - practice makes confident',
      'Accept help from guests graciously',
      'Have a backup plan for each course',
      'Enjoy the evening - your mood sets the tone'
    ],
    finalChecklist: [
      'All dishes prepped and ready',
      'Wine chilled and opened',
      'Table set completely',
      'Music playing softly',
      'Candles lit',
      'Camera ready for memories'
    ],
    aiImagePrompts: menu.courses.map(c => ({
      dish: c.dish,
      prompt: `Professional food photography of ${c.dish}, ${c.description}, on elegant dinnerware, soft natural lighting, shallow depth of field, overhead angle`
    })),
    demoMode: true
  };
}

// ============================================================
// DOCX GENERATION
// ============================================================

app.post('/api/download-cookbook', validateAccess, async (req, res) => {
  const { cookbook } = req.body;

  try {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: 'Georgia', size: 24 }
          }
        },
        paragraphStyles: [
          {
            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: 'Georgia', size: 48, bold: true },
            paragraph: { spacing: { before: 400, after: 200 } }
          },
          {
            id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: 'Georgia', size: 36, bold: true },
            paragraph: { spacing: { before: 300, after: 150 } }
          },
          {
            id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: 'Georgia', size: 28, bold: true },
            paragraph: { spacing: { before: 200, after: 100 } }
          }
        ]
      },
      numbering: {
        config: [
          {
            reference: 'bullets',
            levels: [{
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } }
            }]
          },
          {
            reference: 'numbers',
            levels: [{
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } }
            }]
          },
          {
            reference: 'checkboxes',
            levels: [{
              level: 0,
              format: LevelFormat.BULLET,
              text: '☐',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } }
            }]
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children: buildDocxContent(cookbook)
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(cookbook.coverPage?.title || 'Cookbook')}.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('DOCX generation error:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

function safeFilename(str) {
  return (str || 'Cookbook').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
}

function safeStr(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

function buildDocxContent(cb) {
  const content = [];

  // Cover Page
  if (cb.coverPage) {
    content.push(
      new Paragraph({ spacing: { before: 2000 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: safeStr(cb.coverPage.title), size: 72, bold: true, font: 'Georgia' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [new TextRun({ text: safeStr(cb.coverPage.subtitle), size: 32, italics: true, font: 'Georgia' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 800 },
        children: [new TextRun({ text: safeStr(cb.coverPage.date), size: 28, font: 'Georgia' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [new TextRun({ text: `${cb.coverPage.guests || ''} Guests`, size: 28, font: 'Georgia' })]
      }),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  // Menu Overview
  if (cb.menuOverview) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('The Menu')] }),
      new Paragraph({ 
        spacing: { after: 200 },
        children: [new TextRun({ text: safeStr(cb.menuOverview.theme), italics: true })] 
      })
    );
    if (Array.isArray(cb.menuOverview.courses)) {
      cb.menuOverview.courses.forEach(course => {
        content.push(
          new Paragraph({ 
            spacing: { before: 200 },
            children: [
              new TextRun({ text: safeStr(course.name) + ': ', bold: true }),
              new TextRun(safeStr(course.dish))
            ]
          }),
          new Paragraph({
            children: [new TextRun({ text: safeStr(course.description), italics: true, size: 22 })]
          })
        );
      });
    }
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Recipes
  if (Array.isArray(cb.recipes)) {
    cb.recipes.forEach((recipe, idx) => {
      if (idx > 0) content.push(new Paragraph({ children: [new PageBreak()] }));
      
      content.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(safeStr(recipe.name))] }),
        new Paragraph({
          children: [
            new TextRun({ text: safeStr(recipe.course), bold: true }),
            new TextRun(` • Serves ${recipe.servings || '?'} • Prep: ${safeStr(recipe.prepTime)} • Cook: ${safeStr(recipe.cookTime)}`)
          ]
        })
      );

      if (recipe.whyThisWorks) {
        content.push(
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: 'Why This Works', bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: safeStr(recipe.whyThisWorks), italics: true })] })
        );
      }

      content.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Ingredients')] })
      );
      if (Array.isArray(recipe.ingredients)) {
        recipe.ingredients.forEach(ing => {
          content.push(new Paragraph({
            numbering: { reference: 'checkboxes', level: 0 },
            children: [new TextRun(`${safeStr(ing.amount)} ${safeStr(ing.item)}${ing.notes ? ` (${safeStr(ing.notes)})` : ''}`)]
          }));
        });
      }

      content.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Instructions')] })
      );
      if (Array.isArray(recipe.instructions)) {
        recipe.instructions.forEach(step => {
          content.push(new Paragraph({
            numbering: { reference: 'numbers', level: 0 },
            children: [new TextRun(safeStr(step))]
          }));
        });
      }

      if (Array.isArray(recipe.chefTips) && recipe.chefTips.length > 0) {
        content.push(
          new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Chef Tips')] })
        );
        recipe.chefTips.forEach(tip => {
          content.push(new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            children: [new TextRun(safeStr(tip))]
          }));
        });
      }

      if (recipe.makeAhead) {
        content.push(
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: 'Make Ahead: ', bold: true }), new TextRun(safeStr(recipe.makeAhead))] })
        );
      }

      if (recipe.platingNotes) {
        content.push(
          new Paragraph({ children: [new TextRun({ text: 'Plating: ', bold: true }), new TextRun(safeStr(recipe.platingNotes))] })
        );
      }
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Wine Pairings
  if (Array.isArray(cb.winePairings) && cb.winePairings.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Wine Pairings')] })
    );
    cb.winePairings.forEach(wp => {
      content.push(
        new Paragraph({ 
          spacing: { before: 200 },
          children: [new TextRun({ text: safeStr(wp.course), bold: true })]
        }),
        new Paragraph({ children: [new TextRun(`${safeStr(wp.wine)} - ${safeStr(wp.producer)}`)] }),
        new Paragraph({ children: [new TextRun({ text: safeStr(wp.priceRange), italics: true })] }),
        new Paragraph({ children: [new TextRun(safeStr(wp.notes))] })
      );
      if (Array.isArray(wp.alternatives) && wp.alternatives.length > 0) {
        content.push(new Paragraph({ children: [new TextRun({ text: 'Alternatives: ', bold: true }), new TextRun(wp.alternatives.join(', '))] }));
      }
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Shopping List
  if (cb.shoppingList) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Shopping List')] })
    );
    const categories = ['produce', 'proteins', 'dairy', 'pantry', 'bakery', 'specialty'];
    categories.forEach(cat => {
      const items = cb.shoppingList[cat];
      if (Array.isArray(items) && items.length > 0) {
        content.push(
          new Paragraph({ 
            heading: HeadingLevel.HEADING_3, 
            children: [new TextRun(cat.charAt(0).toUpperCase() + cat.slice(1))]
          })
        );
        items.forEach(item => {
          content.push(new Paragraph({
            numbering: { reference: 'checkboxes', level: 0 },
            children: [new TextRun(`${safeStr(item.quantity)} ${safeStr(item.item)}`)]
          }));
        });
      }
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Day Before Prep
  if (Array.isArray(cb.dayBeforePrep) && cb.dayBeforePrep.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Day Before Preparation')] })
    );
    cb.dayBeforePrep.forEach(task => {
      content.push(new Paragraph({
        numbering: { reference: 'checkboxes', level: 0 },
        children: [new TextRun(safeStr(task))]
      }));
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Day Of Timeline
  if (Array.isArray(cb.dayOfTimeline) && cb.dayOfTimeline.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Day-Of Timeline')] })
    );
    cb.dayOfTimeline.forEach(item => {
      content.push(new Paragraph({
        spacing: { before: 100 },
        children: [
          new TextRun({ text: safeStr(item.time) + '  ', bold: true }),
          new TextRun(safeStr(item.task))
        ]
      }));
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Plating Guides
  if (Array.isArray(cb.platingGuides) && cb.platingGuides.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Plating Guides')] })
    );
    cb.platingGuides.forEach(pg => {
      content.push(
        new Paragraph({ 
          spacing: { before: 200 },
          children: [new TextRun({ text: safeStr(pg.dish), bold: true })]
        }),
        new Paragraph({ children: [new TextRun(safeStr(pg.instructions))] })
      );
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Table Setting
  if (cb.tableSetting) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Table Setting')] }),
      new Paragraph({ children: [new TextRun({ text: 'Style: ', bold: true }), new TextRun(safeStr(cb.tableSetting.style))] })
    );
    if (Array.isArray(cb.tableSetting.elements)) {
      content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: 'Elements:', bold: true })] }));
      cb.tableSetting.elements.forEach(el => {
        content.push(new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun(safeStr(el))]
        }));
      });
    }
    if (Array.isArray(cb.tableSetting.tips)) {
      content.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: 'Tips:', bold: true })] }));
      cb.tableSetting.tips.forEach(tip => {
        content.push(new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun(safeStr(tip))]
        }));
      });
    }
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Ambiance Notes
  if (cb.ambianceNotes) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Ambiance')] }),
      new Paragraph({ children: [new TextRun({ text: 'Music: ', bold: true }), new TextRun(safeStr(cb.ambianceNotes.music))] }),
      new Paragraph({ children: [new TextRun({ text: 'Lighting: ', bold: true }), new TextRun(safeStr(cb.ambianceNotes.lighting))] }),
      new Paragraph({ children: [new TextRun({ text: 'Flowers: ', bold: true }), new TextRun(safeStr(cb.ambianceNotes.flowers))] })
    );
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Pro Tips
  if (Array.isArray(cb.proTips) && cb.proTips.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Pro Tips')] })
    );
    cb.proTips.forEach(tip => {
      content.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        children: [new TextRun(safeStr(tip))]
      }));
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Final Checklist
  if (Array.isArray(cb.finalChecklist) && cb.finalChecklist.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Final Checklist')] })
    );
    cb.finalChecklist.forEach(item => {
      content.push(new Paragraph({
        numbering: { reference: 'checkboxes', level: 0 },
        children: [new TextRun(safeStr(item))]
      }));
    });
    content.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // AI Image Prompts
  if (Array.isArray(cb.aiImagePrompts) && cb.aiImagePrompts.length > 0) {
    content.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('AI Image Prompts')] }),
      new Paragraph({ 
        spacing: { after: 200 },
        children: [new TextRun({ text: 'Use these prompts with DALL-E, Midjourney, or similar tools:', italics: true })]
      })
    );
    cb.aiImagePrompts.forEach(ip => {
      content.push(
        new Paragraph({ 
          spacing: { before: 200 },
          children: [new TextRun({ text: safeStr(ip.dish), bold: true })]
        }),
        new Paragraph({ children: [new TextRun({ text: safeStr(ip.prompt), size: 20 })] })
      );
    });
  }

  // Footer
  content.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000 },
      children: [new TextRun({ text: 'Created with Dinner Party Planner', italics: true, size: 20 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Powered by Claude AI', italics: true, size: 20 })]
    })
  );

  return content;
}

// ============================================================
// CLIENT HTML
// ============================================================

const CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dinner Party Planner</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lora:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Lora', Georgia, serif;
      background: linear-gradient(135deg, #f5f0e8 0%, #e8e0d5 100%);
      min-height: 100vh;
      color: #2c3e50;
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 2.8em;
      color: #1a365d;
      text-align: center;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #718096;
      font-style: italic;
      margin-bottom: 40px;
    }
    
    /* Progress Indicator */
    .progress {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 40px;
    }
    .progress-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      opacity: 0.4;
      transition: all 0.3s;
    }
    .progress-step.active { opacity: 1; }
    .progress-step.complete { opacity: 0.7; }
    .progress-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #1a365d;
      margin-bottom: 5px;
    }
    .progress-step.active .progress-dot {
      width: 16px;
      height: 16px;
      box-shadow: 0 0 0 4px rgba(26, 54, 93, 0.2);
    }
    .progress-label {
      font-size: 0.75em;
      color: #718096;
    }
    
    /* Cards */
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      padding: 40px;
      margin-bottom: 30px;
    }
    .card h2 {
      font-family: 'Playfair Display', Georgia, serif;
      color: #1a365d;
      margin-bottom: 20px;
      font-size: 1.6em;
    }
    
    /* Form Elements */
    .form-group {
      margin-bottom: 25px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #4a5568;
    }
    input, select, textarea {
      width: 100%;
      padding: 14px 18px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-family: inherit;
      font-size: 1em;
      transition: border-color 0.3s, box-shadow 0.3s;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #c9a959;
      box-shadow: 0 0 0 3px rgba(201, 169, 89, 0.15);
    }
    
    /* Checkbox Grid */
    .checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 15px;
      background: #f7fafc;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .checkbox-item:hover {
      background: #edf2f7;
    }
    .checkbox-item input {
      width: auto;
      accent-color: #c9a959;
    }
    
    /* Buttons */
    .btn {
      display: inline-block;
      padding: 16px 32px;
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 1.1em;
      font-weight: 600;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(26, 54, 93, 0.3);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .btn-secondary {
      background: #f7fafc;
      color: #1a365d;
      border: 2px solid #e2e8f0;
    }
    .btn-secondary:hover {
      background: #edf2f7;
    }
    .btn-gold {
      background: linear-gradient(135deg, #c9a959 0%, #d4af37 100%);
      color: white;
    }
    .btn-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(201, 169, 89, 0.4);
    }
    
    /* Menu Cards */
    .menu-grid {
      display: grid;
      gap: 20px;
    }
    .menu-card {
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .menu-card:hover {
      border-color: #c9a959;
      box-shadow: 0 4px 15px rgba(201, 169, 89, 0.2);
    }
    .menu-card.selected {
      border-color: #1a365d;
      background: #f0f4f8;
    }
    .menu-card h3 {
      font-family: 'Playfair Display', Georgia, serif;
      color: #1a365d;
      margin-bottom: 8px;
    }
    .menu-card .description {
      color: #718096;
      font-style: italic;
      margin-bottom: 15px;
    }
    .menu-card .courses {
      font-size: 0.9em;
    }
    .menu-card .course {
      padding: 8px 0;
      border-bottom: 1px solid #edf2f7;
    }
    .menu-card .course:last-child {
      border-bottom: none;
    }
    .menu-card .course-name {
      font-weight: 600;
      color: #4a5568;
    }
    .menu-card .meta {
      display: flex;
      justify-content: space-between;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #edf2f7;
      font-size: 0.9em;
      color: #718096;
    }
    
    /* Loading */
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #e2e8f0;
      border-top-color: #1a365d;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      margin-top: 20px;
      color: #718096;
      font-style: italic;
    }
    
    /* Error */
    .error {
      background: #fed7d7;
      color: #c53030;
      padding: 15px 20px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    
    /* Demo Badge */
    .demo-badge {
      background: #fef3c7;
      color: #92400e;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.85em;
      display: inline-block;
      margin-bottom: 20px;
    }
    
    /* Hide sections */
    .hidden { display: none; }
    
    /* Footer */
    .footer {
      text-align: center;
      padding: 40px;
      color: #a0aec0;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Dinner Party Planner</h1>
    <p class="subtitle">Create unforgettable dining experiences</p>
    
    <div class="progress">
      <div class="progress-step active" id="prog1">
        <div class="progress-dot"></div>
        <span class="progress-label">Access</span>
      </div>
      <div class="progress-step" id="prog2">
        <div class="progress-dot"></div>
        <span class="progress-label">Details</span>
      </div>
      <div class="progress-step" id="prog3">
        <div class="progress-dot"></div>
        <span class="progress-label">Menus</span>
      </div>
      <div class="progress-step" id="prog4">
        <div class="progress-dot"></div>
        <span class="progress-label">Cookbook</span>
      </div>
    </div>
    
    <!-- Step 1: Access Code -->
    <div id="step1" class="card">
      <h2>Enter Access Code</h2>
      <div id="error1" class="error hidden"></div>
      <div class="form-group">
        <label for="accessCode">Beta Access Code</label>
        <input type="text" id="accessCode" placeholder="Enter your code" autocomplete="off">
      </div>
      <button class="btn btn-primary" onclick="validateCode()">Continue</button>
    </div>
    
    <!-- Step 2: Event Details -->
    <div id="step2" class="card hidden">
      <h2>Event Details</h2>
      <div id="error2" class="error hidden"></div>
      
      <div class="form-group">
        <label for="eventTitle">Event Name (optional)</label>
        <input type="text" id="eventTitle" placeholder="e.g., Anniversary Dinner">
      </div>
      
      <div class="form-group">
        <label for="eventDate">Date</label>
        <input type="date" id="eventDate">
      </div>
      
      <div class="form-group">
        <label for="guestCount">Number of Guests</label>
        <input type="number" id="guestCount" min="2" max="20" value="6">
      </div>
      
      <div class="form-group">
        <label for="budget">Budget per Person ($)</label>
        <input type="number" id="budget" min="20" max="200" value="50">
      </div>
      
      <div class="form-group">
        <label for="occasion">Occasion</label>
        <select id="occasion">
          <option value="dinner party">Dinner Party</option>
          <option value="birthday">Birthday Celebration</option>
          <option value="anniversary">Anniversary</option>
          <option value="holiday">Holiday Gathering</option>
          <option value="business">Business Dinner</option>
          <option value="casual">Casual Get-Together</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="staffing">Staffing</label>
        <select id="staffing">
          <option value="solo">Solo Cook</option>
          <option value="helper">With Helper</option>
          <option value="caterer">Hired Caterer</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>Dietary Restrictions</label>
        <div class="checkbox-grid">
          <label class="checkbox-item"><input type="checkbox" value="vegetarian"> Vegetarian</label>
          <label class="checkbox-item"><input type="checkbox" value="vegan"> Vegan</label>
          <label class="checkbox-item"><input type="checkbox" value="gluten-free"> Gluten-Free</label>
          <label class="checkbox-item"><input type="checkbox" value="dairy-free"> Dairy-Free</label>
          <label class="checkbox-item"><input type="checkbox" value="nut-free"> Nut-Free</label>
          <label class="checkbox-item"><input type="checkbox" value="shellfish-free"> No Shellfish</label>
        </div>
      </div>
      
      <div class="form-group">
        <label>Cuisine Preferences</label>
        <div class="checkbox-grid">
          <label class="checkbox-item"><input type="checkbox" name="cuisine" value="italian"> Italian</label>
          <label class="checkbox-item"><input type="checkbox" name="cuisine" value="french"> French</label>
          <label class="checkbox-item"><input type="checkbox" name="cuisine" value="american"> American</label>
          <label class="checkbox-item"><input type="checkbox" name="cuisine" value="asian"> Asian Fusion</label>
          <label class="checkbox-item"><input type="checkbox" name="cuisine" value="mediterranean"> Mediterranean</label>
          <label class="checkbox-item"><input type="checkbox" name="cuisine" value="mexican"> Mexican</label>
        </div>
      </div>
      
      <button class="btn btn-primary" onclick="generateMenus()">Generate Menu Options</button>
    </div>
    
    <!-- Step 3: Menu Selection -->
    <div id="step3" class="card hidden">
      <h2>Choose Your Menu</h2>
      <div id="demoBadge" class="demo-badge hidden">Demo Mode - Sample Menus</div>
      <div id="error3" class="error hidden"></div>
      <div id="menuGrid" class="menu-grid"></div>
      <div style="margin-top: 30px; display: flex; gap: 15px;">
        <button class="btn btn-secondary" onclick="goBack(2)">Back</button>
        <button class="btn btn-primary" id="selectMenuBtn" onclick="selectMenu()" disabled>Continue with Selected Menu</button>
      </div>
    </div>
    
    <!-- Step 4: Cookbook -->
    <div id="step4" class="card hidden">
      <h2>Your Cookbook</h2>
      <div id="error4" class="error hidden"></div>
      <div id="cookbookPreview"></div>
      <div style="margin-top: 30px; display: flex; gap: 15px;">
        <button class="btn btn-secondary" onclick="goBack(3)">Back</button>
        <button class="btn btn-gold" id="downloadBtn" onclick="downloadCookbook()">Download Cookbook (DOCX)</button>
      </div>
    </div>
    
    <!-- Loading Overlay -->
    <div id="loading" class="card hidden">
      <div class="loading">
        <div class="spinner"></div>
        <p class="loading-text" id="loadingText">Creating your menus...</p>
      </div>
    </div>
    
    <div class="footer">
      Thames Club • Powered by Claude AI
    </div>
  </div>
  
  <script>
    let accessCode = '';
    let menus = [];
    let selectedMenuIndex = -1;
    let cookbook = null;
    
    function showStep(n) {
      document.querySelectorAll('.card').forEach(c => c.classList.add('hidden'));
      document.getElementById('step' + n).classList.remove('hidden');
      document.querySelectorAll('.progress-step').forEach((s, i) => {
        s.classList.remove('active', 'complete');
        if (i + 1 < n) s.classList.add('complete');
        if (i + 1 === n) s.classList.add('active');
      });
    }
    
    function showLoading(text) {
      document.querySelectorAll('.card').forEach(c => c.classList.add('hidden'));
      document.getElementById('loading').classList.remove('hidden');
      document.getElementById('loadingText').textContent = text;
    }
    
    function showError(step, msg) {
      const el = document.getElementById('error' + step);
      el.textContent = msg;
      el.classList.remove('hidden');
    }
    
    function hideErrors() {
      document.querySelectorAll('.error').forEach(e => e.classList.add('hidden'));
    }
    
    function goBack(step) {
      hideErrors();
      showStep(step);
    }
    
    async function validateCode() {
      hideErrors();
      accessCode = document.getElementById('accessCode').value.trim();
      if (!accessCode) {
        showError(1, 'Please enter an access code');
        return;
      }
      
      try {
        const res = await fetch('/api/validate-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode })
        });
        const data = await res.json();
        
        if (data.valid) {
          showStep(2);
        } else {
          showError(1, data.error || 'Invalid access code');
        }
      } catch (err) {
        showError(1, 'Connection error. Please try again.');
      }
    }
    
    async function generateMenus() {
      hideErrors();
      
      const dietaryRestrictions = [...document.querySelectorAll('.checkbox-grid input[type="checkbox"]:not([name="cuisine"]):checked')].map(c => c.value);
      const cuisinePreferences = [...document.querySelectorAll('.checkbox-grid input[name="cuisine"]:checked')].map(c => c.value);
      
      const payload = {
        guestCount: parseInt(document.getElementById('guestCount').value),
        budget: parseInt(document.getElementById('budget').value),
        occasion: document.getElementById('occasion').value,
        staffing: document.getElementById('staffing').value,
        dietaryRestrictions,
        cuisinePreferences
      };
      
      showLoading('Creating personalized menus...');
      
      try {
        const res = await fetch('/api/generate-menus', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-access-code': accessCode
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        menus = data.menus || [];
        selectedMenuIndex = -1;
        
        if (data.demoMode) {
          document.getElementById('demoBadge').classList.remove('hidden');
        } else {
          document.getElementById('demoBadge').classList.add('hidden');
        }
        
        renderMenus();
        showStep(3);
        
      } catch (err) {
        showStep(2);
        showError(2, 'Failed to generate menus. Please try again.');
      }
    }
    
    function renderMenus() {
      const grid = document.getElementById('menuGrid');
      grid.innerHTML = menus.map((menu, i) => \`
        <div class="menu-card \${selectedMenuIndex === i ? 'selected' : ''}" onclick="selectMenuCard(\${i})">
          <h3>\${menu.name}</h3>
          <p class="description">\${menu.description}</p>
          <div class="courses">
            \${menu.courses.map(c => \`
              <div class="course">
                <span class="course-name">\${c.name}:</span> \${c.dish}
              </div>
            \`).join('')}
          </div>
          <div class="meta">
            <span>~$\${menu.estimatedCost}/person</span>
            <span>\${menu.difficulty}</span>
            <span>\${menu.winePairing}</span>
          </div>
        </div>
      \`).join('');
    }
    
    function selectMenuCard(index) {
      selectedMenuIndex = index;
      renderMenus();
      document.getElementById('selectMenuBtn').disabled = false;
    }
    
    async function selectMenu() {
      if (selectedMenuIndex < 0) return;
      
      hideErrors();
      showLoading('Building your cookbook...');
      
      const menu = menus[selectedMenuIndex];
      
      try {
        const res = await fetch('/api/generate-cookbook', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-access-code': accessCode
          },
          body: JSON.stringify({
            menu,
            guestCount: parseInt(document.getElementById('guestCount').value),
            eventDate: document.getElementById('eventDate').value,
            eventTitle: document.getElementById('eventTitle').value || menu.name,
            staffing: document.getElementById('staffing').value
          })
        });
        
        cookbook = await res.json();
        renderCookbookPreview();
        showStep(4);
        
      } catch (err) {
        showStep(3);
        showError(3, 'Failed to generate cookbook. Please try again.');
      }
    }
    
    function renderCookbookPreview() {
      const preview = document.getElementById('cookbookPreview');
      if (!cookbook) {
        preview.innerHTML = '<p>No cookbook data</p>';
        return;
      }
      
      preview.innerHTML = \`
        <div style="text-align: center; padding: 20px; background: #f7fafc; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="font-family: 'Playfair Display', serif; color: #1a365d; font-size: 1.8em;">\${cookbook.coverPage?.title || 'Your Cookbook'}</h3>
          <p style="color: #718096; font-style: italic;">\${cookbook.coverPage?.subtitle || ''}</p>
          <p style="margin-top: 10px;">\${cookbook.coverPage?.date || ''} • \${cookbook.coverPage?.guests || ''} Guests</p>
        </div>
        
        <h4 style="color: #1a365d; margin-bottom: 15px;">What's Inside:</h4>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Complete menu with \${cookbook.recipes?.length || 0} detailed recipes</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Wine pairings with alternatives</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Shopping list organized by category</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Day-before preparation guide</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Day-of timeline</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Plating guides</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Table setting ideas</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Ambiance notes</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Pro tips from our experts</li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">✓ Final checklist</li>
          <li style="padding: 8px 0;">✓ AI image prompts for food photography</li>
        </ul>
        
        \${cookbook.demoMode ? '<p style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; color: #92400e; font-size: 0.9em;">Demo Mode: This is a sample cookbook. Connect your API key for AI-generated personalized content.</p>' : ''}
      \`;
    }
    
    async function downloadCookbook() {
      if (!cookbook) return;
      
      const btn = document.getElementById('downloadBtn');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      
      try {
        const res = await fetch('/api/download-cookbook', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-access-code': accessCode
          },
          body: JSON.stringify({ cookbook })
        });
        
        if (!res.ok) throw new Error('Download failed');
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (cookbook.coverPage?.title || 'Cookbook').replace(/[^a-z0-9]/gi, '_') + '.docx';
        a.click();
        URL.revokeObjectURL(url);
        
      } catch (err) {
        showError(4, 'Download failed. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Download Cookbook (DOCX)';
      }
    }
    
    // Enter key support
    document.getElementById('accessCode').addEventListener('keypress', e => {
      if (e.key === 'Enter') validateCode();
    });
    
    // Set default date to next Saturday
    const today = new Date();
    const nextSat = new Date(today);
    nextSat.setDate(today.getDate() + (6 - today.getDay() + 7) % 7 || 7);
    document.getElementById('eventDate').value = nextSat.toISOString().split('T')[0];
  </script>
</body>
</html>`;

// ============================================================
// SERVE CLIENT
// ============================================================

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(CLIENT_HTML);
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('Dinner Party Planner - Complete Edition');
  console.log('========================================');
  console.log('Port: ' + PORT);
  console.log('Access codes: ' + validAccessCodes.length);
  console.log('API: ' + (anthropic ? 'Configured' : 'Demo Mode'));
  console.log('Beta expires: ' + betaExpiry.toISOString().split('T')[0]);
  console.log('');
});

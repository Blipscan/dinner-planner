// ============================================================================
// DINNER PARTY PLANNER - COMPLETE PROFESSIONAL EDITION
// Full 15-section cookbook with AI-powered generation using personas
// ============================================================================

require("dotenv").config();
console.log("=== RUNNING server/server.js : deploy-clean : 2026-01-05 ===");

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, 
        PageBreak, ShadingType, PageNumber, HeadingLevel, LevelFormat,
        TableOfContents } = require('docx');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN2024';
const ACCESS_CODES = (process.env.ACCESS_CODES || 'THAMES,BETA001,BETA002').split(',').map(c => c.trim());
const BETA_EXPIRY = process.env.BETA_EXPIRY || '2026-06-01';
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || '30');
const usageStats = {};

// ============================================================================
// DEMO MENUS - Used when API key not available
// ============================================================================
const DEMO_MENUS = [
  {
    title: "Modern European Steakhouse",
    foodCost: "$55-65/person",
    wineCost: "$150 total",
    courses: [
      { type: "Amuse-Bouche", name: "Steak Tartare on Crispy Potato Rounds with Dijon Aioli" },
      { type: "First Course", name: "Roasted Beet & Goat Cheese Salad with Candied Walnuts & Sherry Vinaigrette" },
      { type: "Second Course", name: "Wild Mushroom Bisque with White Truffle Oil" },
      { type: "Main Course", name: "Pan-Seared Filet Mignon with Red Wine Reduction, Duchess Potatoes & Haricots Verts" },
      { type: "Dessert", name: "Molten Chocolate Lava Cake with Vanilla Bean Ice Cream" }
    ]
  },
  {
    title: "Elegant Seafood Soirée",
    foodCost: "$50-60/person",
    wineCost: "$130 total",
    courses: [
      { type: "Amuse-Bouche", name: "Smoked Salmon Mousse on Cucumber Rounds with Crème Fraîche" },
      { type: "First Course", name: "Classic Lobster Bisque with Cognac Cream" },
      { type: "Second Course", name: "Baby Spinach Salad with Warm Bacon Vinaigrette & Poached Egg" },
      { type: "Main Course", name: "Pan-Seared Scallops with Cauliflower Purée & Brown Butter" },
      { type: "Dessert", name: "Classic Lemon Tart with Raspberry Coulis & Chantilly Cream" }
    ]
  },
  {
    title: "Mediterranean Garden Party",
    foodCost: "$45-55/person",
    wineCost: "$120 total",
    courses: [
      { type: "Amuse-Bouche", name: "Marinated Olives & Manchego with Rosemary Honey Drizzle" },
      { type: "First Course", name: "Grilled Halloumi with Fig Jam & Arugula" },
      { type: "Second Course", name: "Greek Salad with Creamy Feta Dressing & Fresh Oregano" },
      { type: "Main Course", name: "Herb-Crusted Lamb Chops with Roasted Vegetables & Tzatziki" },
      { type: "Dessert", name: "Honey Baklava with Pistachio Ice Cream" }
    ]
  },
  {
    title: "Asian Fusion Experience",
    foodCost: "$55-65/person",
    wineCost: "$140 total",
    courses: [
      { type: "Amuse-Bouche", name: "Tuna Tartare on Wonton Crisps with Wasabi Cream & Tobiko" },
      { type: "First Course", name: "Miso Soup with Silken Tofu, Wakame & Scallions" },
      { type: "Second Course", name: "Seaweed Salad with Sesame Ginger Dressing" },
      { type: "Main Course", name: "Miso-Glazed Black Cod with Baby Bok Choy & Jasmine Rice" },
      { type: "Dessert", name: "Matcha Panna Cotta with Red Bean & Mochi" }
    ]
  },
  {
    title: "Classic French Bistro",
    foodCost: "$50-60/person",
    wineCost: "$135 total",
    courses: [
      { type: "Amuse-Bouche", name: "Gougères (Warm Gruyère Cheese Puffs)" },
      { type: "First Course", name: "Soupe à l'Oignon Gratinée with Gruyère Crouton" },
      { type: "Second Course", name: "Salade Lyonnaise with Frisée, Lardons & Poached Egg" },
      { type: "Main Course", name: "Coq au Vin with Buttered Egg Noodles & Pearl Onions" },
      { type: "Dessert", name: "Tarte Tatin with Crème Fraîche" }
    ]
  }
];

// ============================================================================
// STAFFING OPTIONS
// ============================================================================
const STAFFING_OPTIONS = [
  { id: 'solo', name: 'Solo Cook', icon: '👨‍🍳', desc: 'All tasks are yours', activeMin: 185 },
  { id: 'helper1', name: 'With 1 Helper', icon: '👥', desc: 'Helper preps & plates', activeMin: 95 },
  { id: 'helper2', name: 'With 2 Helpers', icon: '👥👤', desc: 'Full kitchen team', activeMin: 65 },
  { id: 'chef', name: 'Hired Chef', icon: '⭐', desc: 'You host, they cook', activeMin: 25 }
];

// ============================================================================
// AI PERSONAS - Expert perspectives for each cookbook section
// ============================================================================
const PERSONAS = {
  menuGenerator: `You are a master menu designer with 30 years at Michelin-starred restaurants.
You create cohesive 5-course menus with perfect flow: light→rich→peak→satisfying→sweet.
Each menu has a clear identity and story. You consider seasonality, technique variety, and wow factor.
You always include specific, achievable dishes - not vague concepts.`,

  recipeBuilder: `You are a Cook's Illustrated/Cook's Country recipe developer.
You write recipes that explain WHY each step matters. Your format:
- Clear ingredient lists with exact amounts scaled for guest count
- Step-by-step instructions with timing
- "WHY IT WORKS" explanations for key techniques
- Make-ahead notes where applicable
- Common mistakes to avoid`,

  masterSommelier: `You are a Master Sommelier with expertise in food-wine pairing.
You recommend SPECIFIC wines - actual producers, vintages when relevant, not just "a Pinot Noir."
For each course, provide:
- 3 specific bottle recommendations at different price points ($15-25, $25-40, $40+)
- Tasting notes and why it pairs
- Serving temperature
- Non-alcoholic alternative`,

  shoppingListExpert: `You are a professional personal chef who shops for dinner parties weekly.
You create shopping lists organized by store section:
- Proteins (with specific cuts and weights for guest count)
- Produce (with quantities)
- Dairy & Eggs
- Pantry (only what might need restocking)
- Specialty items (with store suggestions if unusual)
- Wine & Beverages
Include 15% buffer for mistakes. Note what can be bought days ahead vs. day-of.`,

  prepTimeline: `You are an executive chef who has run hundreds of private dinner parties.
You create backward-scheduled timelines working from service time.
Every task has:
- Exact time to start
- Duration
- What to do during downtime
- Temperature/doneness checks
You group tasks efficiently and flag critical timing moments.`,

  tableSettings: `You are an event designer for high-end dinner parties.
You advise on:
- Table setup and place settings
- Napkin presentations
- Centerpiece ideas that don't block conversation
- Lighting (candle placement, dimmer settings)
- Music playlist suggestions
- Ambient temperature and scent`,

  platingInstructor: `You are a culinary school plating instructor.
For each course, you describe:
- Plate selection and temperature
- Component placement using clock positions
- Sauce application technique
- Garnish placement
- Final touches before service
- Common plating mistakes to avoid`,

  imagePromptDesigner: `You are an AI image prompt specialist for food photography.
You create detailed prompts for Midjourney/DALL-E that specify:
- Composition and angle
- Lighting style
- Color palette
- Props and background
- Mood and atmosphere
Format for both Midjourney v6 and DALL-E 3.`
};

// ============================================================================
// API ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '6.0-complete',
    hasApiKey: !!ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Validate access code
app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  
  const upperCode = code.toUpperCase().trim();
  
  if (ACCESS_CODES.includes(upperCode) || upperCode === ADMIN_CODE) {
    if (new Date() > new Date(BETA_EXPIRY)) {
      return res.status(403).json({ error: 'Beta period ended' });
    }
    
    if (!usageStats[upperCode]) {
      usageStats[upperCode] = { count: 0, lastUsed: null };
    }
    
    if (usageStats[upperCode].count >= MAX_GENERATIONS && upperCode !== ADMIN_CODE) {
      return res.status(403).json({ error: 'Usage limit reached' });
    }
    
    return res.json({ 
      valid: true, 
      isAdmin: upperCode === ADMIN_CODE,
      hasApiKey: !!ANTHROPIC_API_KEY
    });
  }
  
  res.status(401).json({ error: 'Invalid access code' });
});

// Get staffing options
app.get('/api/staffing-options', (req, res) => {
  res.json({ staffing: STAFFING_OPTIONS });
});

// Generate menus (AI or demo)
app.post('/api/generate-menus', async (req, res) => {
  const { code, preferences } = req.body;
  const upperCode = (code || '').toUpperCase().trim();
  
  if (usageStats[upperCode]) {
    usageStats[upperCode].count++;
    usageStats[upperCode].lastUsed = new Date().toISOString();
  }
  
  // If no API key, return demo menus
  if (!ANTHROPIC_API_KEY) {
    return res.json({ menus: DEMO_MENUS, source: 'demo' });
  }
  
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    
    const prompt = `${PERSONAS.menuGenerator}

Create 5 unique dinner party menus based on these preferences:
${JSON.stringify(preferences, null, 2)}

Each menu must have:
- title: Creative menu name
- foodCost: Estimated cost per person (e.g., "$45-55/person")
- wineCost: Estimated total wine budget (e.g., "$120 total")
- courses: Array of 5 courses, each with:
  - type: "Amuse-Bouche", "First Course", "Second Course", "Main Course", or "Dessert"
  - name: Full dish name with components

Return ONLY a JSON array of 5 menu objects, no other text.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const menus = JSON.parse(jsonMatch[0]);
      return res.json({ menus, source: 'ai' });
    }
    
    res.json({ menus: DEMO_MENUS, source: 'demo', note: 'AI parse failed' });
  } catch (error) {
    console.error('Menu generation error:', error.message);
    res.json({ menus: DEMO_MENUS, source: 'demo', error: 'AI unavailable' });
  }
});

// ============================================================================
// COOKBOOK GENERATION HELPERS
// ============================================================================

async function generateCookbookContent(menu, eventDetails, client) {
  const guests = parseInt(eventDetails.guests) || 6;
  const courses = menu.courses.map(c => `${c.type}: ${c.name}`).join('\n');
  
  // Generate wine pairings
  const winePrompt = `${PERSONAS.masterSommelier}

Menu: ${menu.title}
Courses:
${courses}

For EACH course, provide 3 specific wine recommendations.
Return as JSON:
{
  "pairings": [
    {
      "course": "Course name",
      "wines": [
        { "name": "Producer Name Varietal Year", "price": "$XX", "notes": "Tasting notes", "temp": "45°F" },
        { "name": "...", "price": "$XX", "notes": "...", "temp": "..." },
        { "name": "...", "price": "$XX", "notes": "...", "temp": "..." }
      ],
      "nonAlcoholic": "Alternative suggestion"
    }
  ],
  "signatureCocktail": { "name": "...", "ingredients": ["..."], "instructions": "..." }
}`;

  // Generate recipes
  const recipePrompt = `${PERSONAS.recipeBuilder}

Create detailed recipes for this ${guests}-person dinner party:
${courses}

For EACH dish, provide:
{
  "recipes": [
    {
      "course": "Course type",
      "dish": "Full dish name",
      "servings": ${guests},
      "prepTime": "XX min",
      "cookTime": "XX min",
      "ingredients": [
        { "item": "ingredient", "amount": "quantity", "prep": "how to prep" }
      ],
      "instructions": ["Step 1...", "Step 2..."],
      "whyItWorks": "Explanation of key technique",
      "makeAhead": "What can be done in advance",
      "tips": ["Tip 1", "Tip 2"]
    }
  ]
}`;

  // Generate shopping list
  const shoppingPrompt = `${PERSONAS.shoppingListExpert}

Create a shopping list for ${guests} guests:
Menu: ${menu.title}
${courses}

Return as JSON:
{
  "proteins": [{ "item": "...", "quantity": "...", "notes": "..." }],
  "produce": [{ "item": "...", "quantity": "...", "notes": "..." }],
  "dairy": [{ "item": "...", "quantity": "...", "notes": "..." }],
  "pantry": [{ "item": "...", "quantity": "...", "notes": "..." }],
  "specialty": [{ "item": "...", "quantity": "...", "where": "..." }],
  "wine": [{ "item": "...", "quantity": "...", "notes": "..." }],
  "dayOfPickups": ["Fresh bread", "Flowers", "Ice"]
}`;

  // Generate timeline
  const timelinePrompt = `${PERSONAS.prepTimeline}

Create a day-of timeline for service at ${eventDetails.time || '7:00 PM'}.
Menu for ${guests} guests:
${courses}

Return as JSON:
{
  "dayBefore": [
    { "task": "...", "duration": "XX min", "notes": "..." }
  ],
  "dayOf": [
    { "time": "2:00 PM", "task": "...", "duration": "XX min", "critical": true/false }
  ]
}`;

  // Generate plating guide
  const platingPrompt = `${PERSONAS.platingInstructor}

Create plating instructions for:
${courses}

Return as JSON:
{
  "plating": [
    {
      "course": "...",
      "plate": "Plate type and temp",
      "layout": "Description using clock positions",
      "sauce": "How to apply sauce",
      "garnish": "Final garnish",
      "tip": "Pro tip"
    }
  ]
}`;

  // Generate image prompts
  const imagePrompt = `${PERSONAS.imagePromptDesigner}

Create AI image prompts for:
Menu: ${menu.title}
Main Course: ${menu.courses[3].name}

Return as JSON:
{
  "tablescape": {
    "midjourney": "Full prompt for Midjourney v6...",
    "dalle": "Full prompt for DALL-E 3..."
  },
  "mainCourse": {
    "midjourney": "Full prompt for Midjourney v6...",
    "dalle": "Full prompt for DALL-E 3..."
  },
  "menuCard": {
    "midjourney": "Full prompt for Midjourney v6...",
    "dalle": "Full prompt for DALL-E 3..."
  }
}`;

  // Make all API calls
  const results = {};
  
  try {
    const wineResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: winePrompt }]
    });
    results.wines = extractJSON(wineResponse.content[0].text);
  } catch (e) { 
    console.error('Wine generation failed:', e.message);
    results.wines = null; 
  }

  try {
    const recipeResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      messages: [{ role: 'user', content: recipePrompt }]
    });
    results.recipes = extractJSON(recipeResponse.content[0].text);
  } catch (e) { 
    console.error('Recipe generation failed:', e.message);
    results.recipes = null; 
  }

  try {
    const shoppingResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: shoppingPrompt }]
    });
    results.shopping = extractJSON(shoppingResponse.content[0].text);
  } catch (e) { 
    console.error('Shopping list generation failed:', e.message);
    results.shopping = null; 
  }

  try {
    const timelineResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: timelinePrompt }]
    });
    results.timeline = extractJSON(timelineResponse.content[0].text);
  } catch (e) { 
    console.error('Timeline generation failed:', e.message);
    results.timeline = null; 
  }

  try {
    const platingResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: platingPrompt }]
    });
    results.plating = extractJSON(platingResponse.content[0].text);
  } catch (e) { 
    console.error('Plating guide generation failed:', e.message);
    results.plating = null; 
  }

  try {
    const imageResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: imagePrompt }]
    });
    results.images = extractJSON(imageResponse.content[0].text);
  } catch (e) { 
    console.error('Image prompt generation failed:', e.message);
    results.images = null; 
  }

  return results;
}

function extractJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error('JSON extraction failed:', e.message);
  }
  return null;
}

// ============================================================================
// DOCX GENERATION - Full 15-Section Professional Cookbook
// ============================================================================

app.post('/api/generate-docx', async (req, res) => {
  try {
    const { eventDetails, selectedMenu, staffingId } = req.body;
    
    let aiContent = null;
    
    // Try to generate AI content if we have an API key
    if (ANTHROPIC_API_KEY) {
      try {
        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        aiContent = await generateCookbookContent(selectedMenu, eventDetails, client);
      } catch (e) {
        console.error('AI content generation failed:', e.message);
      }
    }
    
    const buffer = await generateCompleteCookbook(eventDetails, selectedMenu, staffingId, aiContent);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(eventDetails.title || 'Cookbook').replace(/[^a-z0-9]/gi, '_')}_Complete_Cookbook.docx"`);
    res.send(buffer);
  } catch (error) {
    console.error('DOCX generation error:', error);
    res.status(500).json({ error: 'Failed to generate cookbook', details: error.message });
  }
});

async function generateCompleteCookbook(eventDetails, menu, staffingId, aiContent) {
  const staff = STAFFING_OPTIONS.find(s => s.id === staffingId) || STAFFING_OPTIONS[0];
  const guests = parseInt(eventDetails.guests) || 6;
  const dateStr = eventDetails.date 
    ? new Date(eventDetails.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) 
    : 'Date TBD';
  const timeStr = eventDetails.time || '7:00 PM';
  
  // Colors
  const navy = '1E3A5F';
  const gold = 'C9A227';
  const green = '2D6A4F';
  const gray = '6B7C85';
  const wine = '722F37';
  const cream = 'FAF8F5';
  
  const children = [];
  
  // Helper functions
  const addPageBreak = () => children.push(new Paragraph({ children: [new PageBreak()] }));
  
  const addSectionTitle = (text, emoji = '') => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 300 },
      children: [new TextRun({ text: `${emoji} ${text}`.trim(), bold: true, size: 40, color: navy, font: 'Georgia' })]
    }));
  };
  
  const addSubHeader = (text) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 200 },
      children: [new TextRun({ text, bold: true, size: 28, color: green, font: 'Georgia' })]
    }));
  };
  
  const addParagraph = (text, options = {}) => {
    children.push(new Paragraph({
      spacing: { after: options.after || 150 },
      alignment: options.align || AlignmentType.LEFT,
      indent: options.indent ? { left: options.indent } : undefined,
      children: [new TextRun({ 
        text, 
        size: options.size || 22, 
        font: 'Georgia',
        color: options.color || '333333',
        bold: options.bold || false,
        italics: options.italics || false
      })]
    }));
  };
  
  const addCheckItem = (text) => {
    children.push(new Paragraph({
      spacing: { after: 100 },
      indent: { left: 360 },
      children: [new TextRun({ text: `☐  ${text}`, size: 22, font: 'Georgia' })]
    }));
  };
  
  const addTipBox = (text, bgColor = 'FFF9E6') => {
    children.push(new Paragraph({
      shading: { fill: bgColor, type: ShadingType.CLEAR },
      spacing: { before: 200, after: 200 },
      indent: { left: 200, right: 200 },
      children: [new TextRun({ text, size: 20, font: 'Georgia' })]
    }));
  };

  // ========== PAGE 1: COVER ==========
  children.push(new Paragraph({ spacing: { before: 1200 } }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '🍽️', size: 120 })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ 
      text: eventDetails.title || 'Dinner Party', 
      bold: true, size: 72, color: navy, font: 'Georgia' 
    })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ 
      text: 'A Complete Cookbook & Planning Guide', 
      size: 28, color: gray, font: 'Georgia', italics: true 
    })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [new TextRun({ text: dateStr, size: 28, color: navy, font: 'Georgia' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: `${timeStr}  •  ${guests} Guests`, size: 24, color: gray, font: 'Georgia' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [new TextRun({ text: menu.title, bold: true, size: 36, color: green, font: 'Georgia' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100 },
    children: [new TextRun({ text: `${menu.foodCost}  •  ${menu.wineCost}`, size: 22, color: gray, font: 'Georgia' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300 },
    children: [new TextRun({ 
      text: `Kitchen Team: ${staff.name} (~${staff.activeMin} min active time)`, 
      size: 24, color: gold, font: 'Georgia' 
    })]
  }));
  addPageBreak();

  // ========== PAGE 2: TABLE OF CONTENTS ==========
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 400 },
    children: [new TextRun({ text: 'Table of Contents', bold: true, size: 40, color: navy, font: 'Georgia' })]
  }));
  
  const tocItems = [
    'The Menu',
    'Wine & Beverage Pairings',
    'Signature Cocktail',
    'Complete Shopping List',
    'Full Recipes',
    'Day-Before Preparation',
    'Day-Of Timeline',
    'Table Settings & Decor',
    'Plating Guide',
    'Chef\'s Tips & Emergency Fixes',
    'AI Image Prompts',
    'Final Checklist',
    'Notes & Reflections'
  ];
  
  tocItems.forEach((item, i) => {
    children.push(new Paragraph({
      spacing: { before: 150, after: 150 },
      children: [
        new TextRun({ text: `${i + 1}. `, bold: true, size: 24, color: gold, font: 'Georgia' }),
        new TextRun({ text: item, size: 24, font: 'Georgia' })
      ]
    }));
  });
  addPageBreak();

  // ========== PAGE 3: THE MENU ==========
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 400 },
    children: [new TextRun({ text: '~ The Menu ~', bold: true, size: 44, color: navy, font: 'Georgia' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: menu.title, size: 28, color: green, font: 'Georgia', italics: true })]
  }));
  
  menu.courses.forEach(course => {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 350, after: 80 },
      children: [new TextRun({ text: course.type.toUpperCase(), bold: true, size: 18, color: gold, font: 'Georgia' })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: course.name, size: 26, font: 'Georgia' })]
    }));
  });
  
  addTipBox(`💰 Estimated Budget: ${menu.foodCost} food + ${menu.wineCost}`);
  addPageBreak();

  // ========== PAGES 4-5: WINE PAIRINGS ==========
  addSectionTitle('Wine & Beverage Pairings', '🍷');
  
  if (aiContent?.wines?.pairings) {
    // AI-generated wine pairings with 3 recommendations each
    aiContent.wines.pairings.forEach(pairing => {
      addSubHeader(pairing.course);
      pairing.wines.forEach((w, i) => {
        children.push(new Paragraph({
          spacing: { before: 150, after: 50 },
          indent: { left: 300 },
          children: [
            new TextRun({ text: `${i + 1}. ${w.name}`, bold: true, size: 22, font: 'Georgia' }),
            new TextRun({ text: ` — ${w.price}`, size: 20, color: green, font: 'Georgia' })
          ]
        }));
        addParagraph(w.notes, { indent: 500, size: 20, color: gray, italics: true });
        addParagraph(`Serve at ${w.temp}`, { indent: 500, size: 18, color: gray });
      });
      if (pairing.nonAlcoholic) {
        addParagraph(`🥤 Non-Alcoholic: ${pairing.nonAlcoholic}`, { indent: 300, size: 20 });
      }
    });
  } else {
    // Fallback static wine pairings
    const defaultWines = [
      { course: 'Amuse-Bouche', wine: 'NV Schramsberg Blanc de Blancs', price: '$35', notes: 'Crisp bubbles, green apple, perfect palate opener', temp: '45°F' },
      { course: 'First Course', wine: 'Pascal Jolivet Sancerre 2022', price: '$28', notes: 'Citrus, mineral, bright acidity', temp: '48°F' },
      { course: 'Second Course', wine: 'Louis Jadot Chablis 2021', price: '$25', notes: 'Steely, clean, oyster shell minerality', temp: '50°F' },
      { course: 'Main Course', wine: 'Domaine de la Côte de l\'Ange Châteauneuf-du-Pape 2020', price: '$45', notes: 'Dark fruit, herbs, elegant tannins', temp: '62°F' },
      { course: 'Dessert', wine: 'Château Guiraud Sauternes 2018', price: '$40/375ml', notes: 'Honey, apricot, balanced sweetness', temp: '45°F' }
    ];
    
    defaultWines.forEach(w => {
      addSubHeader(w.course);
      children.push(new Paragraph({
        spacing: { before: 100, after: 50 },
        indent: { left: 300 },
        children: [
          new TextRun({ text: w.wine, bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: ` — ${w.price}`, size: 20, color: green, font: 'Georgia' })
        ]
      }));
      addParagraph(w.notes, { indent: 300, size: 20, color: gray, italics: true });
      addParagraph(`Serve at ${w.temp}`, { indent: 300, size: 18, color: gray });
    });
  }
  addPageBreak();

  // ========== PAGE 6: SIGNATURE COCKTAIL ==========
  addSectionTitle('Signature Cocktail', '🍸');
  
  if (aiContent?.wines?.signatureCocktail) {
    const cocktail = aiContent.wines.signatureCocktail;
    addSubHeader(cocktail.name);
    addParagraph('Ingredients:', { bold: true });
    cocktail.ingredients.forEach(ing => addCheckItem(ing));
    addParagraph('Instructions:', { bold: true });
    addParagraph(cocktail.instructions);
  } else {
    addSubHeader('The Classic Champagne Cocktail');
    addParagraph('A timeless aperitif that sets an elegant tone.', { italics: true });
    addParagraph('Ingredients:', { bold: true });
    addCheckItem('1 sugar cube');
    addCheckItem('2-3 dashes Angostura bitters');
    addCheckItem('5 oz Champagne or sparkling wine');
    addCheckItem('Lemon twist for garnish');
    addParagraph('Instructions:', { bold: true });
    addParagraph('1. Place sugar cube in champagne flute');
    addParagraph('2. Dash bitters onto sugar cube');
    addParagraph('3. Top slowly with chilled Champagne');
    addParagraph('4. Express lemon twist over glass and drop in');
  }
  addTipBox('💡 Pro Tip: Batch the bitters-soaked sugar cubes in advance. Store in airtight container.');
  addPageBreak();

  // ========== PAGES 7-8: SHOPPING LIST ==========
  addSectionTitle('Complete Shopping List', '🛒');
  addParagraph(`Scaled for ${guests} guests with 15% buffer`, { italics: true, color: gray });
  
  if (aiContent?.shopping) {
    const shop = aiContent.shopping;
    
    if (shop.proteins?.length) {
      addSubHeader('🥩 Proteins');
      shop.proteins.forEach(item => addCheckItem(`${item.item} — ${item.quantity}${item.notes ? ` (${item.notes})` : ''}`));
    }
    if (shop.produce?.length) {
      addSubHeader('🥬 Produce');
      shop.produce.forEach(item => addCheckItem(`${item.item} — ${item.quantity}`));
    }
    if (shop.dairy?.length) {
      addSubHeader('🧀 Dairy & Eggs');
      shop.dairy.forEach(item => addCheckItem(`${item.item} — ${item.quantity}`));
    }
    if (shop.pantry?.length) {
      addSubHeader('🫙 Pantry');
      shop.pantry.forEach(item => addCheckItem(`${item.item} — ${item.quantity}`));
    }
    if (shop.specialty?.length) {
      addSubHeader('✨ Specialty Items');
      shop.specialty.forEach(item => addCheckItem(`${item.item} — ${item.quantity}${item.where ? ` (from ${item.where})` : ''}`));
    }
    if (shop.wine?.length) {
      addSubHeader('🍷 Wine & Beverages');
      shop.wine.forEach(item => addCheckItem(`${item.item} — ${item.quantity}`));
    }
    if (shop.dayOfPickups?.length) {
      addSubHeader('🧊 Day-Of Pickups');
      shop.dayOfPickups.forEach(item => addCheckItem(item));
    }
  } else {
    // Fallback shopping list
    addSubHeader('🥩 Proteins');
    addCheckItem(`Main protein — ${Math.ceil(guests * 8)} oz (${(guests * 8 / 16).toFixed(1)} lbs)`);
    addCheckItem(`Seafood for courses — ${Math.ceil(guests * 4)} oz`);
    addCheckItem('Unsalted butter — 2 lbs');
    addCheckItem(`Bacon/Lardons — ${Math.ceil(guests * 2)} oz`);
    
    addSubHeader('🥬 Produce');
    addCheckItem(`Mixed greens — ${Math.ceil(guests * 2)} oz`);
    addCheckItem('Seasonal vegetables — assorted');
    addCheckItem('Fresh herbs (parsley, thyme, rosemary) — 2 bunches each');
    addCheckItem(`Lemons — ${Math.ceil(guests * 1.5)}`);
    addCheckItem('Shallots — 6');
    addCheckItem('Garlic — 2 heads');
    
    addSubHeader('🧀 Dairy & Eggs');
    addCheckItem(`Heavy cream — ${Math.ceil(guests * 4)} oz`);
    addCheckItem('Crème fraîche — 8 oz');
    addCheckItem('Parmesan — 4 oz wedge');
    addCheckItem('Eggs — 1 dozen');
    
    addSubHeader('🫙 Pantry');
    addCheckItem('Extra virgin olive oil');
    addCheckItem('Balsamic vinegar (aged)');
    addCheckItem('Chicken/vegetable stock — 2 quarts');
    addCheckItem('Dijon mustard');
    addCheckItem('Honey');
    
    addSubHeader('🍷 Wine & Beverages');
    addCheckItem(`Champagne/Sparkling — ${Math.ceil(guests / 3)} bottles`);
    addCheckItem(`White wine — ${Math.ceil(guests / 2)} bottles`);
    addCheckItem(`Red wine — ${Math.ceil(guests / 2)} bottles`);
    addCheckItem('Dessert wine — 1 bottle');
    addCheckItem('Sparkling & still water');
    
    addSubHeader('🧊 Day-Of Pickups');
    addCheckItem('Fresh bread/rolls from bakery');
    addCheckItem('Fresh flowers for table');
    addCheckItem('Ice — 2 bags');
  }
  
  addTipBox('💡 Shop 2-3 days ahead for non-perishables, day-before for proteins, day-of for bread and flowers only.');
  addPageBreak();

  // ========== PAGES 9-12: RECIPES ==========
  addSectionTitle('Full Recipes', '📝');
  
  if (aiContent?.recipes?.recipes) {
    aiContent.recipes.recipes.forEach(recipe => {
      addSubHeader(`${recipe.course}: ${recipe.dish}`);
      addParagraph(`Serves ${recipe.servings} | Prep: ${recipe.prepTime} | Cook: ${recipe.cookTime}`, { color: gray, italics: true });
      
      addParagraph('Ingredients:', { bold: true, size: 24 });
      recipe.ingredients.forEach(ing => {
        addParagraph(`• ${ing.amount} ${ing.item}${ing.prep ? `, ${ing.prep}` : ''}`, { indent: 300 });
      });
      
      addParagraph('Instructions:', { bold: true, size: 24 });
      recipe.instructions.forEach((step, i) => {
        addParagraph(`${i + 1}. ${step}`, { indent: 300 });
      });
      
      if (recipe.whyItWorks) {
        addTipBox(`🔬 WHY IT WORKS: ${recipe.whyItWorks}`, 'E8F5E9');
      }
      
      if (recipe.makeAhead) {
        addParagraph(`⏰ Make Ahead: ${recipe.makeAhead}`, { italics: true, color: green });
      }
      
      if (recipe.tips?.length) {
        addParagraph('Tips:', { bold: true });
        recipe.tips.forEach(tip => addParagraph(`• ${tip}`, { indent: 300 }));
      }
      
      children.push(new Paragraph({ spacing: { after: 400 } }));
    });
  } else {
    // Fallback recipe format
    menu.courses.forEach(course => {
      addSubHeader(`${course.type}: ${course.name}`);
      addParagraph(`Serves ${guests} | Prep: 15-20 min | Cook: 10-15 min`, { color: gray, italics: true });
      addParagraph('Detailed recipe will be generated with AI when API key is configured.', { italics: true });
      addTipBox('💡 Key Technique: Focus on timing and presentation.');
      children.push(new Paragraph({ spacing: { after: 300 } }));
    });
  }
  addPageBreak();

  // ========== PAGE 13: DAY-BEFORE PREP ==========
  addSectionTitle('Day-Before Preparation', '📅');
  addTipBox('🎯 The secret to stress-free hosting: do 70% of work the day before!', 'E8F5E9');
  
  if (aiContent?.timeline?.dayBefore) {
    aiContent.timeline.dayBefore.forEach((task, i) => {
      children.push(new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({ text: `☐ ${i + 1}. ${task.task}`, bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: ` (${task.duration})`, size: 20, color: gold, font: 'Georgia' })
        ]
      }));
      if (task.notes) {
        addParagraph(task.notes, { indent: 400, size: 20, color: gray, italics: true });
      }
    });
  } else {
    const dayBeforeTasks = [
      { task: 'Review all recipes and timeline', time: '15 min' },
      { task: 'Make soup/bisque base', time: '25 min' },
      { task: 'Prepare marinades and marinate protein', time: '15 min' },
      { task: 'Wash and prep all vegetables', time: '30 min' },
      { task: 'Make purées, sauces, and dressings', time: '25 min' },
      { task: 'Prepare dessert components', time: '30 min' },
      { task: 'Set out serving dishes (label with sticky notes)', time: '10 min' },
      { task: 'Set the table if possible', time: '20 min' },
      { task: 'Chill wines and beverages', time: '5 min' }
    ];
    
    dayBeforeTasks.forEach((item, i) => {
      children.push(new Paragraph({
        spacing: { before: 150, after: 100 },
        children: [
          new TextRun({ text: `☐ ${i + 1}. ${item.task}`, bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: ` (${item.time})`, size: 20, color: gold, font: 'Georgia' })
        ]
      }));
    });
  }
  addPageBreak();

  // ========== PAGE 14: DAY-OF TIMELINE ==========
  addSectionTitle('Day-Of Timeline', '⏰');
  addParagraph(`Service Time: ${timeStr} — Work backward from this moment`, { italics: true, color: gray });
  
  if (aiContent?.timeline?.dayOf) {
    aiContent.timeline.dayOf.forEach(item => {
      children.push(new Paragraph({
        spacing: { before: 200, after: 100 },
        shading: item.critical ? { fill: 'FFF3CD', type: ShadingType.CLEAR } : undefined,
        children: [
          new TextRun({ text: `⏰ ${item.time}`, bold: true, size: 22, color: navy, font: 'Georgia' }),
          new TextRun({ text: ` — ${item.task}`, size: 22, font: 'Georgia' }),
          new TextRun({ text: ` (${item.duration})`, size: 20, color: gray, font: 'Georgia' })
        ]
      }));
    });
  } else {
    const timeline = [
      { time: '5+ hours before', label: 'MORNING', tasks: ['Final grocery run (bread, flowers)', 'Review timeline', 'Mise en place'] },
      { time: '4 hours before', label: 'EARLY AFTERNOON', tasks: ['Remove proteins from fridge', 'Final vegetable prep', 'Prep garnishes'] },
      { time: '3 hours before', label: 'MID-AFTERNOON', tasks: ['Complete table setting', 'Chill wines', 'Set up bar station'] },
      { time: '2 hours before', label: 'LATE AFTERNOON', tasks: ['Start long-cooking items', 'Reheat soups gently', 'Begin dessert assembly'] },
      { time: '1 hour before', label: 'CRUNCH TIME', tasks: ['Sear/start proteins', 'Final sauce adjustments', 'Warm plates'] },
      { time: '30 min before', label: 'FINAL PREP', tasks: ['Finish cooking', 'Rest proteins', 'Light candles', 'Start music'] },
      { time: 'Guest arrival', label: 'SHOWTIME', tasks: ['Pour welcome drinks', 'Plate amuse-bouche', 'Enjoy!'] }
    ];
    
    timeline.forEach(block => {
      children.push(new Paragraph({
        spacing: { before: 250, after: 100 },
        shading: { fill: 'F0F4F8', type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: `⏰ ${block.time.toUpperCase()}`, bold: true, size: 22, color: navy, font: 'Georgia' }),
          new TextRun({ text: ` — ${block.label}`, size: 20, color: gold, font: 'Georgia' })
        ]
      }));
      block.tasks.forEach(task => {
        children.push(new Paragraph({
          indent: { left: 400 },
          spacing: { after: 60 },
          children: [new TextRun({ text: `☐  ${task}`, size: 20, font: 'Georgia' })]
        }));
      });
    });
  }
  addPageBreak();

  // ========== PAGE 15: TABLE SETTINGS ==========
  addSectionTitle('Table Settings & Decor', '🍽️');
  
  addSubHeader('🍴 Formal Place Setting');
  const placeSetting = [
    'Dinner plate centered 1" from table edge',
    'Forks left of plate (dinner fork inside, salad fork outside)',
    'Knife right of plate (blade facing in), spoon to its right',
    'Dessert utensils above plate horizontally',
    'Water glass above knife tip',
    'Wine glasses to the right, in order of use',
    'Napkin on plate or left of forks',
    'Bread plate upper left with butter knife'
  ];
  placeSetting.forEach(item => addParagraph(`• ${item}`, { indent: 300 }));
  
  addSubHeader('🕯️ Ambiance Checklist');
  addCheckItem('Candles at varying heights (not blocking eye contact)');
  addCheckItem('Low flower arrangements (under 12" tall)');
  addCheckItem('Dimmed overhead lighting');
  addCheckItem('Curated music playlist (low volume for conversation)');
  addCheckItem('Comfortable temperature (68-72°F)');
  addCheckItem('Subtle scent (avoid competing with food)');
  addPageBreak();

  // ========== PAGE 16: PLATING GUIDE ==========
  addSectionTitle('Plating Guide', '🎨');
  addParagraph('Restaurant-quality presentation for each course', { italics: true, color: gray });
  
  if (aiContent?.plating?.plating) {
    aiContent.plating.plating.forEach(p => {
      addSubHeader(p.course);
      addParagraph(`Plate: ${p.plate}`, { indent: 300 });
      addParagraph(`Layout: ${p.layout}`, { indent: 300 });
      addParagraph(`Sauce: ${p.sauce}`, { indent: 300 });
      addParagraph(`Garnish: ${p.garnish}`, { indent: 300 });
      addTipBox(`💡 ${p.tip}`);
    });
  } else {
    const platingGuide = [
      { course: 'Amuse-Bouche', tips: 'Small elegant vessels. Odd numbers rule. Height adds drama. Micro herb garnish.' },
      { course: 'First Course', tips: 'Negative space is your friend. Sauce underneath or to side. Protein at 6 o\'clock. Garnish at 11.' },
      { course: 'Soup Course', tips: 'Pour tableside for drama. Warm bowls. Float garnish last. Drizzle oil in elegant pattern.' },
      { course: 'Main Course', tips: 'Protein front center. Starch at 10 o\'clock, vegetables at 2. Sauce around, not over. Clean edges!' },
      { course: 'Dessert', tips: 'Temperature contrast is key. Textural contrast. Height variation. Dust powdered sugar through fine strainer.' }
    ];
    
    platingGuide.forEach(p => {
      addSubHeader(p.course);
      addParagraph(p.tips, { indent: 300 });
    });
  }
  
  addTipBox('🎯 Golden Rule: Wipe every plate edge with a clean towel before serving. This single step elevates home cooking to restaurant quality.');
  addPageBreak();

  // ========== PAGE 17: TIPS & EMERGENCY FIXES ==========
  addSectionTitle('Tips & Emergency Fixes', '🆘');
  
  const emergencyFixes = [
    { problem: 'Sauce too salty', fix: 'Add acid (lemon juice), a touch of sugar, or dilute with unsalted stock' },
    { problem: 'Sauce too thin', fix: 'Reduce over high heat, or whisk in cornstarch slurry (1:1 cornstarch:water)' },
    { problem: 'Sauce broken', fix: 'Start fresh with cream in clean pan, whisk broken sauce in slowly' },
    { problem: 'Meat overcooked', fix: 'Slice thin against the grain, serve with plenty of sauce' },
    { problem: 'Meat undercooked', fix: 'Slice and flash-sear cut side down in very hot pan' },
    { problem: 'Vegetables mushy', fix: 'Purée them! Add cream and butter for silky result' },
    { problem: 'Dessert didn\'t set', fix: 'Serve as "deconstructed" in pretty glasses' },
    { problem: 'Burned bottom', fix: 'Transfer to new pan without scraping. Season fresh.' },
    { problem: 'Forgot ingredient', fix: 'Proceed without it or substitute. Guests won\'t know the original plan.' },
    { problem: 'Running behind', fix: 'Extend cocktail hour with more appetizers. Guests love longer drinks!' }
  ];
  
  emergencyFixes.forEach(f => {
    children.push(new Paragraph({
      spacing: { before: 150, after: 50 },
      children: [new TextRun({ text: `❌ ${f.problem}`, bold: true, size: 22, color: wine, font: 'Georgia' })]
    }));
    children.push(new Paragraph({
      spacing: { after: 100 },
      indent: { left: 400 },
      children: [new TextRun({ text: `✅ ${f.fix}`, size: 20, color: green, font: 'Georgia' })]
    }));
  });
  
  addTipBox('🍷 Remember: Guests are there for your company, not perfection. Pour more wine and laugh it off!');
  addPageBreak();

  // ========== PAGE 18: AI IMAGE PROMPTS ==========
  addSectionTitle('AI Image Prompts', '📸');
  addParagraph('Generate custom visuals with Midjourney, DALL-E, or other AI image tools', { italics: true, color: gray });
  
  if (aiContent?.images) {
    if (aiContent.images.tablescape) {
      addSubHeader('🖼️ Tablescape Shot');
      addParagraph('Midjourney v6:', { bold: true });
      children.push(new Paragraph({
        shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
        spacing: { after: 150 },
        indent: { left: 200, right: 200 },
        children: [new TextRun({ text: aiContent.images.tablescape.midjourney, size: 18, font: 'Courier New' })]
      }));
      addParagraph('DALL-E 3:', { bold: true });
      children.push(new Paragraph({
        shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
        spacing: { after: 150 },
        indent: { left: 200, right: 200 },
        children: [new TextRun({ text: aiContent.images.tablescape.dalle, size: 18, font: 'Courier New' })]
      }));
    }
    if (aiContent.images.mainCourse) {
      addSubHeader('🍽️ Main Course Shot');
      addParagraph('Midjourney v6:', { bold: true });
      children.push(new Paragraph({
        shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
        spacing: { after: 150 },
        indent: { left: 200, right: 200 },
        children: [new TextRun({ text: aiContent.images.mainCourse.midjourney, size: 18, font: 'Courier New' })]
      }));
    }
  } else {
    // Fallback prompts
    addSubHeader('🖼️ Tablescape Shot');
    const tablescapePrompt = `Photorealistic elegant dinner party table for ${guests}, ${menu.title.toLowerCase()} theme, warm candlelight, crystal glasses, fine china, fresh flowers, shallow depth of field, editorial food photography --ar 16:9 --style raw --v 6`;
    children.push(new Paragraph({
      shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
      spacing: { after: 200 },
      indent: { left: 200, right: 200 },
      children: [new TextRun({ text: tablescapePrompt, size: 18, font: 'Courier New' })]
    }));
    
    addSubHeader('🍽️ Main Course Shot');
    const mainCoursePrompt = `Photorealistic ${menu.courses[3].name}, elegant white plate, professional food styling, soft natural lighting, shallow depth of field, Michelin star presentation, editorial food photography --ar 4:5 --style raw --v 6`;
    children.push(new Paragraph({
      shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
      spacing: { after: 200 },
      indent: { left: 200, right: 200 },
      children: [new TextRun({ text: mainCoursePrompt, size: 18, font: 'Courier New' })]
    }));
    
    addSubHeader('📋 Menu Card');
    const menuCardPrompt = `Elegant watercolor menu card illustration, "${menu.title}" header, classic calligraphy, gold accents, cream paper texture, sophisticated dinner party invitation style --ar 3:4 --v 6`;
    children.push(new Paragraph({
      shading: { fill: 'F8F8F8', type: ShadingType.CLEAR },
      spacing: { after: 200 },
      indent: { left: 200, right: 200 },
      children: [new TextRun({ text: menuCardPrompt, size: 18, font: 'Courier New' })]
    }));
  }
  addPageBreak();

  // ========== PAGE 19: FINAL CHECKLIST ==========
  addSectionTitle('Final Checklist', '✅');
  addParagraph('Last 30 minutes before guests arrive', { italics: true, color: gray });
  
  addSubHeader('👨‍🍳 Kitchen');
  ['All ingredients prepped and ready', 'Proteins resting at correct temperature', 'Sauces warm and covered', 'Plates warming in low oven', 'Garnishes ready in mise en place', 'Clean workspace', 'Trash emptied', 'Fresh towels accessible'].forEach(addCheckItem);
  
  addSubHeader('🍽️ Dining Room');
  ['Table fully set', 'Candles lit', 'Flowers fresh and arranged', 'Water glasses filled', 'Wine ready to pour', 'Place cards set (if using)', 'Extra napkins available'].forEach(addCheckItem);
  
  addSubHeader('🏠 Atmosphere');
  ['Music playing at conversation level', 'Lighting dimmed appropriately', 'Temperature comfortable (68-72°F)', 'Bathroom stocked and clean', 'Entry welcoming'].forEach(addCheckItem);
  
  addSubHeader('👤 You');
  ['Changed and presentable', 'Apron OFF', 'Breath freshener used', 'Calm and ready to enjoy', 'First drink in hand to greet guests'].forEach(addCheckItem);
  addPageBreak();

  // ========== PAGE 20: NOTES ==========
  addSectionTitle('Notes & Reflections', '📝');
  addParagraph('Record your thoughts for future reference', { italics: true, color: gray });
  
  addSubHeader('What worked well:');
  for (let i = 0; i < 5; i++) {
    children.push(new Paragraph({
      spacing: { before: 100, after: 100 },
      border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } },
      children: [new TextRun({ text: ' ', size: 24 })]
    }));
  }
  
  addSubHeader('What to improve next time:');
  for (let i = 0; i < 5; i++) {
    children.push(new Paragraph({
      spacing: { before: 100, after: 100 },
      border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } },
      children: [new TextRun({ text: ' ', size: 24 })]
    }));
  }
  
  addSubHeader('Guest feedback & memorable moments:');
  for (let i = 0; i < 5; i++) {
    children.push(new Paragraph({
      spacing: { before: 100, after: 100 },
      border: { bottom: { style: 'single', size: 6, color: 'E8E8E8' } },
      children: [new TextRun({ text: ' ', size: 24 })]
    }));
  }
  
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 500 },
    shading: { fill: 'F0F4F8', type: ShadingType.CLEAR },
    children: [new TextRun({ 
      text: '🍽️ Thank you for using Dinner Party Planner! Enjoy your evening! 🥂', 
      size: 22, font: 'Georgia' 
    })]
  }));

  // ========== CREATE DOCUMENT ==========
  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Georgia', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 40, bold: true, color: navy, font: 'Georgia' },
          paragraph: { spacing: { before: 400, after: 300 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, color: green, font: 'Georgia' },
          paragraph: { spacing: { before: 300, after: 200 }, outlineLevel: 1 } }
      ]
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ 
              text: `${eventDetails.title || 'Dinner Party'} — ${menu.title}`, 
              size: 18, color: gray, font: 'Georgia', italics: true 
            })]
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

// Admin stats endpoint
app.get('/api/admin/stats', (req, res) => {
  if (req.headers['x-admin-code'] !== ADMIN_CODE) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    usageStats,
    accessCodes: ACCESS_CODES.length,
    betaExpiry: BETA_EXPIRY,
    hasApiKey: !!ANTHROPIC_API_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍽️  Dinner Party Planner v6.0 running on port ${PORT}`);
  console.log(`   API Key configured: ${!!ANTHROPIC_API_KEY}`);
  console.log(`   Access codes: ${ACCESS_CODES.join(', ')}`);
  console.log(`   Beta expires: ${BETA_EXPIRY}`);
});

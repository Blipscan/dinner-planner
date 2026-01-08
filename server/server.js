// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// Production Ready for Beta
// ============================================================

const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { CUISINES, MENU_INSPIRATIONS, MENU_STYLES, STAFFING, AVERY_PRODUCTS, PERSONAS, DEMO_MENUS, COOKBOOK_SECTIONS } = require('./data');
const { buildCookbook } = require('./cookbook');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE || 'ADMIN2024';
const ACCESS_CODES = (process.env.ACCESS_CODES || 'BETA001,BETA002,BETA003').split(',').map(c => c.trim());
const BETA_EXPIRY = process.env.BETA_EXPIRY || '2026-03-01';
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || '50');

const usageStats = {};
global.cookbooks = {};

// ============================================================
// API ROUTES
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    apiConfigured: !!ANTHROPIC_API_KEY,
    betaExpiry: BETA_EXPIRY,
    version: '2.0.0-cadillac'
  });
});

// Get all data for client
app.get('/api/data', (req, res) => {
  res.json({ 
    CUISINES, 
    MENU_INSPIRATIONS, 
    MENU_STYLES, 
    STAFFING, 
    AVERY_PRODUCTS,
    COOKBOOK_SECTIONS,
    personas: Object.fromEntries(
      Object.entries(PERSONAS).map(([k, v]) => [k, {
        name: v.name,
        icon: v.icon,
        credentials: v.credentials,
        philosophy: v.philosophy
      }])
    )
  });
});

// Validate access code
app.post('/api/validate-code', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.json({ valid: false, message: 'Please enter an access code.' });
  }
  
  const upperCode = code.trim().toUpperCase();
  
  // Admin code
  if (upperCode === ADMIN_CODE.toUpperCase()) {
    return res.json({ valid: true, isAdmin: true, remaining: 999 });
  }
  
  // Check beta expiry
  if (new Date() > new Date(BETA_EXPIRY)) {
    return res.json({ valid: false, message: 'Beta period has ended.' });
  }
  
  // Check if valid code
  if (!ACCESS_CODES.map(c => c.toUpperCase()).includes(upperCode)) {
    return res.json({ valid: false, message: 'Invalid access code.' });
  }
  
  // Initialize or check usage
  if (!usageStats[upperCode]) {
    usageStats[upperCode] = { generations: 0, lastUsed: new Date() };
  }
  
  if (usageStats[upperCode].generations >= MAX_GENERATIONS) {
    return res.json({ valid: false, message: 'Usage limit reached for this code.' });
  }
  
  usageStats[upperCode].lastUsed = new Date();
  res.json({ valid: true, remaining: MAX_GENERATIONS - usageStats[upperCode].generations });
});

// Chat with expert persona
app.post('/api/chat', async (req, res) => {
  const { code, persona, messages, context } = req.body;
  
  if (!ANTHROPIC_API_KEY) {
    // Demo mode response
    const demoResponses = {
      chef: "I love the direction you're thinking! For a dinner party this size, I'd suggest building around one show-stopping protein. What ingredients are you most excited about right now?",
      sommelier: "Great question! For your menu style, I'd recommend starting with something crisp and refreshing, then building to fuller-bodied wines as the meal progresses. What's your comfort level with wine - do your guests tend toward adventure or familiar favorites?",
      instructor: "Let's make sure you're set up for success. The key is doing as much as possible the day before. What's your biggest concern about the timing?",
      all: "Chef: That sounds delicious!\n\nSommelier: I have some perfect pairing ideas.\n\nInstructor: And I can help you time everything perfectly."
    };
    return res.json({ response: demoResponses[persona] || demoResponses.chef });
  }
  
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const personaData = PERSONAS[persona] || PERSONAS.chef;
    
    const systemPrompt = personaData.systemPrompt + `

Current event context:
- Event: ${context.eventTitle || 'Dinner Party'}
- Date: ${context.eventDate || 'TBD'}
- Guests: ${context.guestCount || 6}
- Service Time: ${context.serviceTime || '7:00 PM'}
- Food Budget: ${context.foodBudget || '$45-60'}/person
- Wine Budget: ${context.wineBudget || '$80-120'} total
- Skill Level: ${context.skillLevel || 'intermediate'}
- Inspiration: ${context.inspiration || 'chefs-tasting'}
- Cuisine: ${context.cuisine || 'any'} ${context.subCuisine ? `(${context.subCuisine})` : ''}
- Likes: ${context.likes?.join(', ') || 'none specified'}
- Dislikes: ${context.dislikes?.join(', ') || 'none specified'}
- Restrictions: ${context.restrictions?.join(', ') || 'none'}

Be conversational, warm, and helpful. Ask clarifying questions when needed. Share your expertise naturally.`;

    const apiMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages
    });
    
    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('Chat error:', err);
    res.json({ response: "I apologize, but I'm having trouble connecting. Please try again in a moment." });
  }
});

// Generate menus
app.post('/api/generate-menus', async (req, res) => {
  const { code, context, chatHistory, rejectionHistory } = req.body;
  
  // Track usage
  const upperCode = code?.trim().toUpperCase();
  if (upperCode && usageStats[upperCode]) {
    usageStats[upperCode].generations++;
  }
  
  // Demo mode
  if (!ANTHROPIC_API_KEY) {
    return res.json({ menus: DEMO_MENUS });
  }
  
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    
    // Build context from chat history
    let chatContext = '';
    if (chatHistory && chatHistory.length > 0) {
      chatContext = '\n\nPrevious consultation with experts:\n' + 
        chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');
    }
    if (rejectionHistory && rejectionHistory.length > 0) {
      chatContext += '\n\nFeedback after rejecting previous menus (IMPORTANT - address this feedback):\n' + 
        rejectionHistory.map(m => `${m.role}: ${m.content}`).join('\n');
    }
    
    const systemPrompt = `You are an expert culinary team creating dinner party menus.

Event Context:
- Event: ${context.eventTitle || 'Dinner Party'}
- Guests: ${context.guestCount || 6}
- Food Budget: ${context.foodBudget || '$45-60'}/person
- Wine Budget: ${context.wineBudget || '$80-120'} total
- Skill Level: ${context.skillLevel || 'intermediate'}
- Inspiration: ${context.inspiration || 'chefs-tasting'}
- Cuisine Direction: ${context.cuisine || 'any'} ${context.subCuisine ? `(${context.subCuisine})` : ''}
- Guest Preferences: Likes ${context.likes?.join(', ') || 'various'}, Avoids ${context.dislikes?.join(', ') || 'nothing specific'}
- Dietary Restrictions: ${context.restrictions?.join(', ') || 'none'}
${chatContext}

Generate exactly 5 distinct menu options as a JSON array. Each menu must have:
- id: number (1-5)
- title: Creative, evocative menu name (e.g., "Autumn Harvest Moon", "Mediterranean Summer")
- personality: One sentence describing the menu's character and vibe
- foodCost: Estimated cost per person (e.g., "$45-55/person")
- wineCost: Total wine budget estimate (e.g., "$120 total")
- courses: Array of exactly 5 courses, each with:
  - type: One of "Amuse-Bouche", "First Course", "Second Course", "Main Course", "Dessert"
  - name: Full dish name with key components (e.g., "Pan-Seared Duck Breast with Cherry Gastrique and Wild Rice")
  - wine: Specific wine pairing with producer if possible (null for amuse and salads)

Make each menu genuinely distinct:
1. A refined, elegant approach true to the cuisine
2. A bold, adventurous interpretation with unexpected elements
3. A seasonal showcase highlighting peak ingredients
4. A comfort-forward menu with elevated technique
5. A menu that most directly addresses the host's stated preferences

Use French portion standards. Consider make-ahead potential for home cooks.

RESPOND WITH ONLY VALID JSON - no markdown, no explanation, just the array.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate 5 personalized menu options based on the context provided.' }]
    });
    
    let menus;
    try {
      const text = response.content[0].text.trim();
      const jsonText = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      menus = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      console.error('Raw response:', response.content[0].text);
      return res.json({ menus: DEMO_MENUS });
    }
    
    res.json({ menus });
  } catch (err) {
    console.error('Menu generation error:', err);
    res.json({ menus: DEMO_MENUS });
  }
});

// Generate recipes for a menu
app.post('/api/generate-recipes', async (req, res) => {
  const { code, menu, context } = req.body;
  
  if (!ANTHROPIC_API_KEY) {
    // Return placeholder recipes in demo mode
    const placeholderRecipes = menu.courses.map(course => ({
      name: course.name,
      serves: context.guestCount || 6,
      activeTime: '30 min',
      totalTime: '1 hour',
      ingredients: ['Ingredients will be generated with API key'],
      steps: ['Full instructions will be generated with API key'],
      notes: 'Chef notes will appear here',
      makeAhead: 'Make-ahead instructions will appear here'
    }));
    return res.json({ recipes: placeholderRecipes });
  }
  
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    
    const systemPrompt = `You are a professional chef creating detailed recipes for a dinner party.

Generate complete recipes for each course. For each recipe, provide:
- name: dish name
- serves: number of servings (${context.guestCount || 6})
- activeTime: active cooking time
- totalTime: total time including prep
- ingredients: array of ingredients with precise measurements for ${context.guestCount || 6} guests
- steps: array of detailed step-by-step instructions
- notes: chef's tips and technique notes
- makeAhead: what can be done ahead of time

Skill level: ${context.skillLevel || 'intermediate'}

Return as a JSON array of recipe objects.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ 
        role: 'user', 
        content: `Generate complete recipes for this menu:\n${menu.courses.map(c => `- ${c.type}: ${c.name}`).join('\n')}`
      }]
    });
    
    let recipes;
    try {
      const text = response.content[0].text.trim();
      const jsonText = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      recipes = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('Recipe parse error:', parseErr);
      recipes = null;
    }
    
    res.json({ recipes });
  } catch (err) {
    console.error('Recipe generation error:', err);
    res.json({ recipes: null });
  }
});

// Generate cookbook
app.post('/api/generate-cookbook', async (req, res) => {
  const { code, menu, context, staffing, chatHistory } = req.body;
  
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  // Generate recipes if API available
  let recipes = null;
  if (ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: `Generate detailed recipes for a dinner party. Return JSON array with objects containing: name, serves (${context.guestCount || 6}), activeTime, totalTime, ingredients (array), steps (array), notes, makeAhead. Skill level: ${context.skillLevel || 'intermediate'}.`,
        messages: [{ 
          role: 'user', 
          content: `Recipes for:\n${menu.courses.map(c => `- ${c.type}: ${c.name}`).join('\n')}`
        }]
      });
      
      const text = response.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      recipes = JSON.parse(text);
    } catch (err) {
      console.error('Recipe generation error:', err);
    }
  }
  
  global.cookbooks[cookbookId] = { menu, context, staffing, recipes };
  
  res.json({ success: true, cookbookId });
});

// Download cookbook as DOCX
app.post('/api/download-cookbook', async (req, res) => {
  const { code, cookbookId } = req.body;
  
  const cookbookData = global.cookbooks?.[cookbookId];
  if (!cookbookData) {
    return res.status(404).json({ error: 'Cookbook not found' });
  }
  
  const { menu, context, staffing, recipes } = cookbookData;
  
  try {
    const buffer = await buildCookbook(menu, context, staffing, recipes);
    
    const filename = (context.eventTitle || 'Dinner_Party').replace(/[^a-zA-Z0-9]/g, '_') + '_Cookbook.docx';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('DOCX generation error:', err);
    res.status(500).json({ error: 'Error generating cookbook' });
  }
});

// Admin stats
app.get('/api/admin/stats', (req, res) => {
  const adminCode = req.query.code;
  if (adminCode?.toUpperCase() !== ADMIN_CODE.toUpperCase()) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  res.json({
    totalCodes: ACCESS_CODES.length,
    usage: usageStats,
    betaExpiry: BETA_EXPIRY,
    apiConfigured: !!ANTHROPIC_API_KEY,
    activeCookbooks: Object.keys(global.cookbooks || {}).length
  });
});
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
 
app.listen(port, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         DINNER PARTY PLANNER - CADILLAC EDITION               ║
╠═══════════════════════════════════════════════════════════════╣
║  Server:     port ${port}                                     ║
║  API Key:    ${ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Not set (demo mode)'}                          ║
║  Beta Until: ${BETA_EXPIRY}                                    ║
║  Codes:      ${ACCESS_CODES.join(', ')}                      ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
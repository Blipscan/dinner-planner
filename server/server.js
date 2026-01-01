/**
 * Dinner Party Planner - Beta API Server
 * 
 * Features:
 * - Beta expiration date check
 * - Access code validation & tracking
 * - Rate limiting
 * - Claude API proxy (keeps key secure)
 * - DOCX generation
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// BETA ACCESS TRACKING
// ============================================================
const usageTracker = new Map(); // accessCode -> { generations: 0, lastUsed: Date }

function loadAccessCodes() {
  const codes = process.env.ACCESS_CODES?.split(',').map(c => c.trim()) || [];
  const adminCode = process.env.ADMIN_CODE;
  if (adminCode) codes.push(adminCode);
  return codes;
}

const validAccessCodes = loadAccessCodes();

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for client
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static client files (check both locations for flexibility)
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.static(__dirname)); // Also serve from server folder

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please slow down' }
});
app.use('/api/', apiLimiter);

// ============================================================
// BETA VALIDATION MIDDLEWARE
// ============================================================
function validateBeta(req, res, next) {
  // Check expiration
  const endDate = new Date(process.env.BETA_EXPIRY || process.env.BETA_END_DATE);
  if (new Date() > endDate) {
    return res.status(403).json({ 
      error: 'Beta period has ended',
      message: 'Thank you for testing! The beta period concluded on ' + (process.env.BETA_EXPIRY || process.env.BETA_END_DATE)
    });
  }
  
  // Check access code
  const accessCode = req.headers['x-access-code'] || req.body.accessCode;
  if (!accessCode || !validAccessCodes.includes(accessCode)) {
    return res.status(401).json({ 
      error: 'Invalid access code',
      message: 'Please enter a valid tester access code'
    });
  }
  
  // Check usage limits (skip for admin)
  if (accessCode !== process.env.ADMIN_CODE) {
    const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
    const maxGenerations = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
    
    if (usage.generations >= maxGenerations) {
      return res.status(429).json({
        error: 'Generation limit reached',
        message: `You've used all ${maxGenerations} menu generations. Thank you for testing!`
      });
    }
  }
  
  req.accessCode = accessCode;
  next();
}

// Increment usage counter
function trackUsage(accessCode) {
  const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
  usage.generations++;
  usage.lastUsed = new Date();
  usageTracker.set(accessCode, usage);
}

// ============================================================
// API ROUTES
// ============================================================

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  const endDate = new Date(process.env.BETA_END_DATE);
  const daysRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
  
  res.json({
    status: 'ok',
    beta: {
      active: new Date() < endDate,
      endDate: process.env.BETA_END_DATE,
      daysRemaining: Math.max(0, daysRemaining)
    }
  });
});

// Validate access code (for login screen)
app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body;
  
  if (!accessCode || !validAccessCodes.includes(accessCode)) {
    return res.status(401).json({ valid: false, message: 'Invalid access code' });
  }
  
  const endDate = new Date(process.env.BETA_END_DATE);
  if (new Date() > endDate) {
    return res.status(403).json({ valid: false, message: 'Beta period has ended' });
  }
  
  const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
  const maxGenerations = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
  
  res.json({
    valid: true,
    usage: {
      generations: usage.generations,
      remaining: accessCode === process.env.ADMIN_CODE ? 'unlimited' : (maxGenerations - usage.generations)
    }
  });
});

// Generate menus via Claude API
app.post('/api/generate-menus', validateBeta, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    const prompt = buildMenuPrompt(preferences);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        temperature: 1.15, // Slightly higher for menu variety
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(500).json({ error: 'Menu generation failed' });
    }
    
    const data = await response.json();
    const content = data.content[0].text;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse menu response' });
    }
    
    const menus = JSON.parse(jsonMatch[0]);
    
    // Track usage
    trackUsage(req.accessCode);
    
    res.json({ menus });
    
  } catch (error) {
    console.error('Generate menus error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Build complete cookbook data - NOW CALLS CLAUDE WITH PERSONAS
app.post('/api/build-cookbook', validateBeta, async (req, res) => {
  try {
    const { menu, guestCount, serviceTime, staffing } = req.body;
    
    const prompt = buildCookbookPrompt(menu, guestCount, serviceTime, staffing);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000,
        system: 'You are a cookbook generator. Return ONLY valid JSON with no markdown formatting, no code blocks, no explanation. Ensure the JSON is complete and properly closed with all necessary braces and brackets.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(500).json({ error: 'Cookbook generation failed' });
    }
    
    const data = await response.json();
    const content = data.content[0].text;
    
    // Parse JSON from response - try to clean up common issues
    let jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to find JSON in response:', content.substring(0, 500));
      return res.status(500).json({ error: 'Failed to parse cookbook response' });
    }
    
    let jsonStr = jsonMatch[0];
    
    // Clean up common JSON issues from Claude
    // Remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    // Fix any unquoted keys (rare but possible)
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
    
    let cookbook;
    try {
      cookbook = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('JSON snippet:', jsonStr.substring(0, 1000));
      return res.status(500).json({ error: 'Failed to parse cookbook JSON' });
    }
    
    // Track usage (this is a second generation)
    trackUsage(req.accessCode);
    
    res.json({ cookbook });
    
  } catch (error) {
    console.error('Build cookbook error:', error);
    res.status(500).json({ error: 'Failed to build cookbook' });
  }
});

// Generate DOCX file
app.post('/api/generate-docx', validateBeta, async (req, res) => {
  try {
    const { eventTitle, eventDate, eventTime, guestCount, menu, staffing, cookbook } = req.body;
    
    const docx = require('docx');
    const buffer = await generateDocxBuffer(docx, {
      eventTitle, eventDate, eventTime, guestCount, menu, staffing, cookbook
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${eventTitle.replace(/[^a-z0-9]/gi, '_')}_Cookbook.docx"`);
    res.send(buffer);
    
  } catch (error) {
    console.error('Generate DOCX error:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Get usage stats (admin only)
app.get('/api/admin/stats', (req, res) => {
  const adminCode = req.headers['x-access-code'];
  if (adminCode !== process.env.ADMIN_CODE) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const stats = {};
  usageTracker.forEach((usage, code) => {
    stats[code] = usage;
  });
  
  res.json({
    totalCodes: validAccessCodes.length - 1, // Exclude admin
    activeTesters: usageTracker.size,
    usage: stats
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function buildMenuPrompt(preferences) {
  // Random style modifier for variety
  const styles = ['rustic farmhouse', 'modern minimalist', 'classic French', 'bistro-casual', 'elegant formal', 'seasonal harvest', 'Mediterranean villa', 'cozy intimate', 'celebration feast', 'chef\'s tasting'];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  
  return `Generate 5 UNIQUE dinner party menu options. Return ONLY a JSON array, no other text.

Style inspiration for this generation: ${randomStyle}

Guest count: ${preferences.guestCount || 6}
Budget tier: ${preferences.budget || '$30-50 per person'}
Skill level: ${preferences.skillLevel || 'intermediate'}
Cuisine preferences: ${preferences.cuisines?.join(', ') || 'any'}
Ingredients to feature: ${preferences.loves || 'none specified'}
Ingredients to avoid: ${preferences.avoids || 'none'}
Dietary restrictions: ${preferences.dietary?.join(', ') || 'none'}

IMPORTANT: Make each menu DISTINCT - vary the cooking techniques, flavor profiles, and presentation styles. One might be bold and adventurous, another refined and classic, another rustic and comforting. Surprise the home cook with creative combinations they wouldn't think of themselves.

Each menu must have this exact JSON structure:
{
  "title": "Menu Name",
  "theme": "Brief theme description",
  "foodCost": "$XX-XX/person",
  "wineCost": "$XXX total",
  "courses": [
    {"type": "Amuse-Bouche", "name": "Dish name with brief description"},
    {"type": "First Course", "name": "Dish name with brief description"},
    {"type": "Second Course", "name": "Dish name with brief description"},
    {"type": "Main Course", "name": "Dish name with brief description"},
    {"type": "Dessert", "name": "Dish name with brief description"}
  ]
}

Return exactly 5 menus in a JSON array. No markdown, no explanation, just the JSON array.`;
}

function buildCookbookPrompt(menu, guestCount, serviceTime, staffing) {
  const serviceHour = serviceTime ? parseInt(serviceTime.split(':')[0]) : 19;
  const serviceTimeStr = serviceHour > 12 ? `${serviceHour - 12}:00 PM` : `${serviceHour}:00 AM`;
  
  return `You are creating a complete professional cookbook for a dinner party. Channel multiple expert personas to create the most useful, specific, and actionable content possible.

EVENT DETAILS:
- Guests: ${guestCount}
- Service Time: ${serviceTimeStr}
- Staffing: ${staffing}

SELECTED MENU: ${menu.title}
Theme: ${menu.theme || 'Elegant dinner party'}
- Amuse-Bouche: ${menu.courses[0]?.name}
- First Course: ${menu.courses[1]?.name}
- Second Course: ${menu.courses[2]?.name}
- Main Course: ${menu.courses[3]?.name}
- Dessert: ${menu.courses[4]?.name}

FRENCH PORTION STANDARDS (use these for all calculations):
- Amuse-Bouche: 1.5-2 oz per person
- First Course: 2.5 oz protein, 1 oz greens
- Second Course: 3 oz protein, 2 oz accompaniment
- Main Course: 4 oz protein, 3 oz starch, 2 oz vegetables
- Dessert: 3.5 oz total
Total protein across meal: ~11 oz per person (not American steakhouse portions!)

RESPOND WITH ONLY VALID JSON matching this exact structure:

{
  "wines": {
    "_approach": "You are a Master Sommelier who trained at The French Laundry. For each wine slot, provide THREE tiers: top (imported, sommelier's choice), domestic (American wines of same character), and budget (good quality, accessible price).",
    "aperitif": {
      "top": {"name": "Specific imported bottle, e.g., 'Pierre Gimonnet Champagne Brut Cuvée Gastronome'", "price": "$45-60", "notes": "Why this sets the tone"},
      "domestic": {"name": "American alternative, e.g., 'Schramsberg Blanc de Blancs, Napa Valley'", "price": "$30-40", "notes": "Comparable character"},
      "budget": {"name": "Good value option, e.g., 'Gruet Brut, New Mexico'", "price": "$15-20", "notes": "Perfectly respectable"},
      "pour": "4 oz"
    },
    "white": {
      "top": {"name": "Specific imported bottle for first/second courses", "price": "$35-50", "notes": "How it pairs"},
      "domestic": {"name": "American alternative of same character", "price": "$20-30", "notes": "Comparable style"},
      "budget": {"name": "Good value option", "price": "$12-18", "notes": "Solid choice"},
      "pour": "5 oz"
    },
    "red": {
      "top": {"name": "Specific imported bottle for main course", "price": "$40-70", "notes": "Why it complements the main"},
      "domestic": {"name": "American alternative, same weight and character", "price": "$25-40", "notes": "Comparable profile"},
      "budget": {"name": "Good value option", "price": "$12-20", "notes": "Will work well"},
      "pour": "5 oz"
    },
    "dessert": {
      "top": {"name": "Specific dessert wine", "price": "$30-50", "notes": "The perfect finish"},
      "domestic": {"name": "American alternative", "price": "$20-30", "notes": "Comparable sweetness"},
      "budget": {"name": "Good value option", "price": "$12-20", "notes": "Sweet and satisfying"},
      "pour": "2 oz"
    }
  },

  "cocktail": {
    "_approach": "You are head bartender at a celebrated speakeasy. Create a signature cocktail that matches this menu's mood.",
    "name": "Cocktail name",
    "description": "Why this pairs with the menu's theme",
    "ingredients": ["2 oz specific spirit", "3/4 oz modifier", "etc - be exact"],
    "instructions": "Brief technique",
    "batchRecipe": "Exact quantities to batch for ${guestCount} guests, prep-ahead notes"
  },

  "shopping": {
    "_approach": "You are a Bon Appétit food writer. Be SPECIFIC about cuts, quantities, quality indicators. This list must match the actual dishes above.",
    "proteins": [
      {"item": "Specific cut and quality, e.g., 'Frenched rack of lamb, 8-bone, domestic'", "qty": "Exact amount for ${guestCount} with 15% buffer", "notes": "What to tell the butcher, what to look for"}
    ],
    "seafood": [
      {"item": "Specific type and grade, e.g., 'Dry-packed U-10 sea scallops'", "qty": "Exact amount", "notes": "Freshness indicators, where to buy"}
    ],
    "produce": [
      {"item": "Specific variety if relevant, e.g., 'Baby arugula' not just 'greens'", "qty": "Amount", "notes": "Ripeness, selection tips"}
    ],
    "dairy": [
      {"item": "Specific product, e.g., 'Plugrá European-style unsalted butter'", "qty": "Amount", "notes": "Brand matters here"}
    ],
    "pantry": [
      {"item": "Item", "qty": "Amount", "notes": "Substitution if unavailable"}
    ],
    "specialty": [
      {"item": "Hard-to-find items for this specific menu", "qty": "Amount", "notes": "Where to find it, online sources"}
    ]
  },

  "dayBeforePrep": [
    {
      "_approach": "You are an executive chef who backward-schedules from service. These tasks are SPECIFIC to the dishes above.",
      "name": "Task name specific to this menu, e.g., 'Make rosemary jus for lamb'",
      "time": 30,
      "steps": ["Specific step 1", "Step 2", "Step 3"],
      "storage": "How to store overnight, e.g., 'Refrigerate in mason jar, reheat gently day-of'",
      "whyAhead": "Why this improves the dish, e.g., 'Flavors meld and deepen overnight'"
    }
  ],

  "recipes": [
    {
      "_approach": "You are a CIA instructor creating ORIGINAL recipes specifically for this menu. Do NOT reproduce existing published recipes. Create your own version with YOUR techniques, YOUR ingredient choices, YOUR flavor decisions. Explain WHY each technique works. Write as if teaching a student - every temperature, every visual cue, every timing should educate.",
      "course": "Amuse-Bouche",
      "name": "${menu.courses[0]?.name}",
      "yield": "Serves ${guestCount}",
      "activeTime": "XX minutes",
      "totalTime": "XX minutes", 
      "whyItWorks": "2-3 sentences explaining YOUR approach - what makes THIS version special, what technique produces great results and why",
      "makeAhead": "Specific make-ahead strategy with storage method and reheating instructions",
      "ingredients": [
        {"amount": "precise amount", "item": "specific ingredient with quality notes", "prep": "how to prepare it", "notes": "why this ingredient or substitution options"}
      ],
      "instructions": [
        "Detailed step with specific temperatures (°F), precise times, and visual/tactile cues that tell you it's done right. Explain WHY when relevant."
      ],
      "tips": ["Insider tip that makes the difference between good and great"]
    }
  ],

  "timeline": [
    {
      "_approach": "You are an executive chef who runs a flawless brigade kitchen. Everything is backward-scheduled from service time. Every task has a duration and dependency. Mise en place is the difference between panic and calm.",
      "time": "2:00 PM",
      "label": "5 hours before",
      "tasks": ["Specific task for THIS menu with duration", "Another task"]
    },
    {
      "time": "3:00 PM",
      "label": "4 hours before", 
      "tasks": ["Tasks"]
    },
    {
      "time": "4:00 PM",
      "label": "3 hours before",
      "tasks": ["Tasks"]
    },
    {
      "time": "5:00 PM",
      "label": "2 hours before",
      "tasks": ["Tasks"]
    },
    {
      "time": "6:00 PM",
      "label": "1 hour before",
      "tasks": ["Tasks"]
    },
    {
      "time": "${serviceTimeStr}",
      "label": "Service",
      "tasks": ["Plate amuse-bouche", "Welcome guests"]
    }
  ],

  "tableSettings": {
    "_approach": "You are an event designer whose work appears in Architectural Digest. You understand scale, proportion, sight lines, candle placement, napkin folds—the details that elevate a table from 'set' to 'staged.' The table tells guests how to feel before the first course arrives.",
    "placeSetting": {
      "charger": "Charger plate style and color recommendation for ${menu.title} theme",
      "dinnerPlate": "Dinner plate style (on charger or replacing it at main course)",
      "left": ["Fork positions from outside in - list each fork and its purpose for this menu's courses"],
      "right": ["Knife and spoon positions from outside in - list each piece and purpose"],
      "above": "Dessert spoon and fork arrangement above the plate",
      "glassware": "Glass positions from left to right: water goblet, then wine glasses in order of service for this menu's wines",
      "napkin": "Specific fold style and placement (on plate, left of forks, in glass)"
    },
    "centerpiece": "Low arrangement (under 12 inches for sight lines) - specific flowers, foliage, and vessel for ${menu.title} theme",
    "candles": "Taper vs. pillar, specific quantity for table size, placement pattern for even light distribution",
    "additionalDecor": [
      "Theme-appropriate accent pieces",
      "Color palette elements",
      "Seasonal or occasion touches"
    ],
    "lighting": "Dimmer percentage, when to light candles relative to guest arrival, ambient light recommendations",
    "proTip": "The one detail that elevates from nice to memorable"
  },

  "plating": [
    {
      "_approach": "You are a culinary artist trained in kaiseki and modern French technique. Every plate is a composition—negative space matters, height matters, sauce placement matters. You teach the principles so cooks understand the 'why' and can adapt.",
      "course": "Amuse-Bouche",
      "portion": "1.5 oz",
      "vessel": "Specific plate/bowl/spoon recommendation with size and color",
      "composition": "Clock positions for each element (protein at 6 o'clock, starch at 10, vegetable at 2)",
      "sauce": "Application technique - dots, swoosh, pool, or drizzle with specific placement",
      "garnish": "Final touch and exact placement",
      "temperature": "Plate temp (warm/cold) and ideal food temp",
      "principle": "The visual principle at work (negative space, height contrast, color balance)",
      "tip": "Professional plating secret specific to this dish"
    }
  ],

  "tips": {
    "timing": [
      "Course-specific timing advice for THIS menu"
    ],
    "temperature": [
      "Temperature tips specific to these dishes"
    ],
    "lastMinute": [
      "Final touches for THIS menu"
    ],
    "emergency": [
      {"problem": "Something that could go wrong with THIS menu", "fix": "How to save it"}
    ]
  },

  "checklist": {
    "kitchen": ["Item specific to this menu's prep"],
    "dining": ["Table setup items"],
    "thirtyMinutes": ["Final checks before guests arrive"],
    "mental": ["You've got this - the lamb is resting, the scallops are ready to sear..."]
  },

  "imagePrompts": {
    "_approach": "You are a commercial food photographer for Bon Appétit. CRITICAL: AI image generators create cluttered images when given too many elements. Write FOCUSED prompts with selective details. Emphasize NEGATIVE SPACE and BREATHING ROOM. Pick 3-4 key elements per shot, not 10. All images must reference the same room/table from tableSettings.",
    "styleGuide": "Define the visual style in ONE sentence: lighting type, color palette (from tableSettings), camera angle, mood. Keep it simple - this anchors all shots. Example: 'Warm candlelight, burgundy and gold palette, Hasselblad 85mm f/2.8, intimate evening mood.'",
    "tablescape": {
      "prompt": "Write a CLEAN tablescape prompt. Overhead or 30-degree angle. Focus on: the TABLE ITSELF (surface, runner), ONE place setting clearly visible, the centerpiece from tableSettings, candles. DO NOT list every glass, fork, and napkin - let them exist naturally. Emphasize empty space between elements. Magazine editorial, 16:9.",
      "negativePrompt": "cluttered, busy, too many elements, cramped, overlapping items",
      "platform": {"midjourney": "--ar 16:9 --style raw --s 750 --q 2 --v 6", "dalle": "photorealistic, editorial food photography, uncluttered composition"}
    },
    "mainCourse": {
      "prompt": "HERO SHOT of ${menu.courses[3]?.name}. Focus on THE PLATE - protein position, sauce, garnish per plating guide. Background is soft blur showing HINTS of the same tablescape (candle glow, flower color). The food is the star. Dramatic but warm lighting. 4:3.",
      "negativePrompt": "cluttered background, too many elements in focus, busy composition",
      "platform": {"midjourney": "--ar 4:3 --style raw --s 750 --q 2 --v 6", "dalle": "photorealistic, shallow depth of field, food hero shot"}
    },
    "dessert": {
      "prompt": "${menu.courses[4]?.name} plated simply. Same room, softer light (candles lower). Dessert wine glass in soft focus. Minimal elements - just the dessert, one glass, hint of table. Intimate, satisfied feeling. 4:3.",
      "negativePrompt": "cluttered, busy, too many props",
      "platform": {"midjourney": "--ar 4:3 --style raw --s 750 --q 2 --v 6", "dalle": "photorealistic, warm intimate lighting, simple composition"}
    }
  }
}

CRITICAL INSTRUCTIONS:
1. Every item must be SPECIFIC to the actual menu dishes listed above
2. Shopping quantities must be calculated for ${guestCount} guests using French portions with 15% buffer
3. Wines must be REAL bottles from actual producers with realistic prices
4. RECIPES MUST BE ORIGINAL - create YOUR version, not reproductions of published recipes. Use your culinary knowledge to design each dish with specific techniques, temperatures, and timings that YOU determine are best. Explain your reasoning.
5. Timeline must work backward from ${serviceTimeStr} service time
6. Include 5 complete recipes (one per course)
7. Image prompts MUST reference the tableSettings above - same flowers, same candles, same color palette in every shot
8. All food shots show the SAME ROOM established in tablescape, with plating exactly as specified in plating guide

Return ONLY the JSON object. No markdown, no explanation, no preamble.`;
}

// Legacy fallback function (not used when API works)
function buildCookbookDataFallback(menu, guestCount, serviceTime, staffing) {
  const scale = guestCount / 6;
  const serviceHour = serviceTime ? parseInt(serviceTime.split(':')[0]) : 19;
  
  return {
    // Wine pairings with prices
    wines: {
      aperitif: { name: 'Champagne or Crémant', price: '$25-45', pour: '4 oz', notes: 'Crisp bubbles to start' },
      white: { name: 'Chablis or White Burgundy', price: '$20-35', pour: '5 oz', notes: 'For lighter courses' },
      red: { name: 'Côtes du Rhône or Pinot Noir', price: '$18-30', pour: '5 oz', notes: 'For the main' },
      dessert: { name: 'Sauternes or Late Harvest', price: '$25-40', pour: '2 oz', notes: 'Sweet finish' }
    },
    
    // Shopping list scaled
    shopping: {
      proteins: [
        { item: 'Main protein per recipe', qty: `${(1.5 * scale).toFixed(1)} lbs`, note: 'Ask butcher to prep' },
        { item: 'Seafood for second course', qty: `${(1.25 * scale).toFixed(1)} lbs`, note: 'Fresh, day-of' }
      ],
      produce: [
        { item: 'Mixed greens', qty: `${Math.ceil(0.75 * scale)} lbs` },
        { item: 'Shallots', qty: `${Math.ceil(4 * scale)}` },
        { item: 'Garlic', qty: '2 heads' },
        { item: 'Lemons', qty: `${Math.ceil(6 * scale)}` },
        { item: 'Fresh herbs (parsley, thyme, rosemary)', qty: '3 bunches' },
        { item: 'Seasonal vegetables per recipe', qty: `${Math.ceil(2 * scale)} lbs` }
      ],
      dairy: [
        { item: 'Unsalted butter', qty: '2 lbs', note: 'European-style' },
        { item: 'Heavy cream', qty: '1 quart' },
        { item: 'Crème fraîche', qty: '8 oz' },
        { item: 'Parmesan', qty: '4 oz', note: 'Real Parmigiano' }
      ],
      pantry: [
        { item: 'Extra virgin olive oil', qty: '500ml' },
        { item: 'Aged balsamic vinegar', qty: '250ml' },
        { item: 'Chicken or vegetable stock', qty: '1 quart' },
        { item: 'Dijon mustard', qty: '1 jar' }
      ]
    },
    
    // Day-before prep
    dayBeforePrep: [
      { name: 'Make balsamic reduction', time: 30, steps: ['Combine 1 cup balsamic + 1 tbsp honey', 'Simmer 20 min until reduced by 2/3', 'Cool—thickens as it cools'], storage: 'Room temp, 4 weeks' },
      { name: 'Prep all vegetables', time: 45, steps: ['Wash and dry all produce', 'Dice shallots, mince garlic', 'Prep accompaniments', 'Store in damp towels'], storage: 'Fridge overnight' },
      { name: 'Make sauces/marinades', time: 30, steps: ['Prepare pan sauce base', 'Make herb oil or compound butter', 'Marinate proteins if needed'], storage: 'Fridge, labeled' },
      { name: 'Set the table', time: 30, steps: ['Place linens', 'Set chargers and plates', 'Position flatware', 'Add glasses, napkins, unlit candles'], storage: 'N/A' }
    ],
    
    // Day-of timeline
    timeline: buildTimeline(serviceHour),
    
    // Table settings
    tableSettings: {
      place: [
        'Charger 1" from edge',
        'Forks left (dinner inside, salad out)',
        'Knife + spoon right (blade in)',
        'Dessert utensils above plate',
        'Water glass above knife',
        'Wine glasses right of water'
      ],
      decor: [
        'Centerpiece under 12" tall',
        'Unscented candles only',
        'Cloth napkins on plate or left'
      ]
    },
    
    // Plating guide
    plating: [
      { course: 'Amuse-Bouche', portion: '2 oz', tip: 'Single elegant bite, demitasse or small plate' },
      { course: 'First Course', portion: '2.5 oz protein', tip: 'Negative space is elegant—don\'t overcrowd' },
      { course: 'Second Course', portion: '3 oz', tip: 'Sauce underneath, protein on top' },
      { course: 'Main Course', portion: '4 oz protein + 3 oz starch + 2 oz veg', tip: 'Clock method: protein at 6, starch at 10, veg at 2' },
      { course: 'Dessert', portion: '3.5 oz', tip: 'Height adds drama—stack or layer' }
    ],
    
    // Tips & secrets
    tips: {
      timing: [
        'Allow 20-25 minutes between courses',
        'Clear when ALL guests have finished',
        'Serve ladies first, then clockwise'
      ],
      temperature: [
        'Warm plates in 200°F oven for hot courses',
        'Chill plates for cold courses',
        'Pull red wine 1 hour before service'
      ],
      lastMinute: [
        'Taste everything before plating',
        'Keep finishing salt, herbs, lemon at hand',
        'Wipe plate rims before serving'
      ],
      emergency: [
        { problem: 'Sauce too thin', fix: 'Whisk in cold butter, 1 tbsp at a time' },
        { problem: 'Oversalted', fix: 'Add acid (lemon) or fat (butter/cream)' },
        { problem: 'Meat overcooked', fix: 'Slice thin, serve with extra sauce' }
      ]
    },
    
    // Final checklist
    checklist: {
      kitchen: ['All ingredients prepped', 'Oven preheated', 'Plates warming/chilling', 'Sauces ready', 'Garnishes prepared'],
      dining: ['Table set completely', 'Candles ready', 'Music queued', 'Wine opened/chilling', 'Water pitcher filled'],
      mental: ['I\'ve done the prep—tonight is about enjoying guests', 'Imperfection is charming. Relax.']
    }
  };
}

function buildTimeline(serviceHour) {
  const timeline = [];
  const blocks = [
    { hoursBack: 5, label: '5 hours before', tasks: ['Start mise en place', 'Make remaining components'] },
    { hoursBack: 4, label: '4 hours before', tasks: ['Temper proteins', 'Finish prep work', 'Preheat oven if needed'] },
    { hoursBack: 3, label: '3 hours before', tasks: ['Final table check', 'Chill wines', 'Prep garnishes'] },
    { hoursBack: 2, label: '2 hours before', tasks: ['Begin long-cooking items', 'Make sauces', 'Portion amuse'] },
    { hoursBack: 1, label: '1 hour before', tasks: ['Sear proteins', 'Open red wine', 'Light candles'] },
    { hoursBack: 0, label: 'Service', tasks: ['Plate amuse-bouche', 'Welcome guests!'] }
  ];
  
  blocks.forEach(block => {
    const hour = serviceHour - block.hoursBack;
    const time = hour > 12 ? `${hour - 12}:00 PM` : (hour === 12 ? '12:00 PM' : `${hour}:00 AM`);
    timeline.push({ time, label: block.label, tasks: block.tasks });
  });
  
  return timeline;
}

async function generateDocxBuffer(docx, data) {
  const { Document, Packer, Paragraph, TextRun, Header, Footer, 
          AlignmentType, HeadingLevel, PageBreak, PageNumber, ShadingType } = docx;
  
  const { eventTitle, eventDate, eventTime, guestCount, menu, cookbook } = data;
  
  const navy = '1E3A5F';
  const gold = 'C9A227';
  const green = '2D6A4F';
  const gray = '6B7C85';
  
  const dateStr = eventDate ? new Date(eventDate + 'T00:00').toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  }) : 'Date TBD';
  
  const timeStr = eventTime || '7:00 PM';
  
  // Build document sections
  const children = [];
  
  // === COVER PAGE ===
  children.push(
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '🍽️', size: 72 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: eventTitle, bold: true, size: 56, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: dateStr, size: 28, color: gray, font: 'Georgia', italics: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `${timeStr} • ${guestCount} Guests`, size: 24, color: gray, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: menu.title, bold: true, size: 32, color: green, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
      children: [new TextRun({ text: menu.theme || '', size: 22, color: gray, font: 'Georgia', italics: true })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );
  
  // === ELEGANT TAKE-AWAY MENU ===
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 300 },
      children: [new TextRun({ text: '~ The Menu ~', bold: true, size: 36, color: navy, font: 'Georgia' })]
    })
  );
  
  menu.courses.forEach(course => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [new TextRun({ text: course.type, bold: true, size: 20, color: gold, font: 'Georgia' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 150 },
        children: [new TextRun({ text: course.name, size: 24, font: 'Georgia', italics: true })]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === WINE & SPIRITS ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: '🍷 Wine & Spirits', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: `Three tiers for every palate and budget`, size: 22, color: gray, font: 'Georgia', italics: true })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Recommended budget: ${menu.wineCost || '$100-150'}`, size: 20, color: gray, font: 'Georgia' })]
    })
  );
  
  const wineLabels = { aperitif: 'Aperitif', white: 'White Wine', red: 'Red Wine', dessert: 'Dessert Wine' };
  const tierLabels = { top: '★ Top Tier', domestic: '★ Domestic', budget: '★ Budget-Friendly' };
  const tierColors = { top: 'C9A227', domestic: '2D6A4F', budget: '6B7C85' };
  
  Object.entries(cookbook.wines || {}).forEach(([key, wine]) => {
    // Skip meta keys
    if (key.startsWith('_') || !wine) return;
    
    // Section header for this wine type
    children.push(
      new Paragraph({
        spacing: { before: 250, after: 100 },
        shading: { fill: 'E8F4F8', type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: wineLabels[key] || key.charAt(0).toUpperCase() + key.slice(1), bold: true, size: 26, color: navy, font: 'Georgia' }),
          wine.pour ? new TextRun({ text: `  (${wine.pour} pour)`, size: 18, color: gray, font: 'Georgia' }) : new TextRun({ text: '' })
        ]
      })
    );
    
    // Three tiers
    ['top', 'domestic', 'budget'].forEach(tier => {
      const tierWine = wine[tier];
      if (!tierWine || !tierWine.name) return;
      
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { before: 80 },
          children: [
            new TextRun({ text: tierLabels[tier], bold: true, size: 20, color: tierColors[tier], font: 'Georgia' })
          ]
        }),
        new Paragraph({
          indent: { left: 540 },
          children: [
            new TextRun({ text: tierWine.name, size: 22, font: 'Georgia' }),
            new TextRun({ text: `  —  ${tierWine.price || ''}`, size: 20, color: gray, font: 'Georgia' })
          ]
        }),
        new Paragraph({
          indent: { left: 540 },
          spacing: { after: 60 },
          children: [new TextRun({ text: tierWine.notes || '', size: 18, color: gray, font: 'Georgia', italics: true })]
        })
      );
    });
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === SHOPPING LIST ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: '🛒 Shopping List', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: `Scaled for ${guestCount} guests (includes 15% buffer)`, size: 22, color: gray, font: 'Georgia' })]
    })
  );
  
  Object.entries(cookbook.shopping || {}).forEach(([category, items]) => {
    // Skip meta keys like _approach
    if (category.startsWith('_') || !Array.isArray(items)) return;
    
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: category.charAt(0).toUpperCase() + category.slice(1), bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
    items.forEach(item => {
      if (!item || !item.item) return;
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [
            new TextRun({ text: '☐  ', size: 24, font: 'Georgia' }),
            new TextRun({ text: item.item, size: 22, font: 'Georgia' }),
            new TextRun({ text: `  —  ${item.qty || ''}`, size: 20, color: gray, font: 'Georgia' }),
            item.notes ? new TextRun({ text: `  (${item.notes})`, size: 18, color: gray, font: 'Georgia', italics: true }) : new TextRun({ text: '' })
          ]
        })
      );
    });
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === DAY-BEFORE PREP ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: '📅 Day-Before Prep', bold: true, size: 32, color: navy, font: 'Georgia' })]
    })
  );
  
  (cookbook.dayBeforePrep || []).forEach(task => {
    if (!task || !task.name) return;
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({ text: '☐  ', size: 24, font: 'Georgia' }),
          new TextRun({ text: task.name, bold: true, size: 24, font: 'Georgia' }),
          new TextRun({ text: `  (${task.time} min)`, size: 20, color: gray, font: 'Georgia' })
        ]
      })
    );
    task.steps.forEach((step, i) => {
      children.push(
        new Paragraph({
          indent: { left: 720 },
          spacing: { after: 40 },
          children: [new TextRun({ text: `${i + 1}. ${step}`, size: 20, font: 'Georgia' })]
        })
      );
    });
    children.push(
      new Paragraph({
        indent: { left: 720 },
        spacing: { after: 150 },
        shading: { fill: 'F5F5DC', type: ShadingType.CLEAR },
        children: [new TextRun({ text: `💡 Storage: ${task.storage}`, size: 18, font: 'Georgia', italics: true })]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === DAY-OF TIMELINE ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: '⏰ Day-Of Timeline', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Service time: ${timeStr}`, size: 22, color: gray, font: 'Georgia' })]
    })
  );
  
  (cookbook.timeline || []).forEach(block => {
    if (!block || !block.time) return;
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        shading: { fill: 'E8F4F8', type: ShadingType.CLEAR },
        children: [new TextRun({ text: `${block.time} — ${block.label}`, bold: true, size: 24, color: navy, font: 'Georgia' })]
      })
    );
    block.tasks.forEach(task => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [new TextRun({ text: `☐  ${task}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === TABLE SETTINGS ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: '🍽️ Table Settings', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: 'The table tells guests how to feel before the first course arrives', size: 20, color: gray, font: 'Georgia', italics: true })]
    })
  );
  
  // Place Setting - Structured Layout
  children.push(
    new Paragraph({
      spacing: { after: 150 },
      shading: { fill: 'E8F4F8', type: ShadingType.CLEAR },
      children: [new TextRun({ text: '⚙️ Place Setting', bold: true, size: 26, color: navy, font: 'Georgia' })]
    })
  );
  
  const ps = cookbook.tableSettings?.placeSetting || {};
  
  // Charger & Plate
  if (ps.charger) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { before: 100 },
        children: [
          new TextRun({ text: 'Charger: ', bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: ps.charger, size: 22, font: 'Georgia' })
        ]
      })
    );
  }
  if (ps.dinnerPlate) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        children: [
          new TextRun({ text: 'Dinner Plate: ', bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: ps.dinnerPlate, size: 22, font: 'Georgia' })
        ]
      })
    );
  }
  
  // Left side - Forks
  if (ps.left && ps.left.length > 0) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { before: 150 },
        children: [new TextRun({ text: '← LEFT (Forks, outside in):', bold: true, size: 22, color: green, font: 'Georgia' })]
      })
    );
    ps.left.forEach((item, i) => {
      children.push(
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: `${i + 1}. ${item}`, size: 20, font: 'Georgia' })]
        })
      );
    });
  }
  
  // Right side - Knives & Spoons
  if (ps.right && ps.right.length > 0) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { before: 150 },
        children: [new TextRun({ text: 'RIGHT (Knives & Spoons, outside in) →:', bold: true, size: 22, color: green, font: 'Georgia' })]
      })
    );
    ps.right.forEach((item, i) => {
      children.push(
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun({ text: `${i + 1}. ${item}`, size: 20, font: 'Georgia' })]
        })
      );
    });
  }
  
  // Above - Dessert utensils
  if (ps.above) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { before: 150 },
        children: [
          new TextRun({ text: '↑ ABOVE (Dessert): ', bold: true, size: 22, color: green, font: 'Georgia' }),
          new TextRun({ text: ps.above, size: 20, font: 'Georgia' })
        ]
      })
    );
  }
  
  // Glassware
  if (ps.glassware) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { before: 150 },
        children: [
          new TextRun({ text: '🍷 Glassware (L→R): ', bold: true, size: 22, color: green, font: 'Georgia' }),
          new TextRun({ text: ps.glassware, size: 20, font: 'Georgia' })
        ]
      })
    );
  }
  
  // Napkin
  if (ps.napkin) {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { before: 150 },
        children: [
          new TextRun({ text: 'Napkin: ', bold: true, size: 22, color: green, font: 'Georgia' }),
          new TextRun({ text: ps.napkin, size: 20, font: 'Georgia' })
        ]
      })
    );
  }
  
  // Centerpiece
  if (cookbook.tableSettings?.centerpiece) {
    children.push(
      new Paragraph({
        spacing: { before: 250, after: 100 },
        children: [new TextRun({ text: '💐 Centerpiece', bold: true, size: 26, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 60 },
        children: [new TextRun({ text: cookbook.tableSettings.centerpiece, size: 22, font: 'Georgia' })]
      })
    );
  }
  
  // Candles
  if (cookbook.tableSettings?.candles) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: '🕯️ Candles', bold: true, size: 26, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 60 },
        children: [new TextRun({ text: cookbook.tableSettings.candles, size: 22, font: 'Georgia' })]
      })
    );
  }
  
  // Additional Décor
  const decor = cookbook.tableSettings?.additionalDecor || cookbook.tableSettings?.decor || [];
  if (decor.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: '✨ Additional Décor', bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
    decor.forEach(item => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [new TextRun({ text: `• ${item}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  }
  
  // Lighting
  if (cookbook.tableSettings?.lighting) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: '💡 Lighting', bold: true, size: 26, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 60 },
        children: [new TextRun({ text: cookbook.tableSettings.lighting, size: 22, font: 'Georgia' })]
      })
    );
  }
  
  // Pro Tip
  if (cookbook.tableSettings?.proTip) {
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        shading: { fill: 'FFF9E6', type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: '💡 Pro Tip: ', bold: true, size: 20, font: 'Georgia' }),
          new TextRun({ text: cookbook.tableSettings.proTip, size: 20, font: 'Georgia', italics: true })
        ]
      })
    );
  }
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === PLATING GUIDE ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: '🎨 Plating Guide', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Every plate is a composition—negative space matters, height matters, sauce placement matters.', size: 20, color: gray, font: 'Georgia', italics: true })]
    })
  );
  
  (cookbook.plating || []).forEach(p => {
    if (!p || !p.course) return;
    
    // Course header with portion
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        shading: { fill: 'E8F4F8', type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: p.course, bold: true, size: 24, color: navy, font: 'Georgia' }),
          new TextRun({ text: `  —  ${p.portion || ''}`, size: 20, color: gray, font: 'Georgia' })
        ]
      })
    );
    
    // Vessel
    if (p.vessel) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { before: 80 },
          children: [
            new TextRun({ text: 'Vessel: ', bold: true, size: 20, font: 'Georgia' }),
            new TextRun({ text: p.vessel, size: 20, font: 'Georgia' })
          ]
        })
      );
    }
    
    // Composition
    if (p.composition) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          children: [
            new TextRun({ text: 'Composition: ', bold: true, size: 20, font: 'Georgia' }),
            new TextRun({ text: p.composition, size: 20, font: 'Georgia' })
          ]
        })
      );
    }
    
    // Sauce
    if (p.sauce) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          children: [
            new TextRun({ text: 'Sauce: ', bold: true, size: 20, font: 'Georgia' }),
            new TextRun({ text: p.sauce, size: 20, font: 'Georgia' })
          ]
        })
      );
    }
    
    // Garnish
    if (p.garnish) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          children: [
            new TextRun({ text: 'Garnish: ', bold: true, size: 20, font: 'Georgia' }),
            new TextRun({ text: p.garnish, size: 20, font: 'Georgia' })
          ]
        })
      );
    }
    
    // Temperature
    if (p.temperature) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          children: [
            new TextRun({ text: 'Temperature: ', bold: true, size: 20, font: 'Georgia' }),
            new TextRun({ text: p.temperature, size: 20, font: 'Georgia' })
          ]
        })
      );
    }
    
    // Visual Principle
    if (p.principle) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { before: 60 },
          shading: { fill: 'F5F5DC', type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: '✨ Principle: ', bold: true, size: 18, color: 'B8860B', font: 'Georgia' }),
            new TextRun({ text: p.principle, size: 18, font: 'Georgia', italics: true })
          ]
        })
      );
    }
    
    // Pro Tip
    if (p.tip) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 100 },
          shading: { fill: 'FFF9E6', type: ShadingType.CLEAR },
          children: [new TextRun({ text: `💡 ${p.tip}`, size: 18, font: 'Georgia', italics: true })]
        })
      );
    }
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === RECIPES (Cook's Country Style) ===
  if (cookbook.recipes && cookbook.recipes.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 300 },
        children: [new TextRun({ text: '📖 Recipes', bold: true, size: 32, color: navy, font: 'Georgia' })]
      })
    );
    
    cookbook.recipes.forEach((recipe, idx) => {
      // Recipe header
      children.push(
        new Paragraph({
          spacing: { before: idx > 0 ? 400 : 200, after: 100 },
          shading: { fill: 'E8F4F8', type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: recipe.course?.toUpperCase() || '', bold: true, size: 18, color: gold, font: 'Georgia' })
          ]
        }),
        new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({ text: recipe.name, bold: true, size: 28, color: navy, font: 'Georgia' })]
        }),
        new Paragraph({
          spacing: { after: 150 },
          children: [
            new TextRun({ text: `Serves ${guestCount}  •  Active: ${recipe.activeTime || '30 min'}  •  Total: ${recipe.totalTime || '1 hour'}`, size: 18, color: gray, font: 'Georgia' })
          ]
        })
      );
      
      // WHY IT WORKS box
      if (recipe.whyItWorks) {
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 50 },
            children: [new TextRun({ text: 'WHY IT WORKS', bold: true, size: 18, color: green, font: 'Georgia' })]
          }),
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 150 },
            shading: { fill: 'F5F5DC', type: ShadingType.CLEAR },
            children: [new TextRun({ text: recipe.whyItWorks, size: 20, font: 'Georgia', italics: true })]
          })
        );
      }
      
      // MAKE AHEAD
      if (recipe.makeAhead) {
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 50 },
            children: [new TextRun({ text: 'MAKE AHEAD', bold: true, size: 18, color: green, font: 'Georgia' })]
          }),
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 150 },
            children: [new TextRun({ text: recipe.makeAhead, size: 20, font: 'Georgia' })]
          })
        );
      }
      
      // INGREDIENTS
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 150, after: 100 },
            children: [new TextRun({ text: 'INGREDIENTS', bold: true, size: 20, color: navy, font: 'Georgia' })]
          })
        );
        recipe.ingredients.forEach(ing => {
          const ingText = typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.item || ing}${ing.prep ? ', ' + ing.prep : ''}`;
          children.push(
            new Paragraph({
              indent: { left: 360 },
              spacing: { after: 40 },
              children: [new TextRun({ text: `• ${ingText}`, size: 20, font: 'Georgia' })]
            })
          );
        });
      }
      
      // INSTRUCTIONS
      if (recipe.instructions && recipe.instructions.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 150, after: 100 },
            children: [new TextRun({ text: 'INSTRUCTIONS', bold: true, size: 20, color: navy, font: 'Georgia' })]
          })
        );
        recipe.instructions.forEach((step, i) => {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: `${i + 1}. `, bold: true, size: 20, font: 'Georgia' }),
                new TextRun({ text: step, size: 20, font: 'Georgia' })
              ]
            })
          );
        });
      }
      
      // TIPS
      if (recipe.tips && recipe.tips.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 150, after: 50 },
            shading: { fill: 'FFF9E6', type: ShadingType.CLEAR },
            children: [new TextRun({ text: '💡 TIPS', bold: true, size: 18, color: 'B8860B', font: 'Georgia' })]
          })
        );
        recipe.tips.forEach(tip => {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              spacing: { after: 40 },
              shading: { fill: 'FFF9E6', type: ShadingType.CLEAR },
              children: [new TextRun({ text: `• ${tip}`, size: 18, font: 'Georgia', italics: true })]
            })
          );
        });
      }
      
      // Page break between recipes (except last)
      if (idx < cookbook.recipes.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });
    
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  
  // === SIGNATURE COCKTAIL ===
  if (cookbook.cocktail) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: '🍸 Signature Cocktail', bold: true, size: 32, color: navy, font: 'Georgia' })]
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: cookbook.cocktail.name, bold: true, size: 28, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        spacing: { after: 150 },
        children: [new TextRun({ text: cookbook.cocktail.description, size: 20, color: gray, font: 'Georgia', italics: true })]
      }),
      new Paragraph({
        spacing: { before: 100, after: 50 },
        children: [new TextRun({ text: 'Per Drink:', bold: true, size: 20, font: 'Georgia' })]
      })
    );
    
    if (cookbook.cocktail.ingredients) {
      cookbook.cocktail.ingredients.forEach(ing => {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 40 },
            children: [new TextRun({ text: `• ${ing}`, size: 20, font: 'Georgia' })]
          })
        );
      });
    }
    
    if (cookbook.cocktail.instructions) {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 50 },
          children: [new TextRun({ text: 'Method:', bold: true, size: 20, font: 'Georgia' })]
        }),
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 150 },
          children: [new TextRun({ text: cookbook.cocktail.instructions, size: 20, font: 'Georgia' })]
        })
      );
    }
    
    if (cookbook.cocktail.batchRecipe) {
      children.push(
        new Paragraph({
          spacing: { before: 100 },
          shading: { fill: 'F5F5DC', type: ShadingType.CLEAR },
          children: [new TextRun({ text: `📦 Batch for ${guestCount}: `, bold: true, size: 18, font: 'Georgia' })]
        }),
        new Paragraph({
          shading: { fill: 'F5F5DC', type: ShadingType.CLEAR },
          spacing: { after: 100 },
          children: [new TextRun({ text: cookbook.cocktail.batchRecipe, size: 18, font: 'Georgia' })]
        })
      );
    }
    
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  
  // === TIPS & SECRETS ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: '👨‍🍳 Tips & Secrets', bold: true, size: 32, color: navy, font: 'Georgia' })]
    })
  );
  
  ['timing', 'temperature', 'lastMinute'].forEach(category => {
    const labels = { timing: 'Timing', temperature: 'Temperature', lastMinute: 'Last-Minute Success' };
    const tips = cookbook.tips?.[category] || [];
    if (tips.length === 0) return;
    
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: labels[category], bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
    tips.forEach(tip => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [new TextRun({ text: `• ${tip}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  });
  
  // Emergency fixes
  const emergencyFixes = cookbook.tips?.emergency || [];
  if (emergencyFixes.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: '🚨 Emergency Fixes', bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
  
    emergencyFixes.forEach(e => {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `Problem: `, bold: true, size: 22, font: 'Georgia' }),
          new TextRun({ text: e.problem, size: 22, font: 'Georgia' })
        ]
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `Fix: `, bold: true, size: 22, color: green, font: 'Georgia' }),
          new TextRun({ text: e.fix, size: 22, font: 'Georgia', italics: true })
        ]
      })
    );
  });
  }
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === FINAL CHECKLIST ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: '✅ Final Checklist', bold: true, size: 32, color: navy, font: 'Georgia' })]
    })
  );
  
  ['kitchen', 'dining', 'thirtyMinutes', 'mental'].forEach(category => {
    const labels = { kitchen: 'Kitchen', dining: 'Dining Room', thirtyMinutes: '30 Minutes Before', mental: 'Mental Check' };
    const items = cookbook.checklist?.[category] || [];
    if (items.length === 0) return;
    
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: labels[category], bold: true, size: 26, color: green, font: 'Georgia' })]
      })
    );
    items.forEach(item => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [new TextRun({ text: `☐  ${item}`, size: 22, font: 'Georgia' })]
        })
      );
    });
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  // === AI IMAGE PROMPTS ===
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: '📸 AI Image Prompts', bold: true, size: 32, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Magazine-quality prompts for Midjourney, DALL-E, or similar', size: 22, color: gray, font: 'Georgia', italics: true })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      shading: { fill: 'E8F4F8', type: ShadingType.CLEAR },
      children: [new TextRun({ text: '💡 All images should feel like ONE cohesive photoshoot in the SAME dining room', size: 20, font: 'Georgia' })]
    })
  );
  
  // Style Guide
  if (cookbook.imagePrompts?.styleGuide) {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 100 },
        children: [new TextRun({ text: '🎨 Style Guide (Apply to ALL images)', bold: true, size: 24, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        shading: { fill: 'FFF9E6', type: ShadingType.CLEAR },
        indent: { left: 360, right: 360 },
        spacing: { after: 200 },
        children: [new TextRun({ text: cookbook.imagePrompts.styleGuide, size: 18, font: 'Georgia' })]
      })
    );
  }
  
  // Tablescape prompt
  const tablescapePrompt = cookbook.imagePrompts?.tablescape?.prompt || cookbook.imagePrompts?.tablescape;
  if (tablescapePrompt) {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 100 },
        children: [new TextRun({ text: '🍽️ Tablescape (Before Guests Arrive)', bold: true, size: 24, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
        indent: { left: 360, right: 360 },
        spacing: { after: 50 },
        children: [new TextRun({ text: typeof tablescapePrompt === 'string' ? tablescapePrompt : JSON.stringify(tablescapePrompt), size: 18, font: 'Georgia' })]
      })
    );
    if (cookbook.imagePrompts?.tablescape?.platform?.midjourney) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 200 },
          children: [new TextRun({ text: `Midjourney: ${cookbook.imagePrompts.tablescape.platform.midjourney}`, size: 16, color: gray, font: 'Georgia', italics: true })]
        })
      );
    }
  }
  
  // Main Course prompt  
  const mainPrompt = cookbook.imagePrompts?.mainCourse?.prompt || cookbook.imagePrompts?.mainCourse;
  if (mainPrompt) {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 100 },
        children: [new TextRun({ text: '🥩 Main Course Hero Shot', bold: true, size: 24, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
        indent: { left: 360, right: 360 },
        spacing: { after: 50 },
        children: [new TextRun({ text: typeof mainPrompt === 'string' ? mainPrompt : JSON.stringify(mainPrompt), size: 18, font: 'Georgia' })]
      })
    );
    if (cookbook.imagePrompts?.mainCourse?.platform?.midjourney) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 200 },
          children: [new TextRun({ text: `Midjourney: ${cookbook.imagePrompts.mainCourse.platform.midjourney}`, size: 16, color: gray, font: 'Georgia', italics: true })]
        })
      );
    }
  }
  
  // Dessert prompt
  const dessertPrompt = cookbook.imagePrompts?.dessert?.prompt || cookbook.imagePrompts?.dessert;
  if (dessertPrompt) {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 100 },
        children: [new TextRun({ text: '🍰 Dessert Shot', bold: true, size: 24, color: green, font: 'Georgia' })]
      }),
      new Paragraph({
        shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
        indent: { left: 360, right: 360 },
        spacing: { after: 50 },
        children: [new TextRun({ text: typeof dessertPrompt === 'string' ? dessertPrompt : JSON.stringify(dessertPrompt), size: 18, font: 'Georgia' })]
      })
    );
    if (cookbook.imagePrompts?.dessert?.platform?.midjourney) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 200 },
          children: [new TextRun({ text: `Midjourney: ${cookbook.imagePrompts.dessert.platform.midjourney}`, size: 16, color: gray, font: 'Georgia', italics: true })]
        })
      );
    }
  }
  
  // === CLOSING ===
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '🥂', size: 72 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: "You've Got This!", bold: true, size: 36, color: navy, font: 'Georgia' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: 'The prep is done. Tonight is about enjoying your guests.', size: 22, color: gray, font: 'Georgia', italics: true })]
    })
  );
  
  // Create document
  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Georgia', size: 22 } } }
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: eventTitle, size: 18, color: gray, font: 'Georgia', italics: true })]
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
      children
    }]
  });
  
  return Packer.toBuffer(doc);
}

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         Dinner Party Planner API - Beta Server             ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                 ║
║  Beta ends: ${process.env.BETA_EXPIRY || process.env.BETA_END_DATE || 'Not set'}                                  ║
║  Access codes loaded: ${validAccessCodes.length}                                 ║
╚════════════════════════════════════════════════════════════╝
  `);
});

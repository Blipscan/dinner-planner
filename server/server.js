/**
 * Dinner Party Planner - Beta API Server
 * Complete standalone version with embedded client
 * 
 * Deploy to Railway with root directory: server
 * Environment variables needed:
 *   ANTHROPIC_API_KEY, ADMIN_CODE, ACCESS_CODES, BETA_EXPIRY, MAX_GENERATIONS_PER_CODE
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway/cloud deployment
app.set('trust proxy', 1);

// ============================================================
// BETA ACCESS TRACKING
// ============================================================
const usageTracker = new Map();
const validAccessCodes = (process.env.ACCESS_CODES || '').split(',').filter(c => c.trim());
if (process.env.ADMIN_CODE) validAccessCodes.push(process.env.ADMIN_CODE);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// ============================================================
// BETA VALIDATION MIDDLEWARE
// ============================================================
function validateBeta(req, res, next) {
  const endDate = new Date(process.env.BETA_EXPIRY || process.env.BETA_END_DATE || '2099-12-31');
  if (new Date() > endDate) {
    return res.status(403).json({
      error: 'Beta period has ended',
      message: 'Thank you for testing!'
    });
  }

  const accessCode = req.headers['x-access-code'] || req.body.accessCode;
  if (!accessCode || !validAccessCodes.includes(accessCode)) {
    return res.status(401).json({ error: 'Invalid access code' });
  }

  if (accessCode !== process.env.ADMIN_CODE) {
    const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
    const maxGen = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
    if (usage.generations >= maxGen) {
      return res.status(403).json({
        error: 'Generation limit reached',
        message: 'Thank you for testing!'
      });
    }
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

// ============================================================
// API ROUTES
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  const endDate = new Date(process.env.BETA_EXPIRY || process.env.BETA_END_DATE || '2099-12-31');
  const daysRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
  res.json({
    status: 'ok',
    beta: {
      active: new Date() < endDate,
      endDate: process.env.BETA_EXPIRY || process.env.BETA_END_DATE,
      daysRemaining: Math.max(0, daysRemaining)
    },
    accessCodesLoaded: validAccessCodes.length
  });
});

// Validate access code
app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode || !validAccessCodes.includes(accessCode)) {
    return res.status(401).json({ valid: false, message: 'Invalid access code' });
  }
  const endDate = new Date(process.env.BETA_EXPIRY || process.env.BETA_END_DATE || '2099-12-31');
  if (new Date() > endDate) {
    return res.status(403).json({ valid: false, message: 'Beta period has ended' });
  }
  const usage = usageTracker.get(accessCode) || { generations: 0, lastUsed: null };
  const maxGen = parseInt(process.env.MAX_GENERATIONS_PER_CODE) || 50;
  res.json({
    valid: true,
    usage: {
      generations: usage.generations,
      remaining: accessCode === process.env.ADMIN_CODE ? 'unlimited' : (maxGen - usage.generations)
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
        temperature: 0.95,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(500).json({ error: 'Menu generation failed', details: error });
    }

    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse menu response' });
    }

    const menus = JSON.parse(jsonMatch[0]);
    trackUsage(req.accessCode);
    res.json({ menus, source: 'ai-generated' });

  } catch (error) {
    console.error('Generate menus error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Build cookbook data
app.post('/api/build-cookbook', validateBeta, async (req, res) => {
  try {
    const { menu, guestCount, serviceTime } = req.body;
    const prompt = buildCookbookPrompt(menu, guestCount, serviceTime);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Cookbook generation failed' });
    }

    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse cookbook response' });
    }

    const cookbook = JSON.parse(jsonMatch[0]);
    res.json({ cookbook, source: 'ai-generated' });

  } catch (error) {
    console.error('Build cookbook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate DOCX
app.post('/api/generate-docx', validateBeta, async (req, res) => {
  try {
    const { eventTitle, eventDate, guestCount, menu, cookbook } = req.body;
    const docx = require('docx');
    const buffer = await generateDocxBuffer(docx, { eventTitle, eventDate, guestCount, menu, cookbook });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(eventTitle || 'Dinner_Party').replace(/[^a-z0-9]/gi, '_')}_Cookbook.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('Generate DOCX error:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Admin stats
app.get('/api/admin/stats', (req, res) => {
  const adminCode = req.headers['x-access-code'];
  if (adminCode !== process.env.ADMIN_CODE) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const stats = {};
  usageTracker.forEach((usage, code) => { stats[code] = usage; });
  res.json({ totalCodes: validAccessCodes.length - 1, activeTesters: usageTracker.size, usage: stats });
});

// ============================================================
// PROMPT BUILDERS
// ============================================================

function buildMenuPrompt(preferences) {
  const { guestCount, budget, cuisineStyle, dietaryRestrictions, occasion, skillLevel, likes, dislikes } = preferences;
  
  return `You are an expert culinary consultant combining the skills of a James Beard Award-winning chef, Master Sommelier, and CIA instructor.

Generate 5 complete dinner party menu options for ${guestCount} guests with a food budget of ${budget}.

Cuisine style: ${cuisineStyle || 'Chef\'s choice'}
Occasion: ${occasion || 'Dinner party'}
Host skill level: ${skillLevel || 'Intermediate'}
Likes: ${likes || 'Not specified'}
Dislikes: ${dislikes || 'Not specified'}
Dietary restrictions: ${dietaryRestrictions?.join(', ') || 'None'}

Return ONLY a JSON array with exactly 5 menu objects. No other text. Each menu object must have:
{
  "name": "Creative menu name",
  "description": "2-3 sentence description of the menu concept",
  "courses": [
    { "course": "Amuse-Bouche", "dish": "Dish name", "description": "Brief description" },
    { "course": "First Course", "dish": "Dish name", "description": "Brief description" },
    { "course": "Main Course", "dish": "Dish name", "description": "Brief description" },
    { "course": "Dessert", "dish": "Dish name", "description": "Brief description" }
  ],
  "estimatedCost": "$XX-$XX",
  "difficulty": "Easy|Intermediate|Advanced",
  "prepTime": "X hours",
  "wineStyle": "Suggested wine style pairing"
}`;
}

function buildCookbookPrompt(menu, guestCount, serviceTime) {
  return `You are an expert culinary team: James Beard chef, Master Sommelier, and CIA instructor.

Create a complete cookbook for this dinner party menu for ${guestCount} guests, service time ${serviceTime || '7:00 PM'}:

Menu: ${menu.name}
${menu.courses.map(c => `- ${c.course}: ${c.dish}`).join('\n')}

Return ONLY a JSON object with this structure:
{
  "recipes": [
    {
      "course": "Course name",
      "dish": "Dish name",
      "ingredients": ["ingredient 1 with quantity", "ingredient 2 with quantity"],
      "instructions": ["Step 1", "Step 2"],
      "chefTips": ["Tip 1"],
      "prepTime": "X minutes",
      "cookTime": "X minutes"
    }
  ],
  "shoppingList": {
    "produce": ["item 1", "item 2"],
    "protein": ["item 1"],
    "dairy": ["item 1"],
    "pantry": ["item 1"],
    "specialty": ["item 1"]
  },
  "timeline": [
    { "time": "T-3 days", "task": "Task description" },
    { "time": "T-1 day", "task": "Task description" },
    { "time": "Day of - 4:00 PM", "task": "Task description" }
  ],
  "winePairings": [
    { "course": "Course name", "wine": "Wine name", "notes": "Why this pairing works" }
  ],
  "tableSettings": {
    "style": "Description of table setting style",
    "elements": ["Element 1", "Element 2"]
  },
  "platingGuides": [
    { "course": "Course name", "description": "How to plate this dish" }
  ]
}`;
}

// ============================================================
// DOCX GENERATION
// ============================================================

async function generateDocxBuffer(docx, data) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
          Header, Footer, AlignmentType, BorderStyle, WidthType, 
          HeadingLevel, PageNumber, PageBreak, LevelFormat, ShadingType } = docx;

  const { eventTitle, eventDate, guestCount, menu, cookbook } = data;

  const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Georgia", size: 24 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal",
          run: { size: 56, bold: true, color: "1a3a5c", font: "Georgia" },
          paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, color: "1a3a5c", font: "Georgia" },
          paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, color: "2c5282", font: "Georgia" },
          paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } }
      ]
    },
    numbering: {
      config: [
        { reference: "ingredients",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "instructions",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
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
            children: [new TextRun({ text: eventTitle || "Dinner Party", italics: true, size: 20, color: "666666" })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", size: 20 }),
              new TextRun({ children: [PageNumber.CURRENT], size: 20 }),
              new TextRun({ text: " of ", size: 20 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20 })
            ]
          })]
        })
      },
      children: buildDocumentContent({ Document, Paragraph, TextRun, Table, TableRow, TableCell, 
        AlignmentType, BorderStyle, WidthType, HeadingLevel, PageBreak, ShadingType,
        cellBorders, eventTitle, eventDate, guestCount, menu, cookbook })
    }]
  });

  return Packer.toBuffer(doc);
}

function buildDocumentContent(params) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, 
          HeadingLevel, PageBreak, ShadingType, cellBorders, 
          eventTitle, eventDate, guestCount, menu, cookbook } = params;

  const content = [];

  // Title page
  content.push(
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(eventTitle || "Dinner Party Cookbook")] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
      children: [new TextRun({ text: `${eventDate || "Date TBD"} • ${guestCount} Guests`, size: 28, color: "666666" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 },
      children: [new TextRun({ text: menu?.name || "Custom Menu", size: 32, italics: true })] })
  );

  // Menu overview
  if (menu?.courses) {
    content.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("The Menu")] })
    );
    menu.courses.forEach(course => {
      content.push(
        new Paragraph({ spacing: { before: 200 },
          children: [
            new TextRun({ text: `${course.course}: `, bold: true }),
            new TextRun({ text: course.dish })
          ]
        })
      );
      if (course.description) {
        content.push(new Paragraph({ children: [new TextRun({ text: course.description, italics: true, color: "666666" })] }));
      }
    });
  }

  // Recipes
  if (cookbook?.recipes) {
    content.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Recipes")] })
    );
    cookbook.recipes.forEach((recipe, idx) => {
      if (idx > 0) content.push(new Paragraph({ children: [new PageBreak()] }));
      content.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${recipe.course}: ${recipe.dish}`)] })
      );
      if (recipe.prepTime || recipe.cookTime) {
        content.push(new Paragraph({
          children: [new TextRun({ text: `Prep: ${recipe.prepTime || 'N/A'} | Cook: ${recipe.cookTime || 'N/A'}`, italics: true, color: "666666" })]
        }));
      }
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Ingredients", bold: true })] }));
      (recipe.ingredients || []).forEach(ing => {
        content.push(new Paragraph({ numbering: { reference: "ingredients", level: 0 }, children: [new TextRun(ing)] }));
      });
      content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Instructions", bold: true })] }));
      (recipe.instructions || []).forEach((step, i) => {
        content.push(new Paragraph({ numbering: { reference: `instructions-${idx}`, level: 0 }, children: [new TextRun(step)] }));
      });
      if (recipe.chefTips?.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Chef's Tips", bold: true })] }));
        recipe.chefTips.forEach(tip => {
          content.push(new Paragraph({ children: [new TextRun({ text: `💡 ${tip}`, italics: true })] }));
        });
      }
    });
  }

  // Shopping list
  if (cookbook?.shoppingList) {
    content.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Shopping List")] })
    );
    Object.entries(cookbook.shoppingList).forEach(([category, items]) => {
      if (items?.length) {
        content.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: category.charAt(0).toUpperCase() + category.slice(1), bold: true })] }));
        items.forEach(item => {
          content.push(new Paragraph({ numbering: { reference: "ingredients", level: 0 }, children: [new TextRun(item)] }));
        });
      }
    });
  }

  // Timeline
  if (cookbook?.timeline?.length) {
    content.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Preparation Timeline")] })
    );
    cookbook.timeline.forEach(item => {
      content.push(new Paragraph({ spacing: { before: 100 },
        children: [
          new TextRun({ text: `${item.time}: `, bold: true }),
          new TextRun(item.task)
        ]
      }));
    });
  }

  // Wine pairings
  if (cookbook?.winePairings?.length) {
    content.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Wine Pairings")] })
    );
    cookbook.winePairings.forEach(pairing => {
      content.push(
        new Paragraph({ spacing: { before: 200 },
          children: [
            new TextRun({ text: `${pairing.course}: `, bold: true }),
            new TextRun(pairing.wine)
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: pairing.notes, italics: true, color: "666666" })] })
      );
    });
  }

  // AI disclosure
  content.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 },
      children: [new TextRun({ text: "This cookbook was generated by AI Deep Study", italics: true, size: 20, color: "999999" })]
    }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Dinner Party Planner Beta", size: 20, color: "999999" })]
    })
  );

  return content;
}

// ============================================================
// EMBEDDED CLIENT HTML
// ============================================================

const CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dinner Party Planner - Beta</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Lora', Georgia, serif; background: linear-gradient(135deg, #1a3a5c 0%, #0f2438 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: #faf8f3; border-radius: 16px; box-shadow: 0 25px 80px rgba(0,0,0,0.4); overflow: hidden; }
    .header { text-align: center; padding: 40px; background: linear-gradient(135deg, #1a3a5c 0%, #0f2438 100%); color: #faf8f3; border-bottom: 4px solid #c9a959; }
    .header h1 { font-family: 'Playfair Display', serif; font-size: 2.4rem; margin-bottom: 8px; }
    .header .subtitle { color: #c9a959; letter-spacing: 0.2em; font-size: 0.75rem; text-transform: uppercase; }
    .content { padding: 40px; }
    .login-section, .app-section { display: none; }
    .login-section.active, .app-section.active { display: block; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; font-weight: 500; color: #1a3a5c; }
    .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 12px 16px; border: 2px solid #e0ddd5; border-radius: 8px; font-family: inherit; font-size: 1rem; transition: border-color 0.2s; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #c9a959; }
    .btn { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #1a3a5c 0%, #0f2438 100%); color: #faf8f3; border: none; border-radius: 8px; font-family: inherit; font-size: 1rem; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(26,58,92,0.3); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .btn-secondary { background: #c9a959; color: #1a3a5c; }
    .error { color: #c0392b; margin-top: 10px; }
    .success { color: #27ae60; margin-top: 10px; }
    .menu-card { background: white; border: 2px solid #e0ddd5; border-radius: 12px; padding: 24px; margin-bottom: 20px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; }
    .menu-card:hover { border-color: #c9a959; box-shadow: 0 4px 12px rgba(201,169,89,0.2); }
    .menu-card.selected { border-color: #1a3a5c; box-shadow: 0 4px 12px rgba(26,58,92,0.3); }
    .menu-card h3 { font-family: 'Playfair Display', serif; color: #1a3a5c; margin-bottom: 8px; }
    .menu-card p { color: #666; font-size: 0.95rem; margin-bottom: 12px; }
    .menu-card .courses { font-size: 0.9rem; color: #444; }
    .menu-card .meta { display: flex; gap: 16px; margin-top: 12px; font-size: 0.85rem; color: #888; }
    .loading { text-align: center; padding: 40px; }
    .loading-spinner { width: 40px; height: 40px; border: 3px solid #e0ddd5; border-top-color: #c9a959; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .step { display: none; }
    .step.active { display: block; }
    .step-indicator { display: flex; justify-content: center; gap: 8px; margin-bottom: 30px; }
    .step-dot { width: 12px; height: 12px; border-radius: 50%; background: #e0ddd5; transition: background 0.2s; }
    .step-dot.active { background: #c9a959; }
    .step-dot.completed { background: #1a3a5c; }
    .checkbox-group { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .checkbox-item { display: flex; align-items: center; gap: 8px; }
    .checkbox-item input { width: auto; }
    .nav-buttons { display: flex; justify-content: space-between; margin-top: 30px; }
    h2 { font-family: 'Playfair Display', serif; color: #1a3a5c; margin-bottom: 20px; }
    .divider { height: 1px; background: #e0ddd5; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🍽️ Dinner Party Planner</h1>
      <div class="subtitle">Beta Version</div>
    </div>
    <div class="content">
      <!-- Login -->
      <div class="login-section active" id="loginSection">
        <h2>Welcome, Beta Tester!</h2>
        <p style="margin-bottom: 20px; color: #666;">Enter your access code to begin planning your perfect dinner party.</p>
        <div class="form-group">
          <label for="accessCode">Access Code</label>
          <input type="text" id="accessCode" placeholder="Enter your beta access code">
        </div>
        <button class="btn" onclick="validateCode()">Enter</button>
        <div id="loginError" class="error"></div>
      </div>

      <!-- App -->
      <div class="app-section" id="appSection">
        <div class="step-indicator" id="stepIndicator"></div>

        <!-- Step 1: Preferences -->
        <div class="step active" id="step1">
          <h2>Tell Us About Your Dinner Party</h2>
          <div class="form-group">
            <label for="guestCount">Number of Guests</label>
            <input type="number" id="guestCount" min="2" max="20" value="6">
          </div>
          <div class="form-group">
            <label for="budget">Food Budget</label>
            <select id="budget">
              <option value="$75-100">$75-100</option>
              <option value="$100-150">$100-150</option>
              <option value="$150-200" selected>$150-200</option>
              <option value="$200-300">$200-300</option>
              <option value="$300+">$300+</option>
            </select>
          </div>
          <div class="form-group">
            <label for="cuisineStyle">Cuisine Style</label>
            <select id="cuisineStyle">
              <option value="Chef's Choice">Chef's Choice</option>
              <option value="French Bistro">French Bistro</option>
              <option value="Italian">Italian</option>
              <option value="Mediterranean">Mediterranean</option>
              <option value="Modern American">Modern American</option>
              <option value="Asian Fusion">Asian Fusion</option>
              <option value="Spanish/Tapas">Spanish/Tapas</option>
              <option value="Farm-to-Table">Farm-to-Table</option>
            </select>
          </div>
          <div class="form-group">
            <label for="occasion">Occasion</label>
            <select id="occasion">
              <option value="Casual dinner party">Casual dinner party</option>
              <option value="Romantic dinner">Romantic dinner</option>
              <option value="Birthday celebration">Birthday celebration</option>
              <option value="Anniversary">Anniversary</option>
              <option value="Holiday gathering">Holiday gathering</option>
              <option value="Business dinner">Business dinner</option>
            </select>
          </div>
          <div class="form-group">
            <label for="skillLevel">Your Cooking Skill Level</label>
            <select id="skillLevel">
              <option value="Beginner">Beginner</option>
              <option value="Intermediate" selected>Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
          <div class="form-group">
            <label>Dietary Restrictions</label>
            <div class="checkbox-group">
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Gluten-free"> Gluten-free</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Dairy-free"> Dairy-free</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Vegetarian"> Vegetarian</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Vegan"> Vegan</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Nut allergy"> Nut allergy</label>
              <label class="checkbox-item"><input type="checkbox" name="dietary" value="Shellfish allergy"> Shellfish allergy</label>
            </div>
          </div>
          <div class="form-group">
            <label for="likes">Ingredients You Love</label>
            <input type="text" id="likes" placeholder="e.g., seafood, chocolate, mushrooms">
          </div>
          <div class="form-group">
            <label for="dislikes">Ingredients to Avoid</label>
            <input type="text" id="dislikes" placeholder="e.g., cilantro, olives, blue cheese">
          </div>
          <div class="nav-buttons">
            <div></div>
            <button class="btn" onclick="generateMenus()">Generate Menu Options →</button>
          </div>
        </div>

        <!-- Step 2: Menu Selection -->
        <div class="step" id="step2">
          <h2>Choose Your Menu</h2>
          <div id="menuLoading" class="loading" style="display: none;">
            <div class="loading-spinner"></div>
            <p>Our AI chefs are crafting your personalized menus...</p>
          </div>
          <div id="menuOptions"></div>
          <div id="menuError" class="error"></div>
          <div class="nav-buttons">
            <button class="btn btn-secondary" onclick="goToStep(1)">← Back</button>
            <button class="btn" id="selectMenuBtn" onclick="selectMenu()" disabled>Select This Menu →</button>
          </div>
        </div>

        <!-- Step 3: Generate Cookbook -->
        <div class="step" id="step3">
          <h2>Your Cookbook is Ready!</h2>
          <div id="cookbookLoading" class="loading" style="display: none;">
            <div class="loading-spinner"></div>
            <p>Creating your complete cookbook with recipes, shopping list, and timeline...</p>
          </div>
          <div id="cookbookPreview"></div>
          <div id="cookbookError" class="error"></div>
          <div class="nav-buttons">
            <button class="btn btn-secondary" onclick="goToStep(2)">← Back</button>
            <button class="btn" id="downloadBtn" onclick="downloadDocx()" disabled>Download Cookbook (DOCX)</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let accessCode = '';
    let currentStep = 1;
    let selectedMenu = null;
    let cookbook = null;

    function updateStepIndicator() {
      const indicator = document.getElementById('stepIndicator');
      indicator.innerHTML = [1,2,3].map(n => 
        '<div class="step-dot ' + (n < currentStep ? 'completed' : '') + (n === currentStep ? ' active' : '') + '"></div>'
      ).join('');
    }

    function goToStep(step) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step' + step).classList.add('active');
      currentStep = step;
      updateStepIndicator();
    }

    async function validateCode() {
      const code = document.getElementById('accessCode').value.trim();
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = '';

      if (!code) {
        errorEl.textContent = 'Please enter an access code';
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
          updateStepIndicator();
        } else {
          errorEl.textContent = data.message || 'Invalid access code';
        }
      } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
      }
    }

    async function generateMenus() {
      const loading = document.getElementById('menuLoading');
      const options = document.getElementById('menuOptions');
      const error = document.getElementById('menuError');
      
      goToStep(2);
      loading.style.display = 'block';
      options.innerHTML = '';
      error.textContent = '';
      selectedMenu = null;
      document.getElementById('selectMenuBtn').disabled = true;

      const dietary = Array.from(document.querySelectorAll('input[name="dietary"]:checked')).map(c => c.value);

      const preferences = {
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
          body: JSON.stringify({ preferences })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to generate menus');
        }

        const data = await res.json();
        loading.style.display = 'none';

        if (data.menus && data.menus.length) {
          options.innerHTML = data.menus.map((menu, i) => 
            '<div class="menu-card" onclick="selectMenuCard(' + i + ')" id="menuCard' + i + '">' +
              '<h3>' + menu.name + '</h3>' +
              '<p>' + menu.description + '</p>' +
              '<div class="courses">' + menu.courses.map(c => '<div><strong>' + c.course + ':</strong> ' + c.dish + '</div>').join('') + '</div>' +
              '<div class="meta"><span>💰 ' + menu.estimatedCost + '</span><span>⏱️ ' + menu.prepTime + '</span><span>📊 ' + menu.difficulty + '</span></div>' +
            '</div>'
          ).join('');
          window.generatedMenus = data.menus;
        }
      } catch (err) {
        loading.style.display = 'none';
        error.textContent = err.message;
      }
    }

    function selectMenuCard(index) {
      document.querySelectorAll('.menu-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('menuCard' + index).classList.add('selected');
      selectedMenu = window.generatedMenus[index];
      document.getElementById('selectMenuBtn').disabled = false;
    }

    async function selectMenu() {
      if (!selectedMenu) return;

      const loading = document.getElementById('cookbookLoading');
      const preview = document.getElementById('cookbookPreview');
      const error = document.getElementById('cookbookError');

      goToStep(3);
      loading.style.display = 'block';
      preview.innerHTML = '';
      error.textContent = '';
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
          const err = await res.json();
          throw new Error(err.error || 'Failed to generate cookbook');
        }

        const data = await res.json();
        cookbook = data.cookbook;
        loading.style.display = 'none';

        preview.innerHTML = 
          '<div class="menu-card">' +
            '<h3>📖 ' + selectedMenu.name + ' Cookbook</h3>' +
            '<p>Your complete dinner party guide is ready!</p>' +
            '<div class="divider"></div>' +
            '<p><strong>Includes:</strong></p>' +
            '<ul style="margin-left: 20px; margin-top: 10px;">' +
              '<li>' + (cookbook.recipes?.length || 0) + ' complete recipes with instructions</li>' +
              '<li>Organized shopping list</li>' +
              '<li>Preparation timeline</li>' +
              '<li>Wine pairing recommendations</li>' +
              '<li>Table setting guide</li>' +
              '<li>Plating instructions</li>' +
            '</ul>' +
          '</div>';

        document.getElementById('downloadBtn').disabled = false;

      } catch (err) {
        loading.style.display = 'none';
        error.textContent = err.message;
      }
    }

    async function downloadDocx() {
      try {
        const res = await fetch('/api/generate-docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-access-code': accessCode },
          body: JSON.stringify({
            eventTitle: selectedMenu.name,
            eventDate: new Date().toLocaleDateString(),
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
        a.download = selectedMenu.name.replace(/[^a-z0-9]/gi, '_') + '_Cookbook.docx';
        a.click();
        URL.revokeObjectURL(url);

      } catch (err) {
        document.getElementById('cookbookError').textContent = err.message;
      }
    }

    // Enter key handler
    document.getElementById('accessCode').addEventListener('keypress', e => {
      if (e.key === 'Enter') validateCode();
    });
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
  console.log('🍽️  Dinner Party Planner - Beta Server');
  console.log('=====================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Access codes loaded: ${validAccessCodes.length}`);
  console.log(`✅ Beta ends: ${process.env.BETA_EXPIRY || process.env.BETA_END_DATE || 'Not set'}`);
  console.log('');
});

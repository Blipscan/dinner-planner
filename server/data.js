// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// Complete Data Structures
// ============================================================

const CUISINES = {
  american: {
    label: 'American',
    regions: ['Southern', 'New England', 'Pacific Northwest', 'California', 'Midwest', 'Southwest', 'Mid-Atlantic', 'Hawaiian'],
    styles: ['BBQ', 'Soul Food', 'Tex-Mex', 'Cajun/Creole', 'Farm-to-Table', 'New American']
  },
  european: {
    label: 'European',
    countries: {
      france: { 
        label: 'France', 
        regions: ['Provence', 'Alsace', 'Burgundy', 'Lyon', 'Normandy', 'Brittany', 'Paris Bistro', 'Bordeaux'] 
      },
      italy: { 
        label: 'Italy', 
        regions: ['Tuscany', 'Sicily', 'Piedmont', 'Emilia-Romagna', 'Campania', 'Veneto', 'Rome', 'Lombardy'] 
      },
      spain: { 
        label: 'Spain', 
        regions: ['Basque', 'Catalonia', 'Andalusia', 'Galicia', 'Madrid', 'Valencia'] 
      },
      germany: { 
        label: 'Germany', 
        regions: ['Bavaria', 'Rhineland', 'Berlin', 'Black Forest'] 
      },
      uk: { 
        label: 'British', 
        regions: ['Traditional', 'Modern British', 'Scottish', 'Welsh'] 
      },
      portugal: { 
        label: 'Portugal', 
        regions: ['Lisbon', 'Porto', 'Algarve', 'Azores'] 
      },
      greece: { 
        label: 'Greece', 
        regions: ['Athens', 'Islands', 'Northern', 'Peloponnese'] 
      },
      scandinavia: { 
        label: 'Scandinavia', 
        regions: ['Swedish', 'Danish', 'Norwegian', 'Finnish', 'New Nordic'] 
      }
    }
  },
  asian: {
    label: 'Asian',
    countries: {
      china: { 
        label: 'Chinese', 
        regions: ['Cantonese', 'Sichuan', 'Hunan', 'Shanghai', 'Beijing', 'Fujian', 'Yunnan'] 
      },
      japan: { 
        label: 'Japanese', 
        regions: ['Tokyo', 'Osaka', 'Kyoto', 'Hokkaido', 'Izakaya', 'Kaiseki', 'Okinawa'] 
      },
      thailand: { 
        label: 'Thai', 
        regions: ['Bangkok', 'Northern', 'Southern', 'Isaan', 'Central'] 
      },
      vietnam: { 
        label: 'Vietnamese', 
        regions: ['Hanoi', 'Saigon', 'Central', 'Hue'] 
      },
      korea: { 
        label: 'Korean', 
        regions: ['Seoul', 'Traditional', 'Modern Korean', 'Temple Cuisine'] 
      },
      india: { 
        label: 'Indian', 
        regions: ['North Indian', 'South Indian', 'Goan', 'Bengali', 'Punjabi', 'Mughlai', 'Rajasthani'] 
      },
      other: { 
        label: 'Southeast Asian', 
        regions: ['Malaysian', 'Indonesian', 'Filipino', 'Singaporean', 'Burmese'] 
      }
    }
  },
  mexican: {
    label: 'Mexican',
    regions: ['Oaxaca', 'Yucatan', 'Mexico City', 'Baja', 'Veracruz', 'Jalisco', 'Puebla', 'Michoacán'],
    styles: ['Traditional', 'Contemporary', 'Street Food Elevated', 'Alta Cocina']
  },
  middleEastern: {
    label: 'Middle Eastern',
    regions: ['Lebanese', 'Israeli', 'Persian', 'Moroccan', 'Turkish', 'Egyptian', 'Syrian', 'Yemeni']
  },
  caribbean: {
    label: 'Caribbean',
    regions: ['Jamaican', 'Cuban', 'Puerto Rican', 'Trinidadian', 'Haitian', 'Dominican', 'Barbadian']
  },
  mediterranean: {
    label: 'Mediterranean',
    regions: ['Greek Isles', 'Coastal Italian', 'Southern French', 'Spanish Coast', 'Turkish Aegean', 'Moroccan Coast']
  },
  southAmerican: {
    label: 'South American',
    regions: ['Argentine', 'Peruvian', 'Brazilian', 'Chilean', 'Colombian']
  },
  religion: {
    label: 'Religion',
    countries: {
      catholic: { label: 'Catholic', regions: ['Lent'] },
      jewish: { label: 'Jewish', regions: ['Kosher'] },
      muslim: { label: 'Muslim', regions: ['Ramadan'] }
    }
  }
};

const MENU_INSPIRATIONS = [
  { id: 'chefs-tasting', icon: '👨‍🍳', title: "Chef's Tasting", desc: 'Elegant multi-course experience' },
  { id: 'adventurous', icon: '🌍', title: 'Adventurous', desc: 'Bold global flavors & unusual ingredients' },
  { id: 'garden', icon: '🥗', title: 'Garden to Table', desc: 'Fresh, seasonal, farm-fresh focus' },
  { id: 'comfort', icon: '🏠', title: 'What Mom Made', desc: 'Nostalgic comfort classics, elevated' },
  { id: 'sale', icon: '💰', title: "What's On Sale", desc: 'Build menu around sale finds' },
  { id: 'seasonal', icon: '🌱', title: "What's In Season", desc: 'Farm-to-table peak freshness' },
  { id: 'restaurant', icon: '🍽️', title: 'From Restaurants', desc: 'Recreate dishes from favorite spots' },
  { id: 'michelin', icon: '⭐', title: 'Michelin Inspired', desc: 'Fine dining techniques at home' },
  { id: 'holiday', icon: '🎄', title: 'Holiday Traditional', desc: 'Festive celebration menus' },
  { id: 'dietary', icon: '🥬', title: 'Dietary Focus', desc: 'Keto, vegan, gluten-free centered' },
  { id: 'street', icon: '🌮', title: 'World Street Food', desc: 'Global street food elevated' },
  { id: 'custom', icon: '✏️', title: 'I Already Know', desc: 'Enter your own menu' }
];

const MENU_STYLES = [
  { id: 'classic', name: 'Classic Formal', desc: 'Timeless elegance, traditional presentation' },
  { id: 'modern', name: 'Modern Minimalist', desc: 'Clean lines, contemporary plating' },
  { id: 'romantic', name: 'Romantic Elegance', desc: 'Soft candlelit, intimate atmosphere' },
  { id: 'artdeco', name: 'Art Deco', desc: 'Gatsby-era glamour and gold accents' },
  { id: 'rustic', name: 'Rustic Elegant', desc: 'Natural warmth, refined farmhouse' },
  { id: 'botanical', name: 'Vintage Botanical', desc: 'Garden-inspired, floral touches' },
  { id: 'coastal', name: 'Coastal Elegance', desc: 'Nautical sophistication, seaside feel' },
  { id: 'urban', name: 'Urban Chic', desc: 'City sophistication, industrial touches' }
];

const STAFFING = [
  { 
    id: 'solo', 
    name: 'Solo Cook', 
    icon: '👨‍🍳', 
    desc: 'All tasks on you — maximum make-ahead required',
    activeMin: 185,
    roles: ['cook']
  },
  { 
    id: 'helper1', 
    name: '+1 Helper', 
    icon: '👥', 
    desc: 'You handle technique, helper preps & serves',
    activeMin: 95,
    roles: ['cook', 'helper']
  },
  { 
    id: 'helper2', 
    name: '+2 Helpers', 
    icon: '👥👤', 
    desc: 'Parallel workflows, coordinated plating',
    activeMin: 65,
    roles: ['cook', 'helper1', 'helper2']
  },
  { 
    id: 'chef', 
    name: 'Hired Chef', 
    icon: '👨‍🍳⭐', 
    desc: 'You host and enjoy — stay out of kitchen!',
    activeMin: 15,
    roles: ['host', 'chef', 'staff']
  }
];

const AVERY_PRODUCTS = {
  placeCards: [
    { sku: '5302', name: 'Small Tent Cards', size: '2" x 3.5"', perSheet: 4, desc: 'Print-to-edge, pre-scored, 160/pack' },
    { sku: '5309', name: 'Large Tent Cards', size: '3.5" x 11"', perSheet: 1, desc: 'Embossed border, 50/pack' },
    { sku: '3328', name: 'Gold Border Tent Cards', size: '2" x 3.5"', perSheet: 4, desc: 'Metallic gold border, 80/pack' },
    { sku: '35701', name: 'Gold Border Place Cards', size: '1-7/16" x 3-3/4"', perSheet: 6, desc: 'Elegant flat cards' }
  ],
  menuCards: [
    { sku: '8315', name: 'Note Cards', size: '4.25" x 5.5"', perSheet: 2, desc: 'Quarter-fold greeting cards' },
    { sku: '3265', name: 'Half-Fold Cards', size: '5.5" x 8.5"', perSheet: 1, desc: 'Folded greeting card' },
    { sku: '3263', name: 'Postcards', size: '4.25" x 5.5"', perSheet: 4, desc: 'Heavy cardstock' }
  ],
  invitations: [
    { sku: '8315', name: 'Note Cards', size: '4.25" x 5.5"', perSheet: 2, desc: 'With envelopes' },
    { sku: '3379', name: 'Photo Postcards', size: '4" x 6"', perSheet: 2, desc: 'Photo quality' },
    { sku: '8317', name: 'Quarter-Fold Cards', size: '4.25" x 5.5"', perSheet: 1, desc: 'With envelopes' }
  ],
  tableNumbers: [
    { sku: '5305', name: 'Embossed Tent Cards', size: '2.5" x 8.5"', perSheet: 2, desc: 'Pre-scored' }
  ]
};

const PERSONAS = {
  planner: {
    name: 'The Planner',
    icon: '🗂️',
    credentials: 'Concierge host coach, event flow + decision support',
    philosophy: '"Make it easy to choose well."',
    systemPrompt: `You are an elite dinner party planning concierge.

Rules:
- Be concise: 1–2 short sentences max unless the user asks for detail.
- Never be condescending, effusive, or overly congratulatory.
- Ask one focused question at a time.
- Offer one clear recommendation + one next step.
- Respect constraints (dietary, avoids, budget, skill, timing).`
  },
  chef: {
    name: 'The Chef',
    icon: '👨‍🍳',
    credentials: 'James Beard Award winner, 20 years fine dining',
    philosophy: '"The ingredient should be the star."',
    systemPrompt: `You are a high-end chef helping design a dinner party menu.

Rules:
- Be concise: 1–2 short sentences max unless asked for detail.
- Start with: “How can I help?” then ask one focused question.
- No condescension, no lecture tone, no long monologues.
- Give practical options and a clear recommendation when appropriate.`
  },
  sommelier: {
    name: 'The Sommelier',
    icon: '🍷',
    credentials: 'Master Sommelier (one of 273 worldwide)',
    philosophy: '"Wine should match the moment, not just the food."',
    systemPrompt: `You are a Master Sommelier helping with pairings and service.

Rules:
- Be concise: 1–2 short sentences max unless asked for detail.
- No pretension, no condescension, no long stories by default.
- Ask one focused question, or give a direct recommendation with a short “why”.
- If a bottle is already named in context, treat it as authoritative (don’t ask “red or white?”).`
  },
  instructor: {
    name: 'The Instructor',
    icon: '📚',
    credentials: 'CIA Hyde Park, teaches professional technique to home cooks',
    philosophy: '"If you\'re calm, your guests are calm."',
    systemPrompt: `You are a Culinary Institute of America instructor from Hyde Park who specializes in teaching professional techniques to home cooks. You're precise, organized, and practical — but also encouraging.

Your philosophy: "If you're calm, your guests are calm." You believe proper preparation eliminates stress, and stress is the enemy of good hosting.

Your expertise:
- Timing and scheduling (working backwards from service time)
- Mise en place organization
- Make-ahead strategies (what holds, what doesn't)
- Plating and presentation techniques
- Kitchen workflow optimization
- Equipment and tool selection
- Temperature management
- Recovery from mistakes

Be encouraging but precise. Help them understand not just WHAT to do but WHY — the reasoning behind professional techniques. Ask about their kitchen setup, equipment, experience level, and comfort zones.

When planning timelines, account for:
- Recipe testing before the event
- Shopping (multiple trips may be needed)
- Equipment prep (do they need to borrow/rent anything?)
- Day-before prep
- Day-of timing with specific timestamps
- Buffer time for the unexpected`
  },
  all: {
    name: 'The Team',
    icon: '👨‍🍳🍷📚',
    credentials: 'Chef, Sommelier, and Instructor working together',
    philosophy: 'Collaborative expertise for the perfect dinner party.',
    systemPrompt: `You are a collaborative team of three experts helping plan a dinner party:

**Chef** (James Beard Award winner): Menu design, recipes, flavor combinations, seasonal ingredients. Passionate and opinionated. Philosophy: "The ingredient should be the star."

**Sommelier** (Master Sommelier): Wine pairings, beverages, serving temperatures. Knowledgeable but approachable. Philosophy: "Wine should match the moment, not just the food."

**Instructor** (CIA Hyde Park): Timing, prep schedules, plating, execution. Precise and organized. Philosophy: "If you're calm, your guests are calm."

When responding, have the relevant expert(s) chime in naturally. Use their titles (Chef:, Sommelier:, Instructor:) when switching voices. Keep it conversational — they respect each other and build on each other's ideas.

The three of you genuinely enjoy working together and helping home cooks create memorable experiences.`
  },
  photographer: {
    name: 'The Photographer',
    icon: '📸',
    credentials: 'Commercial food photographer, Gourmet & Food & Wine covers',
    philosophy: '"Every dish deserves its portrait — in YOUR space."',
    systemPrompt: `You are a commercial food photographer who has shot covers for Gourmet and Food & Wine magazines. You understand lighting angles, prop styling, and the specific language that produces stunning AI-generated food imagery.

IMPORTANT: Your default approach is to create image prompts that reflect the USER'S ACTUAL DINING SPACE. If they've shared photos of their dining room, table, or existing tableware, you incorporate those specific details (table shape, wood tone, wall color, lighting fixtures, their china pattern, etc.) into every prompt.

At the start of a consultation, ask: "Would you like me to create prompts based on YOUR dining room and what you have, or shall I propose an ideal setting?" If they choose "use what I have," ask them to describe or share photos of their space.

Your expertise:
- Camera angles (overhead, 45-degree, hero shot, detail close-up)
- Lighting quality (soft natural, dramatic side light, warm candlelight)
- Background treatment (negative space, contextual, lifestyle)
- Prop styling (linens, surfaces, hands, action shots)
- Matching prompts to the user's actual environment

When creating image prompts, you specify:
- Camera and lens (Hasselblad, Sony α7, Canon EOS R5, 50mm, 85mm)
- Aperture for depth of field (f/1.8 for shallow, f/8 for sharp)
- Lighting style and direction
- Composition and framing
- Style references (editorial, lifestyle, fine art)
- SPECIFIC details from the user's space when provided

Your prompts are detailed enough to produce magazine-quality AI images that look like they were shot in the host's actual home.`
  },
  tablescaper: {
    name: 'The Tablescaper',
    icon: '🌸',
    credentials: 'Event designer featured in Architectural Digest',
    philosophy: '"The table is your stage before the food arrives."',
    systemPrompt: `You are an event designer whose work appears in Architectural Digest. You understand that the table setting creates the first impression and sets the emotional tone for the entire evening.

Your expertise:
- Scale and proportion (centerpiece height, spacing, sight lines)
- Candle placement (flattering light without obstructing conversation)
- Napkin folds that suit the formality level
- Linens, chargers, and layering
- Floral arrangements (seasonal, scented vs unscented near food)
- Place card positioning and style
- Glassware arrangement for multi-wine service

You consider:
- The room and natural light at service time
- Conversation flow between guests (nothing blocking eye contact)
- Traffic patterns for service
- The arc of the evening (how the table transforms from cocktails to dessert)

Your recommendations elevate a table from "set" to "staged" — creating an environment that makes guests feel celebrated.`
  },
  plating: {
    name: 'The Plating Artist',
    icon: '🎨',
    credentials: 'Kaiseki-trained, consults for Michelin-starred restaurants',
    philosophy: '"Every plate is a composition."',
    systemPrompt: `You are a culinary artist trained in kaiseki and modern French technique who now consults for high-end restaurants on their plating programs. You understand that presentation is the first taste.

Your principles:
- Negative space matters — don't overcrowd the plate
- Height creates drama and visual interest
- Sauce placement guides the eye (dots, swooshes, pools)
- Odd numbers are more pleasing (3 or 5 elements)
- Garnish must be edible and purposeful, never just decoration
- Color contrast makes food pop
- Temperature of the plate matters (warm for hot, chilled for cold)

For each dish, you consider:
- The right plate (size, color, shape, rim vs rimless)
- Focal point and composition
- How the diner will approach the first bite
- Practical plating under time pressure (what can be pre-set)

You teach the principles so hosts can adapt, not just follow steps. You help home cooks understand WHY professional plates look the way they do.`
  }
};

const DEMO_MENUS = [
  {
    id: 1,
    title: "Spring Garden Elegance",
    personality: "Light, seasonal, farm-to-table sophistication with delicate flavors",
    foodCost: "$45-55/person",
    wineCost: "$120 total",
    courses: [
      { type: "Amuse-Bouche", name: "Chive Blossoms with Lemon Crème Fraîche on Potato Crisp", wine: null },
      { type: "First Course", name: "Chilled English Pea Soup with Mint Oil and Crème Fraîche", wine: "Sancerre, Domaine Vacheron 2023" },
      { type: "Second Course", name: "Butter Lettuce Salad with Shaved Radish, Herbs & Champagne Vinaigrette", wine: null },
      { type: "Main Course", name: "Herb-Crusted Rack of Lamb with Spring Vegetables and Mint Gremolata", wine: "Châteauneuf-du-Pape, Château de Beaucastel 2020" },
      { type: "Dessert", name: "Meyer Lemon Posset with Lavender Shortbread", wine: "Moscato d'Asti, Vietti 2023" }
    ]
  },
  {
    id: 2,
    title: "Tuscan Summer Evening",
    personality: "Rustic Italian warmth with refined execution and bold flavors",
    foodCost: "$50-60/person",
    wineCost: "$140 total",
    courses: [
      { type: "Amuse-Bouche", name: "Burrata with San Marzano Tomato Confit & Basil Oil", wine: null },
      { type: "First Course", name: "Wild Mushroom Risotto with Shaved Black Truffle", wine: "Vernaccia di San Gimignano, Panizzi 2022" },
      { type: "Second Course", name: "Arugula & Shaved Parmigiano with 25-Year Balsamic", wine: null },
      { type: "Main Course", name: "Bistecca alla Fiorentina with Roasted Fingerlings and Salsa Verde", wine: "Brunello di Montalcino, Biondi-Santi 2018" },
      { type: "Dessert", name: "Panna Cotta with Macerated Berries and Aged Balsamic", wine: "Vin Santo, Avignonesi 2015" }
    ]
  },
  {
    id: 3,
    title: "French Bistro Classic",
    personality: "Timeless Parisian elegance with perfectly executed comfort",
    foodCost: "$55-65/person",
    wineCost: "$150 total",
    courses: [
      { type: "Amuse-Bouche", name: "Gougères (Warm Gruyère Cheese Puffs)", wine: null },
      { type: "First Course", name: "French Onion Soup Gratinée with Gruyère Crouton", wine: "Côtes du Rhône Blanc, E. Guigal 2022" },
      { type: "Second Course", name: "Salade Lyonnaise with Frisée, Lardons & Poached Egg", wine: null },
      { type: "Main Course", name: "Coq au Vin with Pearl Onions, Mushrooms & Pommes Purée", wine: "Burgundy, Louis Jadot Gevrey-Chambertin 2020" },
      { type: "Dessert", name: "Tarte Tatin with Calvados Crème Fraîche", wine: "Sauternes, Château Suduiraut 2019" }
    ]
  },
  {
    id: 4,
    title: "New England Coastal",
    personality: "Fresh Atlantic seafood with understated elegance and clean flavors",
    foodCost: "$60-75/person",
    wineCost: "$150 total",
    courses: [
      { type: "Amuse-Bouche", name: "Oysters on the Half Shell with Champagne Mignonette", wine: null },
      { type: "First Course", name: "Maine Lobster Bisque with Cognac Cream and Chive Oil", wine: "Chablis Premier Cru, William Fèvre 2021" },
      { type: "Second Course", name: "Baby Spinach with Warm Bacon Vinaigrette and Shaved Apple", wine: null },
      { type: "Main Course", name: "Pan-Seared Chilean Sea Bass with Herb Beurre Blanc and Haricots Verts", wine: "Meursault, Domaine Roulot 2021" },
      { type: "Dessert", name: "Maine Blueberry Buckle with Vanilla Bean Ice Cream", wine: "Late Harvest Riesling, Dr. Loosen 2020" }
    ]
  },
  {
    id: 5,
    title: "Modern Steakhouse",
    personality: "Bold flavors, prime cuts, and classic sides perfected",
    foodCost: "$70-85/person",
    wineCost: "$180 total",
    courses: [
      { type: "Amuse-Bouche", name: "Beef Tartare on Black Pepper Crostini with Quail Egg", wine: null },
      { type: "First Course", name: "Classic Wedge Salad with Point Reyes Blue Cheese & Applewood Bacon", wine: "Grüner Veltliner, Hirsch 2022" },
      { type: "Second Course", name: "Jumbo Shrimp Cocktail with House Cocktail Sauce", wine: null },
      { type: "Main Course", name: "45-Day Dry-Aged Ribeye with Truffle Butter and Roasted Bone Marrow", wine: "Napa Cabernet, Caymus Special Selection 2019" },
      { type: "Dessert", name: "New York Cheesecake with Seasonal Berry Compote", wine: "Tawny Port, Graham's 20 Year" }
    ]
  }
];

// Cookbook sections for DOCX generation
const COOKBOOK_SECTIONS = [
  'Cover Page',
  'Menu Overview',
  'Wine Program',
  'Complete Recipes (5)',
  'Shopping List by Category',
  'Day-Before Prep Schedule',
  'Day-Of Timeline',
  'Plating Guides',
  'Table Setting Guide',
  'Service Notes',
  'Ambiance & Music',
  'Final Checklist',
  'AI Image Prompts',
  'Notes Pages',
  'Copyright'
];

const COPYRIGHT_TEXT = 'This cookbook was created using AI-assisted recipe development. Recipes are original adaptations inspired by classic techniques. Generated for personal use.';

module.exports = {
  CUISINES,
  MENU_INSPIRATIONS,
  MENU_STYLES,
  STAFFING,
  AVERY_PRODUCTS,
  PERSONAS,
  DEMO_MENUS,
  COOKBOOK_SECTIONS,
  COPYRIGHT_TEXT
};

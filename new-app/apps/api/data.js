// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// Complete Data Structures
// ============================================================

const CUISINES = {
  american: {
    label: 'American',
    regions: [
      'New England',
      'Mid-Atlantic',
      'Lowcountry',
      'Deep South',
      'Gulf Coast',
      'Texas Hill Country',
      'Appalachian',
      'Great Lakes',
      'Plains',
      'Upper Midwest',
      'Pacific Northwest',
      'California',
      'Southwest',
      'Mountain West',
      'Alaska',
      'Hawaii'
    ],
    styles: ['BBQ', 'Soul Food', 'Tex-Mex', 'Cajun/Creole', 'Farm-to-Table', 'New American', 'Coastal', 'Diner Classics']
  },
  european: {
    label: 'European',
    countries: {
      france: { 
        label: 'France', 
        regions: ['Provence', 'Bordeaux', 'Burgundy', 'Loire Valley', 'Alsace', 'Champagne', 'Rhone', 'Normandy', 'Brittany', 'Paris Bistro'] 
      },
      italy: { 
        label: 'Italy', 
        regions: ['Tuscany', 'Sicily', 'Piedmont', 'Emilia-Romagna', 'Campania', 'Veneto', 'Lazio (Rome)', 'Lombardy', 'Puglia', 'Sardinia'] 
      },
      spain: { 
        label: 'Spain', 
        regions: ['Basque', 'Catalonia', 'Andalusia', 'Galicia', 'Madrid', 'Valencia', 'Rioja'] 
      },
      germany: { 
        label: 'Germany', 
        regions: ['Bavaria', 'Rhineland', 'Berlin', 'Black Forest', 'Mosel', 'Rheingau', 'Baden', 'Pfalz'] 
      },
      uk: { 
        label: 'United Kingdom', 
        regions: ['Traditional', 'Modern British', 'Scottish', 'Welsh', 'Cornish', 'Yorkshire', 'London'] 
      },
      portugal: { 
        label: 'Portugal', 
        regions: ['Lisbon', 'Porto', 'Algarve', 'Azores', 'Douro', 'Alentejo', 'Madeira'] 
      },
      greece: { 
        label: 'Greece', 
        regions: ['Athens', 'Islands', 'Northern', 'Peloponnese', 'Crete', 'Cyclades', 'Macedonia'] 
      },
      scandinavia: { 
        label: 'Scandinavia', 
        regions: ['Swedish', 'Danish', 'Norwegian', 'Finnish', 'Icelandic', 'New Nordic'] 
      },
      ireland: {
        label: 'Ireland',
        regions: ['Dublin', 'Cork', 'Galway', 'Connemara']
      },
      belgium: {
        label: 'Belgium',
        regions: ['Flanders', 'Wallonia', 'Brussels']
      },
      netherlands: {
        label: 'Netherlands',
        regions: ['Amsterdam', 'North Holland', 'South Holland', 'Zeeland']
      },
      austria: {
        label: 'Austria',
        regions: ['Vienna', 'Styria', 'Tyrol', 'Salzburg']
      },
      switzerland: {
        label: 'Switzerland',
        regions: ['Valais', 'Ticino', 'Zurich', 'Geneva']
      },
      poland: {
        label: 'Poland',
        regions: ['Krakow', 'Warsaw', 'Gdansk']
      },
      hungary: {
        label: 'Hungary',
        regions: ['Budapest', 'Tokaj', 'Eger']
      },
      czechia: {
        label: 'Czechia',
        regions: ['Prague', 'Bohemia', 'Moravia']
      },
      croatia: {
        label: 'Croatia',
        regions: ['Dalmatia', 'Istria', 'Zagreb']
      },
      romania: {
        label: 'Romania',
        regions: ['Transylvania', 'Wallachia', 'Moldavia']
      },
      bulgaria: {
        label: 'Bulgaria',
        regions: ['Sofia', 'Thrace', 'Black Sea Coast']
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
  chef: {
    name: 'The Chef',
    icon: '👨‍🍳',
    credentials: 'James Beard Award winner, 20 years fine dining',
    philosophy: '"The ingredient should be the star."',
    systemPrompt: `You are a James Beard Award-winning chef with 20 years in fine dining, helping plan a dinner party menu. You're passionate, opinionated, and deeply knowledgeable about seasonal ingredients and flavor combinations.

Your philosophy: "The ingredient should be the star." You believe in elegant simplicity over fussy complexity. You get genuinely excited about great ingredients and perfect technique.

Use French portion standards when discussing courses:
- Amuse-Bouche: 2oz total (one or two bites)
- First Course: 2.5oz protein or 4oz soup
- Second Course: 3oz protein or composed salad
- Main Course: 4oz protein + 3oz starch + 2oz vegetables
- Dessert: 3.5oz

Be conversational and warm, like talking to a talented home cook. Share your expertise naturally through stories and examples. Ask clarifying questions to understand their vision. Get visibly excited about great flavor combinations.

When discussing menus, think about:
- Seasonal availability and peak ingredients
- Flavor arc through the meal (building, climax, resolution)
- Textural variety
- Color on the plate
- Make-ahead potential for home cooks`
  },
  sommelier: {
    name: 'The Sommelier',
    icon: '🍷',
    credentials: 'Master Sommelier (one of 273 worldwide)',
    philosophy: '"Wine should match the moment, not just the food."',
    systemPrompt: `You are a Master Sommelier (one of only 273 worldwide) helping plan wine pairings for a dinner party. You're deeply knowledgeable but approachable — never pretentious or intimidating.

Your philosophy: "Wine should match the moment, not just the food." You consider the guests, the occasion, the season, the conversation you want to inspire.

When recommending wines:
- Give specific producers and vintages when possible
- Always offer alternatives at different price points
- Explain WHY pairings work in accessible terms
- Consider the arc of the meal — how wines progress from light to full
- Think about serving temperatures and decanting needs
- Remember that guests may not all be wine experts

Be warm and conversational. Ask about guest preferences, budget constraints, and what kind of experience they want to create. Share stories about wines you love and why.

You understand that wine service is theater — the pop of a cork, the pour, the first sip. Help them create memorable moments.`
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

const buildWineTiers = (worldwideTopRated, domesticTopRated, budgetTopRated, bondPick) => ({
  worldwideTopRated,
  domesticTopRated,
  budgetTopRated,
  bondPick
});

const DEMO_MENUS = [
  {
    id: 1,
    title: "Spring Garden Elegance",
    personality: "Light, seasonal, farm-to-table sophistication with delicate flavors",
    foodCost: "$45-55/person",
    wineCost: "$120 total",
    courses: [
      {
        type: "Amuse-Bouche",
        name: "Chive Blossoms with Lemon Crème Fraîche on Potato Crisp",
        wine: buildWineTiers(
          "Champagne, Ruinart Blanc de Blancs NV",
          "Sparkling Wine, Schramsberg Blanc de Blancs 2021",
          "Cava, Raventos i Blanc 2021",
          "Champagne, Bollinger Special Cuvee NV"
        )
      },
      {
        type: "First Course",
        name: "Chilled English Pea Soup with Mint Oil and Crème Fraîche",
        wine: buildWineTiers(
          "Sancerre, Domaine Vacheron 2023",
          "Finger Lakes Riesling, Dr. Frank 2022",
          "Loire Sauvignon Blanc, Domaine des Baumard 2022",
          "Champagne, Krug Grande Cuvee NV"
        )
      },
      {
        type: "Second Course",
        name: "Butter Lettuce Salad with Shaved Radish, Herbs & Champagne Vinaigrette",
        wine: buildWineTiers(
          "Chablis, William Fevre 2021",
          "Sonoma Chardonnay, Ramey 2021",
          "Muscadet Sevre et Maine, Domaine de la Pepiere 2022",
          "Champagne, Pol Roger Brut Reserve NV"
        )
      },
      {
        type: "Main Course",
        name: "Herb-Crusted Rack of Lamb with Spring Vegetables and Mint Gremolata",
        wine: buildWineTiers(
          "Chateauneuf-du-Pape, Chateau de Beaucastel 2020",
          "Napa Cabernet, Stag's Leap SLV 2019",
          "Cotes du Rhone, Guigal 2022",
          "Bordeaux, Chateau Margaux 2015"
        )
      },
      {
        type: "Dessert",
        name: "Meyer Lemon Posset with Lavender Shortbread",
        wine: buildWineTiers(
          "Moscato d'Asti, Vietti 2023",
          "Late Harvest Riesling, Navarro 2022",
          "Moscato d'Asti, Saracco 2023",
          "Sauternes, Chateau d'Yquem 2016"
        )
      }
    ]
  },
  {
    id: 2,
    title: "Tuscan Summer Evening",
    personality: "Rustic Italian warmth with refined execution and bold flavors",
    foodCost: "$50-60/person",
    wineCost: "$140 total",
    courses: [
      {
        type: "Amuse-Bouche",
        name: "Burrata with San Marzano Tomato Confit & Basil Oil",
        wine: buildWineTiers(
          "Prosecco, Bisol Crede 2022",
          "California Sparkling, Domaine Carneros 2021",
          "Prosecco, La Marca 2022",
          "Franciacorta, Ca del Bosco 2018"
        )
      },
      {
        type: "First Course",
        name: "Wild Mushroom Risotto with Shaved Black Truffle",
        wine: buildWineTiers(
          "Vernaccia di San Gimignano, Panizzi 2022",
          "Oregon Pinot Gris, King Estate 2022",
          "Soave Classico, Pieropan 2022",
          "Barolo, Gaja 2017"
        )
      },
      {
        type: "Second Course",
        name: "Arugula & Shaved Parmigiano with 25-Year Balsamic",
        wine: buildWineTiers(
          "Vermentino di Sardegna, Argiolas 2022",
          "Santa Barbara Sauvignon Blanc, Dragonette 2022",
          "Pinot Grigio, Alois Lageder 2022",
          "Champagne, Bollinger Special Cuvee NV"
        )
      },
      {
        type: "Main Course",
        name: "Bistecca alla Fiorentina with Roasted Fingerlings and Salsa Verde",
        wine: buildWineTiers(
          "Brunello di Montalcino, Biondi-Santi 2018",
          "Napa Cabernet, Opus One 2018",
          "Chianti Classico, Castello di Ama 2021",
          "Super Tuscan, Sassicaia 2016"
        )
      },
      {
        type: "Dessert",
        name: "Panna Cotta with Macerated Berries and Aged Balsamic",
        wine: buildWineTiers(
          "Vin Santo, Avignonesi 2015",
          "Late Harvest Zinfandel, Ridge 2021",
          "Moscato d'Asti, Vietti 2023",
          "Madeira, Blandy's 20 Year"
        )
      }
    ]
  },
  {
    id: 3,
    title: "French Bistro Classic",
    personality: "Timeless Parisian elegance with perfectly executed comfort",
    foodCost: "$55-65/person",
    wineCost: "$150 total",
    courses: [
      {
        type: "Amuse-Bouche",
        name: "Gougères (Warm Gruyère Cheese Puffs)",
        wine: buildWineTiers(
          "Champagne, Taittinger Brut Reserve NV",
          "California Sparkling, Roederer Estate 2021",
          "Cremant de Loire, Bouvet 2022",
          "Champagne, Bollinger Special Cuvee NV"
        )
      },
      {
        type: "First Course",
        name: "French Onion Soup Gratinée with Gruyère Crouton",
        wine: buildWineTiers(
          "Cotes du Rhone Blanc, E. Guigal 2022",
          "California Chardonnay, Kistler 2021",
          "Bourgogne Blanc, Louis Jadot 2021",
          "Bordeaux Blanc, Chateau Smith Haut Lafitte 2020"
        )
      },
      {
        type: "Second Course",
        name: "Salade Lyonnaise with Frisée, Lardons & Poached Egg",
        wine: buildWineTiers(
          "Beaujolais, Marcel Lapierre 2022",
          "Willamette Pinot Noir, Cristom 2021",
          "Beaujolais-Villages, Jean Foillard 2022",
          "Burgundy, Domaine de la Romanee-Conti 2016"
        )
      },
      {
        type: "Main Course",
        name: "Coq au Vin with Pearl Onions, Mushrooms & Pommes Purée",
        wine: buildWineTiers(
          "Burgundy, Louis Jadot Gevrey-Chambertin 2020",
          "Oregon Pinot Noir, Domaine Serene 2019",
          "Cotes du Rhone, Guigal 2022",
          "Bordeaux, Chateau Lafite Rothschild 2015"
        )
      },
      {
        type: "Dessert",
        name: "Tarte Tatin with Calvados Crème Fraîche",
        wine: buildWineTiers(
          "Sauternes, Chateau Suduiraut 2019",
          "Late Harvest Riesling, Hermann J. Wiemer 2021",
          "Coteaux du Layon, Chateau de Fesles 2020",
          "Sauternes, Chateau d'Yquem 2016"
        )
      }
    ]
  },
  {
    id: 4,
    title: "New England Coastal",
    personality: "Fresh Atlantic seafood with understated elegance and clean flavors",
    foodCost: "$60-75/person",
    wineCost: "$150 total",
    courses: [
      {
        type: "Amuse-Bouche",
        name: "Oysters on the Half Shell with Champagne Mignonette",
        wine: buildWineTiers(
          "Champagne, Ruinart Blanc de Blancs NV",
          "Sparkling Wine, Schramsberg Blanc de Blancs 2021",
          "Muscadet Sevre et Maine, Domaine de la Pepiere 2022",
          "Champagne, Bollinger Special Cuvee NV"
        )
      },
      {
        type: "First Course",
        name: "Maine Lobster Bisque with Cognac Cream and Chive Oil",
        wine: buildWineTiers(
          "Chablis Premier Cru, William Fevre 2021",
          "Sonoma Chardonnay, Ramey 2021",
          "Bourgogne Blanc, Louis Jadot 2021",
          "White Bordeaux, Chateau Pape Clement 2019"
        )
      },
      {
        type: "Second Course",
        name: "Baby Spinach with Warm Bacon Vinaigrette and Shaved Apple",
        wine: buildWineTiers(
          "Sancerre, Domaine Vacheron 2023",
          "Santa Barbara Sauvignon Blanc, Dragonette 2022",
          "Loire Sauvignon Blanc, Domaine des Baumard 2022",
          "Champagne, Pol Roger Brut Reserve NV"
        )
      },
      {
        type: "Main Course",
        name: "Pan-Seared Chilean Sea Bass with Herb Beurre Blanc and Haricots Verts",
        wine: buildWineTiers(
          "Meursault, Domaine Roulot 2021",
          "Napa Chardonnay, Chateau Montelena 2021",
          "Pouilly-Fuisse, Louis Jadot 2022",
          "Burgundy, Domaine Leflaive 2019"
        )
      },
      {
        type: "Dessert",
        name: "Maine Blueberry Buckle with Vanilla Bean Ice Cream",
        wine: buildWineTiers(
          "Late Harvest Riesling, Dr. Loosen 2020",
          "Finger Lakes Ice Wine, Dr. Frank 2021",
          "Moscato d'Asti, Saracco 2023",
          "Tokaji Aszu 6 Puttonyos, Royal Tokaji 2016"
        )
      }
    ]
  },
  {
    id: 5,
    title: "Modern Steakhouse",
    personality: "Bold flavors, prime cuts, and classic sides perfected",
    foodCost: "$70-85/person",
    wineCost: "$180 total",
    courses: [
      {
        type: "Amuse-Bouche",
        name: "Beef Tartare on Black Pepper Crostini with Quail Egg",
        wine: buildWineTiers(
          "Champagne, Bollinger Special Cuvee NV",
          "Sparkling Wine, Schramsberg Blanc de Noirs 2021",
          "Cremant de Bourgogne, Louis Bouillot 2022",
          "Champagne, Dom Perignon 2013"
        )
      },
      {
        type: "First Course",
        name: "Classic Wedge Salad with Point Reyes Blue Cheese & Applewood Bacon",
        wine: buildWineTiers(
          "Gruner Veltliner, Hirsch 2022",
          "Santa Barbara Chardonnay, Au Bon Climat 2021",
          "Austrian Gruner Veltliner, Schloss Gobelsburg 2022",
          "Champagne, Krug Grande Cuvee NV"
        )
      },
      {
        type: "Second Course",
        name: "Jumbo Shrimp Cocktail with House Cocktail Sauce",
        wine: buildWineTiers(
          "Chablis, William Fevre 2021",
          "Sonoma Chardonnay, Kistler 2021",
          "Muscadet Sevre et Maine, Domaine de la Pepiere 2022",
          "Champagne, Bollinger Special Cuvee NV"
        )
      },
      {
        type: "Main Course",
        name: "45-Day Dry-Aged Ribeye with Truffle Butter and Roasted Bone Marrow",
        wine: buildWineTiers(
          "Napa Cabernet, Caymus Special Selection 2019",
          "Napa Cabernet, Opus One 2018",
          "Ribera del Duero, Emilio Moro 2021",
          "Bordeaux, Chateau Latour 2015"
        )
      },
      {
        type: "Dessert",
        name: "New York Cheesecake with Seasonal Berry Compote",
        wine: buildWineTiers(
          "Tawny Port, Grahams 20 Year",
          "Late Harvest Zinfandel, Ridge 2021",
          "Ruby Port, Fonseca NV",
          "Port, Taylor Fladgate 30 Year"
        )
      }
    ]
  }
];

const DEMO_MENU_RECIPES = {
  1: [
    {
      title: "Chive Blossoms with Lemon Creme Fraiche on Potato Crisp",
      serves: 6,
      activeTime: "20 min",
      totalTime: "45 min",
      ingredients: [
        "Baby potatoes or Yukon golds, thinly sliced",
        "Olive oil",
        "Creme fraiche",
        "Lemon zest and juice",
        "Chives or chive blossoms",
        "Kosher salt and black pepper"
      ],
      steps: [
        "Bake or fry potato slices until crisp and golden; season with salt.",
        "Stir creme fraiche with lemon zest, a squeeze of juice, and pepper.",
        "Spoon a small dollop onto each crisp and top with chives.",
        "Serve immediately for maximum crunch."
      ],
      notes: "Keep crisps dry and assemble right before serving.",
      makeAhead: "Potato crisps can be made 6 hours ahead and stored airtight."
    },
    {
      title: "Chilled English Pea Soup with Mint Oil and Creme Fraiche",
      serves: 6,
      activeTime: "25 min",
      totalTime: "1 hour",
      ingredients: [
        "English peas (fresh or frozen)",
        "Yellow onion or shallot, diced",
        "Vegetable stock",
        "Fresh mint leaves",
        "Creme fraiche",
        "Lemon juice",
        "Olive oil, salt, and pepper"
      ],
      steps: [
        "Saute onion in olive oil until soft; add peas and stock.",
        "Simmer until peas are tender, then blend with mint and lemon.",
        "Chill thoroughly and adjust seasoning.",
        "Finish with a swirl of creme fraiche and mint oil."
      ],
      notes: "A high-speed blend yields the smoothest texture.",
      makeAhead: "Soup can be made 1 day ahead; garnish just before serving."
    },
    {
      title: "Butter Lettuce Salad with Shaved Radish and Champagne Vinaigrette",
      serves: 6,
      activeTime: "15 min",
      totalTime: "20 min",
      ingredients: [
        "Butter lettuce leaves",
        "Radishes, thinly shaved",
        "Fresh herbs (chervil, parsley, or dill)",
        "Champagne vinegar",
        "Dijon mustard",
        "Extra virgin olive oil",
        "Kosher salt and black pepper"
      ],
      steps: [
        "Whisk vinegar, mustard, salt, and pepper; stream in olive oil.",
        "Toss lettuce and herbs lightly with vinaigrette.",
        "Add radishes and finish with fresh cracked pepper.",
        "Serve chilled."
      ],
      notes: "Dress lightly to keep the lettuce crisp.",
      makeAhead: "Vinaigrette can be made 2 days ahead."
    },
    {
      title: "Herb-Crusted Rack of Lamb with Spring Vegetables and Mint Gremolata",
      serves: 6,
      activeTime: "45 min",
      totalTime: "1.5 hours",
      ingredients: [
        "Rack of lamb",
        "Panko or fresh breadcrumbs",
        "Parsley and mint, chopped",
        "Garlic and lemon zest",
        "Asparagus and snap peas",
        "Olive oil, salt, and pepper"
      ],
      steps: [
        "Season lamb, sear well, then coat with herb crumbs.",
        "Roast to medium-rare and rest before slicing.",
        "Blanch vegetables and finish with olive oil and salt.",
        "Top lamb with mint gremolata and serve with vegetables."
      ],
      notes: "Use an instant-read thermometer for precise doneness.",
      makeAhead: "Herb crust and gremolata can be prepped earlier."
    },
    {
      title: "Meyer Lemon Posset with Lavender Shortbread",
      serves: 6,
      activeTime: "20 min",
      totalTime: "3 hours",
      ingredients: [
        "Heavy cream",
        "Sugar",
        "Meyer lemon zest and juice",
        "Pinch of salt",
        "Shortbread cookies with lavender"
      ],
      steps: [
        "Warm cream and sugar until dissolved, then remove from heat.",
        "Stir in lemon zest, juice, and salt to thicken.",
        "Pour into cups and chill until set.",
        "Serve with lavender shortbread."
      ],
      notes: "Strain for the smoothest texture.",
      makeAhead: "Posset sets well overnight."
    }
  ],
  2: [
    {
      title: "Burrata with San Marzano Tomato Confit and Basil Oil",
      serves: 6,
      activeTime: "20 min",
      totalTime: "1 hour",
      ingredients: [
        "Burrata",
        "San Marzano tomatoes",
        "Garlic cloves",
        "Extra virgin olive oil",
        "Fresh basil",
        "Sea salt and black pepper"
      ],
      steps: [
        "Slow-roast tomatoes with garlic, olive oil, salt, and pepper.",
        "Blend basil with olive oil and strain for a bright oil.",
        "Plate burrata with warm tomato confit.",
        "Finish with basil oil and flaky salt."
      ],
      notes: "Serve with toasted bread if desired.",
      makeAhead: "Tomato confit and basil oil can be made 2 days ahead."
    },
    {
      title: "Wild Mushroom Risotto with Shaved Black Truffle",
      serves: 6,
      activeTime: "35 min",
      totalTime: "50 min",
      ingredients: [
        "Arborio rice",
        "Mixed wild mushrooms",
        "Shallot and garlic",
        "Dry white wine",
        "Warm chicken or vegetable stock",
        "Parmigiano-Reggiano and butter",
        "Black truffle or truffle oil"
      ],
      steps: [
        "Saute mushrooms until golden and set aside.",
        "Sweat shallot and toast rice; deglaze with wine.",
        "Add stock gradually, stirring until creamy.",
        "Finish with butter, parmesan, mushrooms, and truffle."
      ],
      notes: "Keep stock hot to maintain consistent texture.",
      makeAhead: "Par-cook risotto 10 minutes, then finish before serving."
    },
    {
      title: "Arugula and Shaved Parmigiano with Aged Balsamic",
      serves: 6,
      activeTime: "10 min",
      totalTime: "10 min",
      ingredients: [
        "Baby arugula",
        "Parmigiano-Reggiano, shaved",
        "Aged balsamic vinegar",
        "Extra virgin olive oil",
        "Lemon juice",
        "Sea salt and black pepper"
      ],
      steps: [
        "Toss arugula with olive oil, lemon juice, salt, and pepper.",
        "Plate and top with generous parmesan shavings.",
        "Drizzle with aged balsamic to finish.",
        "Serve immediately."
      ],
      notes: "Use a light hand with balsamic to avoid overpowering.",
      makeAhead: "Shave cheese and prep greens ahead; dress at service."
    },
    {
      title: "Bistecca alla Fiorentina with Roasted Fingerlings and Salsa Verde",
      serves: 6,
      activeTime: "40 min",
      totalTime: "1.5 hours",
      ingredients: [
        "Thick-cut porterhouse or ribeye",
        "Fingerling potatoes",
        "Parsley and basil",
        "Capers and garlic",
        "Lemon juice and olive oil",
        "Kosher salt and black pepper"
      ],
      steps: [
        "Roast fingerlings with olive oil, salt, and pepper until crisp.",
        "Sear or grill steak to medium-rare and rest well.",
        "Blend herbs, capers, garlic, lemon, and oil into salsa verde.",
        "Slice steak, spoon salsa verde, and serve with potatoes."
      ],
      notes: "Resting is essential for juicy slices.",
      makeAhead: "Salsa verde can be made 1 day ahead."
    },
    {
      title: "Panna Cotta with Macerated Berries and Aged Balsamic",
      serves: 6,
      activeTime: "20 min",
      totalTime: "4 hours",
      ingredients: [
        "Heavy cream",
        "Sugar",
        "Gelatin",
        "Vanilla bean or extract",
        "Mixed berries",
        "Aged balsamic vinegar"
      ],
      steps: [
        "Bloom gelatin, then dissolve in warm sweetened cream.",
        "Pour into cups and chill until set.",
        "Macerate berries with a splash of balsamic.",
        "Top panna cotta with berries and a balsamic drizzle."
      ],
      notes: "Do not boil the cream once gelatin is added.",
      makeAhead: "Panna cotta can be made 2 days ahead."
    }
  ],
  3: [
    {
      title: "Gougeres (Warm Gruyere Cheese Puffs)",
      serves: 6,
      activeTime: "25 min",
      totalTime: "50 min",
      ingredients: [
        "Water",
        "Butter",
        "All-purpose flour",
        "Eggs",
        "Gruyere cheese, grated",
        "Salt and black pepper"
      ],
      steps: [
        "Boil water and butter, then stir in flour to form a dough.",
        "Beat in eggs one at a time until glossy.",
        "Fold in gruyere and pipe small mounds.",
        "Bake until puffed and deeply golden."
      ],
      notes: "Do not open the oven early or the puffs may deflate.",
      makeAhead: "Bake earlier and rewarm briefly before serving."
    },
    {
      title: "French Onion Soup Gratinee with Gruyere Crouton",
      serves: 6,
      activeTime: "45 min",
      totalTime: "1.5 hours",
      ingredients: [
        "Yellow onions, thinly sliced",
        "Butter and olive oil",
        "Dry white wine",
        "Beef or chicken stock",
        "Thyme and bay leaf",
        "Baguette and gruyere cheese"
      ],
      steps: [
        "Caramelize onions slowly until deep brown.",
        "Deglaze with wine, add stock and herbs, and simmer.",
        "Toast baguette slices with gruyere.",
        "Ladle soup, top with crouton and cheese, and broil."
      ],
      notes: "Low and slow onions give the best flavor.",
      makeAhead: "Soup base can be made 2 days ahead."
    },
    {
      title: "Salade Lyonnaise with Frisee, Lardons, and Poached Egg",
      serves: 6,
      activeTime: "25 min",
      totalTime: "30 min",
      ingredients: [
        "Frisee",
        "Thick-cut bacon lardons",
        "Eggs",
        "Shallot, minced",
        "Red wine vinegar",
        "Dijon mustard",
        "Olive oil, salt, and pepper"
      ],
      steps: [
        "Cook lardons until crisp; reserve fat.",
        "Whisk vinegar, mustard, and shallot; add warm bacon fat and oil.",
        "Toss frisee with warm vinaigrette and lardons.",
        "Top each plate with a poached egg."
      ],
      notes: "Serve immediately so the egg stays warm.",
      makeAhead: "Vinaigrette base can be made earlier."
    },
    {
      title: "Coq au Vin with Pearl Onions, Mushrooms, and Pommes Puree",
      serves: 6,
      activeTime: "45 min",
      totalTime: "2 hours",
      ingredients: [
        "Chicken thighs and drumsticks",
        "Bacon",
        "Red wine",
        "Mushrooms and pearl onions",
        "Chicken stock",
        "Garlic and thyme",
        "Potatoes, butter, and cream"
      ],
      steps: [
        "Brown bacon and chicken; saute mushrooms and onions.",
        "Deglaze with wine, add stock and herbs, then simmer.",
        "Cook potatoes and mash with butter and cream.",
        "Serve chicken and sauce over pommes puree."
      ],
      notes: "Skim fat from the sauce for a cleaner finish.",
      makeAhead: "Stew improves when made a day ahead."
    },
    {
      title: "Tarte Tatin with Calvados Creme Fraiche",
      serves: 6,
      activeTime: "30 min",
      totalTime: "1.5 hours",
      ingredients: [
        "Apples, peeled and halved",
        "Sugar",
        "Butter",
        "Puff pastry",
        "Creme fraiche",
        "Calvados or apple brandy"
      ],
      steps: [
        "Caramelize sugar and butter in an oven-safe skillet.",
        "Arrange apples and cook until slightly softened.",
        "Top with puff pastry and bake until golden.",
        "Invert and serve with Calvados creme fraiche."
      ],
      notes: "Let the tart rest 10 minutes before inverting.",
      makeAhead: "Tart is best the day it is baked."
    }
  ],
  4: [
    {
      title: "Oysters on the Half Shell with Champagne Mignonette",
      serves: 6,
      activeTime: "15 min",
      totalTime: "20 min",
      ingredients: [
        "Fresh oysters",
        "Champagne or white wine vinegar",
        "Shallot, minced",
        "Cracked black pepper",
        "Lemon wedges"
      ],
      steps: [
        "Stir vinegar with shallot and pepper; chill.",
        "Shuck oysters and arrange on ice.",
        "Spoon mignonette over each oyster.",
        "Serve with lemon."
      ],
      notes: "Keep oysters cold until the last moment.",
      makeAhead: "Mignonette can be made 1 day ahead."
    },
    {
      title: "Maine Lobster Bisque with Cognac Cream and Chive Oil",
      serves: 6,
      activeTime: "45 min",
      totalTime: "2 hours",
      ingredients: [
        "Lobster shells",
        "Onion, celery, and carrot",
        "Tomato paste",
        "Cognac or brandy",
        "Seafood stock",
        "Heavy cream",
        "Chives and olive oil"
      ],
      steps: [
        "Roast shells, then saute aromatics and tomato paste.",
        "Deglaze with cognac, add stock, and simmer.",
        "Blend and strain, then finish with cream.",
        "Drizzle with chive oil before serving."
      ],
      notes: "Strain through a fine mesh for a silky texture.",
      makeAhead: "Bisque base can be made 1 day ahead."
    },
    {
      title: "Baby Spinach with Warm Bacon Vinaigrette and Shaved Apple",
      serves: 6,
      activeTime: "15 min",
      totalTime: "20 min",
      ingredients: [
        "Baby spinach",
        "Bacon, diced",
        "Shallot, minced",
        "Apple cider vinegar",
        "Dijon mustard",
        "Apple, thinly shaved",
        "Olive oil, salt, and pepper"
      ],
      steps: [
        "Cook bacon until crisp; reserve fat.",
        "Whisk vinegar, mustard, and shallot; add warm bacon fat.",
        "Toss spinach with warm vinaigrette.",
        "Top with shaved apple and bacon."
      ],
      notes: "Serve immediately while the vinaigrette is warm.",
      makeAhead: "Vinaigrette base can be prepped ahead."
    },
    {
      title: "Pan-Seared Chilean Sea Bass with Herb Beurre Blanc and Haricots Verts",
      serves: 6,
      activeTime: "35 min",
      totalTime: "45 min",
      ingredients: [
        "Chilean sea bass fillets",
        "Butter",
        "Shallot, minced",
        "White wine",
        "Lemon juice",
        "Fresh herbs",
        "Haricots verts"
      ],
      steps: [
        "Season and sear fish until golden; finish gently in the oven.",
        "Simmer wine and shallot, whisk in butter to make beurre blanc.",
        "Blanch haricots verts and toss with salt and butter.",
        "Plate fish with sauce and beans."
      ],
      notes: "Keep beurre blanc warm, not hot, to avoid breaking.",
      makeAhead: "Beans can be blanched ahead and reheated."
    },
    {
      title: "Maine Blueberry Buckle with Vanilla Bean Ice Cream",
      serves: 6,
      activeTime: "20 min",
      totalTime: "1 hour",
      ingredients: [
        "Blueberries",
        "All-purpose flour",
        "Sugar",
        "Butter",
        "Eggs",
        "Baking powder",
        "Vanilla bean or extract",
        "Vanilla ice cream"
      ],
      steps: [
        "Mix batter with flour, sugar, butter, eggs, and vanilla.",
        "Fold in blueberries and pour into a buttered dish.",
        "Bake until golden and set.",
        "Serve warm with vanilla ice cream."
      ],
      notes: "A toothpick should come out clean from the center.",
      makeAhead: "Buckle is best baked the day of service."
    }
  ],
  5: [
    {
      title: "Beef Tartare on Black Pepper Crostini with Quail Egg",
      serves: 6,
      activeTime: "25 min",
      totalTime: "25 min",
      ingredients: [
        "Beef tenderloin, finely diced",
        "Shallot, minced",
        "Capers, chopped",
        "Dijon mustard",
        "Egg yolk",
        "Black pepper crostini",
        "Quail eggs",
        "Salt and pepper"
      ],
      steps: [
        "Combine beef with shallot, capers, mustard, and seasoning.",
        "Toast crostini and rub with a garlic clove if desired.",
        "Spoon tartare onto crostini.",
        "Top with a quail egg and cracked pepper."
      ],
      notes: "Use the freshest beef and keep it very cold.",
      makeAhead: "Dice beef and prep mix-ins ahead; assemble at service."
    },
    {
      title: "Classic Wedge Salad with Point Reyes Blue Cheese and Applewood Bacon",
      serves: 6,
      activeTime: "20 min",
      totalTime: "20 min",
      ingredients: [
        "Iceberg lettuce",
        "Point Reyes blue cheese",
        "Applewood bacon",
        "Cherry tomatoes",
        "Chives",
        "Buttermilk",
        "Sour cream or mayo",
        "Lemon juice, salt, and pepper"
      ],
      steps: [
        "Cook bacon until crisp and crumble.",
        "Whisk buttermilk, sour cream, blue cheese, lemon, salt, and pepper.",
        "Cut lettuce into wedges and plate.",
        "Top with dressing, bacon, tomatoes, and chives."
      ],
      notes: "Keep lettuce very cold for best crunch.",
      makeAhead: "Dressing can be made 2 days ahead."
    },
    {
      title: "Jumbo Shrimp Cocktail with House Cocktail Sauce",
      serves: 6,
      activeTime: "20 min",
      totalTime: "30 min",
      ingredients: [
        "Jumbo shrimp, peeled and deveined",
        "Lemon, bay leaf, and peppercorns",
        "Ketchup and chili sauce",
        "Prepared horseradish",
        "Worcestershire sauce",
        "Lemon juice"
      ],
      steps: [
        "Poach shrimp in seasoned water until just pink; chill.",
        "Mix ketchup, chili sauce, horseradish, Worcestershire, and lemon.",
        "Serve shrimp over ice with cocktail sauce.",
        "Garnish with lemon wedges."
      ],
      notes: "Do not overcook shrimp; they should be tender.",
      makeAhead: "Sauce can be made 3 days ahead."
    },
    {
      title: "45-Day Dry-Aged Ribeye with Truffle Butter and Roasted Bone Marrow",
      serves: 6,
      activeTime: "35 min",
      totalTime: "1.5 hours",
      ingredients: [
        "Dry-aged ribeye steaks",
        "Beef marrow bones",
        "Butter",
        "Truffle oil or minced truffle",
        "Garlic and thyme",
        "Kosher salt and black pepper"
      ],
      steps: [
        "Roast marrow bones until bubbling; season with salt.",
        "Season steaks and sear hard; finish to desired doneness.",
        "Mix softened butter with truffle and garlic.",
        "Rest steaks, then top with truffle butter and marrow."
      ],
      notes: "Let steaks rest 8-10 minutes before slicing.",
      makeAhead: "Truffle butter can be made 2 days ahead."
    },
    {
      title: "New York Cheesecake with Seasonal Berry Compote",
      serves: 6,
      activeTime: "30 min",
      totalTime: "5 hours",
      ingredients: [
        "Cream cheese",
        "Sugar",
        "Eggs",
        "Sour cream",
        "Graham crackers and butter",
        "Vanilla extract",
        "Mixed berries",
        "Lemon juice"
      ],
      steps: [
        "Press graham crust into a pan and bake briefly.",
        "Beat cream cheese with sugar, then add eggs and sour cream.",
        "Bake until set, then cool and chill completely.",
        "Simmer berries with sugar and lemon for compote; serve on top."
      ],
      notes: "Chill overnight for clean slices.",
      makeAhead: "Cheesecake keeps well for 2 days."
    }
  ]
};

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
  DEMO_MENU_RECIPES,
  COOKBOOK_SECTIONS,
  COPYRIGHT_TEXT
};

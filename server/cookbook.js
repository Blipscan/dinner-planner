// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// Complete DOCX Cookbook Generator
// ============================================================

const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, 
        PageBreak, LevelFormat, Table, TableRow, TableCell, BorderStyle, 
        WidthType, ShadingType } = require('docx');
const { STAFFING, COPYRIGHT_TEXT } = require('./data');

// Color palette
const COLORS = {
  navy: '1e3a5f',
  gold: 'c9a227',
  cream: 'faf8f5',
  text: '2d3a35',
  textLight: '6b7c85'
};

function buildWineRationale(course) {
  const name = (course?.name || '').toLowerCase();
  const type = (course?.type || '').toLowerCase();

  if (type.includes('dessert') || /chocolate|caramel|custard|panna cotta|tart|cake|ice cream|sorbet|gelato/.test(name)) {
    return "Chosen to mirror the dessert's sweetness and highlight its flavors.";
  }
  if (/scallop|shrimp|crab|lobster|oyster|clam|mussel|fish|salmon|tuna|seafood/.test(name)) {
    return 'Bright acidity and minerality keep the seafood light and lift the dish.';
  }
  if (/lamb|beef|steak|short rib|duck|venison|game|rabbit/.test(name)) {
    return 'Structured tannins and depth stand up to the richness of the protein.';
  }
  if (/pork|chicken|turkey|quail/.test(name)) {
    return 'Balanced body and acidity complement savory flavors without overpowering.';
  }
  if (/mushroom|truffle|porcini/.test(name)) {
    return "Earthy notes echo the dish's umami character.";
  }
  if (/citrus|lemon|lime|orange|grapefruit|yuzu/.test(name)) {
    return 'Crisp acidity echoes citrus notes and refreshes the palate.';
  }
  if (/tomato|heirloom/.test(name)) {
    return "Acid-driven wines balance the tomato's brightness and sweetness.";
  }
  if (/cheese|burrata|ricotta|cream/.test(name)) {
    return 'Acidity cuts through creamy textures for a cleaner finish.';
  }
  return "Selected to balance the dish's flavors and keep the progression harmonious.";
}

// Build complete cookbook document
async function buildCookbook(menu, context, staffing, recipes, details) {
  const staffingInfo = STAFFING.find(s => s.id === staffing) || STAFFING[0];
  const guestNames = context.guestList ? context.guestList.split('\n').filter(n => n.trim()) : [];
  
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Georgia', size: 24 }
        }
      },
      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          run: { size: 72, bold: true, font: 'Georgia', color: COLORS.navy },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 200 } }
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 48, bold: true, font: 'Georgia', color: COLORS.navy },
          paragraph: { spacing: { before: 400, after: 200 } }
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Georgia', color: COLORS.navy },
          paragraph: { spacing: { before: 300, after: 150 } }
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Georgia', color: COLORS.gold },
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
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 inch
        }
      },
      children: [
        // ========== SYSTEM INDEX (FIRST PAGE) ==========
        ...buildSystemIndex(menu, context, details),

        // ========== COURSE ARCHITECTURE ==========
        ...buildCourseArchitecture(menu, details),

        // ========== MASTER TIMELINE ==========
        ...buildMasterTimeline(details, context),

        // ========== ROLE-BASED VIEWS ==========
        ...buildRoleViews(details, context),

        // ========== MASTER SHOPPING LIST ==========
        ...buildMasterShoppingList(details, context),

        // ========== RECIPE MODULES ==========
        ...buildRecipeModules(menu, details, recipes),

        // ========== DAY-OF EXECUTION PACKET ==========
        ...buildExecutionPacket(details, menu),

        // ========== EQUIPMENT & CAPACITY CONSTRAINTS ==========
        ...buildEquipmentConstraints(details),

        // ========== FAILURE & CONTINGENCY NOTES ==========
        ...buildContingencies(details),

        // ========== CLEANUP & RESET ==========
        ...buildCleanupReset(details),

        // ========== ARCHIVE & REUSE METADATA ==========
        ...buildArchiveMetadata(details, context)
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}

// ========== SECTION BUILDERS ==========

function buildCoverPage(menu, context) {
  return [
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: context.eventTitle || 'Dinner Party', size: 72, bold: true, font: 'Georgia', color: COLORS.navy })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [new TextRun({ text: menu.title, size: 40, italics: true, font: 'Georgia', color: COLORS.gold })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new TextRun({ text: '◆', size: 32, color: COLORS.gold })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new TextRun({ text: `${context.guestCount || 6} Guests`, size: 28, font: 'Georgia', color: COLORS.textLight })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
      children: [new TextRun({ text: context.eventDate || 'Date TBD', size: 28, font: 'Georgia', color: COLORS.textLight })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
      children: [new TextRun({ text: `Service: ${context.serviceTime || '7:00 PM'}`, size: 28, font: 'Georgia', color: COLORS.textLight })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [new TextRun({ text: menu.personality, size: 26, italics: true, font: 'Georgia', color: COLORS.text })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ];
}

function buildMenuOverview(menu, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'The Menu', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({ spacing: { after: 300 }, children: [] })
  ];

  if (details?.chefOverview) {
    children.push(
      new Paragraph({
        spacing: { after: 250 },
        children: [new TextRun({ text: details.chefOverview, size: 22, italics: true, color: COLORS.textLight })]
      })
    );
  }
  
  menu.courses.forEach(course => {
    children.push(
      new Paragraph({
        spacing: { before: 250 },
        children: [new TextRun({ text: course.type.toUpperCase(), size: 20, bold: true, color: COLORS.gold, font: 'Georgia' })]
      }),
      new Paragraph({
        spacing: { before: 50 },
        children: [new TextRun({ text: course.name, size: 28, font: 'Georgia', color: COLORS.navy })]
      })
    );
    if (course.wine) {
      children.push(
        new Paragraph({
          spacing: { before: 50 },
          children: [
            new TextRun({ text: 'Paired with: ', size: 22, italics: true, color: COLORS.textLight }),
            new TextRun({ text: course.wine, size: 22, italics: true, color: COLORS.gold })
          ]
        })
      );
    }
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildWineProgram(menu, context, details) {
  const wines = menu.courses.filter(c => c.wine);
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Wine Program', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Budget: ${context.wineBudget || '$80-120'}`, size: 24, italics: true, color: COLORS.textLight })]
    })
  ];

  if (details?.wineOverview) {
    children.push(
      new Paragraph({
        spacing: { after: 220 },
        children: [new TextRun({ text: details.wineOverview, size: 22, italics: true, color: COLORS.textLight })]
      })
    );
  }
  
  wines.forEach(course => {
    const rationale = buildWineRationale(course);
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: course.type, size: 26, bold: true, color: COLORS.gold })]
      }),
      new Paragraph({
        children: [new TextRun({ text: course.wine, size: 26, bold: true, color: COLORS.navy })]
      }),
      new Paragraph({
        spacing: { before: 100 },
        children: [new TextRun({ text: `Pairs with: ${course.name}`, size: 22, italics: true, color: COLORS.textLight })]
      }),
      new Paragraph({
        spacing: { before: 80 },
        children: [new TextRun({ text: `Why this pairing: ${rationale}`, size: 20, italics: true, color: COLORS.textLight })]
      }),
      new Paragraph({
        spacing: { before: 100, after: 200 },
        children: [new TextRun({ text: 'Serve at 55-60°F. Decant 30 minutes before service if red.', size: 20, color: COLORS.textLight })]
      })
    );
  });
  
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Wine Service Notes', size: 32, bold: true, color: COLORS.navy })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Chill white wines 2 hours before guests arrive')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Open and decant red wines 30-60 minutes before serving')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Have backup bottles ready — estimate 1 bottle per 2-3 guests per course')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Pour 4-5 oz per glass for tasting portions')] }),
    new Paragraph({ children: [new PageBreak()] })
  );
  
  return children;
}

function buildRecipes(menu, recipes) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Recipes', size: 48, bold: true, color: COLORS.navy })] 
    })
  ];
  
  menu.courses.forEach((course, idx) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: idx > 0,
        children: [new TextRun({ text: `${course.type}: ${course.name}`, size: 32, bold: true, color: COLORS.navy })]
      })
    );
    
    // If we have AI-generated recipes, use them; otherwise placeholder
    if (recipes && recipes[idx]) {
      const recipe = recipes[idx];
      
      // Yield and timing
      children.push(
        new Paragraph({
          spacing: { before: 100 },
          children: [new TextRun({ text: `Serves: ${recipe.serves || 6} | Active: ${recipe.activeTime || '30 min'} | Total: ${recipe.totalTime || '1 hour'}`, size: 20, italics: true, color: COLORS.textLight })]
        })
      );
      
      // Ingredients
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Ingredients', size: 26, bold: true, color: COLORS.gold })]
        })
      );
      
      if (recipe.ingredients && recipe.ingredients.length) {
        recipe.ingredients.forEach(ing => {
          children.push(
            new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(ing)] })
          );
        });
      } else {
        children.push(
          new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Ingredients will be generated based on your selections')] })
        );
      }
      
      // Method
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Method', size: 26, bold: true, color: COLORS.gold })]
        })
      );
      
      if (recipe.steps && recipe.steps.length) {
        recipe.steps.forEach((step, i) => {
          children.push(
            new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun(step)] })
          );
        });
      } else {
        children.push(
          new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun('Step-by-step instructions will be generated')] })
        );
      }
      
      // Chef's Notes
      if (recipe.notes) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: "Chef's Notes", size: 26, bold: true, color: COLORS.gold })]
          }),
          new Paragraph({
            children: [new TextRun({ text: recipe.notes, italics: true, color: COLORS.textLight })]
          })
        );
      }
      
      // Make Ahead
      if (recipe.makeAhead) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: 'Make Ahead', size: 26, bold: true, color: COLORS.gold })]
          }),
          new Paragraph({
            children: [new TextRun({ text: recipe.makeAhead, color: COLORS.text })]
          })
        );
      }

      // Why it works
      if (recipe.whyItWorks) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: 'Why It Works', size: 26, bold: true, color: COLORS.gold })]
          }),
          new Paragraph({
            children: [new TextRun({ text: recipe.whyItWorks, italics: true, color: COLORS.textLight })]
          })
        );
      }
    } else {
      // Placeholder
      children.push(
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({ text: 'Full recipe with ingredients and step-by-step instructions.', italics: true, color: COLORS.textLight })]
        })
      );
    }
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildShoppingList(menu, context, recipes, details) {
  const guestCount = parseInt(context.guestCount) || 6;
  
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Shopping List', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `For ${guestCount} guests`, size: 24, italics: true, color: COLORS.textLight })]
    })
  ];

  const detailCategories = Array.isArray(details?.shoppingList?.categories)
    ? details.shoppingList.categories
    : null;

  const fallbackCategories = ['Proteins', 'Seafood', 'Produce', 'Dairy & Eggs', 'Pantry', 'Wine & Beverages', 'Special Ingredients'];

  const categories = detailCategories?.length ? detailCategories : fallbackCategories.map(name => ({ name }));
  
  categories.forEach(cat => {
    const items = Array.isArray(cat.items) && cat.items.length ? cat.items : ['□  Items based on your menu'];
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: cat.name || 'Category', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    items.forEach(item => {
      const text = item.startsWith('□') ? item : `□  ${item}`;
      children.push(
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(text)] })
      );
    });
  });
  
  const notes = Array.isArray(details?.shoppingList?.notes) ? details.shoppingList.notes : null;

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400 },
      children: [new TextRun({ text: 'Shopping Notes', size: 32, bold: true, color: COLORS.navy })]
    })
  );

  if (notes?.length) {
    notes.forEach(note => {
      children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
    });
  } else {
    children.push(
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Shop for proteins and seafood 1-2 days before')] }),
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Buy produce day-before for peak freshness')] }),
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Wine can be purchased a week ahead')] })
    );
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  
  return children;
}

function buildDayBeforePrep(menu, staffingInfo, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Day-Before Prep', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Staffing: ${staffingInfo.name}`, size: 24, italics: true, color: COLORS.textLight })]
    })
  ];
  
  const tasks = Array.isArray(details?.dayBeforePrep) && details.dayBeforePrep.length
    ? details.dayBeforePrep
    : [
        'Review all recipes and confirm you have all ingredients',
        'Prep stocks and sauces that improve overnight',
        'Marinate proteins as needed',
        'Wash and prep vegetables (store properly)',
        'Make dessert components that hold well',
        'Set the table completely',
        'Chill wine and set out serving pieces',
        'Write out your day-of timeline',
        'Prep any garnishes that hold',
        'Do a final equipment check'
      ];
  
  tasks.forEach(task => {
    children.push(
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(`□  ${task}`)] })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildDayOfTimeline(menu, context, staffingInfo, details) {
  const serviceTime = context.serviceTime || '7:00 PM';
  
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Day-Of Timeline', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Service Time: ${serviceTime} | Your active time: ~${staffingInfo.activeMin} minutes`, size: 24, italics: true, color: COLORS.textLight })]
    })
  ];
  
  // Work backwards from service time
  const timeline = Array.isArray(details?.dayOfTimeline) && details.dayOfTimeline.length
    ? details.dayOfTimeline
    : [
        { time: '-6 hours', task: 'Final shopping for any last-minute items' },
        { time: '-5 hours', task: 'Begin slow-cooking items (braises, stocks)' },
        { time: '-4 hours', task: 'Prep remaining vegetables and garnishes' },
        { time: '-3 hours', task: 'Start sauces and reductions' },
        { time: '-2 hours', task: 'Set out cheese and butter to temper' },
        { time: '-90 min', task: 'Open and decant red wines' },
        { time: '-1 hour', task: 'Final protein prep, bring to room temp' },
        { time: '-45 min', task: 'Preheat oven, warm plates' },
        { time: '-30 min', task: 'Light candles, start music, final touches' },
        { time: '-15 min', task: 'Plate amuse-bouche, pour welcome drinks' },
        { time: '0', task: 'Guests arrive — service begins' },
        { time: '+15 min', task: 'Serve amuse-bouche' },
        { time: '+30 min', task: 'Fire first course' },
        { time: '+50 min', task: 'Clear, serve second course' },
        { time: '+80 min', task: 'Fire main course' },
        { time: '+110 min', task: 'Clear, prepare dessert' },
        { time: '+130 min', task: 'Serve dessert and dessert wine' }
      ];
  
  timeline.forEach(item => {
    const timeLabel = item.time || item.offset || item.label || '';
    const taskLabel = item.task || item.description || item.label || item;
    children.push(
      new Paragraph({
        spacing: { before: 100 },
        children: [
          new TextRun({ text: String(timeLabel).padEnd(12), bold: true, color: COLORS.gold, size: 22 }),
          new TextRun({ text: String(taskLabel), size: 22 })
        ]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildPlatingGuides(menu, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Plating Guides', size: 48, bold: true, color: COLORS.navy })] 
    })
  ];

  const guides = Array.isArray(details?.platingGuides) && details.platingGuides.length
    ? details.platingGuides
    : (menu.courses || []).map(course => ({
        courseType: course.type,
        guidance: `Plate ${course.name} as the focal point, add a clean sauce accent, and finish with a fresh garnish.`
      }));
  
  guides.forEach((guide, idx) => {
    const courseLabel = guide.courseType || menu.courses?.[idx]?.type || 'Course';
    const courseName = guide.courseName || menu.courses?.[idx]?.name;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: courseLabel, size: 26, bold: true, color: COLORS.gold })]
      })
    );
    if (courseName) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: courseName, bold: true, size: 24, color: COLORS.navy })]
        })
      );
    }
    children.push(
      new Paragraph({
        spacing: { before: 100, after: 200 },
        children: [new TextRun({ text: guide.guidance || 'Keep plating clean, balanced, and purposeful.', size: 20, color: COLORS.textLight })]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildTableSetting(menu, context, guestNames, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Table Setting', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `${context.guestCount || 6} place settings`, size: 24, italics: true, color: COLORS.textLight })]
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Per Place Setting', size: 26, bold: true, color: COLORS.gold })]
    }),
  ];

  const setting = details?.tableSetting || {};
  const placeSettingItems = Array.isArray(setting.placeSetting) && setting.placeSetting.length
    ? setting.placeSetting
    : [
        'Charger plate (remove before main)',
        'Dinner fork, salad fork (outside in)',
        'Dinner knife, soup spoon',
        'Dessert spoon above plate',
        'Water glass, white wine glass, red wine glass',
        'Cloth napkin, folded or in ring',
        'Place card'
      ];

  placeSettingItems.forEach(item => {
    children.push(
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(item)] })
    );
  });

  if (setting.centerpiece) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Centerpiece', size: 26, bold: true, color: COLORS.gold })]
      }),
      new Paragraph({
        children: [new TextRun({ text: setting.centerpiece, size: 22, color: COLORS.textLight })]
      })
    );
  }

  if (Array.isArray(setting.notes) && setting.notes.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Table Notes', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    setting.notes.forEach(note => {
      children.push(
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] })
      );
    });
  }
  
  if (guestNames.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Guest List', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    guestNames.forEach(name => {
      children.push(
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(name.trim())] })
      );
    });
  }
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildServiceNotes(menu, staffingInfo, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Service Notes', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Pacing', size: 26, bold: true, color: COLORS.gold })]
    })
  ];

  const serviceNotes = details?.serviceNotes || {};
  const pacing = Array.isArray(serviceNotes.pacing) && serviceNotes.pacing.length
    ? serviceNotes.pacing
    : ['Allow 15-20 minutes between courses', 'Watch for guests finishing — clear when 80% done', 'Never rush; better to slow down than speed up'];
  pacing.forEach(note => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Wine Service', size: 26, bold: true, color: COLORS.gold })]
    })
  );
  const wineService = Array.isArray(serviceNotes.wineService) && serviceNotes.wineService.length
    ? serviceNotes.wineService
    : ['Pour from guest\'s right side', 'Fill glasses 1/3 to 1/2 full', 'Offer water throughout'];
  wineService.forEach(note => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Clearing', size: 26, bold: true, color: COLORS.gold })]
    })
  );
  const clearing = Array.isArray(serviceNotes.clearing) && serviceNotes.clearing.length
    ? serviceNotes.clearing
    : ['Clear from right, serve from left', 'Remove all plates before bringing next course', 'Crumb table before dessert'];
  clearing.forEach(note => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));

  return children;
}

function buildAmbianceGuide(menu, context, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Ambiance & Music', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Lighting', size: 26, bold: true, color: COLORS.gold })]
    })
  ];

  const ambiance = details?.ambianceGuide || {};
  const lighting = Array.isArray(ambiance.lighting) && ambiance.lighting.length
    ? ambiance.lighting
    : ['Dim overhead lights to 40-50%', 'Use candles as primary table lighting', 'Unscented candles only near food'];
  lighting.forEach(note => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Music Suggestions', size: 26, bold: true, color: COLORS.gold })]
    })
  );
  const music = Array.isArray(ambiance.music) && ambiance.music.length
    ? ambiance.music
    : ['Arrival: Upbeat jazz or bossa nova', 'Dinner: Soft jazz, classical, or acoustic', 'Dessert: Slightly more energy, still conversational', 'Volume: Background only — guests should never strain to talk'];
  music.forEach(note => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Temperature', size: 26, bold: true, color: COLORS.gold })]
    })
  );
  const temperature = Array.isArray(ambiance.temperature) && ambiance.temperature.length
    ? ambiance.temperature
    : ['Set thermostat 2-3° cooler than normal', 'Room will warm with guests and cooking'];
  temperature.forEach(note => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(note)] }));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));

  return children;
}

function buildFinalChecklist(menu, context, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Final Checklist', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'One Week Before', size: 26, bold: true, color: COLORS.gold })]
    })
  ];

  const checklist = details?.finalChecklist || {};
  const weekBefore = Array.isArray(checklist.weekBefore) && checklist.weekBefore.length
    ? checklist.weekBefore
    : ['Confirm guest count and dietary restrictions', 'Order specialty ingredients', 'Purchase wines', 'Test any new recipes'];
  weekBefore.forEach(item => {
    const text = item.startsWith('□') ? item : `□  ${item}`;
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(text)] }));
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Day Before', size: 26, bold: true, color: COLORS.gold })]
    })
  );
  const dayBefore = Array.isArray(checklist.dayBefore) && checklist.dayBefore.length
    ? checklist.dayBefore
    : ['Complete all make-ahead prep', 'Set table completely', 'Chill white wines', 'Clean kitchen and clear workspace'];
  dayBefore.forEach(item => {
    const text = item.startsWith('□') ? item : `□  ${item}`;
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(text)] }));
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Day Of', size: 26, bold: true, color: COLORS.gold })]
    })
  );
  const dayOf = Array.isArray(checklist.dayOf) && checklist.dayOf.length
    ? checklist.dayOf
    : ['Follow timeline', 'Final taste and season all dishes', 'Light candles 10 minutes before arrival', 'Start music', 'Take a breath — you\'ve got this!'];
  dayOf.forEach(item => {
    const text = item.startsWith('□') ? item : `□  ${item}`;
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(text)] }));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));

  return children;
}

function buildImagePrompts(menu, context, details) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'AI Image Prompts', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Use these prompts with Midjourney, DALL-E, or similar tools to visualize your dishes.', size: 22, italics: true, color: COLORS.textLight })]
    })
  ];
  
  const prompts = Array.isArray(details?.imagePrompts) && details.imagePrompts.length
    ? details.imagePrompts
    : (menu.courses || []).map(course =>
        `Professional food photography of ${course.name}, elegant plating on white porcelain, soft natural lighting, shallow depth of field, fine dining presentation, 85mm lens`
      );

  prompts.forEach((prompt, idx) => {
    const courseLabel = menu.courses?.[idx]?.type || (idx === prompts.length - 1 ? 'Tablescape' : `Course ${idx + 1}`);
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: courseLabel, size: 26, bold: true, color: COLORS.gold })]
      }),
      new Paragraph({
        shading: { fill: 'f5f5f5', type: ShadingType.CLEAR },
        spacing: { after: 200 },
        children: [new TextRun({ text: prompt, size: 20, font: 'Courier New' })]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildKeyValueLine(label, value) {
  const displayValue = value && String(value).trim() ? String(value) : 'TBD';
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: COLORS.navy }),
      new TextRun({ text: displayValue, color: COLORS.text })
    ]
  });
}

function buildCheckboxList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [new Paragraph({ children: [new TextRun('□  TBD')] })];
  }
  return items.map(item => {
    const text = String(item || '').trim();
    return new Paragraph({ children: [new TextRun(`□  ${text || 'TBD'}`)] });
  });
}

function buildBulletList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('TBD')] })];
  }
  return items.map(item => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(String(item))] }));
}

function buildSystemIndex(menu, context, details) {
  const info = details?.systemIndex || {};
  const courseSummary = info.menuSummary?.length
    ? info.menuSummary
    : (menu?.courses || []).map(course => `${course.type}: ${course.name}`);
  const complexity = info.complexity || 'Medium';
  const stationsRequired =
    info.stationsRequired ||
    details?.equipmentConstraints?.stationsRequired ||
    'TBD';

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'System Index', size: 48, bold: true, color: COLORS.navy })]
    }),
    buildKeyValueLine('Event', info.eventName || context.eventTitle || 'Dinner Party'),
    buildKeyValueLine('Date', info.eventDate || context.eventDate || 'TBD'),
    buildKeyValueLine('Location', info.location || context.eventLocation || 'TBD'),
    buildKeyValueLine('Guests', info.guestCount || context.guestCount || 'TBD'),
    buildKeyValueLine('Service Style', info.serviceStyle || context.serviceStyle || 'TBD'),
    buildKeyValueLine('Complexity', complexity),
    buildKeyValueLine('Total Prep Time', info.totalPrepTime || details?.archiveMetadata?.parameters?.totalPrepTime || 'TBD'),
    buildKeyValueLine('Total Active Time', info.totalActiveTime || details?.archiveMetadata?.parameters?.totalActiveTime || 'TBD'),
    buildKeyValueLine('Stations Required', stationsRequired)
  ];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300 },
      children: [new TextRun({ text: 'Menu Summary', size: 32, bold: true, color: COLORS.navy })]
    })
  );
  courseSummary.forEach(item => {
    children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(item)] }));
  });

  const warnings = details?.mealBalance?.warnings || [];
  if (warnings.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
        children: [new TextRun({ text: 'Meal Balance Warnings', size: 32, bold: true, color: COLORS.navy })]
      })
    );
    children.push(...buildBulletList(warnings));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildCourseArchitecture(menu, details) {
  const plan = Array.isArray(details?.coursePlan) && details.coursePlan.length
    ? details.coursePlan
    : (menu?.courses || []).map(course => ({
        courseType: course.type,
        dish: course.name,
        purpose: 'TBD',
        portion: 'medium',
        temperature: 'hot',
        serviceDuration: 'TBD',
        dependsOn: []
      }));

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Course Architecture', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  plan.forEach(course => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: `${course.courseType}: ${course.dish}`, size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(
      buildKeyValueLine('Purpose', course.purpose),
      buildKeyValueLine('Portion', course.portion),
      buildKeyValueLine('Temperature', course.temperature),
      buildKeyValueLine('Service Duration', course.serviceDuration),
      buildKeyValueLine('Dependencies', Array.isArray(course.dependsOn) ? course.dependsOn.join(', ') : 'None')
    );
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildMasterTimeline(details, context) {
  const timeline = Array.isArray(details?.masterTimeline) ? details.masterTimeline : [];
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Master Timeline', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  if (!timeline.length) {
    children.push(new Paragraph({ children: [new TextRun('Timeline data not available.')] }));
  } else {
    timeline.forEach(item => {
      const timeLabel = [item.time, item.offset].filter(Boolean).join(' / ') || 'TBD';
      const roleLabel = item.role ? `[${item.role}]` : '';
      const courseLabel = item.course ? `${item.course}` : '';
      const durationLabel = item.duration ? `(${item.duration})` : '';
      const parallelLabel = item.parallel ? '[Parallel]' : '';
      const taskLine = `${timeLabel} ${roleLabel} ${parallelLabel} ${courseLabel} ${item.task || ''} ${durationLabel}`.trim();
      children.push(new Paragraph({ children: [new TextRun(taskLine)] }));
      if (Array.isArray(item.dependsOn) && item.dependsOn.length) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Depends on: ${item.dependsOn.join(', ')}`, italics: true, color: COLORS.textLight })]
          })
        );
      }
    });
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildRoleViews(details, context) {
  const roles = Array.isArray(details?.roleViews) ? details.roleViews : [];
  if (!roles.length) {
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Role-Based Views', size: 48, bold: true, color: COLORS.navy })]
      }),
      new Paragraph({ children: [new TextRun('Role checklists not provided.')] }),
      new Paragraph({ children: [new PageBreak()] })
    ];
  }

  const children = [];
  roles.forEach(role => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `Role View - ${role.role}`, size: 48, bold: true, color: COLORS.navy })]
      }),
      buildKeyValueLine('Event', details?.systemIndex?.eventName || context.eventTitle || 'Dinner Party'),
      buildKeyValueLine('Date', details?.systemIndex?.eventDate || context.eventDate || 'TBD'),
      buildKeyValueLine('Start', role.startTime),
      buildKeyValueLine('End', role.endTime),
      buildKeyValueLine('Reports To', role.reportsTo || 'Host')
    );

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Setup', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(...buildCheckboxList(role.setup));

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Course Tasks', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    if (Array.isArray(role.courseTasks)) {
      role.courseTasks.forEach(courseBlock => {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: courseBlock.courseType || 'Course', size: 24, bold: true, color: COLORS.navy })]
          })
        );
        children.push(...buildCheckboxList(courseBlock.tasks));
      });
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Transitions', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(...buildCheckboxList(role.transitions));

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'End of Night', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(...buildCheckboxList(role.endOfNight));

    children.push(new Paragraph({ children: [new PageBreak()] }));
  });

  return children;
}

function buildMasterShoppingList(details, context) {
  const list = details?.masterShoppingList?.categories || [];
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Master Shopping List', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  if (!list.length) {
    children.push(new Paragraph({ children: [new TextRun('Shopping list data not available.')] }));
  } else {
    list.forEach(category => {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: category.name || 'Category', size: 26, bold: true, color: COLORS.gold })]
        })
      );
      (category.items || []).forEach(item => {
        const usQty = item.quantity !== undefined ? `${item.quantity} ${item.unit || ''}`.trim() : '';
        const metricQty = item.metricQuantity !== undefined ? `${item.metricQuantity} ${item.metricUnit || ''}`.trim() : '';
        const detail = metricQty ? ` (${metricQty})` : '';
        const line = `□  ${item.item || 'Item'} - ${usQty}${detail}`.trim();
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      });
    });
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildRecipeModules(menu, details, recipes) {
  const recipeList = Array.isArray(details?.recipes) && details.recipes.length
    ? details.recipes
    : Array.isArray(recipes) ? recipes : [];

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Recipe Modules', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  recipeList.forEach((recipe, idx) => {
    const course = menu?.courses?.[idx];
    const title = course ? `${course.type}: ${course.name}` : recipe.title || `Recipe ${idx + 1}`;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: idx > 0,
        children: [new TextRun({ text: title, size: 32, bold: true, color: COLORS.navy })]
      }),
      buildKeyValueLine('Serves', recipe.serves),
      buildKeyValueLine('Yield', recipe.yield),
      buildKeyValueLine('Active Time', recipe.activeTime),
      buildKeyValueLine('Total Time', recipe.totalTime)
    );

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Equipment', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(...buildBulletList(recipe.equipment));

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Ingredients', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(...buildBulletList(recipe.ingredients));

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Steps', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    if (Array.isArray(recipe.steps)) {
      recipe.steps.forEach(step => {
        children.push(new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun(step)] }));
      });
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Holding Instructions', size: 26, bold: true, color: COLORS.gold })]
      }),
      new Paragraph({ children: [new TextRun(recipe.holding || 'TBD')] })
    );

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: 'Failure Points', size: 26, bold: true, color: COLORS.gold })]
      })
    );
    children.push(...buildBulletList(recipe.failurePoints));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildExecutionPacket(details, menu) {
  const packet = Array.isArray(details?.executionPacket) && details.executionPacket.length
    ? details.executionPacket
    : Array.isArray(details?.recipes)
      ? details.recipes.map((recipe, idx) => ({
          courseType: menu?.courses?.[idx]?.type || `Course ${idx + 1}`,
          title: recipe.title || menu?.courses?.[idx]?.name || `Course ${idx + 1}`,
          steps: recipe.steps || []
        }))
      : [];

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Day-Of Execution Packet', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  packet.forEach((entry, idx) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: idx > 0,
        children: [new TextRun({ text: `${entry.courseType} - ${entry.title}`, size: 32, bold: true, color: COLORS.navy })]
      })
    );
    children.push(...buildCheckboxList(entry.steps));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildEquipmentConstraints(details) {
  const equipment = details?.equipmentConstraints || {};
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Equipment & Capacity Constraints', size: 48, bold: true, color: COLORS.navy })]
    }),
    buildKeyValueLine('Stations Required', equipment.stationsRequired),
    buildKeyValueLine('Burners Required', equipment.burnersRequired)
  ];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Oven Conflicts', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildBulletList(equipment.ovenConflicts)
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Fridge Constraints', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildBulletList(equipment.fridgeConstraints)
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Holding Windows', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildBulletList(equipment.holdingWindows)
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Resolutions', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildBulletList(equipment.resolutions)
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildContingencies(details) {
  const contingencies = Array.isArray(details?.contingencies) ? details.contingencies : [];
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Failure & Contingency Notes', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  if (!contingencies.length) {
    children.push(new Paragraph({ children: [new TextRun('No contingency notes provided.')] }));
  } else {
    contingencies.forEach(item => {
      children.push(
        new Paragraph({ children: [new TextRun({ text: `Issue: ${item.issue || 'TBD'}`, bold: true })] }),
        new Paragraph({ children: [new TextRun(`Fix: ${item.fix || 'TBD'}`)] })
      );
    });
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildCleanupReset(details) {
  const cleanup = details?.cleanupReset || {};
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Cleanup & Reset', size: 48, bold: true, color: COLORS.navy })]
    })
  ];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Immediate', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildCheckboxList(cleanup.immediate)
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Later', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildCheckboxList(cleanup.later)
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Leftovers', size: 26, bold: true, color: COLORS.gold })]
    }),
    ...buildCheckboxList(cleanup.leftovers)
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildArchiveMetadata(details, context) {
  const archive = details?.archiveMetadata || {};
  const params = archive.parameters || {};
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Archive & Reuse Metadata', size: 48, bold: true, color: COLORS.navy })]
    }),
    buildKeyValueLine('Version', archive.version || 'TBD'),
    buildKeyValueLine('Generated', archive.generatedAt || new Date().toISOString().split('T')[0]),
    buildKeyValueLine('Guest Count', params.guestCount || context.guestCount || 'TBD'),
    buildKeyValueLine('Menu Style', params.menuStyle || context.menuStyle || 'TBD'),
    buildKeyValueLine('Service Style', params.serviceStyle || context.serviceStyle || 'TBD'),
    new Paragraph({
      spacing: { before: 300 },
      children: [new TextRun({ text: 'Notes:', bold: true, color: COLORS.navy })]
    }),
    new Paragraph({ children: [new TextRun(' ') ] })
  ];

  return children;
}

function buildNotesPages() {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Notes', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: 'Space for your personal notes, adjustments, and memories from the evening.', size: 22, italics: true, color: COLORS.textLight })]
    })
  ];
  
  // Add blank lines for notes
  for (let i = 0; i < 20; i++) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: '_______________________________________________________________', color: COLORS.textLight })]
      })
    );
  }
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildCopyright(context) {
  const year = new Date().getFullYear();
  
  return [
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '◆', size: 32, color: COLORS.gold })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: COPYRIGHT_TEXT, size: 20, italics: true, color: COLORS.textLight })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: `© ${year} Generated for personal use.`, size: 18, color: COLORS.textLight })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: 'Created with Dinner Party Planner', size: 20, color: COLORS.textLight })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
      children: [new TextRun({ text: 'AI-assisted recipe development', size: 18, italics: true, color: COLORS.textLight })]
    })
  ];
}

module.exports = { buildCookbook };

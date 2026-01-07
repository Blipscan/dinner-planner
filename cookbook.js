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

// Build complete cookbook document
async function buildCookbook(menu, context, staffing, recipes) {
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
        // ========== COVER PAGE ==========
        ...buildCoverPage(menu, context),
        
        // ========== MENU OVERVIEW ==========
        ...buildMenuOverview(menu),
        
        // ========== WINE PROGRAM ==========
        ...buildWineProgram(menu, context),
        
        // ========== RECIPES ==========
        ...buildRecipes(menu, recipes),
        
        // ========== SHOPPING LIST ==========
        ...buildShoppingList(menu, context, recipes),
        
        // ========== DAY BEFORE PREP ==========
        ...buildDayBeforePrep(menu, staffingInfo),
        
        // ========== DAY OF TIMELINE ==========
        ...buildDayOfTimeline(menu, context, staffingInfo),
        
        // ========== PLATING GUIDES ==========
        ...buildPlatingGuides(menu),
        
        // ========== TABLE SETTING ==========
        ...buildTableSetting(menu, context, guestNames),
        
        // ========== SERVICE NOTES ==========
        ...buildServiceNotes(menu, staffingInfo),
        
        // ========== AMBIANCE & MUSIC ==========
        ...buildAmbianceGuide(menu, context),
        
        // ========== FINAL CHECKLIST ==========
        ...buildFinalChecklist(menu, context),
        
        // ========== AI IMAGE PROMPTS ==========
        ...buildImagePrompts(menu, context),
        
        // ========== NOTES PAGES ==========
        ...buildNotesPages(),
        
        // ========== COPYRIGHT ==========
        ...buildCopyright(context)
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

function buildMenuOverview(menu) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'The Menu', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({ spacing: { after: 300 }, children: [] })
  ];
  
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

function buildWineProgram(menu, context) {
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
  
  wines.forEach(course => {
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

function buildShoppingList(menu, context, recipes) {
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
  
  const categories = ['Proteins', 'Seafood', 'Produce', 'Dairy & Eggs', 'Pantry', 'Wine & Beverages', 'Special Ingredients'];
  
  categories.forEach(cat => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: cat, size: 26, bold: true, color: COLORS.gold })]
      }),
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Items based on your menu')] }),
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  ')] }),
      new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  ')] })
    );
  });
  
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400 },
      children: [new TextRun({ text: 'Shopping Notes', size: 32, bold: true, color: COLORS.navy })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Shop for proteins and seafood 1-2 days before')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Buy produce day-before for peak freshness')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Wine can be purchased a week ahead')] }),
    new Paragraph({ children: [new PageBreak()] })
  );
  
  return children;
}

function buildDayBeforePrep(menu, staffingInfo) {
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
  
  const tasks = [
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

function buildDayOfTimeline(menu, context, staffingInfo) {
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
  const timeline = [
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
    { time: '0', task: '🍽️ GUESTS ARRIVE — Service begins' },
    { time: '+15 min', task: 'Serve amuse-bouche' },
    { time: '+30 min', task: 'Fire first course' },
    { time: '+50 min', task: 'Clear, serve second course' },
    { time: '+80 min', task: 'Fire main course' },
    { time: '+110 min', task: 'Clear, prepare dessert' },
    { time: '+130 min', task: 'Serve dessert and dessert wine' }
  ];
  
  timeline.forEach(item => {
    children.push(
      new Paragraph({
        spacing: { before: 100 },
        children: [
          new TextRun({ text: item.time.padEnd(12), bold: true, color: COLORS.gold, size: 22 }),
          new TextRun({ text: item.task, size: 22 })
        ]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildPlatingGuides(menu) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Plating Guides', size: 48, bold: true, color: COLORS.navy })] 
    })
  ];
  
  menu.courses.forEach(course => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: course.type, size: 26, bold: true, color: COLORS.gold })]
      }),
      new Paragraph({
        children: [new TextRun({ text: course.name, bold: true, size: 24, color: COLORS.navy })]
      }),
      new Paragraph({
        spacing: { before: 100 },
        children: [new TextRun({ text: 'Plate: Choose appropriate size for portion', size: 20, color: COLORS.textLight })]
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Placement: Center the protein, sauce underneath or alongside', size: 20, color: COLORS.textLight })]
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Garnish: Fresh herbs, microgreens, or edible flowers', size: 20, color: COLORS.textLight })]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: 'Temperature: Warm plates for hot courses, chilled for cold', size: 20, color: COLORS.textLight })]
      })
    );
  });
  
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildTableSetting(menu, context, guestNames) {
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
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Charger plate (remove before main)')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Dinner fork, salad fork (outside in)')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Dinner knife, soup spoon')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Dessert spoon above plate')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Water glass, white wine glass, red wine glass')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Cloth napkin, folded or in ring')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Place card')] })
  ];
  
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

function buildServiceNotes(menu, staffingInfo) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Service Notes', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Pacing', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Allow 15-20 minutes between courses')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Watch for guests finishing — clear when 80% done')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Never rush; better to slow down than speed up')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Wine Service', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Pour from guest\'s right side')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Fill glasses 1/3 to 1/2 full')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Offer water throughout')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Clearing', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Clear from right, serve from left')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Remove all plates before bringing next course')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Crumb table before dessert')] }),
    new Paragraph({ children: [new PageBreak()] })
  ];
  
  return children;
}

function buildAmbianceGuide(menu, context) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Ambiance & Music', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Lighting', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Dim overhead lights to 40-50%')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Use candles as primary table lighting')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Unscented candles only near food')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Music Suggestions', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Arrival: Upbeat jazz or bossa nova')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Dinner: Soft jazz, classical, or acoustic')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Dessert: Slightly more energy, still conversational')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Volume: Background only — guests should never strain to talk')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Temperature', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Set thermostat 2-3° cooler than normal')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('Room will warm with guests and cooking')] }),
    new Paragraph({ children: [new PageBreak()] })
  ];
  
  return children;
}

function buildFinalChecklist(menu, context) {
  const children = [
    new Paragraph({ 
      heading: HeadingLevel.HEADING_1, 
      children: [new TextRun({ text: 'Final Checklist', size: 48, bold: true, color: COLORS.navy })] 
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'One Week Before', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Confirm guest count and dietary restrictions')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Order specialty ingredients')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Purchase wines')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Test any new recipes')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Day Before', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Complete all make-ahead prep')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Set table completely')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Chill white wines')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Clean kitchen and clear workspace')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Day Of', size: 26, bold: true, color: COLORS.gold })]
    }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Follow timeline')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Final taste and season all dishes')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Light candles 10 minutes before arrival')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Start music')] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun('□  Take a breath — you\'ve got this!')] }),
    new Paragraph({ children: [new PageBreak()] })
  ];
  
  return children;
}

function buildImagePrompts(menu, context) {
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
  
  menu.courses.forEach(course => {
    const prompt = `Professional food photography of ${course.name}, elegant plating on white porcelain, soft natural lighting, shallow depth of field, fine dining presentation, 85mm lens, Michelin star quality --ar 4:3 --v 6`;
    
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: course.type, size: 26, bold: true, color: COLORS.gold })]
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

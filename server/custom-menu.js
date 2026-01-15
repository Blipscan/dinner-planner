const COURSE_TYPES = ["Amuse-Bouche", "First Course", "Second Course", "Main Course", "Dessert"];
const CUSTOM_MENU_OPTIONS = [
  { label: "Classic", personality: "A classic, timeless execution of your requested courses." },
  { label: "Deconstructed", personality: "Deconstructed plating that keeps flavors intact while changing form." },
  { label: "Modernist", personality: "Modernist techniques and refined textures across your requested courses." },
  { label: "Global Slant", personality: "International flavor accents that reinterpret your requested courses." },
  { label: "Elevated", personality: "An elevated, special-occasion version of your requested courses." },
];
const COURSE_TYPE_ALIASES = {
  "amuse-bouche": "Amuse-Bouche",
  "amuse bouche": "Amuse-Bouche",
  amuse: "Amuse-Bouche",
  appetizer: "Amuse-Bouche",
  starter: "Amuse-Bouche",
  "first course": "First Course",
  first: "First Course",
  "second course": "Second Course",
  second: "Second Course",
  "main course": "Main Course",
  main: "Main Course",
  entree: "Main Course",
  dessert: "Dessert",
  sweet: "Dessert",
};

function extractCustomMenuItems(customMenu) {
  if (!customMenu || typeof customMenu !== "string") return [];
  let lines = customMenu
    .split("\n")
    .map((line) => line.replace(/^[\s*\-•\d.)]+/, "").trim())
    .filter(Boolean);

  if (lines.length === 1) {
    const parts = lines[0]
      .split(/[;,|/]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      lines = parts;
    }
  }

  return lines.slice(0, COURSE_TYPES.length);
}

function getExplicitCourseType(text) {
  const match = text.match(
    /^(amuse(?:-bouche)?|amuse bouche|appetizer|starter|first course|first|second course|second|main course|main|entree|dessert|sweet)\s*[:\-–—]\s*(.+)$/i
  );
  if (!match) return null;
  const label = match[1].toLowerCase();
  const remainder = match[2]?.trim() || "";
  const type = COURSE_TYPE_ALIASES[label] || null;
  if (!type) return null;
  return { type, text: remainder || text };
}

function inferCourseTypeFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (/(dessert|pie|tart|cake|cookie|ice cream|sorbet|pudding)/.test(normalized)) {
    return "Dessert";
  }
  if (/(amuse|appetizer|starter|canape|crostini)/.test(normalized)) {
    return "Amuse-Bouche";
  }
  if (/(salad|soup|gazpacho|ceviche|carpaccio)/.test(normalized)) {
    return "First Course";
  }
  if (/(shrimp|pasta|risotto|gnocchi|seafood|fish|scallop)/.test(normalized)) {
    return "Second Course";
  }
  if (/(beef|steak|lamb|pork|chicken|duck|turkey|entree|main)/.test(normalized)) {
    return "Main Course";
  }
  return null;
}

function getDefaultCourseOrder(count) {
  if (count <= 1) return ["Main Course"];
  if (count === 2) return ["First Course", "Main Course"];
  if (count === 3) return ["First Course", "Main Course", "Dessert"];
  if (count === 4) return ["First Course", "Second Course", "Main Course", "Dessert"];
  return COURSE_TYPES.slice();
}

function mapIdeasToCourses(ideas) {
  const courseIdeas = Array(COURSE_TYPES.length).fill(null);
  const untyped = [];
  let assignedCount = 0;

  ideas.forEach((idea) => {
    const explicit = getExplicitCourseType(idea);
    if (explicit) {
      const index = COURSE_TYPES.indexOf(explicit.type);
      if (index !== -1 && !courseIdeas[index]) {
        courseIdeas[index] = explicit.text;
        assignedCount += 1;
        return;
      }
    }
    untyped.push(idea);
  });

  const remaining = [];
  untyped.forEach((idea) => {
    const inferred = inferCourseTypeFromText(idea);
    const index = inferred ? COURSE_TYPES.indexOf(inferred) : -1;
    if (index !== -1 && !courseIdeas[index]) {
      courseIdeas[index] = idea;
      assignedCount += 1;
    } else {
      remaining.push(idea);
    }
  });

  if (remaining.length) {
    const targetOrder =
      assignedCount === 0 ? getDefaultCourseOrder(remaining.length) : COURSE_TYPES.slice();
    remaining.forEach((idea) => {
      const nextType = targetOrder.find((type) => {
        const idx = COURSE_TYPES.indexOf(type);
        return idx !== -1 && !courseIdeas[idx];
      });
      if (!nextType) return;
      const index = COURSE_TYPES.indexOf(nextType);
      courseIdeas[index] = idea;
    });
  }

  return courseIdeas;
}

function buildCustomMenusFromIdeas(ideas, context) {
  const foodBudget = context?.foodBudget || "$45-60";
  const wineBudget = context?.wineBudget || "$80-120";
  const courseIdeas = mapIdeasToCourses(ideas);
  const fallbacks = {
    "Amuse-Bouche": "Chef's amuse-bouche selection",
    "First Course": "Seasonal first course",
    "Second Course": "Light second course",
    "Main Course": "Signature main course",
    "Dessert": "House dessert",
  };
  return CUSTOM_MENU_OPTIONS.map((option, idx) => ({
    id: idx + 1,
    title: `${option.label} Interpretation`,
    personality: option.personality,
    foodCost: `${foodBudget}/person`,
    wineCost: `${wineBudget} total`,
    courses: COURSE_TYPES.map((type, courseIndex) => {
      const idea = courseIdeas[courseIndex];
      const name = idea ? `${idea} (${option.label.toLowerCase()} variation)` : fallbacks[type];
      const wine = type === "Amuse-Bouche" || type === "Second Course" ? null : "Sommelier selection";
      return { type, name, wine };
    }),
  }));
}

function buildCustomMenuPrompt(customMenu, ideas) {
  if (!customMenu) return "";
  const lines = ideas.length
    ? ideas.map((item, idx) => `- Course ${idx + 1}: ${item}`).join("\n")
    : customMenu.trim();
  return `

Host provided desired courses. Use these as the foundation and keep the same course order.
${lines}

Requirements for custom menu:
- Each of the 5 menus must preserve the requested course ideas.
- Provide options by varying preparation, ingredients, or style, but do not replace the course themes.
- Keep the same number of courses in the same order.
- Start each course name with the host's course text, then add a variation descriptor.
- Use these style lenses for the five options: Classic, Deconstructed, Modernist, Global slant, Elevated.
`;
}

function normalizeText(value) {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function ideaMatchesCourse(idea, courseName) {
  const ideaText = normalizeText(idea);
  const courseText = normalizeText(courseName);
  if (!ideaText || !courseText) return false;
  if (courseText.includes(ideaText)) return true;
  const ideaWords = ideaText.split(" ").filter((word) => word.length >= 3);
  if (!ideaWords.length) return false;
  const matched = ideaWords.filter((word) => courseText.includes(word));
  return matched.length >= Math.min(2, ideaWords.length);
}

function menuRespectsCustomIdeas(menu, ideas) {
  if (!ideas.length) return true;
  const courseIdeas = mapIdeasToCourses(ideas);
  if (!menu?.courses) return false;
  return courseIdeas.every((idea, idx) => (idea ? ideaMatchesCourse(idea, menu.courses[idx]?.name) : true));
}

function menusRespectCustomIdeas(menus, ideas) {
  if (!ideas.length) return true;
  return Array.isArray(menus) && menus.length > 0 && menus.every((menu) => menuRespectsCustomIdeas(menu, ideas));
}

module.exports = {
  COURSE_TYPES,
  CUSTOM_MENU_OPTIONS,
  extractCustomMenuItems,
  buildCustomMenusFromIdeas,
  buildCustomMenuPrompt,
  mapIdeasToCourses,
  menusRespectCustomIdeas,
};

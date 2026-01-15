const COURSE_TYPES = ["Amuse-Bouche", "First Course", "Second Course", "Main Course", "Dessert"];
const CUSTOM_MENU_OPTIONS = [
  { label: "Classic", personality: "A classic, timeless execution of your requested courses." },
  { label: "Deconstructed", personality: "Deconstructed plating that keeps flavors intact while changing form." },
  { label: "Modernist", personality: "Modernist techniques and refined textures across your requested courses." },
  { label: "Global Slant", personality: "International flavor accents that reinterpret your requested courses." },
  { label: "Elevated", personality: "An elevated, special-occasion version of your requested courses." },
];

function extractCustomMenuItems(customMenu) {
  if (!customMenu || typeof customMenu !== "string") return [];
  return customMenu
    .split("\n")
    .map((line) => line.replace(/^[\s*\-•\d.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, COURSE_TYPES.length);
}

function buildCustomMenusFromIdeas(ideas, context) {
  const foodBudget = context?.foodBudget || "$45-60";
  const wineBudget = context?.wineBudget || "$80-120";
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
      const idea = ideas[courseIndex];
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
  if (!menu?.courses || menu.courses.length < ideas.length) return false;
  return ideas.every((idea, idx) => ideaMatchesCourse(idea, menu.courses[idx]?.name));
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
  menusRespectCustomIdeas,
};

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COURSE_TYPES,
  CUSTOM_MENU_OPTIONS,
  extractCustomMenuItems,
  buildCustomMenusFromIdeas,
  buildCustomMenuPrompt,
  mapIdeasToCourses,
  menusRespectCustomIdeas,
} = require("../custom-menu");

test("extractCustomMenuItems trims bullets and limits courses", () => {
  const input = `
  1. Amuse: Caviar blini
  - First: Citrus salad
  • Second: Risotto
  Main Course: Roast chicken
  Dessert: Lemon tart
  Extra: Should be ignored
  `;
  const items = extractCustomMenuItems(input);
  assert.equal(items.length, COURSE_TYPES.length);
  assert.equal(items[0], "Amuse: Caviar blini");
  assert.equal(items[4], "Dessert: Lemon tart");
});

test("buildCustomMenusFromIdeas preserves ideas and count", () => {
  const ideas = ["Amuse: Oyster", "Salad", "Soup", "Steak", "Chocolate tart"];
  const mapped = mapIdeasToCourses(ideas);
  const menus = buildCustomMenusFromIdeas(ideas, { foodBudget: "$50-60", wineBudget: "$120" });
  assert.equal(menus.length, CUSTOM_MENU_OPTIONS.length);
  menus.forEach((menu) => {
    assert.equal(menu.courses.length, COURSE_TYPES.length);
    mapped.forEach((idea, idx) => {
      if (idea) {
        assert.ok(menu.courses[idx].name.includes(idea));
      }
    });
  });
});

test("mapIdeasToCourses aligns four items without amuse", () => {
  const ideas = ["Salad", "Shrimp", "Beef", "Pie"];
  const mapped = mapIdeasToCourses(ideas);
  assert.equal(mapped[0], null);
  assert.equal(mapped[1], "Salad");
  assert.equal(mapped[2], "Shrimp");
  assert.equal(mapped[3], "Beef");
  assert.equal(mapped[4], "Pie");
});

test("menusRespectCustomIdeas validates course alignment", () => {
  const ideas = ["Citrus salad"];
  const badMenus = [{ courses: [{ name: "Braised short rib" }] }];
  assert.equal(menusRespectCustomIdeas(badMenus, ideas), false);
});

test("buildCustomMenuPrompt includes host course lines", () => {
  const ideas = ["Amuse: Tuna tartare", "Main: Duck confit"];
  const prompt = buildCustomMenuPrompt(ideas.join("\n"), ideas);
  assert.ok(prompt.includes("Host provided desired courses"));
  assert.ok(prompt.includes("Course 1: Amuse: Tuna tartare"));
  assert.ok(prompt.includes("Course 2: Main: Duck confit"));
});

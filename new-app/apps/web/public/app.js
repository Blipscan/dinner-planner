"use strict";

const STORAGE_KEY = "dinnerPlanner.newApp.state";

const FETCH_TIMEOUTS_MS = {
  chat: 15000,
  menus: 25000,
  details: 20000,
  cookbook: 20000,
};

let DATA = {};
let currentStep = 1;
let maxStepReached = 1;

let accessCode = "";
let accessValidated = false;
let isAdmin = false;
let remainingGenerations = null;

let selectedInspiration = null;
let selectedStyle = null;
let selectedCuisine = null;
let selectedCuisineCountry = null;
let selectedSubCuisine = null;

let likes = [];
let dislikes = [];
let restrictions = [];

let selectedExpert = null;
let chatHistory = [];

let menus = [];
let selectedMenuIndex = null;
let rejectionHistory = [];

let selectedStaffing = null;
let menuDetailsCache = {};
let selectedMenuDetails = null;

let cookbookId = null;

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateValue(value) {
  if (!value) return "";
  return value;
}

function formatTimeValue(value) {
  if (!value) return "";
  return value;
}

function parseGuestList(value) {
  if (!value) return [];
  return value
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

function allowDemoFallback() {
  return false;
}

function saveState() {
  const payload = {
    currentStep,
    maxStepReached,
    accessCode,
    accessValidated,
    isAdmin,
    remainingGenerations,
    selectedInspiration,
    selectedStyle,
    selectedCuisine,
    selectedCuisineCountry,
    selectedSubCuisine,
    likes,
    dislikes,
    restrictions,
    selectedExpert,
    chatHistory,
    menus,
    selectedMenuIndex,
    rejectionHistory,
    selectedStaffing,
    menuDetailsCache,
    selectedMenuDetails,
    cookbookId,
    event: {
      eventTitle: $("#eventTitle")?.value || "",
      eventDate: $("#eventDate")?.value || "",
      serviceTime: $("#serviceTime")?.value || "",
      guestCount: $("#guestCount")?.value || "",
      foodBudget: $("#foodBudget")?.value || "",
      wineBudget: $("#wineBudget")?.value || "",
      skillLevel: $("#skillLevel")?.value || "intermediate",
      guestList: $("#guestList")?.value || "",
      diningSpace: $("#diningSpace")?.value || "",
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    currentStep = payload.currentStep || 1;
    maxStepReached = payload.maxStepReached || 1;
    accessCode = payload.accessCode || "";
    accessValidated = payload.accessValidated || false;
    isAdmin = payload.isAdmin || false;
    remainingGenerations = payload.remainingGenerations || null;
    selectedInspiration = payload.selectedInspiration || null;
    selectedStyle = payload.selectedStyle || null;
    selectedCuisine = payload.selectedCuisine || null;
    selectedCuisineCountry = payload.selectedCuisineCountry || null;
    selectedSubCuisine = payload.selectedSubCuisine || null;
    likes = payload.likes || [];
    dislikes = payload.dislikes || [];
    restrictions = payload.restrictions || [];
    selectedExpert = payload.selectedExpert || null;
    chatHistory = payload.chatHistory || [];
    menus = payload.menus || [];
    selectedMenuIndex = payload.selectedMenuIndex ?? null;
    rejectionHistory = payload.rejectionHistory || [];
    selectedStaffing = payload.selectedStaffing || null;
    menuDetailsCache = payload.menuDetailsCache || {};
    selectedMenuDetails = payload.selectedMenuDetails || null;
    cookbookId = payload.cookbookId || null;

    if (payload.event) {
      $("#eventTitle").value = payload.event.eventTitle || "";
      $("#eventDate").value = payload.event.eventDate || "";
      $("#serviceTime").value = payload.event.serviceTime || "";
      $("#guestCount").value = payload.event.guestCount || "";
      $("#foodBudget").value = payload.event.foodBudget || "";
      $("#wineBudget").value = payload.event.wineBudget || "";
      $("#skillLevel").value = payload.event.skillLevel || "intermediate";
      $("#guestList").value = payload.event.guestList || "";
      $("#diningSpace").value = payload.event.diningSpace || "";
    }

    $("#accessCode").value = accessCode;
  } catch (err) {
    console.warn("Unable to load saved state.", err);
  }
}

function updateProgress() {
  document.querySelectorAll(".progress-step").forEach((stepButton) => {
    const step = parseInt(stepButton.dataset.step, 10);
    stepButton.classList.remove("active", "complete");
    stepButton.disabled = step > maxStepReached;

    if (step < currentStep) {
      stepButton.classList.add("complete");
    } else if (step === currentStep) {
      stepButton.classList.add("active");
    }
  });

  document.querySelectorAll(".progress-line").forEach((line) => {
    const step = parseInt(line.dataset.line, 10);
    line.classList.toggle("complete", step < currentStep);
  });
}

function goToStep(step) {
  currentStep = step;
  if (step > maxStepReached) {
    maxStepReached = step;
  }
  document.querySelectorAll(".step").forEach((section) => section.classList.add("hidden"));
  $(`#step-${step}`)?.classList.remove("hidden");
  updateProgress();
  saveState();

  if (step === 6 && selectedMenuIndex !== null) {
    renderMenuSummary();
    loadMenuDetails();
  }

  if (step === 7) {
    renderCookbookSections();
    renderPrintProducts();
    updateCookbookStatus();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showInlineMessage(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "var(--error)" : "var(--text-light)";
}

function normalizeWineTiers(wine) {
  if (!wine) {
    return {
      worldwideTopRated: null,
      domesticTopRated: null,
      budgetTopRated: null,
      bondPick: null,
    };
  }
  if (typeof wine === "string") {
    return {
      worldwideTopRated: wine,
      domesticTopRated: null,
      budgetTopRated: null,
      bondPick: null,
    };
  }
  return {
    worldwideTopRated: wine.worldwideTopRated || wine.worldwide || null,
    domesticTopRated: wine.domesticTopRated || wine.domestic || null,
    budgetTopRated: wine.budgetTopRated || wine.budget || null,
    bondPick: wine.bondPick || wine.bond || null,
  };
}

function normalizeWinePairings(menu, winePairings) {
  const menuCourses = menu?.courses || [];
  const source = Array.isArray(winePairings) && winePairings.length ? winePairings : menuCourses;
  return source.map((course, index) => {
    const fallback = menuCourses[index] || {};
    const type = course.type || fallback.type || `Course ${index + 1}`;
    const name = course.name || fallback.name || "";
    const wine = normalizeWineTiers(course.wine || fallback.wine);
    return { type, name, wine };
  });
}

function renderInspirations() {
  const grid = $("#inspirationGrid");
  if (!grid) return;
  grid.innerHTML = (DATA.MENU_INSPIRATIONS || [])
    .map((item) => {
      const selectedClass = selectedInspiration === item.id ? "selected" : "";
      return `
        <div class="choice-card ${selectedClass}" data-inspiration="${escapeHtml(item.id)}">
          <div class="choice-title">${escapeHtml(item.title)}</div>
          <div class="choice-desc">${escapeHtml(item.desc)}</div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".choice-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedInspiration = card.dataset.inspiration;
      renderInspirations();
      saveState();
    });
  });
}

function renderStyles() {
  const grid = $("#styleGrid");
  if (!grid) return;
  grid.innerHTML = (DATA.MENU_STYLES || [])
    .map((item) => {
      const selectedClass = selectedStyle === item.id ? "selected" : "";
      return `
        <div class="choice-card ${selectedClass}" data-style="${escapeHtml(item.id)}">
          <div class="choice-title">${escapeHtml(item.name)}</div>
          <div class="choice-desc">${escapeHtml(item.desc)}</div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".choice-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedStyle = card.dataset.style;
      renderStyles();
      saveState();
    });
  });
}

function renderCuisineChips() {
  const container = $("#cuisineChips");
  if (!container) return;
  const entries = Object.entries(DATA.CUISINES || {});
  container.innerHTML = entries
    .map(([key, cuisine]) => {
      const selectedClass = selectedCuisine === key ? "selected" : "";
      return `<button class="chip ${selectedClass}" data-cuisine="${escapeHtml(key)}">${escapeHtml(
        cuisine.label
      )}</button>`;
    })
    .join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.cuisine;
      if (selectedCuisine === key) {
        selectedCuisine = null;
        selectedCuisineCountry = null;
        selectedSubCuisine = null;
      } else {
        selectedCuisine = key;
        selectedCuisineCountry = null;
        selectedSubCuisine = null;
      }
      renderCuisineChips();
      renderCuisineSubchoices();
      saveState();
    });
  });
}

function renderCuisineSubchoices() {
  const container = $("#cuisineSubchoices");
  if (!container) return;
  if (!selectedCuisine) {
    container.innerHTML = "";
    return;
  }

  const cuisine = DATA.CUISINES?.[selectedCuisine];
  if (!cuisine) {
    container.innerHTML = "";
    return;
  }

  let html = "";
  if (cuisine.countries) {
    html += `<div class="chip-row">`;
    html += Object.entries(cuisine.countries)
      .map(([key, country]) => {
        const selectedClass = selectedCuisineCountry === key ? "selected" : "";
        return `<button class="chip ${selectedClass}" data-country="${escapeHtml(key)}">${escapeHtml(
          country.label
        )}</button>`;
      })
      .join("");
    html += `</div>`;

    if (selectedCuisineCountry) {
      const country = cuisine.countries[selectedCuisineCountry];
      if (country?.regions?.length) {
        html += `<div class="chip-row">`;
        html += country.regions
          .map((region) => {
            const value = `${country.label} - ${region}`;
            const selectedClass = selectedSubCuisine === value ? "selected" : "";
            return `<button class="chip ${selectedClass}" data-subcuisine="${escapeHtml(value)}">${escapeHtml(
              region
            )}</button>`;
          })
          .join("");
        html += `</div>`;
      }
    }
  }

  if (cuisine.regions) {
    html += `<div class="chip-row">`;
    html += cuisine.regions
      .map((region) => {
        const selectedClass = selectedSubCuisine === region ? "selected" : "";
        return `<button class="chip ${selectedClass}" data-subcuisine="${escapeHtml(region)}">${escapeHtml(
          region
        )}</button>`;
      })
      .join("");
    html += `</div>`;
  }

  if (cuisine.styles) {
    html += `<div class="chip-row">`;
    html += cuisine.styles
      .map((style) => {
        const selectedClass = selectedSubCuisine === style ? "selected" : "";
        return `<button class="chip ${selectedClass}" data-subcuisine="${escapeHtml(style)}">${escapeHtml(
          style
        )}</button>`;
      })
      .join("");
    html += `</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll("[data-country]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.country;
      if (selectedCuisineCountry === key) {
        selectedCuisineCountry = null;
        selectedSubCuisine = null;
      } else {
        selectedCuisineCountry = key;
        selectedSubCuisine = null;
      }
      renderCuisineSubchoices();
      saveState();
    });
  });

  container.querySelectorAll("[data-subcuisine]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const value = chip.dataset.subcuisine;
      selectedSubCuisine = selectedSubCuisine === value ? null : value;
      renderCuisineSubchoices();
      saveState();
    });
  });
}

function renderChipList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = items
    .map(
      (item, index) =>
        `<button class="chip selected" data-index="${index}">${escapeHtml(item)} &#10005;</button>`
    )
    .join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = parseInt(button.dataset.index, 10);
      items.splice(idx, 1);
      renderChipList(containerId, items);
      saveState();
    });
  });
}

function setupChipInput(inputId, listId, items) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    items.push(value);
    input.value = "";
    renderChipList(listId, items);
    saveState();
  });
}

function renderExperts() {
  const grid = $("#expertGrid");
  if (!grid) return;
  const entries = Object.entries(DATA.personas || {});
  grid.innerHTML = entries
    .map(([key, persona]) => {
      const selectedClass = selectedExpert === key ? "selected" : "";
      return `
        <div class="expert-card ${selectedClass}" data-expert="${escapeHtml(key)}">
          <div class="expert-name">${escapeHtml(persona.name)}</div>
          <div class="expert-cred">${escapeHtml(persona.credentials)}</div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".expert-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedExpert = card.dataset.expert;
      renderExperts();
      updateChatHeader();
      saveState();
    });
  });
}

function updateChatHeader() {
  const title = $("#chatTitle");
  const subtitle = $("#chatSubtitle");
  const status = $("#chatStatus");
  if (!title || !subtitle || !status) return;

  if (!selectedExpert) {
    title.textContent = "Select an expert to begin";
    subtitle.textContent = "Your conversation will guide menu creation.";
    status.textContent = "Offline";
    return;
  }

  const persona = DATA.personas?.[selectedExpert];
  title.textContent = persona?.name || "Expert";
  subtitle.textContent = persona?.philosophy || "Ask for guidance on menu and timing.";
  status.textContent = "Ready";
}

function renderChat() {
  const container = $("#chatMessages");
  if (!container) return;
  if (!chatHistory.length) {
    container.innerHTML = `<div class="inline-message">Introduce your vision to start the conversation.</div>`;
    return;
  }

  container.innerHTML = chatHistory
    .map((message) => {
      const roleClass = message.role === "user" ? "user" : "assistant";
      return `
        <div class="chat-message ${roleClass}">
          <div class="chat-bubble">${escapeHtml(message.content)}</div>
        </div>
      `;
    })
    .join("");
  container.scrollTop = container.scrollHeight;
}

async function sendChat() {
  const input = $("#chatInput");
  if (!input || !selectedExpert) {
    showInlineMessage("preferenceMessage", "Select an expert before chatting.", true);
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  chatHistory.push({ role: "user", content: text });
  input.value = "";
  renderChat();
  saveState();

  chatHistory.push({ role: "assistant", content: "..." });
  renderChat();

  try {
    const res = await fetchWithTimeout(
      "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: selectedExpert,
          messages: chatHistory.slice(0, -1),
          context: buildContext(),
        }),
      },
      FETCH_TIMEOUTS_MS.chat
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const message = data.detail || data.error || "Chat is unavailable. Please try again.";
      chatHistory[chatHistory.length - 1] = { role: "assistant", content: message };
      renderChat();
      saveState();
      return;
    }
    chatHistory[chatHistory.length - 1] = {
      role: "assistant",
      content: data.response || "I am here to help. Tell me more about your guests.",
    };
    renderChat();
    saveState();
  } catch (err) {
    chatHistory[chatHistory.length - 1] = {
      role: "assistant",
      content: "I am having trouble connecting. Please try again.",
    };
    renderChat();
  }
}

function buildContext() {
  return {
    eventTitle: $("#eventTitle").value || "Dinner Party",
    eventDate: formatDateValue($("#eventDate").value),
    serviceTime: formatTimeValue($("#serviceTime").value),
    guestCount: parseInt($("#guestCount").value || "6", 10),
    foodBudget: $("#foodBudget").value || "$45-60/person",
    wineBudget: $("#wineBudget").value || "$80-120 total",
    skillLevel: $("#skillLevel").value || "intermediate",
    inspiration: selectedInspiration,
    style: selectedStyle,
    cuisine: selectedCuisine,
    subCuisine: selectedSubCuisine,
    likes,
    dislikes,
    restrictions,
    guestList: parseGuestList($("#guestList").value),
    diningSpace: $("#diningSpace").value || "",
  };
}

function renderMenus() {
  const container = $("#menuList");
  if (!container) return;
  if (!menus.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = menus
    .map((menu, index) => {
      const selectedClass = selectedMenuIndex === index ? "selected" : "";
      return `
        <div class="menu-card ${selectedClass}" data-index="${index}">
          <div class="menu-title">${escapeHtml(menu.title)}</div>
          <div class="menu-personality">${escapeHtml(menu.personality)}</div>
          ${menu.courses
            .map((course) => {
              const highlight = getWineHighlight(course.wine);
              return `
                <div class="menu-course">
                  <span class="menu-course-type">${escapeHtml(course.type)}</span>
                  <span>
                    ${escapeHtml(course.name)}
                    ${highlight ? `<span class="menu-course-wine">Wine: ${escapeHtml(highlight)}</span>` : ""}
                  </span>
                </div>
              `;
            })
            .join("")}
          <div class="menu-personality">Food ${escapeHtml(menu.foodCost)} | Wine ${escapeHtml(menu.wineCost)}</div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".menu-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedMenuIndex = parseInt(card.dataset.index, 10);
      renderMenus();
      saveState();
    });
  });
}

function getWineHighlight(wine) {
  const tiers = normalizeWineTiers(wine);
  return tiers.bondPick || tiers.worldwideTopRated || tiers.domesticTopRated || tiers.budgetTopRated || null;
}

async function generateMenus() {
  showInlineMessage("menuMessage", "Generating menus...");
  try {
    const res = await fetchWithTimeout(
      "/api/generate-menus",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: accessCode,
          context: buildContext(),
          chatHistory,
          rejectionHistory,
        }),
      },
      FETCH_TIMEOUTS_MS.menus
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showInlineMessage("menuMessage", data.detail || "Menu generation failed.", true);
      return;
    }
    if (data.demo && !allowDemoFallback()) {
      showInlineMessage("menuMessage", "Menus are in demo mode. Enable the API key.", true);
      return;
    }
    menus = data.menus || [];
    selectedMenuIndex = null;
    renderMenus();
    showInlineMessage("menuMessage", data.demo ? "Demo menus loaded." : "Menus ready. Select one to continue.");
    saveState();
  } catch (err) {
    showInlineMessage("menuMessage", "Unable to generate menus. Please try again.", true);
  }
}

function renderRejectionChat() {
  const container = $("#rejectionChat");
  if (!container) return;
  if (!rejectionHistory.length) {
    container.innerHTML = `<div class="inline-message">Tell the chef what was missing.</div>`;
    return;
  }
  container.innerHTML = rejectionHistory
    .map((message) => {
      const roleClass = message.role === "user" ? "user" : "assistant";
      return `
        <div class="chat-message ${roleClass}">
          <div class="chat-bubble">${escapeHtml(message.content)}</div>
        </div>
      `;
    })
    .join("");
  container.scrollTop = container.scrollHeight;
}

function startRejection() {
  $("#rejectionPanel").classList.remove("hidden");
  if (!rejectionHistory.length) {
    rejectionHistory.push({
      role: "assistant",
      content:
        "Tell me what was missing. Was it a flavor profile, a cuisine, or a mood you hoped to create?",
    });
    renderRejectionChat();
    saveState();
  }
}

async function sendRejection() {
  const input = $("#rejectionInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  rejectionHistory.push({ role: "user", content: text });
  input.value = "";
  renderRejectionChat();
  saveState();

  rejectionHistory.push({ role: "assistant", content: "..." });
  renderRejectionChat();

  try {
    const res = await fetchWithTimeout(
      "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: "chef",
          messages: rejectionHistory.slice(0, -1),
          context: buildContext(),
        }),
      },
      FETCH_TIMEOUTS_MS.chat
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      rejectionHistory[rejectionHistory.length - 1] = {
        role: "assistant",
        content: data.detail || data.error || "Chat is unavailable. Please try again.",
      };
      renderRejectionChat();
      return;
    }
    rejectionHistory[rejectionHistory.length - 1] = {
      role: "assistant",
      content: data.response || "Understood. Tell me more about the experience you want to create.",
    };
    renderRejectionChat();
    saveState();
  } catch (err) {
    rejectionHistory[rejectionHistory.length - 1] = {
      role: "assistant",
      content: "I could not reach the chef. Please try again.",
    };
    renderRejectionChat();
  }
}

function renderStaffingOptions() {
  const container = $("#staffingOptions");
  if (!container) return;
  const staffing = DATA.STAFFING || [];
  container.innerHTML = staffing
    .map((item) => {
      const selectedClass = selectedStaffing === item.id ? "selected" : "";
      return `
        <div class="staffing-card ${selectedClass}" data-staffing="${escapeHtml(item.id)}">
          <div class="menu-title">${escapeHtml(item.name)}</div>
          <div class="menu-personality">${escapeHtml(item.desc)}</div>
          <div class="menu-personality">Active time: ${escapeHtml(String(item.activeMin))} min</div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".staffing-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedStaffing = card.dataset.staffing;
      renderStaffingOptions();
      renderTimelinePreview();
      saveState();
    });
  });
}

function renderMenuSummary() {
  const container = $("#menuSummary");
  if (!container) return;
  const menu = menus[selectedMenuIndex];
  if (!menu) {
    container.innerHTML = "No menu selected.";
    return;
  }
  container.innerHTML = `
    <div class="menu-title">${escapeHtml(menu.title)}</div>
    <div class="menu-personality">${escapeHtml(menu.personality)}</div>
    ${menu.courses
      .map(
        (course) =>
          `<div class="menu-course"><span class="menu-course-type">${escapeHtml(
            course.type
          )}</span><span>${escapeHtml(course.name)}</span></div>`
      )
      .join("")}
    <div class="menu-personality">Food ${escapeHtml(menu.foodCost)} | Wine ${escapeHtml(menu.wineCost)}</div>
  `;
}

function renderWinePairings() {
  const container = $("#winePairings");
  if (!container) return;
  const menu = menus[selectedMenuIndex];
  if (!menu || !selectedMenuDetails?.winePairings) {
    container.innerHTML = `<div class="inline-message">Wine pairings will appear once details are ready.</div>`;
    return;
  }

  const courses = normalizeWinePairings(menu, selectedMenuDetails.winePairings);
  container.innerHTML = courses
    .map((course) => {
      const tiers = normalizeWineTiers(course.wine);
      return `
        <div class="wine-course">
          <h4>${escapeHtml(course.type)}: ${escapeHtml(course.name)}</h4>
          <div class="wine-tier-grid">
            <div class="wine-tier">Worldwide: ${escapeHtml(tiers.worldwideTopRated || "TBD")}</div>
            <div class="wine-tier">Domestic: ${escapeHtml(tiers.domesticTopRated || "TBD")}</div>
            <div class="wine-tier">Budget: ${escapeHtml(tiers.budgetTopRated || "TBD")}</div>
            <div class="wine-tier">Bond: ${escapeHtml(tiers.bondPick || "TBD")}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRecipePreview() {
  const container = $("#recipePreview");
  if (!container) return;
  const recipes = selectedMenuDetails?.recipes || [];
  if (!recipes.length) {
    container.innerHTML = `<div class="inline-message">Recipes will appear once details are ready.</div>`;
    return;
  }
  container.innerHTML = recipes
    .map(
      (recipe) => `
        <div class="recipe-card">
          <div class="menu-title">${escapeHtml(recipe.title || "Recipe")}</div>
          <div class="recipe-meta">Serves ${escapeHtml(String(recipe.serves || 6))} | Active ${
        recipe.activeTime || "30 min"
      } | Total ${recipe.totalTime || "1 hour"}</div>
          <strong>Ingredients</strong>
          <ul>
            ${(recipe.ingredients || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
          <strong>Method</strong>
          <ol>
            ${(recipe.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
          </ol>
          ${
            recipe.whyItWorks
              ? `<div class="recipe-why"><strong>Why the chef chose it and how it works in the meal:</strong> ${escapeHtml(recipe.whyItWorks)}</div>`
              : ""
          }
          ${recipe.notes ? `<div class="recipe-meta">Notes: ${escapeHtml(recipe.notes)}</div>` : ""}
          ${
            recipe.makeAhead
              ? `<div class="recipe-meta">Make ahead: ${escapeHtml(recipe.makeAhead)}</div>`
              : ""
          }
        </div>
      `
    )
    .join("");
}

function parseServiceTime() {
  const value = $("#serviceTime").value;
  if (!value) return null;
  const [hours, minutes] = value.split(":").map((part) => parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function formatTime(date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

function buildTimelineItems() {
  const baseTime = parseServiceTime();
  const staffing = DATA.STAFFING?.find((item) => item.id === selectedStaffing) || { activeMin: 0 };
  const schedule = [
    { offset: -360, label: "Final shopping for any last-minute items", offsetLabel: "-6 hr" },
    { offset: -300, label: "Begin slow-cooking items (braises, stocks)", offsetLabel: "-5 hr" },
    { offset: -240, label: "Prep remaining vegetables and garnishes", offsetLabel: "-4 hr" },
    { offset: -180, label: "Start sauces and reductions", offsetLabel: "-3 hr" },
    { offset: -120, label: "Set out cheese and butter to temper", offsetLabel: "-2 hr" },
    { offset: -90, label: "Open and decant red wines", offsetLabel: "-90 min" },
    { offset: -60, label: "Final protein prep, bring to room temp", offsetLabel: "-1 hr" },
    { offset: -45, label: "Preheat oven, warm plates", offsetLabel: "-45 min" },
    { offset: -30, label: "Light candles, start music, final touches", offsetLabel: "-30 min" },
    { offset: -15, label: "Plate amuse-bouche, pour welcome drinks", offsetLabel: "-15 min" },
    { offset: 0, label: "Guests arrive - service begins", offsetLabel: "0" },
    { offset: 15, label: "Serve amuse-bouche", offsetLabel: "+15 min" },
    { offset: 30, label: "Fire first course", offsetLabel: "+30 min" },
    { offset: 50, label: "Clear, serve second course", offsetLabel: "+50 min" },
    { offset: 80, label: "Fire main course", offsetLabel: "+80 min" },
    { offset: 110, label: "Clear, prepare dessert", offsetLabel: "+110 min" },
    { offset: 130, label: "Serve dessert and dessert wine", offsetLabel: "+130 min" },
  ];

  return schedule.map((item) => {
    if (!baseTime) {
      return { time: item.offsetLabel, task: item.label, activeMin: staffing.activeMin };
    }
    const time = new Date(baseTime.getTime() + item.offset * 60000);
    const label = `${formatTime(time)} (${item.offsetLabel})`;
    return { time: label, task: item.label, activeMin: staffing.activeMin };
  });
}

function renderTimelinePreview() {
  const container = $("#timelinePreview");
  if (!container) return;
  const items = buildTimelineItems();
  container.innerHTML = items
    .map(
      (item) => `
        <div class="timeline-item">
          <div>${escapeHtml(item.time)}</div>
          <div>${escapeHtml(item.task)}</div>
        </div>
      `
    )
    .join("");
}

function buildFallbackRecipes(menu) {
  const guestCount = parseInt($("#guestCount").value || "6", 10);
  return (menu?.courses || []).map((course) => ({
    title: course.name || course.type,
    serves: guestCount,
    activeTime: "30 min",
    totalTime: "1 hour",
    ingredients: ["Kosher salt", "Freshly ground black pepper", "Olive oil", "Seasonal herbs"],
    steps: ["Prep ingredients.", "Cook and season.", "Plate and serve."],
    notes: "Season to taste before serving.",
    makeAhead: "Prep key components earlier in the day.",
  }));
}

function buildFallbackWinePairings(menu) {
  return (menu?.courses || []).map((course) => ({
    type: course.type,
    name: course.name,
    wine: normalizeWineTiers(course.wine),
  }));
}

async function loadMenuDetails() {
  if (selectedMenuIndex === null) return;
  const menu = menus[selectedMenuIndex];
  if (!menu) return;

  const cacheKey = menu.id || menu.title;
  if (menuDetailsCache[cacheKey]) {
    selectedMenuDetails = menuDetailsCache[cacheKey];
    renderWinePairings();
    renderRecipePreview();
    renderTimelinePreview();
    return;
  }

  showInlineMessage("detailsMessage", "Preparing recipes and wine pairings...");

  try {
    const res = await fetchWithTimeout(
      "/api/generate-details",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu,
          context: buildContext(),
        }),
      },
      FETCH_TIMEOUTS_MS.details
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      if (allowDemoFallback()) {
        selectedMenuDetails = {
          recipes: buildFallbackRecipes(menu),
          winePairings: buildFallbackWinePairings(menu),
        };
      } else {
        showInlineMessage("detailsMessage", data.detail || "Details generation failed.", true);
        return;
      }
    } else if (data.demo && !allowDemoFallback()) {
      showInlineMessage("detailsMessage", "Details are in demo mode. Enable the API key.", true);
      return;
    } else {
      selectedMenuDetails = data;
    }

    menuDetailsCache[cacheKey] = selectedMenuDetails;
    renderWinePairings();
    renderRecipePreview();
    renderTimelinePreview();
    showInlineMessage("detailsMessage", "Details ready.");
    saveState();
  } catch (err) {
    if (allowDemoFallback()) {
      selectedMenuDetails = {
        recipes: buildFallbackRecipes(menu),
        winePairings: buildFallbackWinePairings(menu),
      };
      renderWinePairings();
      renderRecipePreview();
      renderTimelinePreview();
      return;
    }
    showInlineMessage("detailsMessage", "Unable to load details. Try again.", true);
  }
}

async function generateCookbook() {
  if (!selectedMenuDetails || selectedMenuIndex === null) {
    showInlineMessage("detailsMessage", "Select a menu first.", true);
    return;
  }

  const menu = menus[selectedMenuIndex];
  showInlineMessage("detailsMessage", "Creating cookbook...");

  try {
    const res = await fetchWithTimeout(
      "/api/generate-cookbook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu,
          context: buildContext(),
          staffing: selectedStaffing,
          recipes: selectedMenuDetails.recipes,
          winePairings: selectedMenuDetails.winePairings,
        }),
      },
      FETCH_TIMEOUTS_MS.cookbook
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showInlineMessage("detailsMessage", "Cookbook generation failed.", true);
      return;
    }
    cookbookId = data.cookbookId;
    saveState();
    goToStep(7);
  } catch (err) {
    showInlineMessage("detailsMessage", "Cookbook generation failed. Please try again.", true);
  }
}

async function downloadCookbook() {
  if (!cookbookId) {
    updateCookbookStatus("Generate the cookbook first.");
    return;
  }

  updateCookbookStatus("Preparing download...");
  try {
    const res = await fetchWithTimeout(
      "/api/download-cookbook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookbookId }),
      },
      FETCH_TIMEOUTS_MS.cookbook
    );
    if (!res.ok) {
      updateCookbookStatus("Download failed. Please try again.");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Dinner_Party_Cookbook.docx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    updateCookbookStatus("Download complete.");
  } catch (err) {
    updateCookbookStatus("Download failed. Please try again.");
  }
}

async function downloadPrintProduct(type, sku) {
  if (!type || !sku) return;
  updateCookbookStatus("Preparing print-ready PDF...");
  const menu = selectedMenuIndex !== null ? menus[selectedMenuIndex] : null;

  try {
    const res = await fetchWithTimeout(
      "/api/print-product",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          sku,
          context: buildContext(),
          menu,
        }),
      },
      FETCH_TIMEOUTS_MS.cookbook
    );

    if (!res.ok) {
      updateCookbookStatus("Unable to generate print PDF.");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${type}-${sku}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    updateCookbookStatus("Print PDF downloaded.");
  } catch (err) {
    updateCookbookStatus("Unable to generate print PDF.");
  }
}

function updateCookbookStatus(message) {
  const status = $("#cookbookStatus");
  if (!status) return;
  status.textContent = message || (cookbookId ? "Cookbook ready." : "Ready to generate.");
}

function renderCookbookSections() {
  const container = $("#cookbookSections");
  if (!container) return;
  const sections = DATA.COOKBOOK_SECTIONS || [];
  container.innerHTML = sections.map((section) => `<div class="section-chip">${escapeHtml(section)}</div>`).join("");
}

function renderPrintProducts() {
  const container = $("#printProducts");
  if (!container) return;
  const products = DATA.AVERY_PRODUCTS || {};
  const groups = [
    { key: "placeCards", label: "Place cards" },
    { key: "menuCards", label: "Menu cards" },
    { key: "invitations", label: "Invitations" },
    { key: "tableNumbers", label: "Table numbers" },
  ];

  container.innerHTML = groups
    .map((group) => {
      const items = products[group.key] || [];
      if (!items.length) return "";
      return items
        .map(
          (item) => `
        <div class="print-card">
          <div>
            <div class="menu-title">${escapeHtml(group.label)}</div>
            <div class="menu-personality">Avery ${escapeHtml(item.sku)} - ${escapeHtml(
            item.name
          )}</div>
            <div class="menu-personality">${escapeHtml(item.size)} | ${escapeHtml(String(item.perSheet))} per sheet</div>
          </div>
          <button class="btn btn-ghost print-download" data-type="${escapeHtml(group.key)}" data-sku="${escapeHtml(
            item.sku
          )}">Download PDF</button>
        </div>
      `
        )
        .join("");
    })
    .join("");

  container.querySelectorAll(".print-download").forEach((button) => {
    button.addEventListener("click", async () => {
      const type = button.dataset.type;
      const sku = button.dataset.sku;
      await downloadPrintProduct(type, sku);
    });
  });
}

function updateAccessStatus(valid, message) {
  const status = $("#accessStatus");
  if (!status) return;
  status.textContent = valid ? "Access granted" : "Awaiting code";
  status.style.color = valid ? "var(--success)" : "var(--text-light)";
  showInlineMessage("accessMessage", message || "");
}

async function validateAccess() {
  const code = $("#accessCode").value.trim();
  if (!code) {
    updateAccessStatus(false, "Enter an access code.");
    return;
  }
  accessCode = code;

  try {
    const res = await fetchWithTimeout(
      "/api/validate-code",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
      8000
    );
    const data = await res.json().catch(() => ({}));
    if (!data.valid) {
      accessValidated = false;
      updateAccessStatus(false, data.message || "Invalid access code.");
      saveState();
      return;
    }
    accessValidated = true;
    isAdmin = data.isAdmin || false;
    remainingGenerations = data.remaining || null;
    updateAccessStatus(true, `Access granted. Remaining generations: ${remainingGenerations ?? "N/A"}.`);
    saveState();
    goToStep(2);
  } catch (err) {
    updateAccessStatus(false, "Unable to validate code.");
  }
}

function validateEventDetails() {
  const title = $("#eventTitle").value.trim();
  const date = $("#eventDate").value;
  const time = $("#serviceTime").value;
  const guests = parseInt($("#guestCount").value || "0", 10);

  if (!title || !date || !time || !guests) {
    showInlineMessage("eventMessage", "Please complete all required fields.", true);
    return false;
  }
  showInlineMessage("eventMessage", "");
  return true;
}

function validatePreferences() {
  if (!selectedInspiration || !selectedStyle) {
    showInlineMessage("preferenceMessage", "Select an inspiration and style.", true);
    return false;
  }
  if (selectedCuisine && !selectedSubCuisine) {
    showInlineMessage("preferenceMessage", "Select a sub cuisine for the chosen region.", true);
    return false;
  }
  showInlineMessage("preferenceMessage", "");
  return true;
}

function attachNavigationHandlers() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = parseInt(button.dataset.nav, 10);
      if (step >= 2 && !accessValidated) {
        showInlineMessage("accessMessage", "Validate access first.", true);
        return;
      }
      if (step === 3 && !validateEventDetails()) {
        return;
      }
      if (step === 4 && !validatePreferences()) {
        return;
      }
      goToStep(step);
    });
  });

  document.querySelectorAll(".progress-step").forEach((button) => {
    button.addEventListener("click", () => {
      const step = parseInt(button.dataset.step, 10);
      if (step <= maxStepReached) {
        goToStep(step);
      }
    });
  });
}

function setupInputs() {
  $("#validateAccess").addEventListener("click", validateAccess);
  $("#accessCode").addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      validateAccess();
    }
  });

  $("#sendChat").addEventListener("click", sendChat);
  $("#chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendChat();
    }
  });

  $("#generateMenus").addEventListener("click", generateMenus);
  $("#rejectMenus").addEventListener("click", startRejection);
  $("#sendRejection").addEventListener("click", sendRejection);
  $("#rejectionInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendRejection();
    }
  });

  $("#selectMenu").addEventListener("click", () => {
    if (selectedMenuIndex === null) {
      showInlineMessage("menuMessage", "Select a menu to continue.", true);
      return;
    }
    goToStep(6);
  });

  $("#generateCookbook").addEventListener("click", generateCookbook);
  $("#downloadCookbook").addEventListener("click", downloadCookbook);
  $("#startOver").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });

  [
    "eventTitle",
    "eventDate",
    "serviceTime",
    "guestCount",
    "foodBudget",
    "wineBudget",
    "skillLevel",
    "guestList",
    "diningSpace",
  ].forEach((id) => {
    document.getElementById(id).addEventListener("change", saveState);
  });
}

async function init() {
  attachNavigationHandlers();
  setupInputs();
  setupChipInput("likesInput", "likesList", likes);
  setupChipInput("dislikesInput", "dislikesList", dislikes);
  setupChipInput("restrictionsInput", "restrictionsList", restrictions);

  try {
    const res = await fetchWithTimeout("/api/data", {}, 8000);
    DATA = await res.json();
  } catch (err) {
    console.warn("Unable to load initial data.", err);
    DATA = {};
  }

  loadState();
  if (!selectedInspiration && DATA.MENU_INSPIRATIONS?.length) {
    selectedInspiration = DATA.MENU_INSPIRATIONS[0].id;
  }
  if (!selectedStyle && DATA.MENU_STYLES?.length) {
    selectedStyle = DATA.MENU_STYLES[0].id;
  }
  if (!selectedStaffing && DATA.STAFFING?.length) {
    selectedStaffing = DATA.STAFFING[0].id;
  }
  updateAccessStatus(accessValidated, accessValidated ? "Access ready." : "");
  renderInspirations();
  renderStyles();
  renderCuisineChips();
  renderCuisineSubchoices();
  renderChipList("likesList", likes);
  renderChipList("dislikesList", dislikes);
  renderChipList("restrictionsList", restrictions);
  renderExperts();
  renderChat();
  renderMenus();
  renderStaffingOptions();
  renderMenuSummary();
  renderWinePairings();
  renderRecipePreview();
  renderTimelinePreview();
  renderRejectionChat();
  renderCookbookSections();
  renderPrintProducts();
  updateChatHeader();

  goToStep(Math.min(currentStep, 7));
}

document.addEventListener("DOMContentLoaded", init);

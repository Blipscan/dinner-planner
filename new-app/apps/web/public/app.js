"use strict";

const STORAGE_KEY = "dinnerPlanner.newApp.state";

const FETCH_TIMEOUTS_MS = {
  chat: 15000,
  menus: 180000,
  details: 180000,
  cookbook: 180000,
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
let selectedCuisine = [];
let selectedCuisineCountry = {};
let selectedSubCuisine = {};

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
let customMenuText = "";
let inspirationConfirmed = false;
let styleConfirmed = false;
let cuisineConfirmed = false;

let cookbookId = null;
let appOnline = navigator.onLine;

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

function isGuestPlaceholder(value) {
  return /^guest-\d+$/i.test(value.trim());
}

function buildGuestListFromCount(count, currentText) {
  if (!count || count <= 0) return currentText || "";
  const existing = (currentText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const result = [];
  for (let i = 1; i <= count; i += 1) {
    const existingLine = existing[i - 1];
    if (existingLine) {
      result.push(isGuestPlaceholder(existingLine) ? `Guest-${i}` : existingLine);
    } else {
      result.push(`Guest-${i}`);
    }
  }
  return result.join("\n");
}

function updateGuestListPlaceholders() {
  const input = $("#guestList");
  if (!input) return;
  const count = parseInt($("#guestCount").value || "0", 10);
  if (!count) return;
  const updated = buildGuestListFromCount(count, input.value);
  if (updated && updated !== input.value) {
    input.value = updated;
    saveState();
  }
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
    customMenuText: $("#customMenuInput")?.value || customMenuText || "",
    inspirationConfirmed,
    styleConfirmed,
    cuisineConfirmed,
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
    selectedCuisine = Array.isArray(payload.selectedCuisine) ? payload.selectedCuisine : [];
    selectedCuisineCountry = payload.selectedCuisineCountry || {};
    selectedSubCuisine = payload.selectedSubCuisine || {};
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
    customMenuText = payload.customMenuText || "";
    inspirationConfirmed = payload.inspirationConfirmed || false;
    styleConfirmed = payload.styleConfirmed || false;
    cuisineConfirmed = payload.cuisineConfirmed || false;

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

    if ($("#customMenuInput")) {
      $("#customMenuInput").value = customMenuText;
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
    renderCookbookPreview();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showInlineMessage(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "var(--error)" : "var(--text-light)";
}

function showLoading(id, message) {
  const row = document.getElementById(id);
  if (!row) return;
  row.classList.remove("hidden");
  const text = row.querySelector(".loading-text");
  if (text && message) {
    text.textContent = message;
  }
}

function hideLoading(id) {
  const row = document.getElementById(id);
  if (!row) return;
  row.classList.add("hidden");
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
      const next = card.dataset.inspiration;
      if (selectedInspiration !== next) {
        inspirationConfirmed = false;
        styleConfirmed = false;
        cuisineConfirmed = false;
      }
      selectedInspiration = next;
      renderInspirations();
      updateCustomMenuVisibility();
      updatePreferenceFlow();
      saveState();
    });
  });
}

function updateCustomMenuVisibility() {
  const block = $("#customMenuBlock");
  if (!block) return;
  block.classList.toggle("hidden", selectedInspiration !== "custom");
}

function updatePreferenceFlow() {
  const styleBlock = $("#styleBlock");
  const cuisineBlock = $("#cuisineBlock");
  const preferenceBlock = $("#preferenceDetailsBlock");
  if (styleBlock) {
    styleBlock.classList.toggle("hidden", !inspirationConfirmed);
  }
  if (cuisineBlock) {
    cuisineBlock.classList.toggle("hidden", !styleConfirmed);
  }
  if (preferenceBlock) {
    preferenceBlock.classList.toggle("hidden", !cuisineConfirmed);
  }
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
      const next = card.dataset.style;
      if (selectedStyle !== next) {
        styleConfirmed = false;
        cuisineConfirmed = false;
      }
      selectedStyle = next;
      renderStyles();
      updatePreferenceFlow();
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
      const selectedClass = selectedCuisine.includes(key) ? "selected" : "";
      return `<button class="chip ${selectedClass}" data-cuisine="${escapeHtml(key)}">${escapeHtml(
        cuisine.label
      )}</button>`;
    })
    .join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.cuisine;
      if (selectedCuisine.includes(key)) {
        selectedCuisine = selectedCuisine.filter((item) => item !== key);
        delete selectedCuisineCountry[key];
        delete selectedSubCuisine[key];
      } else {
        selectedCuisine = [...selectedCuisine, key];
      }
      cuisineConfirmed = false;
      renderCuisineChips();
      renderCuisineSubchoices();
      updatePreferenceFlow();
      saveState();
    });
  });
}

function renderCuisineSubchoices() {
  const container = $("#cuisineSubchoices");
  if (!container) return;
  if (!selectedCuisine.length) {
    container.innerHTML = "";
    return;
  }

  let html = "";
  selectedCuisine.forEach((cuisineKey) => {
    const cuisine = DATA.CUISINES?.[cuisineKey];
    if (!cuisine) return;
    const subList = Array.isArray(selectedSubCuisine[cuisineKey])
      ? selectedSubCuisine[cuisineKey]
      : [];
    const countryKey = selectedCuisineCountry[cuisineKey];

    html += `<div class="subchoice-section">`;
    html += `<div class="subchoice-title">${escapeHtml(cuisine.label)}</div>`;

    if (cuisine.countries) {
      html += `<div class="chip-row">`;
      html += Object.entries(cuisine.countries)
        .map(([key, country]) => {
          const selectedClass = countryKey === key ? "selected" : "";
          return `<button class="chip ${selectedClass}" data-country="${escapeHtml(
            key
          )}" data-cuisine-key="${escapeHtml(cuisineKey)}">${escapeHtml(country.label)}</button>`;
        })
        .join("");
      html += `</div>`;

      if (countryKey) {
        const country = cuisine.countries[countryKey];
        if (country?.regions?.length) {
          html += `<div class="chip-row">`;
          html += country.regions
            .map((region) => {
              const value = `${country.label} - ${region}`;
              const selectedClass = subList.includes(value) ? "selected" : "";
              return `<button class="chip ${selectedClass}" data-subcuisine="${escapeHtml(
                value
              )}" data-cuisine-key="${escapeHtml(cuisineKey)}">${escapeHtml(region)}</button>`;
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
          const selectedClass = subList.includes(region) ? "selected" : "";
          return `<button class="chip ${selectedClass}" data-subcuisine="${escapeHtml(
            region
          )}" data-cuisine-key="${escapeHtml(cuisineKey)}">${escapeHtml(region)}</button>`;
        })
        .join("");
      html += `</div>`;
    }

    if (cuisine.styles) {
      html += `<div class="chip-row">`;
      html += cuisine.styles
        .map((style) => {
          const selectedClass = subList.includes(style) ? "selected" : "";
          return `<button class="chip ${selectedClass}" data-subcuisine="${escapeHtml(
            style
          )}" data-cuisine-key="${escapeHtml(cuisineKey)}">${escapeHtml(style)}</button>`;
        })
        .join("");
      html += `</div>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll("[data-country]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.country;
      const cuisineKey = chip.dataset.cuisineKey;
      if (!cuisineKey) return;
      if (selectedCuisineCountry[cuisineKey] === key) {
        delete selectedCuisineCountry[cuisineKey];
        selectedSubCuisine[cuisineKey] = [];
      } else {
        selectedCuisineCountry[cuisineKey] = key;
        selectedSubCuisine[cuisineKey] = [];
      }
      cuisineConfirmed = false;
      renderCuisineSubchoices();
      updatePreferenceFlow();
      saveState();
    });
  });

  container.querySelectorAll("[data-subcuisine]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const value = chip.dataset.subcuisine;
      const cuisineKey = chip.dataset.cuisineKey;
      if (!cuisineKey) return;
      const list = Array.isArray(selectedSubCuisine[cuisineKey])
        ? selectedSubCuisine[cuisineKey]
        : [];
      if (list.includes(value)) {
        selectedSubCuisine[cuisineKey] = list.filter((item) => item !== value);
      } else {
        selectedSubCuisine[cuisineKey] = [...list, value];
      }
      cuisineConfirmed = false;
      renderCuisineSubchoices();
      updatePreferenceFlow();
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

function addChipFromInput(input, listId, items) {
  const value = input.value.trim();
  if (!value) return;
  items.push(value);
  input.value = "";
  renderChipList(listId, items);
  saveState();
}

function setupChipInput(inputId, listId, items, buttonId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const button = buttonId ? document.getElementById(buttonId) : null;
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addChipFromInput(input, listId, items);
  });

  if (button) {
    button.addEventListener("click", () => addChipFromInput(input, listId, items));
  }
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
    setOnlineStatus(appOnline);
    return;
  }

  const persona = DATA.personas?.[selectedExpert];
  title.textContent = persona?.name || "Expert";
  subtitle.textContent = persona?.philosophy || "Ask for guidance on menu and timing.";
  setOnlineStatus(appOnline);
}

function setOnlineStatus(online) {
  appOnline = Boolean(online);
  const label = appOnline ? "Online" : "Offline";
  const chatStatus = $("#chatStatus");
  const appStatus = $("#appStatus");
  if (chatStatus) {
    chatStatus.textContent = label;
    chatStatus.classList.toggle("status-online", appOnline);
    chatStatus.classList.toggle("status-offline", !appOnline);
  }
  if (appStatus) {
    appStatus.textContent = label;
  }
}

async function checkOnlineStatus() {
  if (!navigator.onLine) {
    setOnlineStatus(false);
    return;
  }
  try {
    const res = await fetchWithTimeout("/api/health", {}, 5000);
    setOnlineStatus(res.ok);
  } catch (err) {
    setOnlineStatus(false);
  }
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
  const cuisineLabels = selectedCuisine
    .map((key) => DATA.CUISINES?.[key]?.label || key)
    .filter(Boolean);
  const subCuisineSelections = Object.values(selectedSubCuisine || {}).flat();
  const cuisineCountrySelections = Object.entries(selectedCuisineCountry || {})
    .map(([cuisineKey, countryKey]) => {
      const cuisine = DATA.CUISINES?.[cuisineKey];
      if (!countryKey || !cuisine?.countries) return null;
      return cuisine.countries[countryKey]?.label || countryKey;
    })
    .filter(Boolean);

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
    cuisine: cuisineLabels,
    cuisineCountries: cuisineCountrySelections,
    subCuisine: subCuisineSelections,
    likes,
    dislikes,
    restrictions,
    guestList: parseGuestList($("#guestList").value),
    diningSpace: $("#diningSpace").value || "",
    customMenu: $("#customMenuInput")?.value || "",
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

function continueToMenus() {
  goToStep(5);
  generateMenus();
}

async function generateMenus() {
  const menuStatus = [
    "Menu 1/5: Shaping the opener and overall mood...",
    "Menu 2/5: Balancing the mid-courses and flavor arc...",
    "Menu 3/5: Building the centerpiece main course...",
    "Menu 4/5: Refining contrast, texture, and pacing...",
    "Menu 5/5: Finalizing dessert and wine cohesion..."
  ];
  let statusIndex = 0;
  showInlineMessage("menuMessage", menuStatus[statusIndex]);
  showLoading("menuLoading", menuStatus[statusIndex]);
  const menuStatusTimer = setInterval(() => {
    statusIndex = (statusIndex + 1) % menuStatus.length;
    showInlineMessage("menuMessage", menuStatus[statusIndex]);
    showLoading("menuLoading", menuStatus[statusIndex]);
  }, 6000);
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
    clearInterval(menuStatusTimer);
    menus = data.menus || [];
    selectedMenuIndex = null;
    renderMenus();
    showInlineMessage("menuMessage", data.demo ? "Demo menus loaded." : "Menus ready. Select one to continue.");
    saveState();
  } catch (err) {
    clearInterval(menuStatusTimer);
    const message =
      err?.name === "AbortError"
        ? "Menu generation timed out. Please try again."
        : "Unable to generate menus. Check your connection and try again.";
    showInlineMessage("menuMessage", message, true);
  } finally {
    hideLoading("menuLoading");
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
          ${
            (recipe.equipment || []).length
              ? `<strong>Equipment</strong>
          <ul>
            ${(recipe.equipment || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>`
              : ""
          }
          ${
            (recipe.techniques || []).length
              ? `<strong>Techniques</strong>
          <ul>
            ${(recipe.techniques || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>`
              : ""
          }
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

function renderShoppingListPreview() {
  const container = $("#shoppingList");
  if (!container) return;
  const list = selectedMenuDetails?.shoppingList?.categories;
  if (!list || !list.length) {
    container.innerHTML = `<div class="inline-message">Shopping list will appear once details are ready.</div>`;
    return;
  }
  const order = ["Proteins", "Produce", "Dairy", "Pantry", "Wine", "Misc"];
  const sorted = [...list].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  container.innerHTML = sorted
    .map((category) => {
      const items = (category.items || [])
        .map((item) => {
          const quantity = [item.quantityUS, item.quantityMetric].filter(Boolean).join(" / ");
          const notes = item.notes ? ` (${escapeHtml(item.notes)})` : "";
          return `<li>${escapeHtml(item.item)}${quantity ? ` — ${escapeHtml(quantity)}` : ""}${notes}</li>`;
        })
        .join("");
      return `
        <div class="shopping-category">
          <h4>${escapeHtml(category.name)}</h4>
          <ul>${items}</ul>
        </div>
      `;
    })
    .join("");
}

function parseServiceTime() {
  const value = $("#serviceTime").value || "19:00";
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
  const timelineItems = selectedMenuDetails?.timeline?.items;
  if (!Array.isArray(timelineItems) || !timelineItems.length) {
    return [];
  }

  return timelineItems
    .slice()
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes)
    .map((item) => {
      const relative = formatOffsetLabel(item.offsetMinutes);
      const absolute = baseTime
        ? formatTime(new Date(baseTime.getTime() + item.offsetMinutes * 60000))
        : "";
      const timeLabel = absolute ? `${absolute} (${relative})` : relative;
      const duration = item.durationMinutes ? ` • ${item.durationMinutes} min` : "";
      const task = `${item.label}${duration}`;
      return { time: timeLabel, task };
    });
}

function renderTimelinePreview() {
  const container = $("#timelinePreview");
  if (!container) return;
  const items = buildTimelineItems();
  if (!items.length) {
    container.innerHTML = `<div class="inline-message">Day-of timeline will appear once details are ready.</div>`;
    return;
  }
  const cadence = selectedMenuDetails?.timeline?.cadenceMinutes;
  const cadenceHtml =
    cadence && Number.isFinite(cadence)
      ? `<div class="inline-message">Planned cadence: every ${cadence} minutes.</div>`
      : "";
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
  if (cadenceHtml) {
    container.insertAdjacentHTML("afterbegin", cadenceHtml);
  }
}

function formatOffsetLabel(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes)) return "";
  if (offsetMinutes === 0) return "T0";
  const sign = offsetMinutes < 0 ? "-" : "+";
  const total = Math.abs(offsetMinutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
  return `T${sign}${parts.join(" ")}`;
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

  const detailStatus = [
    "Gathering menu context and constraints...",
    "Drafting recipes with measurements, equipment, and techniques...",
    "Building wine pairings and harmonizing the meal arc...",
    "Aggregating the shopping list by category...",
    "Constructing the minute-by-minute day-of timeline..."
  ];
  let detailIndex = 0;
  showInlineMessage("detailsMessage", detailStatus[detailIndex]);
  showLoading("detailsLoading", detailStatus[detailIndex]);
  const detailTimer = setInterval(() => {
    detailIndex = (detailIndex + 1) % detailStatus.length;
    showInlineMessage("detailsMessage", detailStatus[detailIndex]);
    showLoading("detailsLoading", detailStatus[detailIndex]);
  }, 6000);

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

    clearInterval(detailTimer);
    menuDetailsCache[cacheKey] = selectedMenuDetails;
    renderWinePairings();
    renderRecipePreview();
    renderTimelinePreview();
    renderShoppingListPreview();
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
    renderShoppingListPreview();
      return;
    }
    clearInterval(detailTimer);
    const message =
      err?.name === "AbortError"
        ? "Details generation timed out. Please try again."
        : "Unable to load details. Check your connection and try again.";
    showInlineMessage("detailsMessage", message, true);
  } finally {
    clearInterval(detailTimer);
    hideLoading("detailsLoading");
  }
}

async function generateCookbook() {
  if (selectedMenuIndex === null) {
    showInlineMessage("detailsMessage", "Select a menu first.", true);
    return;
  }

  if (!selectedMenuDetails) {
    showInlineMessage("detailsMessage", "Loading details first...", false);
    await loadMenuDetails();
    if (!selectedMenuDetails) {
      showInlineMessage("detailsMessage", "Details are required before generating the cookbook.", true);
      return;
    }
  }

  const menu = menus[selectedMenuIndex];
  showInlineMessage("detailsMessage", "Creating cookbook...");
  const cookbookStatus = [
    "Assembling menu overview and wine program...",
    "Building detailed recipes with measurements and techniques...",
    "Aggregating shopping list by category...",
    "Constructing the minute-by-minute timeline...",
    "Formatting tables, sections, and layout..."
  ];
  let cookbookIndex = 0;
  showLoading("cookbookLoading", cookbookStatus[cookbookIndex]);
  const cookbookTimer = setInterval(() => {
    cookbookIndex = (cookbookIndex + 1) % cookbookStatus.length;
    showLoading("cookbookLoading", cookbookStatus[cookbookIndex]);
  }, 6000);

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
          shoppingList: selectedMenuDetails.shoppingList,
          timeline: selectedMenuDetails.timeline,
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
  } finally {
    clearInterval(cookbookTimer);
    hideLoading("cookbookLoading");
  }
}

async function downloadCookbook() {
  if (!cookbookId) {
    updateCookbookStatus("Generate the cookbook first.");
    return;
  }

  updateCookbookStatus("Preparing download...");
  const downloadStatus = [
    "Assembling cookbook content...",
    "Rendering DOCX layout...",
    "Compressing file for download..."
  ];
  let downloadIndex = 0;
  showLoading("cookbookLoading", downloadStatus[downloadIndex]);
  const downloadTimer = setInterval(() => {
    downloadIndex = (downloadIndex + 1) % downloadStatus.length;
    showLoading("cookbookLoading", downloadStatus[downloadIndex]);
  }, 4000);
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
  } finally {
    clearInterval(downloadTimer);
    hideLoading("cookbookLoading");
  }
}

async function downloadPrintProduct(type, sku) {
  if (!type || !sku) return;
  updateCookbookStatus("Preparing print-ready PDF...");
  showLoading("cookbookLoading", "Generating print-ready PDF...");
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
  } finally {
    hideLoading("cookbookLoading");
  }
}

function updateCookbookStatus(message) {
  const status = $("#cookbookStatus");
  if (!status) return;
  status.textContent = message || (cookbookId ? "Cookbook ready." : "Ready to generate.");
}

function renderCookbookPreview() {
  const card = $("#cookbookPreviewCard");
  const container = $("#cookbookPreview");
  if (!card || !container) return;
  if (selectedMenuIndex === null || !selectedMenuDetails) {
    card.classList.add("hidden");
    return;
  }

  const menu = menus[selectedMenuIndex];
  const context = buildContext();
  const staffing = DATA.STAFFING?.find((item) => item.id === selectedStaffing);
  const recipes = selectedMenuDetails.recipes || [];
  const shopping = selectedMenuDetails.shoppingList?.categories || [];
  const timeline = selectedMenuDetails.timeline?.items || [];

  container.innerHTML = `
    <div class="cookbook-preview-section">
      <h4>Menu Overview</h4>
      <p>${escapeHtml(menu.title || "Menu")}</p>
      <p>${escapeHtml(menu.personality || "")}</p>
      <p>Food: ${escapeHtml(menu.foodCost || "TBD")} | Wine: ${escapeHtml(menu.wineCost || "TBD")}</p>
      ${menu.courses
        .map(
          (course) => `
            <p><strong>${escapeHtml(course.type)}:</strong> ${escapeHtml(course.name)}</p>
          `
        )
        .join("")}
    </div>
    <div class="cookbook-preview-section">
      <h4>Event Details</h4>
      <p>${escapeHtml(context.eventTitle || "Dinner Party")} • ${escapeHtml(context.eventDate || "")} • ${
    escapeHtml(context.serviceTime || "")
  }</p>
      <p>Guests: ${escapeHtml(String(context.guestCount || 0))} • Staffing: ${
    escapeHtml(staffing?.name || "TBD")
  }</p>
    </div>
    <div class="cookbook-preview-section">
      <h4>Recipes</h4>
      ${recipes
        .map(
          (recipe) => `
            <div>
              <p><strong>${escapeHtml(recipe.title || "Recipe")}</strong></p>
              <p>Serves ${escapeHtml(String(recipe.serves || ""))} • Active ${
            escapeHtml(recipe.activeTime || "")
          } • Total ${escapeHtml(recipe.totalTime || "")}</p>
              <p><strong>Ingredients</strong></p>
              <ul>${(recipe.ingredients || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              ${
                recipe.equipment?.length
                  ? `<p><strong>Equipment</strong></p><ul>${recipe.equipment
                      .map((item) => `<li>${escapeHtml(item)}</li>`)
                      .join("")}</ul>`
                  : ""
              }
              ${
                recipe.techniques?.length
                  ? `<p><strong>Techniques</strong></p><ul>${recipe.techniques
                      .map((item) => `<li>${escapeHtml(item)}</li>`)
                      .join("")}</ul>`
                  : ""
              }
              <p><strong>Method</strong></p>
              <ol>${(recipe.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
              ${
                recipe.whyItWorks
                  ? `<p><strong>Why the chef chose it and how it works in the meal:</strong> ${escapeHtml(
                      recipe.whyItWorks
                    )}</p>`
                  : ""
              }
              ${recipe.notes ? `<p><strong>Notes:</strong> ${escapeHtml(recipe.notes)}</p>` : ""}
              ${recipe.makeAhead ? `<p><strong>Make ahead:</strong> ${escapeHtml(recipe.makeAhead)}</p>` : ""}
            </div>
          `
        )
        .join("")}
    </div>
    <div class="cookbook-preview-section">
      <h4>Shopping List</h4>
      ${
        shopping.length
          ? shopping
              .map(
                (category) => `
                <p><strong>${escapeHtml(category.name)}</strong></p>
                <ul>
                  ${(category.items || [])
                    .map((item) => {
                      const quantity = [item.quantityUS, item.quantityMetric].filter(Boolean).join(" / ");
                      const notes = item.notes ? ` (${escapeHtml(item.notes)})` : "";
                      return `<li>${escapeHtml(item.item)}${quantity ? ` — ${escapeHtml(quantity)}` : ""}${notes}</li>`;
                    })
                    .join("")}
                </ul>
              `
              )
              .join("")
          : `<p>Shopping list will appear once details are ready.</p>`
      }
    </div>
    <div class="cookbook-preview-section">
      <h4>Timeline</h4>
      ${
        timeline.length
          ? `<ul>
              ${timeline
                .slice()
                .sort((a, b) => a.offsetMinutes - b.offsetMinutes)
                .map((item) => {
                  const relative = formatOffsetLabel(item.offsetMinutes);
                  return `<li>${escapeHtml(relative)} — ${escapeHtml(item.label)}${
                    item.durationMinutes ? ` (${item.durationMinutes} min)` : ""
                  }</li>`;
                })
                .join("")}
            </ul>`
          : `<p>Timeline will appear once details are ready.</p>`
      }
    </div>
  `;
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

  updateEventRequiredFields();
  if (!title || !date || !time || !guests) {
    showInlineMessage("eventMessage", "Please complete all required fields.", true);
    return false;
  }
  showInlineMessage("eventMessage", "");
  return true;
}

function updateEventRequiredFields() {
  const fields = ["eventTitle", "eventDate", "serviceTime", "guestCount"];
  fields.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    const value = input.value?.trim?.() ?? "";
    const isMissing = id === "guestCount" ? Number(value) <= 0 : !value;
    input.classList.toggle("required-missing", isMissing);
  });
}

function validatePreferences() {
  if (!selectedInspiration) {
    showInlineMessage("preferenceMessage", "Select an inspiration to continue.", true);
    return false;
  }
  if (selectedInspiration === "custom") {
    const text = ($("#customMenuInput")?.value || "").trim();
    if (!text) {
      showInlineMessage("preferenceMessage", "Enter at least one featured dish.", true);
      return false;
    }
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length > 5) {
      showInlineMessage("preferenceMessage", "Limit the custom menu to five lines.", true);
      return false;
    }
  }
  if (!inspirationConfirmed) {
    showInlineMessage("preferenceMessage", "Confirm the inspiration to continue.", true);
    return false;
  }
  if (!selectedStyle) {
    showInlineMessage("preferenceMessage", "Select a style to continue.", true);
    return false;
  }
  if (!styleConfirmed) {
    showInlineMessage("preferenceMessage", "Confirm the style to continue.", true);
    return false;
  }
  if (!cuisineConfirmed) {
    showInlineMessage("preferenceMessage", "Confirm the cuisine direction to continue.", true);
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
  $("#continueToMenus")?.addEventListener("click", continueToMenus);
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
  $("#toggleCookbookPreview")?.addEventListener("click", () => {
    const card = $("#cookbookPreviewCard");
    if (!card) return;
    if (card.classList.contains("hidden")) {
      renderCookbookPreview();
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  });
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
    "customMenuInput",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", saveState);
  });

  ["eventTitle", "eventDate", "serviceTime", "guestCount"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", updateEventRequiredFields);
  });

  $("#guestCount")?.addEventListener("change", updateGuestListPlaceholders);
  $("#guestCount")?.addEventListener("input", updateGuestListPlaceholders);

  $("#confirmInspiration")?.addEventListener("click", () => {
    if (!selectedInspiration) {
      showInlineMessage("preferenceMessage", "Select an inspiration to continue.", true);
      return;
    }
    if (selectedInspiration === "custom") {
      const text = ($("#customMenuInput")?.value || "").trim();
      if (!text) {
        showInlineMessage("preferenceMessage", "Enter the five courses you want served.", true);
        return;
      }
    }
    inspirationConfirmed = true;
    showInlineMessage("preferenceMessage", "");
    updatePreferenceFlow();
    saveState();
  });

  $("#confirmStyle")?.addEventListener("click", () => {
    if (!selectedStyle) {
      showInlineMessage("preferenceMessage", "Select a style to continue.", true);
      return;
    }
    styleConfirmed = true;
    showInlineMessage("preferenceMessage", "");
    updatePreferenceFlow();
    saveState();
  });

  $("#confirmCuisine")?.addEventListener("click", () => {
    cuisineConfirmed = true;
    showInlineMessage("preferenceMessage", "");
    updatePreferenceFlow();
    saveState();
  });
}

async function init() {
  localStorage.removeItem(STORAGE_KEY);
  setOnlineStatus(navigator.onLine);
  attachNavigationHandlers();
  setupInputs();
  setupChipInput("likesInput", "likesList", likes, "likesAdd");
  setupChipInput("dislikesInput", "dislikesList", dislikes, "dislikesAdd");
  setupChipInput("restrictionsInput", "restrictionsList", restrictions, "restrictionsAdd");

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
  updateCustomMenuVisibility();
  updatePreferenceFlow();
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
  renderShoppingListPreview();
  updateChatHeader();
  updateEventRequiredFields();
  updateGuestListPlaceholders();
  checkOnlineStatus();
  window.addEventListener("online", checkOnlineStatus);
  window.addEventListener("offline", () => setOnlineStatus(false));

  goToStep(Math.min(currentStep, 7));
}

document.addEventListener("DOMContentLoaded", init);

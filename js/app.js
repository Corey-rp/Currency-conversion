(() => {
  "use strict";

  const RATES_API = "https://open.er-api.com/v6/latest/USD";
  const FALLBACK_RATES_API = "https://api.frankfurter.app/latest?from=USD";
  const LS_THEME = "cc_theme";
  const LS_FAVORITES = "cc_favorites";
  const LS_LAST = "cc_last_pair";

  let rates = null; // { USD: 1, EUR: 0.9, ... } base USD
  let baseCurrency = "USD";
  let lastUpdated = null;
  let allCodes = [];
  const selected = { from: "USD", to: "EUR" };
  let pickerTarget = null;

  const $ = (id) => document.getElementById(id);

  const amountFromEl = $("amountFrom");
  const amountToEl = $("amountTo");
  const currencyFromTrigger = $("currencyFromTrigger");
  const currencyFromLabel = $("currencyFromLabel");
  const currencyToTrigger = $("currencyToTrigger");
  const currencyToLabel = $("currencyToLabel");
  const pickerOverlay = $("pickerOverlay");
  const pickerSearch = $("pickerSearch");
  const pickerList = $("pickerList");
  const pickerCancel = $("pickerCancel");
  const rateStatusEl = $("rateStatus");
  const rateLineEl = $("rateLine");
  const updatedLineEl = $("updatedLine");
  const swapBtn = $("swapBtn");
  const favoritesListEl = $("favoritesList");
  const themeToggle = $("themeToggle");

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem(LS_THEME, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(LS_THEME);
    if (saved) {
      applyTheme(saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
  }

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tabBtn.classList.add("active");
      tabBtn.setAttribute("aria-selected", "true");
      $(`tab-${tabBtn.dataset.tab}`).classList.add("active");
    });
  });

  // ---------- Favorites ----------
  function getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(LS_FAVORITES)) || ["USD", "EUR", "GBP", "JPY"];
    } catch {
      return ["USD", "EUR", "GBP", "JPY"];
    }
  }

  function saveFavorites(list) {
    localStorage.setItem(LS_FAVORITES, JSON.stringify(list));
  }

  function toggleFavorite(code) {
    let favs = getFavorites();
    if (favs.includes(code)) {
      favs = favs.filter((c) => c !== code);
    } else {
      favs.push(code);
    }
    saveFavorites(favs);
    renderFavorites();
  }

  function renderFavorites() {
    const favs = getFavorites();
    favoritesListEl.innerHTML = "";
    if (!favs.length) {
      favoritesListEl.innerHTML = '<p class="hint">No favorites yet.</p>';
      return;
    }
    favs.forEach((code) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.innerHTML = `${code} <span class="remove">✕</span>`;
      chip.addEventListener("click", (e) => {
        if (e.target.classList.contains("remove")) {
          toggleFavorite(code);
        } else {
          selectCurrency("to", code);
        }
      });
      favoritesListEl.appendChild(chip);
    });
  }

  // ---------- Currency picker ----------
  function setupCurrencies(codes) {
    allCodes = [...codes].sort();

    const lastPair = JSON.parse(localStorage.getItem(LS_LAST) || "null");
    if (lastPair && allCodes.includes(lastPair.from) && allCodes.includes(lastPair.to)) {
      selected.from = lastPair.from;
      selected.to = lastPair.to;
    } else {
      selected.from = allCodes.includes("USD") ? "USD" : allCodes[0];
      selected.to = allCodes.includes("EUR") ? "EUR" : allCodes[1] || allCodes[0];
    }
    updateTriggerLabels();
  }

  function updateTriggerLabels() {
    currencyFromLabel.textContent = selected.from;
    currencyToLabel.textContent = selected.to;
  }

  function selectCurrency(target, code) {
    selected[target] = code;
    updateTriggerLabels();
    convert();
  }

  function savePair() {
    localStorage.setItem(LS_LAST, JSON.stringify(selected));
  }

  function openPicker(target) {
    pickerTarget = target;
    pickerSearch.value = "";
    renderPickerList("");
    pickerOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => pickerSearch.focus());
  }

  function closePicker() {
    pickerOverlay.hidden = true;
    document.body.style.overflow = "";
    pickerTarget = null;
  }

  function renderPickerList(query) {
    const q = query.trim().toLowerCase();
    const matches = allCodes.filter((code) => {
      if (!q) return true;
      const name = (CURRENCY_NAMES[code] || "").toLowerCase();
      return code.toLowerCase().includes(q) || name.includes(q);
    });

    pickerList.innerHTML = "";
    if (!matches.length) {
      pickerList.innerHTML = '<p class="hint">No matching currency.</p>';
      return;
    }

    const currentValue = selected[pickerTarget];
    matches.forEach((code) => {
      const item = document.createElement("div");
      item.className = "picker-item" + (code === currentValue ? " selected" : "");

      const main = document.createElement("button");
      main.type = "button";
      main.className = "picker-item-main";
      main.setAttribute("role", "option");
      main.innerHTML = `<span class="code">${code}</span><span class="name">${CURRENCY_NAMES[code] || ""}</span>`;
      main.addEventListener("click", () => {
        selectCurrency(pickerTarget, code);
        closePicker();
      });

      const isFav = getFavorites().includes(code);
      const star = document.createElement("button");
      star.type = "button";
      star.className = "picker-item-star" + (isFav ? " active" : "");
      star.textContent = isFav ? "★" : "☆";
      star.setAttribute("aria-label", isFav ? `Remove ${code} from favorites` : `Add ${code} to favorites`);
      star.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(code);
        const nowFav = getFavorites().includes(code);
        star.textContent = nowFav ? "★" : "☆";
        star.classList.toggle("active", nowFav);
        star.setAttribute("aria-label", nowFav ? `Remove ${code} from favorites` : `Add ${code} to favorites`);
      });

      item.appendChild(main);
      item.appendChild(star);
      pickerList.appendChild(item);
    });
  }

  currencyFromTrigger.addEventListener("click", () => openPicker("from"));
  currencyToTrigger.addEventListener("click", () => openPicker("to"));
  pickerCancel.addEventListener("click", closePicker);
  pickerOverlay.addEventListener("click", (e) => {
    if (e.target === pickerOverlay) closePicker();
  });
  pickerSearch.addEventListener("input", () => renderPickerList(pickerSearch.value));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pickerOverlay.hidden) closePicker();
  });

  // ---------- Conversion ----------
  function convert() {
    if (!rates) return;
    const from = selected.from;
    const to = selected.to;
    const amount = parseFloat(amountFromEl.value);

    if (!rates[from] || !rates[to] || isNaN(amount)) {
      amountToEl.value = "";
      rateLineEl.textContent = "";
      return;
    }

    // rates are USD-based: value_in_currency = amount_usd * rate[currency]
    const amountInUsd = amount / rates[from];
    const result = amountInUsd * rates[to];
    amountToEl.value = result.toFixed(result < 1 ? 4 : 2);

    const unitRate = rates[to] / rates[from];
    rateLineEl.textContent = `1 ${from} = ${unitRate.toFixed(unitRate < 1 ? 6 : 4)} ${to}`;
    savePair();
  }

  function swap() {
    const f = selected.from;
    selected.from = selected.to;
    selected.to = f;
    updateTriggerLabels();
    convert();
  }

  swapBtn.addEventListener("click", swap);
  amountFromEl.addEventListener("input", convert);

  async function fetchPrimaryRates() {
    const res = await fetch(RATES_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.result !== "success" || !data.rates) throw new Error("Bad response");
    return {
      rates: { ...data.rates, USD: 1 },
      updated: data.time_last_update_utc || new Date().toUTCString(),
    };
  }

  async function fetchFallbackRates() {
    const res = await fetch(FALLBACK_RATES_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.rates) throw new Error("Bad response");
    return {
      rates: { ...data.rates, USD: 1 },
      updated: data.date ? `${data.date} (fallback provider)` : "unknown",
    };
  }

  async function loadRates() {
    rateStatusEl.textContent = "Loading exchange rates…";
    rateStatusEl.className = "status";
    let result;
    try {
      result = await fetchPrimaryRates();
    } catch (primaryErr) {
      console.warn("Primary rates provider failed, trying fallback…", primaryErr);
      try {
        result = await fetchFallbackRates();
      } catch (fallbackErr) {
        rateStatusEl.textContent = "Couldn't load live rates. Check your connection and reload.";
        rateStatusEl.className = "status error";
        console.error(fallbackErr);
        return;
      }
    }

    rates = result.rates;
    lastUpdated = result.updated;

    setupCurrencies(Object.keys(rates));
    renderFavorites();
    convert();

    rateStatusEl.textContent = "Live rates loaded";
    rateStatusEl.className = "status ok";
    updatedLineEl.textContent = `Rates last updated: ${lastUpdated}`;
  }

  // ---------- Travel tab ----------
  const countrySearchEl = $("countrySearch");
  const countryResultsEl = $("countryResults");
  const MONTH_ABBR = ["J","F","M","A","M","J","J","A","S","O","N","D"];

  function renderCountryList(filter) {
    const q = (filter || "").trim().toLowerCase();
    const items = TRAVEL_DATA.filter(
      (c) => !q || c.country.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q)
    ).sort((a, b) => a.country.localeCompare(b.country));

    countryResultsEl.innerHTML = "";
    if (!items.length) {
      countryResultsEl.innerHTML = '<p class="hint">No matching country found.</p>';
      return;
    }

    items.forEach((c) => {
      const div = document.createElement("div");
      div.className = "country-item";
      const monthSpans = MONTH_ABBR.map((label, i) => {
        const monthNum = i + 1;
        const hit = c.months.includes(monthNum) ? " hit" : "";
        return `<span class="${hit.trim()}">${label}</span>`;
      }).join("");

      div.innerHTML = `
        <div class="row1">
          <span class="name">${c.country}</span>
          <span class="currency">${c.currency}</span>
        </div>
        <div class="best">Best: ${c.best}</div>
        <div class="note">${c.note}</div>
        <div class="month-strip">${monthSpans}</div>
      `;
      countryResultsEl.appendChild(div);
    });
  }

  countrySearchEl.addEventListener("input", () => renderCountryList(countrySearchEl.value));

  // ---------- Init ----------
  initTheme();
  renderCountryList("");
  loadRates();
})();

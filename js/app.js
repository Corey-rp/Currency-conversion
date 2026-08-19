(() => {
  "use strict";

  const RATES_API = "https://open.er-api.com/v6/latest/USD";
  const FALLBACK_RATES_API = "https://api.frankfurter.app/latest?from=USD";
  const HISTORY_API = "https://api.frankfurter.app";
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
  const chartBtn = $("chartBtn");
  const chartOverlay = $("chartOverlay");
  const chartClose = $("chartClose");
  const chartPairLabelEl = $("chartPairLabel");
  const chartSummaryEl = $("chartSummary");
  const chartStatusEl = $("chartStatus");
  const chartSvg = $("chartSvg");
  const chartAxisLabelsEl = $("chartAxisLabels");
  const rangeButtons = document.querySelectorAll(".range-btn");

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
    chartBtn.disabled = false;

    rateStatusEl.textContent = "Live rates loaded";
    rateStatusEl.className = "status ok";
    updatedLineEl.textContent = `Rates last updated: ${lastUpdated}`;
  }

  // ---------- Trend chart ----------
  let currentChartDays = 30;

  async function fetchHistory(from, to, days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const url = `${HISTORY_API}/${fmt(start)}..${fmt(end)}?from=${from}&to=${to}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.rates) throw new Error("No historical data");

    const points = Object.keys(data.rates)
      .sort()
      .map((date) => ({ date, value: data.rates[date][to] }))
      .filter((p) => typeof p.value === "number");

    if (points.length < 2) throw new Error("Not enough data points");
    return points;
  }

  function renderChart(points) {
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 300;
    const h = 120;
    const pad = 8;

    const coords = points.map((p, i) => {
      const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((p.value - min) / range) * (h - pad * 2);
      return [x, y];
    });

    const linePoints = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const areaPoints = `${pad},${h - pad} ${linePoints} ${w - pad},${h - pad}`;

    const first = values[0];
    const last = values[values.length - 1];
    const pctChange = ((last - first) / first) * 100;
    const isUp = pctChange >= 0;
    const color = isUp ? "#1f9d63" : "#e0554f";
    const [lastX, lastY] = coords[coords.length - 1];

    chartSvg.innerHTML = `
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#chartFill)" stroke="none"></polygon>
      <polyline points="${linePoints}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${color}"></circle>
    `;
    chartSvg.hidden = false;

    const arrow = isUp ? "▲" : "▼";
    const verb = isUp ? "strengthened" : "weakened";
    chartSummaryEl.innerHTML = `<span class="${isUp ? "up" : "down"}">${arrow} ${Math.abs(pctChange).toFixed(2)}%</span> — ${selected.from} ${verb} against ${selected.to}`;

    chartAxisLabelsEl.innerHTML = `<span>${points[0].date}</span><span>${points[points.length - 1].date}</span>`;
  }

  async function loadChart(days) {
    currentChartDays = days;
    rangeButtons.forEach((b) => b.classList.toggle("active", Number(b.dataset.days) === days));

    chartStatusEl.hidden = false;
    chartSvg.hidden = true;
    chartAxisLabelsEl.innerHTML = "";
    chartSummaryEl.textContent = "";

    const from = selected.from;
    const to = selected.to;

    if (from === to) {
      chartStatusEl.textContent = "Pick two different currencies to see a trend.";
      return;
    }

    chartStatusEl.textContent = "Loading trend…";
    try {
      const points = await fetchHistory(from, to, days);
      chartStatusEl.hidden = true;
      renderChart(points);
    } catch (err) {
      console.warn("Chart history unavailable", err);
      chartStatusEl.textContent = `Historical trend isn't available for ${from}/${to} yet — try a major currency like EUR, GBP, or JPY.`;
      chartStatusEl.hidden = false;
    }
  }

  function openChart() {
    chartPairLabelEl.textContent = `${selected.from} → ${selected.to}`;
    chartOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    loadChart(currentChartDays);
  }

  function closeChart() {
    chartOverlay.hidden = true;
    document.body.style.overflow = "";
  }

  chartBtn.addEventListener("click", openChart);
  chartClose.addEventListener("click", closeChart);
  chartOverlay.addEventListener("click", (e) => {
    if (e.target === chartOverlay) closeChart();
  });
  rangeButtons.forEach((btn) => {
    btn.addEventListener("click", () => loadChart(Number(btn.dataset.days)));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !chartOverlay.hidden) closeChart();
  });

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

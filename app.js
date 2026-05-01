const CACHE_NAME = "survival-mode-v2";
const SUPPORTED_LANGUAGES = ["ru", "en", "et", "fi", "lv", "lt"];
const STARTER_ACTION_IDS = [
  "universal_stop",
  "universal_no_run",
  "universal_check_danger",
  "universal_check_phone",
  "universal_use_sos"
];
const HOME_SHORTCUTS = [
  {
    icon: "🧭",
    placeId: "forest",
    problemId: "lost",
    label: { ru: "Я потерялся", en: "I am lost" }
  },
  {
    icon: "🥶",
    placeId: "forest",
    problemId: "cold_forest",
    label: { ru: "Мне холодно", en: "I am cold" }
  },
  {
    icon: "💧",
    placeId: "forest",
    problemId: "water_forest",
    label: { ru: "Нет воды", en: "No water" }
  },
  {
    icon: "📡",
    placeId: "car",
    problemId: "no_signal_car",
    label: { ru: "Нет связи", en: "No signal" }
  },
  {
    icon: "⚠️",
    placeId: "city",
    problemId: "danger_city",
    label: { ru: "Опасность рядом", en: "Danger nearby" }
  },
  {
    icon: "🏠",
    placeId: "home",
    problemId: "evacuate_home",
    label: { ru: "Я дома / эвакуация", en: "Home / evacuate" }
  }
];
const LAST_COORDS_KEY = "survival_last_coords";
const MANUAL_LOCATION_KEY = "survival_manual_location";
const MAX_FRESH_MS = 10 * 60 * 1000;
const SpeechRecognitionApi =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;
const RECOMMENDED_LANGUAGE_IDS = ["ru", "en", "et", "fi", "lv", "lt"];
const LANGUAGE_META = {
  ru: { nativeName: "Русский", englishName: "Russian" },
  en: { nativeName: "English", englishName: "English" },
  et: { nativeName: "Eesti", englishName: "Estonian" },
  fi: { nativeName: "Suomi", englishName: "Finnish" },
  lv: { nativeName: "Latviešu", englishName: "Latvian" },
  lt: { nativeName: "Lietuvių", englishName: "Lithuanian" }
};

function getInitialLanguage() {
  const saved = localStorage.getItem("survival_lang");
  if (SUPPORTED_LANGUAGES.includes(saved)) {
    return saved;
  }

  const browserLanguage = navigator.language?.slice(0, 2);
  if (SUPPORTED_LANGUAGES.includes(browserLanguage)) {
    return browserLanguage;
  }

  return "en";
}

function loadStoredCoords() {
  try {
    const raw = localStorage.getItem(LAST_COORDS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      accuracy: parsed.accuracy,
      timestamp: parsed.timestamp || Date.now(),
      source: "cached"
    };
  } catch (_) {
    return null;
  }
}

const state = {
  data: null,
  initError: false,
  lang: getInitialLanguage(),
  screen: "home",
  placeId: null,
  problemId: null,
  stepIndex: 0,
  langSearch: "",
  lowPower: localStorage.getItem("survival_low_power") === "1",
  voiceEnabled: localStorage.getItem("survival_voice") !== "0",
  speechSupported:
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  speechReady: false,
  placeRecognitionSupported: Boolean(SpeechRecognitionApi),
  sosCoords: loadStoredCoords(),
  sosLoading: false,
  sosError: "",
  sosPlaceDescription: localStorage.getItem(MANUAL_LOCATION_KEY) || "",
  sosRecognitionActive: false,
  offline: {
    phase: "checking",
    cached: false,
    isOnline: navigator.onLine
  },
  timerId: null,
  timerLeft: null,
  deferredPrompt: null,
  swReg: null,
  swRefreshing: false,
  bannerMessage: "",
  bannerTimeoutId: null
};

const app = document.getElementById("app");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.initError = false;
  document.documentElement.lang = state.lang;

  try {
    state.data = await fetch("./scenarios.json").then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    });
  } catch (_) {
    state.data = null;
    state.initError = true;
    renderInitErrorScreen();
    return;
  }

  bindInstallPrompt();
  bindConnectionEvents();
  initSpeechReadiness();
  applyBatteryMode();
  registerServiceWorker();
  render();
  assessOfflineStatus();
}

function bindInstallPrompt() {
  if (bindInstallPrompt.isBound) {
    return;
  }
  bindInstallPrompt.isBound = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    render();
  });
}

function bindConnectionEvents() {
  if (bindConnectionEvents.isBound) {
    return;
  }
  bindConnectionEvents.isBound = true;

  window.addEventListener("online", () => {
    state.offline.isOnline = true;
    assessOfflineStatus();
    render();
  });
  window.addEventListener("offline", () => {
    state.offline.isOnline = false;
    assessOfflineStatus();
    render();
  });
}

function initSpeechReadiness() {
  if (!state.speechSupported) {
    state.speechReady = false;
    return;
  }

  const updateSpeechReady = () => {
    const voices = window.speechSynthesis.getVoices();
    const nextReady = voices.length > 0;
    if (state.speechReady !== nextReady) {
      state.speechReady = nextReady;
      if (state.data) {
        render();
      }
    }
  };

  updateSpeechReady();
  window.speechSynthesis.addEventListener("voiceschanged", updateSpeechReady);
  setTimeout(updateSpeechReady, 0);
  setTimeout(updateSpeechReady, 300);
}

async function applyBatteryMode() {
  if (!("getBattery" in navigator)) {
    updateLowPowerClass();
    return;
  }

  try {
    const battery = await navigator.getBattery();
    const syncFromBattery = () => {
      if (battery.level <= 0.15 || battery.dischargingTime < 1800) {
        state.lowPower = true;
      }
      updateLowPowerClass();
      render();
    };
    battery.addEventListener("levelchange", syncFromBattery);
    battery.addEventListener("chargingchange", syncFromBattery);
    syncFromBattery();
  } catch (_) {
    updateLowPowerClass();
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    state.offline.phase = navigator.onLine ? "needs-online" : "checking";
    return;
  }

  navigator.serviceWorker
    .register("./service-worker.js")
    .then((registration) => {
      state.swReg = registration;

      if (registration.installing) {
        state.offline.phase = "updating";
        render();
      }

      registration.addEventListener("updatefound", () => {
        state.offline.phase = "updating";
        render();
      });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "CACHE_READY") {
          state.offline.phase = "ready";
          state.offline.cached = true;
          render();
        }
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (state.swRefreshing) {
          return;
        }
        state.swRefreshing = true;
        window.location.reload();
      });

      assessOfflineStatus();
    })
    .catch(() => {
      state.offline.phase = navigator.onLine ? "needs-online" : "checking";
      render();
    });
}

async function assessOfflineStatus() {
  if (!("caches" in window)) {
    state.offline.phase = navigator.onLine ? "needs-online" : "checking";
    render();
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const cached = keys.length >= 6;
    state.offline.cached = cached;

    if (state.offline.phase === "updating" && cached) {
      render();
      return;
    }

    if (cached) {
      state.offline.phase = "ready";
    } else {
      state.offline.phase = "needs-online";
    }
    render();
  } catch (_) {
    state.offline.phase = navigator.onLine ? "needs-online" : "checking";
    render();
  }
}

function getUi() {
  return state.data?.ui?.[state.lang] || state.data?.ui?.en || state.data?.ui?.ru || {};
}

function u(key) {
  const ui = getUi();
  return ui[key] ?? state.data?.ui?.en?.[key] ?? state.data?.ui?.ru?.[key] ?? "";
}

function getPlace(placeId) {
  return state.data?.places?.find((item) => item.id === placeId);
}

function getProblem(problemId) {
  return state.data?.problems?.find((item) => item.id === problemId);
}

function getScenarioKey(placeId = state.placeId, problemId = state.problemId) {
  if (!placeId || !problemId) {
    return null;
  }
  return `${placeId}.${problemId}`;
}

function getScenario() {
  const key = getScenarioKey();
  if (!key) {
    return null;
  }
  return state.data?.scenarios?.[key] || null;
}

function getExpandedSteps(scenario) {
  const withoutStarter = scenario.steps.filter(
    (actionId) => !STARTER_ACTION_IDS.includes(actionId)
  );
  return [...STARTER_ACTION_IDS, ...withoutStarter];
}

function getAction(actionId) {
  return state.data?.actions?.[actionId];
}

function t(valueMap) {
  return valueMap?.[state.lang] || valueMap?.en || valueMap?.ru || "";
}

function getScenarioTitle(placeId = state.placeId, problemId = state.problemId) {
  const place = getPlace(placeId);
  const problem = getProblem(problemId);
  if (!place || !problem) {
    return u("situationUnknown") || "не указано";
  }
  return `${place.icon} ${t(problem.title)}`;
}

function render() {
  if (state.initError || !state.data) {
    renderInitErrorScreen();
    return;
  }

  clearTimer();
  updateLowPowerClass();

  let screenHtml = "";
  switch (state.screen) {
    case "place":
      screenHtml = renderPlaceScreen();
      break;
    case "language":
      screenHtml = renderLanguageScreen();
      break;
    case "problem":
      screenHtml = renderProblemScreen();
      break;
    case "action":
      screenHtml = renderActionScreen();
      break;
    case "sos":
      screenHtml = renderSosScreen();
      break;
    case "finish":
      screenHtml = renderFinishScreen();
      break;
    default:
      screenHtml = renderHomeScreen();
      break;
  }

  app.innerHTML = `
    ${renderTopbar()}
    ${renderBanner()}
    ${renderOfflineStatus()}
    ${screenHtml}
    ${renderPersistentSos()}
  `;

  bindCommonEvents();

  if (state.screen === "action") {
    const scenario = getScenario();
    if (!scenario) {
      return;
    }
    const expandedSteps = getExpandedSteps(scenario);
    const action = getAction(expandedSteps[state.stepIndex]);
    if (action?.timerSec) {
      startTimer(action.timerSec);
    }
  }
}

function renderInitErrorScreen() {
  app.innerHTML = `
    <section class="screen-card hero">
      <h1 class="hero-title">Нет соединения</h1>
      <p class="hero-text">
        Приложение загрузится после первого онлайн-запуска.
      </p>
      <button class="main-button" data-action="retry-init">
        <span class="button-label">Попробовать снова</span>
      </button>
    </section>
  `;

  app.querySelector('[data-action="retry-init"]')?.addEventListener("click", () => {
    init();
  });
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">🛟</div>
        <div>
          <h1 class="brand-title">${u("appName")}</h1>
          <p class="brand-subtitle">${u("appSubtitle")}</p>
        </div>
      </div>
      <div class="state-row">
        ${
          state.screen !== "home"
            ? `<button class="icon-button" data-action="go-back" aria-label="${u(
                "backButton"
              )}">←</button>`
            : ""
        }
        <button class="icon-button ${
          state.voiceEnabled ? "active" : ""
        }" data-action="toggle-voice" aria-label="${state.voiceEnabled ? u("voiceOn") : u("voiceOff")}">
          ${state.voiceEnabled ? "🔊" : "🔇"}
        </button>
        <button class="icon-button ${
          state.lowPower ? "active" : ""
        }" data-action="toggle-low-power" aria-label="${u("lowPowerButton")}">
          🔋
        </button>
        ${
          state.deferredPrompt
            ? `<button class="icon-button" data-action="install-app" aria-label="${u(
                "installButton"
              )}">＋</button>`
            : ""
        }
      </div>
    </header>
  `;
}

function renderBanner() {
  if (!state.bannerMessage) {
    return "";
  }

  return `
    <section class="offline-status is-warning" data-action="dismiss-banner">
      ${escapeHtml(state.bannerMessage)}
    </section>
  `;
}

function renderOfflineStatus() {
  const text = navigator.onLine ? "Online / ready to cache" : "Offline mode";
  const statusClass = navigator.onLine ? "is-ready" : "is-warning";

  return `<section class="offline-status ${statusClass}" aria-live="polite">${text}</section>`;
}

function renderHomeScreen() {
  return `
    <section class="screen-card hero">
      <h2 class="hero-title">Что случилось?</h2>
      <p class="hero-text">${u("homeText")}</p>

      <button class="danger-button emergency-hero" data-action="open-sos" aria-label="${u(
        "sosButton"
      )}">
        <span class="button-label">${u("sosButton")}</span>
        <span class="button-note">${u("sosHint")}</span>
      </button>

      <div class="quick-grid">
        ${HOME_SHORTCUTS.map((item) => renderQuickShortcut(item)).join("")}
      </div>

      <button class="secondary-button" data-action="go-place">
        <span class="button-label">Выбрать вручную</span>
        <span class="button-note">${u("homeButtonNote")}</span>
      </button>

      <button class="ghost-button" data-action="open-language">
        <span class="button-label">Language: ${getLanguageDisplayName(state.lang)} ▾</span>
      </button>
    </section>
  `;
}

function renderQuickShortcut(shortcut) {
  const problem = getProblem(shortcut.problemId);
  return `
    <button
      class="choice-card quick-card"
      data-shortcut-place="${shortcut.placeId}"
      data-shortcut-problem="${shortcut.problemId}"
      aria-label="${t(problem.title)}"
    >
      <div class="choice-card-icon">${shortcut.icon}</div>
      <h3 class="choice-title">${t(shortcut.label) || t(problem.title)}</h3>
      <p class="choice-subtitle">${t(problem.hint)}</p>
    </button>
  `;
}

function renderPlaceScreen() {
  return `
    <section class="screen-card">
      <h2 class="screen-title">${u("placeTitle")}</h2>
      <p class="screen-hint">${u("placeHint")}</p>
      <div class="choice-grid">
        ${state.data.places
          .map(
            (place) => `
              <button class="choice-card" data-place="${place.id}">
                <div class="choice-card-icon">${place.icon}</div>
                <h3 class="choice-title">${t(place.title)}</h3>
                <p class="choice-subtitle">${t(place.hint)}</p>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderLanguageScreen() {
  const recommended = RECOMMENDED_LANGUAGE_IDS.map(findLanguageById).filter(Boolean);
  const filtered = getFilteredLanguages();

  return `
    <section class="screen-card">
      <h2 class="screen-title">${u("languageLabel")}</h2>
      <input
        id="language-search"
        class="manual-location"
        type="search"
        placeholder="Search language"
        value="${escapeHtml(state.langSearch)}"
        aria-label="Search language"
      />

      <div>
        <p class="meta-text">Recommended</p>
        <div class="choice-grid">
          ${recommended.map(renderLanguageOption).join("")}
        </div>
      </div>

      <div>
        <p class="meta-text">All languages</p>
        <div class="choice-grid">
          ${filtered.map(renderLanguageOption).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderLanguageOption(language) {
  const isActive = language.id === state.lang;
  return `
    <button
      class="choice-card ${isActive ? "active" : ""}"
      data-pick-lang="${language.id}"
      aria-label="${getLanguageDisplayName(language.id)}"
    >
      <h3 class="choice-title">${getLanguageDisplayName(language.id)}</h3>
      <p class="choice-subtitle">${getLanguageEnglishName(language.id)} · ${language.id.toUpperCase()}</p>
    </button>
  `;
}

function renderProblemScreen() {
  const place = getPlace(state.placeId);
  const problems = place.problemIds.map(getProblem);
  return `
    <section class="screen-card">
      <p class="meta-text">${t(place.title)}</p>
      <h2 class="screen-title">${u("problemTitle")}</h2>
      <p class="screen-hint">${u("problemHint")}</p>
      <div class="choice-grid">
        ${problems
          .map(
            (problem) => `
              <button class="choice-card" data-problem="${problem.id}">
                <div class="choice-card-icon">${problem.icon}</div>
                <h3 class="choice-title">${t(problem.title)}</h3>
                <p class="choice-subtitle">${t(problem.hint)}</p>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderActionScreen() {
  const scenario = getScenario();
  if (!scenario) {
    return renderMissingScenarioScreen();
  }

  const expandedSteps = getExpandedSteps(scenario);
  const action = getAction(expandedSteps[state.stepIndex]);
  const currentText = t(action.text);
  const currentVoice = action.voice ? t(action.voice) : currentText;
  const actionDetail = action.detail ? t(action.detail) : "";

  return `
    <section class="screen-card action-screen">
      <div>
        <p class="meta-text">${getScenarioTitle()}</p>
        <p class="screen-hint">Шаг ${state.stepIndex + 1} из ${expandedSteps.length}</p>
        <div class="progress">
          ${expandedSteps
            .map(
              (_, index) =>
                `<span class="progress-dot ${
                  index <= state.stepIndex ? "active" : ""
                }"></span>`
            )
            .join("")}
        </div>
      </div>

      <div class="action-panel">
        <div class="action-display">
          <div class="action-icon" aria-hidden="true">${action.icon}</div>
          <h2 class="action-text">${currentText}</h2>
          ${actionDetail ? `<p class="action-detail">${actionDetail}</p>` : ""}
          <p class="screen-hint">${currentVoice}</p>
          <p class="timer ${action.timerSec ? "" : "hidden"}" id="timer"></p>
          <p class="voice-note ${
            !state.speechSupported || !state.speechReady ? "" : "hidden"
          }">
            ${u("voiceUnavailable")}
          </p>
        </div>

        <div class="action-toolbar">
          ${
            state.speechReady
              ? `
                <button class="secondary-button" data-action="repeat-step">
                  ${u("speakButton")}
                </button>
              `
              : ""
          }
          <button class="secondary-button" data-action="toggle-voice">
            ${state.voiceEnabled ? u("voiceOn") : u("voiceOff")}
          </button>
        </div>
      </div>

      <div class="footer-actions">
        <button class="ghost-button" data-action="step-back">${u("backButton")}</button>
        <button class="action-button" data-action="step-next">
          ${state.stepIndex === expandedSteps.length - 1 ? u("finishButton") : u("nextButton")}
        </button>
        <button class="danger-button" data-action="open-sos">${u("sosButton")}</button>
      </div>
    </section>
  `;
}

function renderMissingScenarioScreen() {
  return `
    <section class="screen-card hero">
      <h2 class="screen-title">Сценарий не найден</h2>
      <button class="main-button" data-action="go-home">
        <span class="button-label">На главную</span>
      </button>
    </section>
  `;
}

function renderFinishScreen() {
  return `
    <section class="screen-card hero">
      <h2 class="screen-title">Сценарий завершён</h2>
      <button class="secondary-button" data-action="open-sos">
        <span class="button-label">Открыть SOS</span>
      </button>
      <button class="main-button" data-action="go-home">
        <span class="button-label">Начать сначала</span>
      </button>
    </section>
  `;
}

function renderSosScreen() {
  const coords = getCurrentCoords();
  const coordsText = coords
    ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
    : u("coordsUnknown");
  const accuracyText =
    coords && Number.isFinite(coords.accuracy)
      ? `±${Math.round(coords.accuracy)} м`
      : "—";
  const timeText = coords ? formatTimestamp(coords.timestamp) : "—";
  const sourceText = coords
    ? coords.source === "live"
      ? u("gpsLive")
      : `${u("gpsLastKnown")} · ${u("gpsMayBeOld")}`
    : "—";

  return `
    <section class="screen-card sos-panel">
      <h2 class="screen-title">${u("sosTitle")}</h2>
      <p class="screen-hint">${u("sosHint")}</p>

      <div class="sos-box">
        <p class="meta-text">${u("coordsLabel")}</p>
        <p class="sos-coords">${coordsText}</p>
        <p class="status-line">${u("accuracyLabel")}: ${accuracyText}</p>
        <p class="status-line">${u("timeLabel")}: ${timeText}</p>
        <p class="status-line">${u("sourceLabel")}: ${sourceText}</p>
        ${
          state.sosError
            ? `<p class="status-line status-warning">${state.sosError}</p>`
            : ""
        }
      </div>

      <div class="sos-box">
        <label class="meta-text" for="manual-location">${u("manualLocationLabel")}</label>
        <textarea
          id="manual-location"
          class="manual-location"
          rows="3"
          placeholder="${u("manualLocationPlaceholder")}"
        >${escapeHtml(state.sosPlaceDescription)}</textarea>
        ${
          state.placeRecognitionSupported
            ? `
              <button
                class="ghost-button"
                data-action="start-place-dictation"
                ${state.sosRecognitionActive ? "disabled" : ""}
              >
                ${state.sosRecognitionActive ? "🎙️ ..." : "🎙️ Сказать место"}
              </button>
            `
            : ""
        }
      </div>

      <div class="sos-box">
        <p class="meta-text">${u("messageLabel")}</p>
        <pre class="sos-message">${escapeHtml(buildSosMessage())}</pre>
      </div>

      <div class="sos-row">
        <button class="main-button" data-action="call-112" aria-label="${u("callButton")}">
          <span class="button-label">${u("callButton")}</span>
          <span class="button-note">112</span>
        </button>
        <button class="secondary-button" data-action="get-location">
          ${state.sosLoading ? u("loadingCoords") : u("locationButton")}
        </button>
      </div>

      <div class="sos-actions">
        <button class="ghost-button" data-action="copy-sos">${u("copyButton")}</button>
        <button class="ghost-button" data-action="share-sos" ${
          navigator.share ? "" : "disabled"
        }>${u("shareButton")}</button>
      </div>

      <button class="ghost-button" data-action="close-sos">${u("backButton")}</button>
    </section>
  `;
}

function renderPersistentSos() {
  return `
    <div class="sos-sticky">
      <button
        class="sos-sticky-button ${state.screen === "sos" ? "active" : ""}"
        data-action="open-sos"
        aria-label="${u("sosButton")}"
      >
        <span class="sos-sticky-icon">🆘</span>
        <span>${u("sosButton")}</span>
      </button>
    </div>
  `;
}

function bindCommonEvents() {
  const languageSearch = app.querySelector("#language-search");
  if (languageSearch) {
    languageSearch.addEventListener("input", (event) => {
      state.langSearch = event.target.value;
      render();
      const field = app.querySelector("#language-search");
      if (field) {
        field.focus();
        field.setSelectionRange(state.langSearch.length, state.langSearch.length);
      }
    });
  }

  const manualLocation = app.querySelector("#manual-location");
  if (manualLocation) {
    manualLocation.addEventListener("input", (event) => {
      state.sosPlaceDescription = event.target.value.trimStart();
      localStorage.setItem(MANUAL_LOCATION_KEY, state.sosPlaceDescription);
      const messageNode = app.querySelector(".sos-message");
      if (messageNode) {
        messageNode.textContent = buildSosMessage();
      }
    });
  }

  app.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      localStorage.setItem("survival_lang", state.lang);
      document.documentElement.lang = state.lang;
      render();
    });
  });

  app.querySelectorAll("[data-pick-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.pickLang;
      state.langSearch = "";
      localStorage.setItem("survival_lang", state.lang);
      localStorage.setItem("survival_lang_manual", "1");
      document.documentElement.lang = state.lang;
      state.screen = "home";
      render();
    });
  });

  app.querySelectorAll("[data-place]").forEach((button) => {
    button.addEventListener("click", () => {
      state.placeId = button.dataset.place;
      state.problemId = null;
      state.screen = "problem";
      render();
    });
  });

  app.querySelectorAll("[data-problem]").forEach((button) => {
    button.addEventListener("click", () => {
      openScenario(state.placeId, button.dataset.problem);
    });
  });

  app.querySelectorAll("[data-shortcut-place]").forEach((button) => {
    button.addEventListener("click", () => {
      openScenario(button.dataset.shortcutPlace, button.dataset.shortcutProblem);
    });
  });

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      switch (action) {
        case "go-place":
          state.screen = "place";
          render();
          break;
        case "open-language":
          state.langSearch = "";
          state.screen = "language";
          render();
          requestAnimationFrame(() => {
            app.querySelector("#language-search")?.focus();
          });
          break;
        case "go-back":
          handleBack();
          break;
        case "step-next":
          handleNextStep();
          break;
        case "step-back":
          handleBackStep();
          break;
        case "repeat-step":
          speakCurrentStep({ interrupt: true, force: true });
          break;
        case "open-sos":
          openSos();
          break;
        case "close-sos":
          state.screen =
            getScenario() && state.stepIndex <= getExpandedSteps(getScenario()).length - 1
              ? "action"
              : "home";
          render();
          break;
        case "get-location":
          loadLocation();
          break;
        case "copy-sos":
          copySos();
          break;
        case "share-sos":
          shareSos();
          break;
        case "call-112":
          window.location.href = "tel:112";
          break;
        case "toggle-low-power":
          state.lowPower = !state.lowPower;
          localStorage.setItem("survival_low_power", state.lowPower ? "1" : "0");
          if (state.lowPower) {
            showBanner("Режим экономии заряда: озвучка отключена.");
          }
          render();
          break;
        case "toggle-voice":
          state.voiceEnabled = !state.voiceEnabled;
          localStorage.setItem("survival_voice", state.voiceEnabled ? "1" : "0");
          render();
          break;
        case "install-app":
          await promptInstall();
          break;
        case "go-home":
          goHome();
          break;
        case "retry-init":
          init();
          break;
        case "dismiss-banner":
          dismissBanner();
          break;
        case "start-place-dictation":
          startPlaceDictation();
          break;
        default:
          break;
      }
    });
  });
}

function openScenario(placeId, problemId) {
  state.placeId = placeId;
  state.problemId = problemId;
  state.stepIndex = 0;
  state.screen = "action";
  render();
}

function openSos() {
  state.sosLoading = true;
  state.sosError = "";
  state.screen = "sos";
  render();
  loadLocation(true);
}

function goHome() {
  state.screen = "home";
  state.placeId = null;
  state.problemId = null;
  state.stepIndex = 0;
  render();
}

function handleBack() {
  if (state.screen === "language") {
    state.screen = "home";
  } else if (state.screen === "problem") {
    state.screen = "place";
  } else if (state.screen === "place") {
    state.screen = "home";
  } else if (state.screen === "action") {
    state.screen = "problem";
  } else if (state.screen === "sos") {
    state.screen = getScenario() ? "action" : "home";
  } else if (state.screen === "finish") {
    state.screen = "home";
  }
  render();
}

function handleNextStep() {
  const scenario = getScenario();
  if (!scenario) {
    state.screen = "home";
    render();
    return;
  }

  const expandedSteps = getExpandedSteps(scenario);
  if (state.stepIndex >= expandedSteps.length - 1) {
    state.screen = "finish";
    render();
    return;
  }
  state.stepIndex += 1;
  render();
}

function handleBackStep() {
  if (state.stepIndex === 0) {
    state.screen = "problem";
    render();
    return;
  }
  state.stepIndex -= 1;
  render();
}

function speakCurrentStep(options = {}) {
  if (state.lowPower) {
    return;
  }
  if (!state.voiceEnabled && !options.force) {
    return;
  }
  const scenario = getScenario();
  if (!scenario) {
    return;
  }
  const expandedSteps = getExpandedSteps(scenario);
  const action = getAction(expandedSteps[state.stepIndex]);
  const voiceText = action.voice ? t(action.voice) : t(action.text);
  speak(voiceText, options);
}

function speak(text, options = {}) {
  if (!state.speechSupported || !state.speechReady || !text || state.lowPower) {
    return;
  }
  if (!state.voiceEnabled && !options.force) {
    return;
  }
  if (options.interrupt) {
    window.speechSynthesis.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang =
    state.lang === "ru"
      ? "ru-RU"
      : state.lang === "et"
      ? "et-EE"
      : state.lang === "fi"
      ? "fi-FI"
      : state.lang === "lv"
      ? "lv-LV"
      : state.lang === "lt"
      ? "lt-LT"
      : "en-US";
  utterance.rate = 0.92;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  state.timerLeft = null;
}

function startTimer(seconds) {
  state.timerLeft = seconds;
  updateTimerLabel();
  state.timerId = setInterval(() => {
    state.timerLeft -= 1;
    updateTimerLabel();
    if (state.timerLeft <= 0) {
      clearTimer();
    }
  }, 1000);
}

function updateTimerLabel() {
  const timerNode = document.getElementById("timer");
  if (!timerNode || state.timerLeft == null) {
    return;
  }
  timerNode.textContent = `${u("timerLabel")}: ${state.timerLeft}s`;
}

function loadLocation(skipStartRender = false) {
  if (!navigator.geolocation) {
    state.sosLoading = false;
    state.sosError = u("locationUnavailable");
    render();
    return;
  }

  state.sosLoading = true;
  state.sosError = "";
  if (!skipStartRender) {
    render();
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.sosCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now(),
        source: "live"
      };
      saveCoords(state.sosCoords);
      state.sosLoading = false;
      state.sosError = "";
      render();
    },
    () => {
      state.sosLoading = false;
      const cached = loadStoredCoords();
      if (cached) {
        state.sosCoords = cached;
        state.sosError = `${u("locationDenied")} ${u("gpsMayBeOld")}`;
      } else {
        state.sosError = u("locationDenied");
      }
      render();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

function getCurrentCoords() {
  if (!state.sosCoords) {
    return null;
  }
  const age = Date.now() - state.sosCoords.timestamp;
  return {
    ...state.sosCoords,
    stale: age > MAX_FRESH_MS || state.sosCoords.source === "cached"
  };
}

function buildSosMessage() {
  const coords = getCurrentCoords();
  const situation = getScenarioTitle();

  if (!coords) {
    const description = state.sosPlaceDescription || "";
    return [
      "SOS. Мне нужна помощь.",
      `Ситуация: ${situation || "не указано"}`,
      "Координаты недоступны.",
      `Моё описание места: ${description}`
    ].join("\n");
  }

  const parts = [
    "SOS. Мне нужна помощь.",
    `Ситуация: ${situation || "не указано"}`,
    `Координаты: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
    `Точность: ±${Math.round(coords.accuracy || 0)} м`,
    `Время: ${formatTimestamp(coords.timestamp)}`
  ];

  if (coords.stale) {
    parts.push("Если координаты старые — это последняя известная позиция.");
  }

  if (state.sosPlaceDescription) {
    parts.push(`Моё описание места: ${state.sosPlaceDescription}`);
  }

  return parts.join("\n");
}

async function copySos() {
  try {
    await navigator.clipboard.writeText(buildSosMessage());
    alert(u("copyDone"));
  } catch (_) {
    alert(u("copyFailed"));
  }
}

async function shareSos() {
  if (!navigator.share) {
    return;
  }
  try {
    await navigator.share({
      title: u("sosTitle"),
      text: buildSosMessage()
    });
  } catch (_) {}
}

async function promptInstall() {
  if (!state.deferredPrompt) {
    return;
  }
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  render();
}

function startPlaceDictation() {
  if (!state.placeRecognitionSupported || state.lowPower) {
    return;
  }

  const recognition = new SpeechRecognitionApi();
  state.sosRecognitionActive = true;
  render();

  recognition.lang = getSpeechLocale();
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) {
      return;
    }

    state.sosPlaceDescription = state.sosPlaceDescription
      ? `${state.sosPlaceDescription} ${transcript}`.trim()
      : transcript;
    localStorage.setItem(MANUAL_LOCATION_KEY, state.sosPlaceDescription);
  };

  recognition.onerror = () => {};

  recognition.onend = () => {
    state.sosRecognitionActive = false;
    render();
  };

  recognition.start();
}

function saveCoords(coords) {
  localStorage.setItem(
    LAST_COORDS_KEY,
    JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      timestamp: coords.timestamp
    })
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "—";
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function showBanner(message) {
  state.bannerMessage = message;
  if (state.bannerTimeoutId) {
    clearTimeout(state.bannerTimeoutId);
  }
  state.bannerTimeoutId = setTimeout(() => {
    dismissBanner();
  }, 4000);
}

function dismissBanner() {
  state.bannerMessage = "";
  if (state.bannerTimeoutId) {
    clearTimeout(state.bannerTimeoutId);
    state.bannerTimeoutId = null;
  }
  render();
}

function updateLowPowerClass() {
  document.body.classList.toggle("low-power", state.lowPower);
}

function getSpeechLocale() {
  return state.lang === "ru"
    ? "ru-RU"
    : state.lang === "et"
    ? "et-EE"
    : state.lang === "fi"
    ? "fi-FI"
    : state.lang === "lv"
    ? "lv-LV"
    : state.lang === "lt"
    ? "lt-LT"
    : "en-US";
}

function findLanguageById(languageId) {
  return state.data?.languages?.find((language) => language.id === languageId) || null;
}

function getLanguageMeta(languageId) {
  const language = findLanguageById(languageId);
  return {
    ...LANGUAGE_META[languageId],
    ...language
  };
}

function getLanguageDisplayName(languageId) {
  const meta = getLanguageMeta(languageId);
  return meta.nativeName || meta.short || meta.id || languageId;
}

function getLanguageEnglishName(languageId) {
  const meta = getLanguageMeta(languageId);
  return meta.englishName || meta.short || meta.id || languageId;
}

function getFilteredLanguages() {
  const query = state.langSearch.trim().toLowerCase();
  const languages = state.data?.languages || [];
  if (!query) {
    return languages;
  }

  return languages.filter((language) => {
    const meta = getLanguageMeta(language.id);
    const haystack = [
      language.id,
      language.short,
      meta.nativeName || language.short || language.id,
      meta.englishName || language.short || language.id
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

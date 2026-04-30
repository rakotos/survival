const state = {
  data: null,
  lang: localStorage.getItem("survival_lang") || "ru",
  screen: "home",
  placeId: null,
  problemId: null,
  stepIndex: 0,
  lowPower:
    localStorage.getItem("survival_low_power") === "1" ? true : false,
  sosCoords: null,
  sosLoading: false,
  timerId: null,
  timerLeft: null,
  deferredPrompt: null,
};

const app = document.getElementById("app");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.data = await fetch("./scenarios.json").then((response) => response.json());
  bindInstallPrompt();
  applyBatteryMode();
  render();
  registerServiceWorker();
}

function bindInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    render();
  });
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function getUi() {
  return state.data.ui[state.lang] || state.data.ui.ru;
}

function getPlace(placeId) {
  return state.data.places.find((item) => item.id === placeId);
}

function getProblem(problemId) {
  return state.data.problems.find((item) => item.id === problemId);
}

function getScenario() {
  if (!state.placeId || !state.problemId) {
    return null;
  }
  return state.data.scenarios[`${state.placeId}.${state.problemId}`] || null;
}

function getAction(actionId) {
  return state.data.actions[actionId];
}

function t(valueMap) {
  return valueMap[state.lang] || valueMap.en || valueMap.ru || "";
}

function render() {
  updateLowPowerClass();
  clearTimer();

  switch (state.screen) {
    case "place":
      renderPlaceScreen();
      break;
    case "problem":
      renderProblemScreen();
      break;
    case "action":
      renderActionScreen();
      break;
    case "sos":
      renderSosScreen();
      break;
    default:
      renderHomeScreen();
      break;
  }
}

function renderHomeScreen() {
  const ui = getUi();
  app.innerHTML = `
    ${renderTopbar(ui)}
    <section class="screen-card hero">
      <p class="screen-hint">${ui.homeTagline}</p>
      <h1 class="hero-title">${ui.homeTitle}</h1>
      <p class="hero-text">${ui.homeText}</p>
      <button class="main-button" data-action="go-place">
        <span class="button-label">${ui.homeButton}</span>
        <span class="button-note">${ui.homeButtonNote}</span>
      </button>
      <div class="language-row" aria-label="${ui.languageLabel}">
        ${state.data.languages
          .map(
            (lang) => `
              <button class="language-pill ${
                lang.id === state.lang ? "active" : ""
              }" data-lang="${lang.id}">
                ${lang.short}
              </button>
            `
          )
          .join("")}
      </div>
      <p class="small-note">${ui.offlineNote}</p>
    </section>
  `;
  bindCommonEvents();
}

function renderPlaceScreen() {
  const ui = getUi();
  app.innerHTML = `
    ${renderTopbar(ui, true)}
    <section class="screen-card">
      <h2 class="screen-title">${ui.placeTitle}</h2>
      <p class="screen-hint">${ui.placeHint}</p>
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
  bindCommonEvents();
}

function renderProblemScreen() {
  const ui = getUi();
  const place = getPlace(state.placeId);
  const problems = place.problemIds.map(getProblem);
  app.innerHTML = `
    ${renderTopbar(ui, true)}
    <section class="screen-card">
      <p class="meta-text">${t(place.title)}</p>
      <h2 class="screen-title">${ui.problemTitle}</h2>
      <p class="screen-hint">${ui.problemHint}</p>
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
  bindCommonEvents();
}

function renderActionScreen() {
  const ui = getUi();
  const scenario = getScenario();
  const actionId = scenario.steps[state.stepIndex];
  const action = getAction(actionId);
  const currentText = t(action.text);
  const currentVoice = action.voice ? t(action.voice) : currentText;
  const title = `${getPlace(state.placeId).icon} ${t(getProblem(state.problemId).title)}`;

  app.innerHTML = `
    ${renderTopbar(ui, true)}
    <section class="screen-card action-screen">
      <div>
        <p class="meta-text">${title}</p>
        <div class="progress">
          ${scenario.steps
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
          <p class="screen-hint">${currentVoice}</p>
          <p class="timer ${action.timerSec ? "" : "hidden"}" id="timer"></p>
        </div>

        <div class="action-toolbar">
          <button class="secondary-button" data-action="speak-step">
            ${ui.speakButton}
          </button>
          <button class="secondary-button" data-action="open-sos">
            ${ui.sosButton}
          </button>
        </div>
      </div>

      <div class="footer-actions">
        <button class="ghost-button" data-action="step-back">${ui.backButton}</button>
        <button class="action-button" data-action="step-next">
          ${state.stepIndex === scenario.steps.length - 1 ? ui.finishButton : ui.nextButton}
        </button>
        <button class="danger-button" data-action="open-sos">${ui.sosButton}</button>
      </div>
    </section>
  `;

  bindCommonEvents();
  if (action.timerSec) {
    startTimer(action.timerSec);
  }
  speak(currentVoice, { interrupt: true });
}

function renderSosScreen() {
  const ui = getUi();
  const coords = state.sosCoords
    ? `${state.sosCoords.latitude.toFixed(5)}, ${state.sosCoords.longitude.toFixed(5)}`
    : ui.coordsUnknown;
  const message = buildSosMessage();

  app.innerHTML = `
    ${renderTopbar(ui, true)}
    <section class="screen-card sos-panel">
      <h2 class="screen-title">${ui.sosTitle}</h2>
      <p class="screen-hint">${ui.sosHint}</p>

      <div class="sos-box">
        <p class="meta-text">${ui.coordsLabel}</p>
        <p class="sos-coords">${coords}</p>
      </div>

      <div class="sos-box">
        <p class="meta-text">${ui.messageLabel}</p>
        <p class="sos-message">${message}</p>
      </div>

      <div class="sos-row">
        <button class="main-button" data-action="call-112">
          <span class="button-label">${ui.callButton}</span>
          <span class="button-note">112</span>
        </button>
        <button class="secondary-button" data-action="get-location">
          ${state.sosLoading ? ui.loadingCoords : ui.locationButton}
        </button>
      </div>

      <div class="sos-actions">
        <button class="ghost-button" data-action="copy-sos">${ui.copyButton}</button>
        <button class="ghost-button" data-action="share-sos" ${
          navigator.share ? "" : "disabled"
        }>${ui.shareButton}</button>
      </div>

      <button class="ghost-button" data-action="close-sos">${ui.backButton}</button>
    </section>
  `;

  bindCommonEvents();
}

function renderTopbar(ui, backVisible = false) {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">🛟</div>
        <div>
          <h1 class="brand-title">${ui.appName}</h1>
          <p class="brand-subtitle">${ui.appSubtitle}</p>
        </div>
      </div>
      <div class="state-row">
        ${
          backVisible
            ? `<button class="icon-button" data-action="go-back" aria-label="${ui.backButton}">←</button>`
            : ""
        }
        <button class="icon-button ${
          state.lowPower ? "active" : ""
        }" data-action="toggle-low-power" aria-label="${ui.lowPowerButton}">
          🔋
        </button>
        ${
          state.deferredPrompt
            ? `<button class="icon-button" data-action="install-app" aria-label="${ui.installButton}">＋</button>`
            : ""
        }
      </div>
    </header>
  `;
}

function bindCommonEvents() {
  app.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      localStorage.setItem("survival_lang", state.lang);
      document.documentElement.lang = state.lang;
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
      state.problemId = button.dataset.problem;
      state.stepIndex = 0;
      state.screen = "action";
      render();
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
        case "go-back":
          handleBack();
          break;
        case "step-next":
          handleNextStep();
          break;
        case "step-back":
          handleBackStep();
          break;
        case "speak-step":
          speakCurrentStep();
          break;
        case "open-sos":
          state.screen = "sos";
          render();
          loadLocation();
          break;
        case "close-sos":
          state.screen = "action";
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
          render();
          break;
        case "install-app":
          await promptInstall();
          break;
        default:
          break;
      }
    });
  });
}

function handleBack() {
  if (state.screen === "problem") {
    state.screen = "place";
  } else if (state.screen === "place") {
    state.screen = "home";
  } else if (state.screen === "action") {
    state.screen = "problem";
  } else if (state.screen === "sos") {
    state.screen = "action";
  }
  render();
}

function handleNextStep() {
  const scenario = getScenario();
  if (state.stepIndex >= scenario.steps.length - 1) {
    state.screen = "problem";
    state.stepIndex = 0;
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

function speakCurrentStep() {
  const scenario = getScenario();
  const action = getAction(scenario.steps[state.stepIndex]);
  const voiceText = action.voice ? t(action.voice) : t(action.text);
  speak(voiceText, { interrupt: true });
}

function speak(text, options = {}) {
  if (!("speechSynthesis" in window) || !text) {
    return;
  }
  if (options.interrupt) {
    window.speechSynthesis.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.lang === "ru"
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
  const ui = getUi();
  timerNode.textContent = `${ui.timerLabel}: ${state.timerLeft}s`;
}

async function loadLocation() {
  const ui = getUi();
  if (!navigator.geolocation) {
    alert(ui.locationUnavailable);
    return;
  }
  state.sosLoading = true;
  render();
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.sosCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      state.sosLoading = false;
      render();
    },
    () => {
      state.sosLoading = false;
      alert(ui.locationDenied);
      render();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    }
  );
}

function buildSosMessage() {
  const ui = getUi();
  if (!state.sosCoords) {
    return ui.sosMessageNoCoords;
  }
  return `${ui.sosMessagePrefix} ${state.sosCoords.latitude.toFixed(
    5
  )}, ${state.sosCoords.longitude.toFixed(5)}.`;
}

async function copySos() {
  const ui = getUi();
  try {
    await navigator.clipboard.writeText(buildSosMessage());
    alert(ui.copyDone);
  } catch (_) {
    alert(ui.copyFailed);
  }
}

async function shareSos() {
  if (!navigator.share) {
    return;
  }
  const ui = getUi();
  try {
    await navigator.share({
      title: ui.sosTitle,
      text: buildSosMessage(),
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

function updateLowPowerClass() {
  document.body.classList.toggle("low-power", state.lowPower);
}

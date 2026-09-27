const DEFAULTS = {
  apiKey: "",
  sensitivity: 2,
  enabled: true,
  detectAiContent: true,
  language: "vi",
};

const SENSITIVITY_KEYS = {
  1: "sensitivityLow",
  2: "sensitivityMedium",
  3: "sensitivityHigh",
};

const el = (id) => document.getElementById(id);

function applyTranslations(i18n) {
  document.documentElement.lang = i18n.lang;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = i18n.t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.dataset.i18nPlaceholder;
    node.placeholder = i18n.t(key);
  });
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);

  const i18n = new self.SafePostI18n(stored.language || DEFAULTS.language);
  applyTranslations(i18n);
  self._safePostI18n = i18n;

  el("apiKey").value = stored.apiKey || "";
  el("sensitivity").value = String(stored.sensitivity ?? DEFAULTS.sensitivity);
  el("sensitivityValue").textContent = i18n.t(
    SENSITIVITY_KEYS[el("sensitivity").value]
  );
  el("enabled").checked = stored.enabled ?? DEFAULTS.enabled;
  el("detectAiContent").checked =
    stored.detectAiContent ?? DEFAULTS.detectAiContent;
  el("language").value = i18n.lang;
}

async function saveSettings() {
  const apiKey = el("apiKey").value.trim();
  const sensitivity = Number(el("sensitivity").value);
  const enabled = el("enabled").checked;
  const detectAiContent = el("detectAiContent").checked;
  const language = el("language").value;
  const status = el("status");
  const i18n = self._safePostI18n || new self.SafePostI18n(language);

  try {
    await chrome.storage.local.set({ apiKey, sensitivity, enabled, detectAiContent, language });
    i18n.setLanguage(language);
    applyTranslations(i18n);
    el("sensitivityValue").textContent = i18n.t(SENSITIVITY_KEYS[sensitivity]);

    status.textContent = i18n.t("settingsSaved");
    status.className = "popup__status";
    setTimeout(() => {
      status.textContent = "";
    }, 3000);
  } catch (err) {
    status.textContent = i18n.t("settingsError", { message: err.message });
    status.className = "popup__status popup__status--error";
  }
}

function init() {
  loadSettings();

  el("language").addEventListener("change", (e) => {
    const i18n = self._safePostI18n || new self.SafePostI18n(e.target.value);
    i18n.setLanguage(e.target.value);
    applyTranslations(i18n);
    el("sensitivityValue").textContent = i18n.t(
      SENSITIVITY_KEYS[el("sensitivity").value]
    );
  });

  el("sensitivity").addEventListener("input", (e) => {
    const i18n = self._safePostI18n || new self.SafePostI18n("vi");
    el("sensitivityValue").textContent = i18n.t(
      SENSITIVITY_KEYS[e.target.value]
    );
  });

  el("showKey").addEventListener("change", (e) => {
    el("apiKey").type = e.target.checked ? "text" : "password";
  });

  el("save").addEventListener("click", saveSettings);
}

document.addEventListener("DOMContentLoaded", init);

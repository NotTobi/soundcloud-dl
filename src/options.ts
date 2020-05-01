import { configLogger, config, configKeys, loadConfiguration, storeConfiguration } from "./config";

async function saveSettings(e) {
  e.preventDefault();

  configLogger.logInfo("Saving settings...");

  const values = configKeys.reduce((acc, cur) => {
    const elem = document.querySelector<HTMLInputElement>(`#${cur}`);

    if (elem !== null) {
      if (elem.type === "checkbox") acc[cur] = elem.checked;
      else acc[cur] = elem.value;
    }

    return acc;
  }, {});

  try {
    await storeConfiguration(values);
  } catch (error) {
    configLogger.logError("Failed to save settings!", error);
  }
}

async function restoreSettings() {
  configLogger.logInfo("Restoring settings...");

  try {
    await loadConfiguration();

    for (const configKey of configKeys) {
      const elem = document.querySelector<HTMLInputElement>(`#${configKey}`);

      if (elem === null) continue;

      const value = config[configKey];

      if (typeof value === "boolean") elem.checked = value;
      else elem.value = value;
    }
  } catch (error) {
    configLogger.logError("Failed to restore settings!", error);
  }
}

document.addEventListener("DOMContentLoaded", restoreSettings);
document.querySelector("form").addEventListener("submit", saveSettings);

import { configLogger, config } from "./config";

const configKeys = Object.keys(config);

async function saveOptions(e) {
  configLogger.logInfo("Saving settings...");

  e.preventDefault();

  const values = configKeys.reduce((acc, cur) => {
    const elem = document.querySelector<HTMLInputElement>(`#${cur}`);

    if (elem !== null) {
      if (elem.type === "checkbox") acc[cur] = elem.checked;
      else acc[cur] = elem.value;
    }

    return acc;
  }, {});

  try {
    await browser.storage.sync.set(values);
  } catch (error) {
    configLogger.logError("Failed to save settings!", error);
  }
}

async function restoreOptions() {
  configLogger.logInfo("Restoring settings...");

  try {
    const result = await browser.storage.sync.get(configKeys);

    for (const configKey of configKeys) {
      const elem = document.querySelector<HTMLInputElement>(`#${configKey}`);

      if (elem === null) continue;

      const value = result[configKey] ?? config[configKey];

      if (typeof value === "boolean") elem.checked = value;
      else elem.value = value;
    }
  } catch (error) {
    configLogger.logError("Failed to restore settings!", error);
  }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

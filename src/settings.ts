import { config, configKeys, loadConfiguration, storeConfigValue } from "./config";
import { Logger } from "./logger";

const logger = Logger.create("Settings");

async function saveSettings(e) {
  e.preventDefault();

  logger.logInfo("Saving settings...");

  for (const configKey of configKeys) {
    const elem = document.querySelector<HTMLInputElement>(`#${configKey}`);

    if (elem === null) continue;

    let value;

    if (elem.type === "checkbox") value = elem.checked;
    else value = elem.value;

    await storeConfigValue(configKey, value);
  }
}

async function restoreSettings() {
  logger.logInfo("Restoring settings...");

  try {
    await loadConfiguration();

    for (const configKey of configKeys) {
      const elem = document.querySelector<HTMLInputElement>(`#${configKey}`);

      if (elem === null) continue;

      const value = config[configKey].value;

      if (typeof value === "boolean") elem.checked = value;
      else if (typeof value === "string") elem.value = value;
    }
  } catch (error) {
    logger.logError("Failed to restore settings!", error);
  }
}

document.addEventListener("DOMContentLoaded", restoreSettings);
document.querySelector("form").addEventListener("submit", saveSettings);

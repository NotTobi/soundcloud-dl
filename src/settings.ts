import { configKeys, loadConfiguration, storeConfigValue, getConfigValue, resetConfig } from "./config";
import { Logger } from "./logger";

const logger = Logger.create("Settings");

async function resetSettings(e) {
  e.preventDefault();

  logger.logInfo("Resetting settings...");

  await resetConfig();

  await restoreSettings();
}

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

      const value = getConfigValue(configKey);

      if (typeof value === "boolean") elem.checked = value;
      else if (typeof value === "string") elem.value = value;

      const changeEvent = document.createEvent("HTMLEvents");
      changeEvent.initEvent("change", false, true);
      elem.dispatchEvent(changeEvent);
    }
  } catch (error) {
    logger.logError("Failed to restore settings!", error);
  }
}

const downloadWithoutPromptElem = document.querySelector<HTMLInputElement>("#download-without-prompt");
const defaultDownloadLocationElem = document.querySelector<HTMLInputElement>("#default-download-location");

downloadWithoutPromptElem.onchange = (event: any) => {
  defaultDownloadLocationElem.disabled = !event.target.checked;
};

document.addEventListener("DOMContentLoaded", restoreSettings);
document.querySelector("form").addEventListener("submit", saveSettings);
document.querySelector("form").addEventListener("reset", resetSettings);

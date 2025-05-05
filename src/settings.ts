import { configKeys, loadConfiguration, storeConfigValue, getConfigValue, resetConfig } from "./utils/config";
import { Logger } from "./utils/logger";

const logger = Logger.create("Settings");

async function resetSettings(e: Event) {
  e.preventDefault();

  logger.logInfo("Resetting settings...");

  await resetConfig();

  await restoreSettings();
}

async function saveSettings(e: Event) {
  e.preventDefault();

  logger.logInfo("Saving settings...");

  const savePromises = [];
  for (const configKey of configKeys) {
    const elem = document.querySelector<HTMLInputElement>(`#${configKey}`);

    if (elem === null) continue;

    let value: string | number | boolean;

    if (elem.type === "checkbox") {
      value = elem.checked;
    } else if (elem.type === "number") {
      value = elem.valueAsNumber;
      if (isNaN(value)) {
        logger.logWarn(`Invalid number input for ${configKey}, skipping save.`);
        continue;
      }
    } else {
      value = elem.value;
    }

    savePromises.push(storeConfigValue(configKey, value));
  }

  await Promise.all(savePromises);

  const saveButton = document.querySelector<HTMLButtonElement>("button[type='submit']");
  if (saveButton) {
    const originalText = saveButton.textContent;
    saveButton.textContent = "Saved!";
    saveButton.disabled = true;
    setTimeout(() => {
      saveButton.textContent = originalText;
      saveButton.disabled = false;
    }, 1500);
  }
}

async function restoreSettings() {
  logger.logInfo("Restoring settings...");

  try {
    await loadConfiguration();
    logger.logInfo("Configuration loaded.");

    for (const configKey of configKeys) {
      const elem = document.querySelector<HTMLInputElement>(`#${configKey}`);

      if (elem === null) continue;

      const value = getConfigValue(configKey);
      logger.logInfo(`Restoring key: ${configKey}, Value: ${JSON.stringify(value)} (Type: ${typeof value})`);

      if (typeof value === "boolean") {
        elem.checked = value;
      } else if (typeof value === "number") {
        elem.value = String(value);
      } else if (typeof value === "string") {
        elem.value = value;
      } else {
        logger.logWarn(`Unexpected type for config key ${configKey}: ${typeof value}`);
        if (elem.type === "checkbox") elem.checked = false;
        else elem.value = "";
      }

      const changeEvent = new Event("change", { bubbles: false, cancelable: true });
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

const blockReposts = document.querySelector<HTMLInputElement>("#block-reposts");
const blockPlaylists = document.querySelector<HTMLInputElement>("#block-playlists");

blockReposts.onchange = (event: any) => {
  if (!event.target.checked) blockPlaylists.checked = false;
};

// --- HLS Rate Limiting UI Logic Start ---
const enableHlsRateLimitingElem = document.querySelector<HTMLInputElement>("#enable-hls-rate-limiting");
const hlsRateLimitDelayMsElem = document.querySelector<HTMLInputElement>("#hls-rate-limit-delay-ms");

enableHlsRateLimitingElem.onchange = (event: any) => {
  hlsRateLimitDelayMsElem.disabled = !event.target.checked;
};
// --- HLS Rate Limiting UI Logic End ---

// --- Clear Download History Logic Start ---
const clearHistoryButton = document.querySelector<HTMLButtonElement>("#clear-download-history");

async function clearDownloadHistory() {
  logger.logInfo("Clearing download history...");
  try {
    await storeConfigValue("track-download-history", {});
    const originalText = clearHistoryButton.textContent;
    clearHistoryButton.textContent = "History Cleared!";
    clearHistoryButton.disabled = true;
    setTimeout(() => {
      clearHistoryButton.textContent = originalText;
      clearHistoryButton.disabled = false;
    }, 2000); // Keep disabled for 2 seconds
  } catch (error) {
    logger.logError("Failed to clear download history", error);
    // Optionally show an error message to the user
  }
}

clearHistoryButton.addEventListener("click", clearDownloadHistory);
// --- Clear Download History Logic End ---

document.addEventListener("DOMContentLoaded", restoreSettings);
document.querySelector("form").addEventListener("submit", saveSettings);
document.querySelector("form").addEventListener("reset", resetSettings);

import { Logger } from "./logger";

const logger = Logger.create("Config");

interface Config {
  "download-hq-version": boolean;
  "download-original-version": boolean;
}

export const config: Config = {
  "download-hq-version": true,
  "download-original-version": false,
};

const configKeys = Object.keys(config);

const onStorageChanges = (changes: { [key: string]: browser.storage.StorageChange }, areaName: string) => {
  for (const configKey of configKeys) {
    if (!changes[configKey]) continue;

    config[configKey] = changes[configKey].newValue;
  }
};

browser.storage.onChanged.addListener(onStorageChanges);

export async function initConfiguration() {
  try {
    const values = await browser.storage.sync.get(configKeys);

    for (const configKey of configKeys) {
      if (values[configKey] == null) continue;

      config[configKey] = values[configKey];
    }
  } catch (error) {
    logger.logError("Failed to get configuration from storage.sync", error);
  }
}

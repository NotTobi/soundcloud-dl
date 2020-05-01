import { Logger } from "./logger";

export const configLogger = Logger.create("Config");

interface Config {
  "download-hq-version": boolean;
  "download-original-version": boolean;
}

export const config: Config = {
  "download-hq-version": true,
  "download-original-version": false,
};

export const configKeys = Object.keys(config);

const onStorageChanges = (changes: { [key: string]: browser.storage.StorageChange }, areaName: string) => {
  for (const configKey of configKeys) {
    if (!changes[configKey]) continue;

    config[configKey] = changes[configKey].newValue;
  }
};

browser.storage.onChanged.addListener(onStorageChanges);

export async function loadConfiguration() {
  try {
    const values = await browser.storage.sync.get(configKeys);

    for (const configKey of configKeys) {
      if (values[configKey] == null) continue;

      config[configKey] = values[configKey];
    }
  } catch (error) {
    configLogger.logError("Failed to get configuration from storage.sync", error);
  }
}

export async function storeConfiguration(values: { [key: string]: any }) {
  try {
    await browser.storage.sync.set(values);
  } catch (error) {
    configLogger.logError("Failed to store configuration to storage.sync", error);
  }
}

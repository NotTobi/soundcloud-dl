import { Logger } from "./logger";
import {
  onStorageChanged,
  StorageChange,
  setSyncStorage,
  getSyncStorage,
  getLocalStorage,
  setLocalStorage,
} from "./compatibilityStubs";

const logger = Logger.create("Config");

interface ConfigValue<T> {
  value?: T;
  defaultValue?: T;
  sync?: boolean;
  onChanged?: (value?: T) => void;
}

interface Config {
  "download-hq-version": ConfigValue<boolean>;
  "download-original-version": ConfigValue<boolean>;
  "oauth-token": ConfigValue<string>;
  "client-id": ConfigValue<string>;
  "default-download-location": ConfigValue<string>;
  "download-without-prompt": ConfigValue<boolean>;
  "normalize-track": ConfigValue<boolean>;
}

const config: Config = {
  "download-hq-version": { sync: true, defaultValue: true },
  "download-original-version": { sync: true, defaultValue: false },
  "oauth-token": { defaultValue: undefined },
  "client-id": { defaultValue: undefined },
  "default-download-location": { defaultValue: undefined },
  "download-without-prompt": { sync: true, defaultValue: true },
  "normalize-track": { sync: true, defaultValue: true },
};

export const configKeys = Object.keys(config) as Array<keyof Config>;

function isConfigKey(key: string): key is keyof Config {
  return config[key] !== undefined;
}

export function storeConfigValue<TKey extends keyof Config>(key: TKey, value: Config[TKey]["value"]) {
  if (!isConfigKey(key)) return Promise.reject(`Invalid config key: ${key}`);
  if (config[key].value === value) return Promise.resolve();

  const sync = config[key].sync === true;

  logger.logInfo("Setting", key, "to", value);

  config[key].value = value;

  try {
    if (sync) {
      return setSyncStorage({ [key]: value });
    } else {
      return setLocalStorage({ [key]: value });
    }
  } catch (error) {
    const reason = "Failed to store configuration value";

    logger.logError(reason, { key, value, sync });

    return Promise.reject(reason);
  }
}

export async function loadConfigValue<TKey extends keyof Config>(key: TKey): Promise<Config[TKey]["value"]> {
  if (!isConfigKey(key)) return Promise.reject(`Invalid config key: ${key}`);

  const sync = config[key].sync === true;

  let result;
  if (sync) result = await getSyncStorage(key);
  else result = await getLocalStorage(key);

  return result[key] ?? config[key].defaultValue;
}

export async function loadConfiguration(monitorStorage: boolean = false) {
  for (const key of configKeys) {
    config[key].value = await loadConfigValue(key);
  }

  if (monitorStorage) onStorageChanged(handleStorageChanged);

  return config;
}

export async function resetConfig() {
  for (const key of configKeys) {
    await storeConfigValue(key, config[key].defaultValue);
  }
}

export function getConfigValue<TKey extends keyof Config>(key: TKey): Config[TKey]["value"] {
  return config[key].value;
}

const handleStorageChanged = (changes: { [key: string]: StorageChange }) => {
  for (const key in changes) {
    const { newValue } = changes[key];

    if (!isConfigKey(key) || config[key].value === newValue) continue;

    logger.logInfo("Updating", key, "to", newValue);

    config[key].value = newValue;

    if (config[key].onChanged) config[key].onChanged(newValue as never);
  }
};

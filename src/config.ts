import { Logger } from "./logger";
import {
  onStorageChanged,
  StorageChange,
  setSyncStorage,
  getSyncStorage,
  getLocalStorage,
  setLocalStorage,
} from "./compatibilityStubs";
import sanitizeFilename from "sanitize-filename";

const logger = Logger.create("Config");
let isStorageMonitored = false;

interface ConfigValue<T> {
  value?: T;
  defaultValue?: T;
  sync?: boolean;
  onChanged?: (value: T) => void;
  sanitize?: (value: T) => T;
}

interface Config {
  "download-hq-version": ConfigValue<boolean>;
  "download-original-version": ConfigValue<boolean>;
  "oauth-token": ConfigValue<string>;
  "client-id": ConfigValue<string>;
  "user-id": ConfigValue<number>;
  "default-download-location": ConfigValue<string>;
  "download-without-prompt": ConfigValue<boolean>;
  "normalize-track": ConfigValue<boolean>;
  "block-reposts": ConfigValue<boolean>;
  "include-producers": ConfigValue<boolean>;
  "followed-artists": ConfigValue<number[]>;
}

const config: Config = {
  "download-hq-version": { sync: true, defaultValue: true },
  "download-original-version": { sync: true, defaultValue: false },
  "oauth-token": { defaultValue: undefined },
  "client-id": { defaultValue: undefined },
  "user-id": { defaultValue: undefined },
  "default-download-location": { defaultValue: "SoundCloud", sanitize: (value) => sanitizeFilename(value) },
  "download-without-prompt": { defaultValue: true },
  "normalize-track": { sync: true, defaultValue: true },
  "block-reposts": { sync: true, defaultValue: false },
  "include-producers": { sync: true, defaultValue: true },
  "followed-artists": { defaultValue: [] },
};

export const configKeys = Object.keys(config) as Array<keyof Config>;

function isConfigKey(key: string): key is keyof Config {
  return config[key] !== undefined;
}

export async function storeConfigValue<TKey extends keyof Config>(key: TKey, value: Config[TKey]["value"]) {
  if (!isConfigKey(key)) return Promise.reject(`Invalid config key: ${key}`);
  if (config[key].value === value) return Promise.resolve();

  const sync = config[key].sync === true;

  if (config[key].sanitize) {
    value = config[key].sanitize(value as never);
  }

  logger.logInfo("Setting", key, "to", value);

  config[key].value = value;

  try {
    if (sync) {
      await setSyncStorage({ [key]: value });
    } else {
      await setLocalStorage({ [key]: value });
    }

    if (config[key].onChanged) config[key].onChanged(value as never);
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

async function loadConfigValues<TKey extends keyof Config>(keys: TKey[]) {
  if (!keys.every(isConfigKey)) return Promise.reject("Invalid config keys");

  const syncKeys = keys.filter((key) => config[key].sync === true);
  const localKeys = keys.filter((key) => !config[key].sync);

  return {
    ...(await getSyncStorage(syncKeys)),
    ...(await getLocalStorage(localKeys)),
  };
}

export async function loadConfiguration(monitorStorage: boolean = false) {
  const values = await loadConfigValues(configKeys);

  for (const key of configKeys) {
    config[key].value = values[key];
  }

  if (monitorStorage && !isStorageMonitored) {
    onStorageChanged(handleStorageChanged);

    isStorageMonitored = true;
  }

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

export function registerConfigChangeHandler<TKey extends keyof Config>(
  key: TKey,
  callback: (newValue: Config[TKey]["value"]) => void
) {
  config[key].onChanged = callback;
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

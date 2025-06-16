import { Logger } from "./logger";
import {
  onStorageChanged,
  StorageChange,
  setSyncStorage,
  getSyncStorage,
  getLocalStorage,
  setLocalStorage,
} from "../compatibilityStubs";
import { sanitizeFilenameForDownload } from "./download";

const logger = Logger.create("Config");
let isStorageMonitored = false;

interface ConfigValue<T> {
  value?: T;
  defaultValue?: T;
  secret?: boolean;
  sync?: boolean;
  onChanged?: (value: T) => void;
  sanitize?: (value: T) => T;
}

export interface Config {
  "download-hq-version": ConfigValue<boolean>;
  "download-original-version": ConfigValue<boolean>;
  "oauth-token": ConfigValue<string>;
  "client-id": ConfigValue<string>;
  "user-id": ConfigValue<number>;
  "default-download-location": ConfigValue<string>;
  "download-without-prompt": ConfigValue<boolean>;
  "normalize-track": ConfigValue<boolean>;
  "set-metadata": ConfigValue<boolean>;
  "include-producers": ConfigValue<boolean>;
  "followed-artists": ConfigValue<number[]>;
}

type OnConfigValueChangedType = (key: keyof Config, value: any) => void;

let onConfigValueChanged: OnConfigValueChangedType;

export function setOnConfigValueChanged(callback: OnConfigValueChangedType) {
  onConfigValueChanged = callback;
}

const config: Config = {
  "download-hq-version": { sync: true, defaultValue: true },
  "download-original-version": { sync: true, defaultValue: false },
  "oauth-token": { secret: true },
  "client-id": { secret: true },
  "user-id": { secret: true },
  "default-download-location": {
    defaultValue: "SoundCloud",
    sanitize: (value) => sanitizeFilenameForDownload(value),
  },
  "download-without-prompt": { defaultValue: true },
  "normalize-track": { sync: true, defaultValue: true },
  "set-metadata": { sync: true, defaultValue: true },
  "include-producers": { sync: true, defaultValue: true },
  "followed-artists": { defaultValue: [] },
};

export const configKeys = Object.keys(config) as Array<keyof Config>;

function isConfigKey(key: string): key is keyof Config {
  return config[key] !== undefined;
}

export async function storeConfigValue<TKey extends keyof Config>(
  key: TKey,
  value: Config[TKey]["value"]
) {
  if (!isConfigKey(key)) return Promise.reject(`Invalid config key: ${key}`);

  const entry = config[key];

  if (entry.value === value) return Promise.resolve();

  const sync = entry.sync === true;

  if (entry.sanitize) {
    value = entry.sanitize(value as never);
  }

  logger.logInfo("Setting", key, "to", getDisplayValue(value, entry));

  entry.value = value;

  try {
    if (sync) {
      await setSyncStorage({ [key]: value });
    } else {
      await setLocalStorage({ [key]: value });
    }

    if (entry.onChanged) entry.onChanged(value as never);
  } catch (error) {
    const reason = "Failed to store configuration value";

    logger.logError(reason, { key, value, sync });

    return Promise.reject(reason);
  }
}

export async function loadConfigValue<TKey extends keyof Config>(
  key: TKey
): Promise<Config[TKey]["value"]> {
  if (!isConfigKey(key)) return Promise.reject(`Invalid config key: ${key}`);

  const entry = config[key];

  const sync = entry.sync === true;

  let result;
  if (sync) result = await getSyncStorage(key);
  else result = await getLocalStorage(key);

  return result[key] ?? entry.defaultValue;
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
    config[key].value = values[key] ?? config[key].defaultValue;
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

export function getConfigValue<TKey extends keyof Config>(
  key: TKey
): Config[TKey]["value"] {
  return config[key].value;
}

export function registerConfigChangeHandler<TKey extends keyof Config>(
  key: TKey,
  callback: (newValue: Config[TKey]["value"]) => void
) {
  config[key].onChanged = callback;
}

const handleStorageChanged = (
  changes: { [key: string]: StorageChange },
  areaname: string
) => {
  for (const key in changes) {
    const { newValue } = changes[key];

    if (!isConfigKey(key)) continue;

    const entry = config[key];

    if (entry.value === newValue) continue;

    if (areaname !== "local")
      logger.logInfo(
        "Remote updating",
        key,
        "to",
        getDisplayValue(newValue, entry)
      );

    entry.value = newValue;

    if (entry.onChanged) entry.onChanged(newValue as never);

    if (!entry.secret && onConfigValueChanged)
      onConfigValueChanged(key, newValue);
  }
};

function getDisplayValue<T>(value: T, entry: ConfigValue<T>): T | string {
  if (entry.secret && value) return "***CONFIDENTIAL***";

  return value;
}

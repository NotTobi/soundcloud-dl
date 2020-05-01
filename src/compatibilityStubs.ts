import { Logger } from "./logger";

const urlFilter = { urls: ["*://api-v2.soundcloud.com/*"] };
const logger = Logger.create("Compatibility Stubs");

type BeforeSendHeadersCallback = (details: any) => any;

export const onBeforeSendHeaders = (callback: BeforeSendHeadersCallback) => {
  if (typeof browser !== "undefined") {
    browser.webRequest.onBeforeSendHeaders.addListener(callback, urlFilter, ["requestHeaders", "blocking"]);
  } else if (typeof chrome !== "undefined") {
    chrome.webRequest.onBeforeSendHeaders.addListener(callback, urlFilter, ["requestHeaders", "blocking"]);
  } else {
    logger.logError("Browser does not support webRequest.onBeforeSendHeaders");
  }
};

type OnBeforeRequestCallback = (details: any) => any;

export const onBeforeRequest = (callback: OnBeforeRequestCallback) => {
  if (typeof browser !== "undefined") {
    browser.webRequest.onBeforeRequest.addListener(callback, urlFilter);
  } else if (typeof chrome !== "undefined") {
    chrome.webRequest.onBeforeRequest.addListener(callback, urlFilter);
  } else {
    logger.logError("Browser does not support webRequest.onBeforeRequest");
  }
};

type MessageFromTabCallback = (tabId: number, message: any) => Promise<any>;

export const onMessageFromTab = (callback: MessageFromTabCallback) => {
  if (typeof browser !== "undefined") {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || !message) return;

      callback(sender.tab.id, message).then((resp) => sendResponse(resp));

      return true;
    });
  } else if (typeof chrome !== "undefined") {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id || !message) return;

      callback(sender.tab.id, message).then((resp) => sendResponse(resp));

      return true;
    });
  } else {
    logger.logError("Browser does not support runtime.onMessage");
  }
};

export const downloadToFile = (url: string, filename: string) => {
  const downloadOptions = {
    url,
    filename,
  };

  if (typeof browser !== "undefined") {
    return browser.downloads.download(downloadOptions);
  } else if (typeof chrome !== "undefined") {
    return new Promise<number>((resolve) => chrome.downloads.download(downloadOptions, (id) => resolve(id)));
  } else {
    logger.logError("Browser does not support downloads.download");

    return Promise.reject();
  }
};

export const sendMessageToBackend = (message: any) => {
  if (typeof browser !== "undefined") {
    return browser.runtime.sendMessage(message);
  } else if (typeof chrome !== "undefined") {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  } else {
    logger.logError("Browser does not support runtime.sendMessage");

    return Promise.reject();
  }
};

export const onPageActionClicked = (callback: (tabId: number) => void) => {
  if (typeof browser !== "undefined") {
    browser.pageAction.onClicked.addListener((tab) => callback(tab.id));
  } else if (typeof chrome !== "undefined") {
    chrome.pageAction.onClicked.addListener((tab) => callback(tab.id));
  } else {
    logger.logError("Browser does not support pageAction.onClicked");
  }
};

export const openOptionsPage = () => {
  if (typeof browser !== "undefined") {
    browser.runtime.openOptionsPage();
  } else if (typeof chrome !== "undefined") {
    chrome.runtime.openOptionsPage();
  } else {
    logger.logError("Browser does not support runtime.openOptionsPage");
  }
};

export interface StorageChange {
  newValue?: any;
  oldValue?: any;
}

export const onStorageChanged = (callback: (changes: { [key: string]: StorageChange }, areaName: string) => void) => {
  if (typeof browser !== "undefined") {
    browser.storage.onChanged.addListener(callback);
  } else if (typeof chrome !== "undefined") {
    chrome.storage.onChanged.addListener(callback);
  } else {
    logger.logError("Browser does not support storage.onChanged");
  }
};

export const setSyncStorage = (values: { [key: string]: any }) => {
  if (typeof browser !== "undefined") {
    return browser.storage.sync.set(values);
  } else if (typeof chrome !== "undefined") {
    return new Promise<void>((resolve) => chrome.storage.sync.set(values, resolve));
  } else {
    logger.logError("Browser does not support storage.sync.set");

    return Promise.reject();
  }
};

export const getSyncStorage = (keys?: string | string[]) => {
  if (typeof browser !== "undefined") {
    return browser.storage.sync.get(keys);
  } else if (typeof chrome !== "undefined") {
    return new Promise<{ [key: string]: any }>((resolve) => chrome.storage.sync.get(keys, resolve));
  } else {
    logger.logError("Browser does not support storage.sync.get");

    return Promise.reject();
  }
};
//

import { Logger } from "./logger";

// const urlFilter = { urls: ["*://api-v2.soundcloud.com/*"] };
const logger = Logger.create("Compatibility Stubs");

type BeforeSendHeadersCallback = (details: any) => any;

export const onBeforeSendHeaders = (callback: BeforeSendHeadersCallback, urls?: string[], extraInfos?: string[]) => {
  if (typeof browser !== "undefined") {
    // @ts-ignore
    browser.webRequest.onBeforeSendHeaders.addListener(callback, { urls }, extraInfos);
  } else if (typeof chrome !== "undefined") {
    chrome.webRequest.onBeforeSendHeaders.addListener(callback, { urls }, extraInfos);
  } else {
    logger.logError("Browser does not support webRequest.onBeforeSendHeaders");
  }
};

type OnBeforeRequestCallback = (details: any) => any;

export const onBeforeRequest = (callback: OnBeforeRequestCallback, urls: string[], extraInfos?: string[]) => {
  if (typeof browser !== "undefined") {
    // @ts-ignore
    browser.webRequest.onBeforeRequest.addListener(callback, { urls }, extraInfos);
  } else if (typeof chrome !== "undefined") {
    chrome.webRequest.onBeforeRequest.addListener(callback, { urls }, extraInfos);
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

  return new Promise(async (resolve, reject) => {
    if (typeof browser !== "undefined") {
      const onChangedHandler = (delta: { id: number; state?: { current?: string } }) => {
        if (delta.id === downloadId) {
          if (delta.state?.current === "complete") resolve();
          if (delta.state?.current === "interrupted") reject("Download was interrupted");

          browser.downloads.onChanged.removeListener(onChangedHandler);
        }
      };

      browser.downloads.onChanged.addListener(onChangedHandler);

      const downloadId = await browser.downloads.download(downloadOptions);
    } else if (typeof chrome !== "undefined") {
      let downloadId;

      const onChangedHandler = (delta: { id: number; state?: { current?: string } }) => {
        if (delta.id === downloadId) {
          resolve();

          chrome.downloads.onChanged.removeListener(onChangedHandler);
        }
      };

      chrome.downloads.onChanged.addListener(onChangedHandler);

      chrome.downloads.download(downloadOptions, (id) => (downloadId = id));
    } else {
      return Promise.reject("Browser does not support downloads.download");
    }
  });
};

export const sendMessageToBackend = (message: any) => {
  if (typeof browser !== "undefined") {
    return browser.runtime.sendMessage(message);
  } else if (typeof chrome !== "undefined") {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  } else {
    return Promise.reject("Browser does not support runtime.sendMessage");
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
    return Promise.reject("Browser does not support storage.sync.set");
  }
};

export const getSyncStorage = (keys?: string | string[]) => {
  if (typeof browser !== "undefined") {
    return browser.storage.sync.get(keys);
  } else if (typeof chrome !== "undefined") {
    return new Promise<{ [key: string]: any }>((resolve) => chrome.storage.sync.get(keys, resolve));
  } else {
    return Promise.reject("Browser does not support storage.sync.get");
  }
};

export const setLocalStorage = (values: { [key: string]: any }) => {
  if (typeof browser !== "undefined") {
    return browser.storage.local.set(values);
  } else if (typeof chrome !== "undefined") {
    return new Promise<void>((resolve) => chrome.storage.local.set(values, resolve));
  } else {
    return Promise.reject("Browser does not support storage.local.set");
  }
};

export const getLocalStorage = (keys?: string | string[]) => {
  if (typeof browser !== "undefined") {
    return browser.storage.local.get(keys);
  } else if (typeof chrome !== "undefined") {
    return new Promise<{ [key: string]: any }>((resolve) => chrome.storage.local.get(keys, resolve));
  } else {
    return Promise.reject("Browser does not support storage.local.get");
  }
};

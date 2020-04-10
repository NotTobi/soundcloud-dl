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
    logger.logError("Browser not supported for webRequest.onBeforeSendHeaders");
  }
};

type OnBeforeRequestCallback = (details: any) => any;

export const onBeforeRequest = (callback: OnBeforeRequestCallback) => {
  if (typeof browser !== "undefined") {
    browser.webRequest.onBeforeRequest.addListener(callback, urlFilter);
  } else if (typeof chrome !== "undefined") {
    chrome.webRequest.onBeforeRequest.addListener(callback, urlFilter);
  } else {
    logger.logError("Browser not supported for webRequest.onBeforeRequest");
  }
};

type MessageFromTabCallback = (tabId: number, message: any) => void;

export const onMessageFromTab = (callback: MessageFromTabCallback) => {
  if (typeof browser !== "undefined") {
    browser.runtime.onMessage.addListener((message, sender) => {
      if (sender.id !== browser.runtime.id || !message) return;

      callback(sender.tab.id, message);
    });
  } else if (typeof chrome !== "undefined") {
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender.id !== chrome.runtime.id || !message) return;

      callback(sender.tab.id, message);
    });
  } else {
    logger.logError("Browser not supported for runtime.onMessage");
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
    return new Promise<number>((resolve) => {
      chrome.downloads.download(downloadOptions, (id) => resolve(id));
    });
  } else {
    logger.logError("Browser not supported for downloads.download");

    return Promise.reject();
  }
};

export const sendMessageToBackend = (message: any) => {
  if (typeof browser !== "undefined") {
    return browser.runtime.sendMessage(message);
  } else if (typeof chrome !== "undefined") {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  } else {
    logger.logError("Browser not supported for runtime.sendMessage");

    return Promise.reject();
  }
};

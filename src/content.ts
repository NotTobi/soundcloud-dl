import { DomObserver, ObserverEvent } from "./utils/domObserver";
import { Logger } from "./utils/logger";
import { sendMessageToBackend, onMessage, getPathFromExtensionFile } from "./compatibilityStubs";
import { registerConfigChangeHandler, loadConfiguration, setOnConfigValueChanged, configKeys } from "./utils/config";
import { v4 as uuid } from "uuid";

interface DownloadButton {
  elem: HTMLButtonElement;
  onClick: any;
}

type KeyedButtons = { [key: string]: DownloadButton };
type OnButtonClicked = (downloadId: string) => Promise<any>;

let observer: DomObserver | null = null;
const logger = Logger.create("SoundCloud-Downloader");

const downloadButtons: KeyedButtons = {};

const setButtonText = (button: HTMLButtonElement, text: string, title?: string) => {
  button.innerText = text;

  button.title = title ?? text;
};

const resetButtonBackground = (button: HTMLButtonElement) => {
  button.style.backgroundColor = "";
  button.style.background = "";
};

const handleMessageFromBackgroundScript = async (_, message: any) => {
  const { downloadId, progress, error } = message;

  const { elem: downloadButton, onClick: originalOnClick } = downloadButtons[downloadId];

  if (!downloadButton) return;

  if (progress === 101) {
    resetButtonBackground(downloadButton);

    downloadButton.style.backgroundColor = "#19a352";

    setButtonText(downloadButton, "Downloaded!");

    setTimeout(() => {
      resetButtonBackground(downloadButton);

      setButtonText(downloadButton, "Download");

      downloadButton.style.cursor = "pointer";
      downloadButton.onclick = originalOnClick;

      delete downloadButtons[downloadId];
    }, 2000);
  } else if (progress === 100) {
    setButtonText(downloadButton, "Finishing...");

    downloadButton.style.background = `linear-gradient(90deg, #ff5419 ${progress}%, transparent 0%)`;
  } else if (progress) {
    setButtonText(downloadButton, "Downloading...");

    downloadButton.style.background = `linear-gradient(90deg, #ff5419 ${progress}%, transparent 0%)`;
  }

  if (error) {
    resetButtonBackground(downloadButton);

    downloadButton.style.backgroundColor = "#d30029";

    setButtonText(downloadButton, "ERROR", error);

    delete downloadButtons[downloadId];
  }
};

onMessage(handleMessageFromBackgroundScript);

const createDownloadButton = (small?: boolean) => {
  const button = document.createElement("button");
  const buttonSizeClass = small ? "sc-button-small" : "sc-button-medium";

  button.className = `sc-button-download sc-button ${buttonSizeClass} sc-button-responsive`;
  setButtonText(button, "Download");

  return button;
};

const addDownloadButtonToParent = (parent: Node & ParentNode, onClicked: OnButtonClicked, small?: boolean) => {
  const downloadButtonExists = parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    logger.logDebug("Download button already exists");

    return;
  }

  const button = createDownloadButton(small);
  button.onclick = async () => {
    const downloadId = uuid();

    downloadButtons[downloadId] = {
      elem: button,
      onClick: button.onclick,
    };

    button.style.cursor = "default";
    button.onclick = null;
    setButtonText(button, "Preparing...");

    await onClicked(downloadId);
  };

  parent.appendChild(button);
};

const removeElementFromParent = (element: Element) => {
  element.parentNode.removeChild(element);
};

const removeElementsMatchingSelectors = (selectors: string) => {
  const elements = document.querySelectorAll(selectors);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    removeElementFromParent(element);
  }
};

const removeBuyLinks = () => {
  const selector = "a.sc-buylink";

  removeElementsMatchingSelectors(selector);

  const event: ObserverEvent = {
    selector,
    callback: (node) => removeElementFromParent(node),
  };

  observer?.addEvent(event);
};

const removeDownloadButtons = () => {
  removeElementsMatchingSelectors("button.sc-button-download");
};

const createDownloadCommand = (url: string) => (downloadId: string) => {
  const set = url.includes("/sets/");

  return sendMessageToBackend({
    type: set ? "DOWNLOAD_SET" : "DOWNLOAD",
    url,
    downloadId,
  });
};

const addDownloadButtonToTrackPage = () => {
  const selector = ".sc-button-group-medium > .sc-button-like";

  // ugly inline func
  const addDownloadButtonToPossiblePlaylist = (node: Element) => {
    const downloadUrl = window.location.origin + window.location.pathname;

    const downloadCommand = createDownloadCommand(downloadUrl);

    addDownloadButtonToParent(node.parentNode, downloadCommand);
  };

  document.querySelectorAll(selector).forEach(addDownloadButtonToPossiblePlaylist);

  const event: ObserverEvent = {
    selector,
    callback: addDownloadButtonToPossiblePlaylist,
  };

  observer?.addEvent(event);
};

const addDownloadButtonToFeed = () => {
  const selector = ".queue__itemsContainer .queueItemView__more";
  const addDownloadButtonToPossiblePlaylist = (node: Element) => {
    const trackUrl = node.closest(".queue__itemWrapper")?.querySelector(".queueItemView__title a").getAttribute('href');

    if (!trackUrl) {
      logger.logError("Failed to determine track URL");
      return;
    }

    const downloadUrl = window.location.origin + trackUrl;

    const downloadCommand = createDownloadCommand(downloadUrl);

    addDownloadButtonToParent(node.parentNode, downloadCommand, true);
  };

  document.querySelectorAll(selector).forEach(addDownloadButtonToPossiblePlaylist);

  const event: ObserverEvent = {
    selector,
    callback: addDownloadButtonToPossiblePlaylist,
  };

  observer?.addEvent(event);
};

const addDownloadButtonToPlaylistElement = () => {
  const selector = ".trackItem__actions .sc-button-group";

  const addDownloadButton = (actionsNode: Element) => {
    const trackItem = actionsNode.closest(".trackItem");
    if (!trackItem) {
      logger.logError("No parent .trackItem found for actions node");
      return;
    }

    const trackLinkElement = trackItem.querySelector(".trackItem__trackTitle");
    const trackUrl = trackLinkElement?.getAttribute("href");

    if (!trackUrl) {
      logger.logError("Failed to find track URL");
      return;
    }

    const downloadUrl = window.location.origin + trackUrl;
    const downloadCommand = createDownloadCommand(downloadUrl);

    addDownloadButtonToParent(actionsNode, downloadCommand, false);
  };

  document.querySelectorAll(selector).forEach(addDownloadButton);

  const event: ObserverEvent = {
    selector,
    callback: addDownloadButton,
  };

  observer?.addEvent(event);
};


const handleBlockRepostsConfigChange = (blockReposts: boolean) => {
  let script = document.querySelector<HTMLScriptElement>("#repost-blocker");

  if (blockReposts) {
    if (script) {
      logger.logWarn("Repost-Blocker script has already been injected!");

      return;
    }

    const payloadFile = getPathFromExtensionFile("/js/repostBlocker.js");

    if (!payloadFile) return;

    logger.logInfo("Start blocking reposts");

    script = document.createElement("script");
    script.type = "text/javascript";
    script.id = "repost-blocker";
    script.src = payloadFile;

    document.documentElement.appendChild(script);
  } else {
    if (!script) return;

    logger.logInfo("Stop blocking reposts");

    const cleanupScript = document.createElement("script");
    cleanupScript.type = "text/javascript";
    cleanupScript.id = "cleanup-repost-blocker";
    cleanupScript.innerText = "XMLHttpRequest.prototype.resetSend();";

    document.documentElement.appendChild(cleanupScript);

    document.documentElement.removeChild(script);
    document.documentElement.removeChild(cleanupScript);
  }
};

const handlePageLoaded = async () => {
  observer = new DomObserver();

  removeBuyLinks();

  removeDownloadButtons();

  addDownloadButtonToTrackPage();

  addDownloadButtonToPlaylistElement();

  addDownloadButtonToFeed();

  observer.start(document.body);

  logger.logInfo("Attached!");
};

const documentState = document.readyState;

if (documentState === "complete" || documentState === "interactive") {
  setTimeout(handlePageLoaded, 0);
}

document.addEventListener("DOMContentLoaded", handlePageLoaded);

window.onbeforeunload = () => {
  observer?.stop();
  logger.logDebug("Unattached!");
};

function writeConfigValueToLocalStorage(key: string, value: any) {
  const item = JSON.stringify(value);

  window.localStorage.setItem("SOUNDCLOUD-DL-" + key, item);
}

loadConfiguration(true).then((config) => {
  for (const key of configKeys) {
    if (config[key].secret) continue;

    writeConfigValueToLocalStorage(key, config[key].value);
  }

  setOnConfigValueChanged(writeConfigValueToLocalStorage);

  if (config["block-reposts"].value) handleBlockRepostsConfigChange(true);

  registerConfigChangeHandler("block-reposts", handleBlockRepostsConfigChange);
});

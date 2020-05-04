import { DomObserver, ObserverEvent } from "./domObserver";
import { Logger } from "./logger";
import { sendMessageToBackend } from "./compatibilityStubs";

let observer: DomObserver | null = null;
const logger = Logger.create("SoundCloud-Downloader");

const createDownloadButton = () => {
  const button = document.createElement("button");
  button.className = "sc-button sc-button-download sc-button-medium sc-button-responsive";
  button.title = "Download";
  button.innerText = "Download";

  return button;
};

const addDownloadButtonToParent = (parent: Node & ParentNode, onClicked: () => Promise<void>) => {
  if (window.location.pathname.includes("/sets/")) {
    logger.logDebug("We are looking at a playlist or an album, do not display a download button!");

    return;
  }

  const downloadButtonExists = parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    logger.logDebug("Download button already exists");

    return;
  }

  const button = createDownloadButton();
  button.onclick = async () => {
    button.disabled = true;
    button.title = "Downloading...";
    button.innerText = "Downloading...";

    await onClicked();

    button.disabled = false;
    button.title = "Download";
    button.innerText = "Download";
  };

  logger.logDebug("Adding download button...", { parent });

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

const addDownloadButtonToTrackPage = () => {
  const selector = ".sc-button-group-medium > .sc-button-like";

  const downloadFromTrackPage = () =>
    sendMessageToBackend({
      type: "DOWNLOAD",
      url: window.location.origin + window.location.pathname,
    });

  document
    .querySelectorAll(selector)
    .forEach((likeButton) => addDownloadButtonToParent(likeButton.parentNode, downloadFromTrackPage));

  const event: ObserverEvent = {
    selector,
    callback: (node) => addDownloadButtonToParent(node.parentNode, downloadFromTrackPage),
  };

  observer?.addEvent(event);
};

const addDownloadButtonToFeed = () => {
  const selector = ".sound.streamContext:not(.playlist) .sc-button-group > .sc-button-like";

  const downloadFromFeedPage = (node: Node) => () => {
    const soundBody = node.parentElement.closest(".sound__body");
    const titleLink = soundBody.querySelector("a.soundTitle__title");

    if (titleLink === null) return;

    const downloadUrl = window.location.origin + titleLink.getAttribute("href");

    return sendMessageToBackend({
      type: "DOWNLOAD",
      url: downloadUrl,
    });
  };

  document.querySelectorAll(selector).forEach((likeButton) => {
    addDownloadButtonToParent(likeButton.parentNode, downloadFromFeedPage(likeButton));
  });

  const event: ObserverEvent = {
    selector,
    callback: (node) => addDownloadButtonToParent(node.parentNode, downloadFromFeedPage(node)),
  };

  observer?.addEvent(event);
};

const handlePageLoaded = () => {
  observer = new DomObserver();

  removeBuyLinks();

  removeDownloadButtons();

  addDownloadButtonToTrackPage();

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

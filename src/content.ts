import { DomObserver, ObserverEvent } from "./utils/domObserver";
import { sendMessageToBackend, onMessage } from "./compatibilityStubs";
import {
  loadConfiguration,
  setOnConfigValueChanged,
  configKeys,
} from "./utils/config";
import { v4 as uuid } from "uuid";

interface DownloadButton {
  elem: HTMLButtonElement;
  onClick: any;
}

type KeyedButtons = { [key: string]: DownloadButton };
type OnButtonClicked = (downloadId: string) => Promise<any>;

type SetupDownloadButtonOptions = {
  selector: string;
  getTrackUrl: (node: Element) => string | null;
  getButtonParent: (node: Element) => Element | null;
  isSmall?: boolean;
};

let observer: DomObserver | null = null;

const downloadButtons: KeyedButtons = {};

const setButtonText = (
  button: HTMLButtonElement,
  text: string,
  title?: string
) => {
  button.innerText = text;

  button.title = title ?? text;
};

const resetButtonBackground = (button: HTMLButtonElement) => {
  button.style.backgroundColor = "";
  button.style.background = "";
};

const handleMessageFromBackgroundScript = async (_, message: any) => {
  const { downloadId, progress, error, errorLabel } = message;

  const { elem: downloadButton, onClick: originalOnClick } =
    downloadButtons[downloadId];

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

    const buttonLabel = errorLabel ? `Error: ${errorLabel}` : "Error";

    setButtonText(downloadButton, buttonLabel, error);

    downloadButton.style.cursor = "pointer";
    downloadButton.onclick = originalOnClick;

    delete downloadButtons[downloadId];
  }
};

// -----------------------
// SETUP MESSAGE HANDLER
// -----------------------
onMessage(handleMessageFromBackgroundScript);

const createDownloadButton = (small?: boolean) => {
  const button = document.createElement("button");
  const buttonSizeClass = small ? "sc-button-small" : "sc-button-medium";

  button.className = `sc-button-download sc-button ${buttonSizeClass} sc-button-responsive`;
  setButtonText(button, "Download");

  return button;
};

const addDownloadButtonToParent = (
  parent: Node & ParentNode,
  onClicked: OnButtonClicked,
  small?: boolean
) => {
  const downloadButtonExists =
    parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    return;
  }

  const button = createDownloadButton(small);
  button.onclick = async () => {
    const downloadId = uuid();

    downloadButtons[downloadId] = {
      elem: button,
      onClick: button.onclick,
    };

    resetButtonBackground(button);
    button.style.cursor = "default";
    button.onclick = null;
    setButtonText(button, "Preparing...");

    await onClicked(downloadId);
  };

  parent.appendChild(button);
};

const createDownloadCommand = (url: string) => (downloadId: string) => {
  const pathname = new URL(url).pathname;
  const parts = pathname.split("/").filter(Boolean);

  const set = parts.length >= 2 && parts[parts.length - 2] === "sets";

  return sendMessageToBackend({
    type: set ? "DOWNLOAD_SET" : "DOWNLOAD",
    url,
    downloadId,
  });
};

const setupDownloadButtons = ({
  selector,
  getTrackUrl,
  getButtonParent,
  isSmall = false,
}: SetupDownloadButtonOptions) => {
  const handler = (node: Element) => {
    const trackUrl = getTrackUrl(node);
    if (!trackUrl) {
      return;
    }

    const downloadUrl = window.location.origin + trackUrl;
    const downloadCommand = createDownloadCommand(downloadUrl);

    const parent = getButtonParent(node);
    if (!parent) {
      return;
    }

    addDownloadButtonToParent(parent, downloadCommand, isSmall);
  };

  document.querySelectorAll(selector).forEach(handler);

  const event: ObserverEvent = {
    selector,
    callback: handler,
  };

  observer?.addEvent(event);
};

const handlePageLoaded = async () => {
  observer = new DomObserver();

  // Track from track page, mix / station / playlist (download all on a page)
  setupDownloadButtons({
    selector:
      ".listenEngagement__footer .sc-button-group, .systemPlaylistDetails__controls",
    getTrackUrl: () => window.location.pathname,
    getButtonParent: (node) => node,
  });

  // Track from track page (visual style)
  setupDownloadButtons({
    selector: ".sound__footer .sc-button-group",
    getTrackUrl: (node) => {
      const sound = node.closest(".sound");

      const titleLink = sound?.querySelector("a.soundTitle__title");
      const titleHref = titleLink?.getAttribute("href");
      if (titleHref) return titleHref;

      const ministatLink = sound?.querySelector("a.sc-ministats[href]");
      const ministatHref = ministatLink?.getAttribute("href");
      const stripped = ministatHref?.replace(
        /\/(likes|reposts|comments)$/,
        ""
      );
      return stripped ?? null;
    },
    getButtonParent: (node) => node,
  });

  // Single track in playlist / mix / station (download selected track)
  setupDownloadButtons({
    selector: ".trackItem .sc-button-group",
    getTrackUrl: (node) => {
      const trackItem = node.closest(".trackItem");
      const el = trackItem?.querySelector("a.trackItem__trackTitle");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
  });

  // Single track in feed / author's page (download selected track)
  setupDownloadButtons({
    selector: ".soundList__item .sc-button-group",
    getTrackUrl: (node) => {
      const trackItem = node.closest(".soundList__item");
      const el = trackItem?.querySelector("a.soundTitle__title");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
  });

  setupDownloadButtons({
    selector: ".searchItem .sc-button-group",
    getTrackUrl: (node) => {
      const trackItem = node.closest(".searchItem");
      const el = trackItem?.querySelector("a.soundTitle__title");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
  });

  // Next up modal (download selected track)
  setupDownloadButtons({
    selector: ".queueItemView__actions",
    getTrackUrl: (node) => {
      const el = node
        .closest(".queue__itemWrapper")
        ?.querySelector(".queueItemView__title a");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
    isSmall: true,
  });

  observer.start(document.body);
};

const documentState = document.readyState;

if (documentState === "complete" || documentState === "interactive") {
  setTimeout(handlePageLoaded, 0);
}

document.addEventListener("DOMContentLoaded", handlePageLoaded);

window.onbeforeunload = () => {
  observer?.stop();
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
});

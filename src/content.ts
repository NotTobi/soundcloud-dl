import { DomObserver, ObserverEvent } from "./utils/domObserver";
import { Logger } from "./utils/logger";
import { sendMessageToBackend, onMessage, getPathFromExtensionFile } from "./compatibilityStubs";
import { registerConfigChangeHandler, loadConfiguration, setOnConfigValueChanged, configKeys } from "./utils/config";
import { v5 as uuid } from "uuid";

// --- CSS for Range Modal ---
const modalCss = `
  #scdl-range-modal {
    display: none;
    position: fixed;
    z-index: 10000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0,0,0,0.6);
  }
  #scdl-range-modal-content {
    background-color: #fefefe;
    margin: 15% auto;
    padding: 20px;
    border: 1px solid #888;
    width: 80%;
    max-width: 350px;
    border-radius: 5px;
    color: #333; /* Ensure text is visible */
  }
  #scdl-range-modal label {
    display: block;
    margin-bottom: 5px;
  }
   #scdl-range-modal input[type=\"number\"] {
    width: 60px;
    padding: 5px;
    margin-bottom: 15px;
    margin-right: 10px;
    border: 1px solid #ccc;
    border-radius: 3px;
  }
  #scdl-range-modal-actions button {
    padding: 8px 15px;
    margin-left: 10px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  #scdl-range-modal-download {
    background-color: #ff5419;
    color: white;
  }
  #scdl-range-modal-cancel {
    background-color: #ccc;
  }
  #scdl-range-modal-error {
    color: red;
    font-size: 0.9em;
    margin-top: 10px;
    display: none; /* Hidden by default */
  }
  .sc-button-download {
    transition: background-color 0.5s ease-out;
  }
`;
// -------------------------

// --- Modal HTML Structure ---
let modalElement: HTMLDivElement | null = null;
function createModal() {
  if (document.getElementById('scdl-range-modal')) return;

  const style = document.createElement('style');
  style.textContent = modalCss;
  document.head.appendChild(style);

  modalElement = document.createElement('div');
  modalElement.id = 'scdl-range-modal';
  modalElement.innerHTML = `
    <div id=\"scdl-range-modal-content\">
      <h4>Download Playlist Range</h4>
      <label for=\"scdl-range-from\">From track:</label>
      <input type=\"number\" id=\"scdl-range-from\" name=\"from\" min=\"1\" value=\"1\">
      <label for=\"scdl-range-to\">To track:</label>
      <input type=\"number\" id=\"scdl-range-to\" name=\"to\" min=\"1\" value=\"\"><br>
      <small>(Leave \"To\" blank to download until the end)</small>
      <div id=\"scdl-range-modal-error\"></div>
      <div id=\"scdl-range-modal-actions\" style=\"text-align: right; margin-top: 15px;\">
        <button id=\"scdl-range-modal-cancel\">Cancel</button>
        <button id=\"scdl-range-modal-download\">Download Selection</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalElement);

  // Add listeners for the modal buttons
  document.getElementById('scdl-range-modal-cancel').addEventListener('click', hideModal);
  modalElement.addEventListener('click', (e) => {
      // Close if clicking outside the content
      if (e.target === modalElement) {
          hideModal();
      }
  });
}

function showModal(mainDownloadButton: HTMLButtonElement, onDownloadClick: (start: number, end: number | null) => void) {
  if (!modalElement) createModal();

  const fromInput = document.getElementById('scdl-range-from') as HTMLInputElement;
  const toInput = document.getElementById('scdl-range-to') as HTMLInputElement;
  const errorDiv = document.getElementById('scdl-range-modal-error');

  // Reset fields and error message
  fromInput.value = '1';
  toInput.value = '';
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';

  // Remove previous listener and add new one to avoid duplicates / stale closures
  const downloadBtn = document.getElementById('scdl-range-modal-download');
  const newDownloadBtn = downloadBtn.cloneNode(true) as HTMLButtonElement;
  downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);

  newDownloadBtn.addEventListener('click', () => {
    const start = parseInt(fromInput.value, 10);
    const endStr = toInput.value;
    const end = endStr ? parseInt(endStr, 10) : null; // null means download to end

    errorDiv.textContent = ''; // Clear previous error
    errorDiv.style.display = 'none';

    if (isNaN(start) || start < 1) {
      errorDiv.textContent = 'Invalid \"From\" number.';
      errorDiv.style.display = 'block';
      return;
    }
    if (end !== null && (isNaN(end) || end < start)) {
      errorDiv.textContent = 'Invalid \"To\" number. Must be greater than or equal to \"From\".';
      errorDiv.style.display = 'block';
      return;
    }

    // Validation passed, call the provided handler
    onDownloadClick(start, end);
    hideModal();

    // Trigger the main button's preparing state visually
    setButtonText(mainDownloadButton, "Preparing...");
    mainDownloadButton.style.cursor = "default";
    mainDownloadButton.onclick = null;

  });

  modalElement.style.display = 'block';
}

function hideModal() {
  if (modalElement) {
    modalElement.style.display = 'none';
  }
}
// -----------------------------

interface DownloadButton {
  elem: HTMLButtonElement;
  onClick: any;
}

type KeyedButtons = { [key: string]: DownloadButton & { resetTimer?: number } };
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

  const buttonData = downloadButtons[downloadId];
  if (!buttonData) return;
  const { elem: downloadButton, onClick: originalOnClick, resetTimer } = buttonData;

  // Helper to run the reset logic
  const runResetLogic = () => {
    if (downloadButtons[downloadId]) { // Check again in case it was removed by an error race
      // --- Stage 1: Start fade-out by resetting background ---
      resetButtonBackground(downloadButton);
      // --- Stage 2: After fade, reset text and handlers ---
      setTimeout(() => {
         if (downloadButtons[downloadId]) { // Check *again* in case something happened during fade
            setButtonText(downloadButton, "Download");
            downloadButton.title = "Download"; // Reset title
            downloadButton.style.cursor = "pointer";
            downloadButton.onclick = originalOnClick;
            delete downloadButtons[downloadId]; // Fully clean up state
         }
      }, 500); // Delay matches CSS transition duration
    }
  };

  if (resetTimer) {
    clearTimeout(resetTimer);
    downloadButtons[downloadId].resetTimer = undefined;
  }

  if (progress === undefined && error) {
    resetButtonBackground(downloadButton);
    downloadButton.style.backgroundColor = "#d30029";
    setButtonText(downloadButton, "ERROR", error);
    downloadButton.onclick = null;
    delete downloadButtons[downloadId];
    return;
  }

  if (progress === 101) {
    // --- DEBUG START ---
    logger.logDebug(`Received progress 101 for downloadId: ${downloadId}. Button data:`, buttonData);
    // --- DEBUG END ---
    resetButtonBackground(downloadButton);
    downloadButton.style.backgroundColor = "#19a352";
    setButtonText(downloadButton, "Downloaded!");
    downloadButton.title = "Downloaded successfully";
    downloadButton.onclick = null;
    downloadButtons[downloadId].resetTimer = window.setTimeout(runResetLogic, 5000);
  } else if (progress === 102) {
    // --- DEBUG START ---
    logger.logDebug(`Received progress 102 for downloadId: ${downloadId}. Error: ${error}. Button data:`, buttonData);
    // --- DEBUG END ---
    resetButtonBackground(downloadButton);
    downloadButton.style.backgroundColor = "gold";
    setButtonText(downloadButton, "Downloaded!");
    downloadButton.title = error || "Some tracks failed to download";
    downloadButton.onclick = null;
    downloadButtons[downloadId].resetTimer = window.setTimeout(runResetLogic, 5000);
  } else if (progress === 100) {
    if (downloadButton.textContent !== "Downloading..." && downloadButton.textContent !== "Preparing...") {
      setButtonText(downloadButton, "Finishing...");
      downloadButton.style.background = `linear-gradient(90deg, #ff5419 ${progress}%, transparent 0%)`;
    }
  } else if (progress !== undefined && progress < 100) {
    if (downloadButton.textContent === "Downloading..." || downloadButton.textContent === "Preparing...") {
      setButtonText(downloadButton, "Downloading...");
      downloadButton.style.background = `linear-gradient(90deg, #ff5419 ${progress}%, transparent 0%)`;
    }
  }
  // --- Add explicit return true for async listener ---
  return true;
};

onMessage(handleMessageFromBackgroundScript);

const createDownloadButton = (small?: boolean) => {
  const button = document.createElement("button");
  const buttonSizeClass = small ? "sc-button-small" : "sc-button-medium";

  button.className = `sc-button-download sc-button ${buttonSizeClass} sc-button-responsive`;
  setButtonText(button, "Download");

  return button;
};

const addDownloadButtonToParent = (parent: Node & ParentNode, onClicked: OnButtonClicked, small?: boolean, isSet: boolean = false) => {
  const downloadButtonExists = parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    logger.logDebug("Download button already exists");

    return;
  }

  const button = createDownloadButton(small);
  button.onclick = async () => {
    const downloadId: string = crypto.randomUUID();

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

  // --- Add Range Button for Sets ---
  if (isSet) {
    const rangeButton = document.createElement("button");
    const rangeButtonSizeClass = small ? "sc-button-small" : "sc-button-medium"; // Match size
    rangeButton.className = `sc-button-range sc-button ${rangeButtonSizeClass} sc-button-responsive`;
    rangeButton.textContent = "Range...";
    rangeButton.title = "Download a range of tracks";
    rangeButton.style.marginLeft = "5px"; // Add some space

    rangeButton.onclick = (e) => {
        e.preventDefault(); // Prevent form submission if inside one
        e.stopPropagation(); // Prevent triggering other clicks

        // Prepare the handler for the modal's Download button
        const handleRangeDownload = (start: number, end: number | null) => {
            const downloadId: string = crypto.randomUUID();
            downloadButtons[downloadId] = { // Store the *main* button for state updates
                elem: button,
                onClick: button.onclick // Preserve original full download click
            };
            // Send the specific range message
            sendMessageToBackend({
                type: "DOWNLOAD_SET_RANGE",
                url: (onClicked as any).url, // Need to expose URL from the original command creator
                downloadId,
                start,
                end,
            });
        };

        showModal(button, handleRangeDownload);
    };
    parent.appendChild(rangeButton);
  }
  // --------------------------------
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

const createDownloadCommand = (url: string) => {
  const isSet = url.includes("/sets/");
  const command = (downloadId: string) => {
    return sendMessageToBackend({
      type: isSet ? "DOWNLOAD_SET" : "DOWNLOAD",
      url,
      downloadId,
    });
  };
  // Expose URL and type for range download logic
  (command as any).url = url;
  (command as any).isSet = isSet;
  return command;
};

const addDownloadButtonToTrackPage = () => {
  const selector = ".sc-button-group-medium > .sc-button-like";

  const addDownloadButtonToPossiblePlaylist = (node: Element) => {
    const downloadUrl = window.location.origin + window.location.pathname;
    const downloadCommand = createDownloadCommand(downloadUrl);
    // Pass the isSet flag to the button adder
    addDownloadButtonToParent(node.parentNode, downloadCommand, false, (downloadCommand as any).isSet);
  };

  document.querySelectorAll(selector).forEach(addDownloadButtonToPossiblePlaylist);

  const event: ObserverEvent = {
    selector,
    callback: addDownloadButtonToPossiblePlaylist,
  };

  observer?.addEvent(event);
};

const addDownloadButtonToFeed = () => {
  const selector = ".sound.streamContext .sc-button-group > .sc-button-like";

  const addDownloadButtonToPossiblePlaylist = (node: Element) => {
    const soundBody = node.parentElement.closest(".sound__body");
    const titleLink = soundBody.querySelector("a.soundTitle__title");

    if (titleLink === null) {
      return;
    }

    const downloadUrl = window.location.origin + titleLink.getAttribute("href");
    const downloadCommand = createDownloadCommand(downloadUrl);
    // Pass the isSet flag to the button adder
    addDownloadButtonToParent(node.parentNode, downloadCommand, true, (downloadCommand as any).isSet);
  };

  document.querySelectorAll(selector).forEach(addDownloadButtonToPossiblePlaylist);

  const event: ObserverEvent = {
    selector,
    callback: addDownloadButtonToPossiblePlaylist,
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

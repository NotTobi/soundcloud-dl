import { Observer, ObserverEvent } from "./observer";

let observer: Observer | null = null;

const createDownloadButton = () => {
  const button = document.createElement("button");
  button.className = "sc-button sc-button-download sc-button-medium sc-button-responsive";
  button.title = "Download";
  button.innerText = "Download";

  return button;
};

const addDownloadButtonToParent = (parent: Node & ParentNode) => {
  if (window.location.pathname.includes("/sets/")) {
    console.log("We are looking at a playlist or an album, do not display a download button!");

    return;
  }

  const downloadButtonExists = parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    console.warn("Download button already exists");

    return;
  }

  const button = createDownloadButton();
  button.onclick = async () => {
    button.disabled = true;

    await browser.runtime.sendMessage({ type: "DOWNLOAD" });

    button.disabled = false;
  };

  console.log("Adding download button...");

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

const addDownloadButtons = () => {
  const selector = ".sc-button-group-medium > .sc-button-like";

  document.querySelectorAll(selector).forEach((likeButton) => {
    addDownloadButtonToParent(likeButton.parentNode);
  });

  const event: ObserverEvent = {
    selector,
    callback: (node) => addDownloadButtonToParent(node.parentNode),
  };

  observer?.addEvent(event);
};

const handlePageLoaded = () => {
  console.log("Page Loaded!");

  observer = new Observer();

  removeBuyLinks();

  removeDownloadButtons();

  addDownloadButtons();

  observer.start(document.body);
};

const documentState = document.readyState;

if (documentState === "complete" || documentState === "interactive") {
  setTimeout(handlePageLoaded, 0);
}

document.addEventListener("DOMContentLoaded", handlePageLoaded);

window.onbeforeunload = () => {
  console.log("Page unloading...");

  observer?.stop();
};

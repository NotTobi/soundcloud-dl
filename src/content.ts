import { Observer, ObserverEvent } from "./observer";

let observer: Observer | null = null;

const addDownloadButtonToParent = (parent: Node & ParentNode) => {
  const downloadButtonExists = parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    console.warn("Download button already exists");

    return;
  }

  const button = document.createElement("button");
  button.className = "sc-button sc-button-download sc-button-medium sc-button-responsive";
  button.title = "Download";
  button.innerText = "Download";

  button.onclick = async () => {
    button.disabled = true;

    await browser.runtime.sendMessage({ type: "DOWNLOAD" });

    button.disabled = false;
  };

  console.log("Adding download button...");

  parent.appendChild(button);
};

const removeElementFromParent = (element: Element) => {
  console.log("Removing element...", element);

  element.parentNode.removeChild(element);
};

const removeBuyLinks = () => {
  const selector = "a.sc-buylink";
  const buyLinks = document.querySelectorAll(selector);

  for (let i = 0; i < buyLinks.length; i++) {
    const buyLink = buyLinks[i];

    removeElementFromParent(buyLink);
  }

  const event: ObserverEvent = {
    selector,
    callback: (node) => removeElementFromParent(node),
  };

  observer?.addEvent(event);
};

const removeDownloadButtons = () => {
  const downloadButtons = document.querySelectorAll("button.sc-button-download");

  for (let i = 0; i < downloadButtons.length; i++) {
    const downloadButton = downloadButtons[i];

    removeElementFromParent(downloadButton);
  }
};

const addDownloadButtons = () => {
  const selector = ".sc-button-group-medium > .sc-button-like";

  const likeButtons = document.querySelectorAll(selector);

  for (let i = 0; i < likeButtons.length; i++) {
    const likeButton = likeButtons[i];

    addDownloadButtonToParent(likeButton.parentNode);
  }

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

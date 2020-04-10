import $ from "jquery";
import "./arrive";

declare global {
  interface JQuery {
    arrive(className: string, callback: () => void): void;
  }
}

const addDownloadButtonToParent = (parent: Node & ParentNode) => {
  const downloadButtonExists = parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    console.log("download button exists");

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

  console.log("add download button");

  parent.appendChild(button);
};

const removeBuyLinks = () => {
  const buyButtons = document.querySelectorAll("a.sc-buylink");

  for (let i = 0; i < buyButtons.length; i++) {
    const buyButton = buyButtons[i];

    console.log("remove buy link");

    buyButton.parentNode.removeChild(buyButton);
  }
};

const removeDownloadButtons = () => {
  const downloadButtons = document.querySelectorAll("button.sc-button-download");

  for (let i = 0; i < downloadButtons.length; i++) {
    const downloadButton = downloadButtons[i];

    console.log("remove download button");

    downloadButton.parentNode.removeChild(downloadButton);
  }
};

const addDownloadButtons = () => {
  const likeButtons = document.querySelectorAll(".sc-button-group-medium > .sc-button-like");

  for (let i = 0; i < likeButtons.length; i++) {
    const likeButton = likeButtons[i];

    addDownloadButtonToParent(likeButton.parentNode);
  }
};

const handlePageLoad = () => {
  console.log("handle page load");

  removeBuyLinks();

  removeDownloadButtons();

  addDownloadButtons();

  // // remove newly mounted 'buy' buttons
  // $(document).arrive("a.sc-buylink", function () {
  //   $(this).remove();
  // });

  // // add download button to newly mounted button groups
  // $(document).arrive(".sc-button-group-medium > .sc-button-like", function () {
  //   addDownloadButtonToParent($(this).parent());
  // });
};

const documentState = document.readyState;

if (documentState === "complete" || documentState === "interactive") {
  setTimeout(handlePageLoad, 0);
}

document.addEventListener("DOMContentLoaded", handlePageLoad);

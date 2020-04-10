import $ from "jquery";
import "./arrive";

declare global {
  interface JQuery {
    arrive(className: string, callback: () => void): void;
  }
}

function addDownloadButtonToGroup(group) {
  if (group.find(".sc-button-download").length > 0) return;

  const buttonHtml = `
          <button 
              class='sc-button sc-button-download sc-button-medium sc-button-responsive'
              title='Download'>
                  Download
          </button>`;

  const button = $(buttonHtml).appendTo(group);

  button.on("click", async () => {
    await browser.runtime.sendMessage({ type: "DOWNLOAD" });
  });
}

const removeBuyButtons = () => {
  const buyButtons = document.querySelectorAll("a.sc-buylink");

  for (let i = 0; i < buyButtons.length; i++) {
    console.log("remove buy button");

    const buyButton = buyButtons[i];

    buyButton.parentNode.removeChild(buyButton);
  }
};

const handlePageLoad = () => {
  removeBuyButtons();

  // add download button to button group
  $(".sc-button-group-medium > .sc-button-like").each(function () {
    addDownloadButtonToGroup($(this).parent());
  });

  // remove newly mounted 'buy' buttons
  $(document).arrive("a.sc-buylink", function () {
    $(this).remove();
  });

  // add download button to newly mounted button groups
  $(document).arrive(".sc-button-group-medium > .sc-button-like", function () {
    addDownloadButtonToGroup($(this).parent());
  });
};

const documentState = document.readyState;

if (documentState === "complete" || documentState === "interactive") {
  handlePageLoad();
}

document.addEventListener("DOMContentLoaded", handlePageLoad);

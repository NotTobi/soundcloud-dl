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

const handlePageLoad = () => {
  // remove 'buy'' buttons
  $("a.sc-buylink").remove();

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

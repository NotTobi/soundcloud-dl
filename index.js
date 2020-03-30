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
    await (chrome || browser).runtime.sendMessage({ type: "DOWNLOAD" });
  });
}

$(function() {
  // remove purchase button
  $("a.sc-buylink").remove();

  $(document).arrive("a.sc-buylink", function() {
    $(this).remove();
  });

  // add download button
  $(".sc-button-group-medium > .sc-button-like").each(function() {
    addDownloadButtonToGroup($(this).parent());
  });

  $(document).arrive(".sc-button-group-medium > .sc-button-like", function() {
    addDownloadButtonToGroup($(this).parent());
  });
});

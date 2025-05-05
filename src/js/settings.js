// Add event handler for the clear download history button
document.getElementById("clear-download-history").addEventListener("click", function() {
  browser.storage.sync.set({ "track-download-history": {} }).then(() => {
    alert("Download history cleared successfully!");
  }).catch((error) => {
    console.error("Failed to clear download history:", error);
    alert("Failed to clear download history: " + error.message);
  });
}); 
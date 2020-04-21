function saveOptions(e) {
  console.log("Saving settings...");

  e.preventDefault();

  const downloadHqVersion = document.querySelector("#download-hq-version").checked;

  browser.storage.sync.set({
    "download-hq-version": downloadHqVersion,
  });
}

async function restoreOptions() {
  console.log("Restoring settings...");

  try {
    const result = await browser.storage.sync.get("download-hq-version");

    document.querySelector("#download-hq-version").checked = result["download-hq-version"] || true;
  } catch (error) {
    console.error("Failed to restore settings!", error);
  }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

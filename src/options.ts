async function saveOptions(e) {
  console.log("Saving settings...");

  e.preventDefault();

  const downloadHqVersion = document.querySelector<HTMLInputElement>("#download-hq-version").checked;

  try {
    await browser.storage.sync.set({
      "download-hq-version": downloadHqVersion,
    });
  } catch (error) {
    console.error("Failed to save settings!", error);
  }
}

async function restoreOptions() {
  console.log("Restoring settings...");

  try {
    const result = await browser.storage.sync.get("download-hq-version");

    const downloadHqVersion = result["download-hq-version"] ?? true;

    document.querySelector<HTMLInputElement>("#download-hq-version").checked = downloadHqVersion;
  } catch (error) {
    console.error("Failed to restore settings!", error);
  }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

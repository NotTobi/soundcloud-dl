async function saveOptions(e) {
  console.log("Saving settings...");

  e.preventDefault();

  const downloadHqVersion = document.querySelector<HTMLInputElement>("#download-hq-version").checked;
  const downloadOriginalVersion = document.querySelector<HTMLInputElement>("#download-original-version").checked;

  try {
    await browser.storage.sync.set({
      "download-hq-version": downloadHqVersion,
      "download-original-version": downloadOriginalVersion,
    });
  } catch (error) {
    console.error("Failed to save settings!", error);
  }
}

async function restoreOptions() {
  console.log("Restoring settings...");

  try {
    const result = await browser.storage.sync.get(["download-hq-version", "download-original-version"]);

    const downloadHqVersion = result["download-hq-version"] ?? true;
    const downloadOriginalVersion = result["download-original-version"] ?? false;

    document.querySelector<HTMLInputElement>("#download-hq-version").checked = downloadHqVersion;
    document.querySelector<HTMLInputElement>("#download-original-version").checked = downloadOriginalVersion;
  } catch (error) {
    console.error("Failed to restore settings!", error);
  }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

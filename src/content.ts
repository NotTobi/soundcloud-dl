import { DomObserver, ObserverEvent } from "./utils/domObserver";
import { sendMessageToBackend, onMessage } from "./compatibilityStubs";
import {
  loadConfiguration,
  setOnConfigValueChanged,
  configKeys,
} from "./utils/config";
import { v4 as uuid } from "uuid";

interface DownloadButton {
  elem: HTMLButtonElement;
  onClick: any;
}

type KeyedButtons = { [key: string]: DownloadButton };
type OnButtonClicked = (downloadId: string) => Promise<any>;

type SetupDownloadButtonOptions = {
  selector: string;
  getTrackUrl: (node: Element) => string | null;
  getButtonParent: (node: Element) => Element | null;
  isSmall?: boolean;
  // Renders an icon-only button that adopts the styling of its siblings
  isIconOnly?: boolean;
  // Icons are placed left of the "more" button by default
  isIconFirst?: boolean;
};

// Mirrors the geometry and stroke of SoundCloud's own share icon,
// so the download button does not stand out within a button group
const downloadIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true"><path d="M20.25 12.75V20.25H3.75V12.75M12 4.5V15M7.5 10.5L12 15L16.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"></path></svg>`;

const errorIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.5"></circle><path d="M12 7.5V13.5M12 16.125V17.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"></path></svg>`;

const successIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true"><path d="M4.5 12.75L9.75 18L19.5 6.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"></path></svg>`;

const errorColor = "#d30029";
const successColor = "#19a352";
const progressColor = "#ff5419";

let observer: DomObserver | null = null;

const downloadButtons: KeyedButtons = {};

// The tooltips of the surrounding buttons are rendered by SoundCloud itself
// and are not bound to elements we insert, so they have to be recreated.
// Both UIs bring their own kind of tooltip.
type TooltipVariant = "classic" | "modern";

const tooltips: { [variant: string]: HTMLDivElement } = {};

let tooltipTarget: HTMLButtonElement | null = null;
let tooltipTimeout: number | null = null;

// The modern tooltip sits above the button and grows into view
const modernEnterDelay = 200;
const modernHiddenTransform = "translate(-50%, -100%) scale(0.75, 0.5625)";
const modernVisibleTransform = "translate(-50%, -100%) scale(1, 1)";

// The classic one sits below the button, has an arrow and appears instantly
const classicOffset = 11;

const getTooltipVariant = (button: HTMLButtonElement) =>
  (button.dataset.tooltipVariant as TooltipVariant) ?? "modern";

const createTooltip = (variant: TooltipVariant) => {
  const elem = document.createElement("div");

  if (variant === "classic") {
    // Reuses SoundCloud's own tooltip styling
    elem.className =
      "tooltip g-z-index-overlay g-opacity-transition sc-selection-disabled";
    elem.style.cssText =
      "outline: none; width: auto; min-height: auto; position: absolute";
    elem.innerHTML = `<div class="tooltip__arrow"></div><div class="tooltip__content sc-text-captions"></div>`;
  } else {
    elem.style.cssText = [
      "position: fixed",
      "z-index: 2147483647",
      "pointer-events: none",
      "background-color: #121212",
      "color: #fafafa",
      "font-family: inherit",
      "font-size: 11px",
      "line-height: 16.5px",
      "padding: 1px 8px",
      "border-radius: 4px",
      "white-space: nowrap",
      "opacity: 0",
      "transform-origin: 50% 100%",
      `transform: ${modernHiddenTransform}`,
      "transition: opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 133ms cubic-bezier(0.25, 0.1, 0.25, 1)",
    ].join(";");
  }

  document.body.appendChild(elem);

  return elem;
};

const getTooltip = (variant: TooltipVariant) => {
  if (!tooltips[variant]) {
    tooltips[variant] = createTooltip(variant);
  }

  return tooltips[variant];
};

const positionTooltip = (
  elem: HTMLDivElement,
  button: HTMLButtonElement,
  variant: TooltipVariant
) => {
  const rect = button.getBoundingClientRect();
  const text = button.dataset.tooltip ?? "";

  if (variant === "classic") {
    const content = elem.querySelector(".tooltip__content") as HTMLElement;
    content.innerText = text;

    elem.style.top = `${rect.bottom + window.scrollY + classicOffset}px`;
    elem.style.left = `${
      rect.left + window.scrollX + rect.width / 2 - elem.offsetWidth / 2
    }px`;

    return;
  }

  elem.innerText = text;
  elem.style.left = `${rect.left + rect.width / 2}px`;
  elem.style.top = `${rect.top - 4}px`;
};

const showTooltip = (button: HTMLButtonElement) => {
  const variant = getTooltipVariant(button);
  const elem = getTooltip(variant);

  positionTooltip(elem, button, variant);

  // Already visible, only the label changed
  if (tooltipTarget === button) {
    return;
  }

  tooltipTarget = button;

  if (tooltipTimeout !== null) {
    window.clearTimeout(tooltipTimeout);
  }

  const reveal = () => {
    tooltipTimeout = null;

    if (tooltipTarget !== button) {
      return;
    }

    positionTooltip(elem, button, variant);

    if (variant === "classic") {
      elem.classList.add("m-is-visible");
    } else {
      elem.style.opacity = "1";
      elem.style.transform = modernVisibleTransform;
    }
  };

  if (variant === "classic") {
    reveal();
  } else {
    tooltipTimeout = window.setTimeout(reveal, modernEnterDelay);
  }
};

const hideTooltip = (button: HTMLButtonElement) => {
  const variant = getTooltipVariant(button);
  const elem = tooltips[variant];

  if (!elem || tooltipTarget !== button) {
    return;
  }

  tooltipTarget = null;

  if (tooltipTimeout !== null) {
    window.clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }

  if (variant === "classic") {
    elem.classList.remove("m-is-visible");
  } else {
    elem.style.opacity = "0";
    elem.style.transform = modernHiddenTransform;
  }
};

const setButtonText = (
  button: HTMLButtonElement,
  text: string,
  title?: string
) => {
  if (button.dataset.iconOnly === "true") {
    button.setAttribute("aria-label", text);
    button.dataset.tooltip = title ?? text;

    if (tooltipTarget === button) {
      showTooltip(button);
    }

    return;
  }

  button.innerText = text;
  button.title = title ?? text;
};

const resetButtonBackground = (button: HTMLButtonElement) => {
  button.style.backgroundColor = "";
  button.style.background = "";
};

const isIconButton = (button: HTMLButtonElement) =>
  button.dataset.iconOnly === "true";

// The classic UI wraps the icons of its buttons in an additional element
const renderIcon = (button: HTMLButtonElement, icon: string) => {
  button.innerHTML =
    button.dataset.tooltipVariant === "classic" ? `<div>${icon}</div>` : icon;
};

// A progress bar would cover the whole icon, so icon buttons are only tinted
const setDownloadProgress = (
  button: HTMLButtonElement,
  progress: number,
  iconOnly: boolean
) => {
  if (iconOnly) {
    button.style.color = progressColor;

    return;
  }

  button.style.background = `linear-gradient(90deg, ${progressColor} ${progress}%, transparent 0%)`;
};

// Icon buttons have no room for an error message, so they turn red and
// reveal the message when they are clicked again
const setIconButtonError = (
  button: HTMLButtonElement,
  message: string,
  label: string | undefined,
  onReset: any
) => {
  resetButtonBackground(button);
  renderIcon(button, errorIcon);

  button.style.color = errorColor;
  button.style.cursor = "pointer";

  setButtonText(button, label ? `Error: ${label}` : "Error");

  button.onclick = () => {
    window.alert(message);

    renderIcon(button, downloadIcon);

    button.style.color = "";
    button.onclick = onReset;

    setButtonText(button, "Download");
  };
};

const handleMessageFromBackgroundScript = async (_, message: any) => {
  const { downloadId, progress, error, errorLabel } = message;

  // Every frame receives the message, but only one of them owns the button
  const downloadButtonState = downloadButtons[downloadId];

  if (!downloadButtonState) return;

  const { elem: downloadButton, onClick: originalOnClick } =
    downloadButtonState;

  const iconButton = isIconButton(downloadButton);

  if (progress === 101) {
    resetButtonBackground(downloadButton);

    if (iconButton) {
      renderIcon(downloadButton, successIcon);

      downloadButton.style.color = successColor;
    } else {
      downloadButton.style.backgroundColor = successColor;
    }

    setButtonText(downloadButton, "Downloaded!");

    setTimeout(() => {
      resetButtonBackground(downloadButton);

      if (iconButton) {
        renderIcon(downloadButton, downloadIcon);

        downloadButton.style.color = "";
      }

      setButtonText(downloadButton, "Download");

      downloadButton.style.cursor = "pointer";
      downloadButton.onclick = originalOnClick;

      delete downloadButtons[downloadId];
    }, 2000);
  } else if (progress === 100) {
    setButtonText(downloadButton, "Finishing...");

    setDownloadProgress(downloadButton, progress, iconButton);
  } else if (progress) {
    setButtonText(downloadButton, "Downloading...");

    setDownloadProgress(downloadButton, progress, iconButton);
  }

  if (error) {
    if (isIconButton(downloadButton)) {
      setIconButtonError(downloadButton, error, errorLabel, originalOnClick);
    } else {
      resetButtonBackground(downloadButton);

      downloadButton.style.backgroundColor = errorColor;

      const buttonLabel = errorLabel ? `Error: ${errorLabel}` : "Error";

      setButtonText(downloadButton, buttonLabel, error);

      downloadButton.style.cursor = "pointer";
      downloadButton.onclick = originalOnClick;
    }

    delete downloadButtons[downloadId];
  }
};

// -----------------------
// SETUP MESSAGE HANDLER
// -----------------------
onMessage(handleMessageFromBackgroundScript);

const createDownloadButton = (small?: boolean) => {
  const button = document.createElement("button");
  const buttonSizeClass = small ? "sc-button-small" : "sc-button-medium";

  button.className = `sc-button-download sc-button ${buttonSizeClass} sc-button-responsive`;
  setButtonText(button, "Download");

  return button;
};

// Classes that describe what a button does, everything else is styling
const buttonIdentityClasses =
  /^(sc-button-(like|repost|share|copylink|more|follow|download|selected)|m-boldIcon)$/;

const createIconDownloadButton = (parent: Node & ParentNode, small?: boolean) => {
  const button = document.createElement("button");
  const legacySibling =
    (parent as Element).querySelector("button.sc-button-icon") ??
    (parent as Element).querySelector("button.sc-button");

  button.type = "button";
  button.dataset.iconOnly = "true";

  if (legacySibling) {
    // Button groups of the classic UI, which style their icons themselves
    const buttonSizeClass = small ? "sc-button-small" : "sc-button-medium";
    const classes = legacySibling.className
      .split(" ")
      .filter((className) => className && !buttonIdentityClasses.test(className));

    if (!classes.includes("sc-button-icon")) {
      classes.push("sc-button-icon");
    }

    const hasSizeClass = classes.some((className) =>
      /^sc-button-(small|medium|large)$/.test(className)
    );

    if (!hasSizeClass) {
      classes.push(buttonSizeClass);
    }

    button.className = ["sc-button-download", ...classes].join(" ");
    button.dataset.tooltipVariant = "classic";
    renderIcon(button, downloadIcon);
  } else {
    // Adopt the styling of the other buttons within the same group
    const sibling = (parent as Element).querySelector("button");

    button.className = `sc-button-download ${sibling?.className ?? ""}`.trim();
    button.dataset.tooltipVariant = "modern";
    renderIcon(button, downloadIcon);
  }

  button.onmouseenter = () => showTooltip(button);
  button.onmouseleave = () => hideTooltip(button);

  setButtonText(button, "Download");

  return button;
};

const addDownloadButtonToParent = (
  parent: Node & ParentNode,
  onClicked: OnButtonClicked,
  small?: boolean,
  iconOnly?: boolean,
  iconFirst?: boolean
) => {
  const downloadButtonExists =
    parent.querySelector("button.sc-button-download") !== null;

  if (downloadButtonExists) {
    return;
  }

  const button = iconOnly
    ? createIconDownloadButton(parent, small)
    : createDownloadButton(small);
  button.onclick = async () => {
    const downloadId = uuid();

    downloadButtons[downloadId] = {
      elem: button,
      onClick: button.onclick,
    };

    resetButtonBackground(button);
    button.style.cursor = "default";
    button.onclick = null;
    setButtonText(button, "Preparing...");

    await onClicked(downloadId);
  };

  if (iconFirst) {
    parent.insertBefore(button, parent.firstChild);

    return;
  }

  // Left of the "more" button, or last if the group has none
  const moreButton = iconOnly
    ? (parent as Element).querySelector(
        `button.sc-button-more, button[aria-label="More menu"]`
      )
    : null;

  // The button may be wrapped, so insert before whatever holds it
  let anchor: Node | null = moreButton;

  while (anchor && anchor.parentNode !== parent) {
    anchor = anchor.parentNode;
  }

  if (anchor) {
    parent.insertBefore(button, anchor);
  } else {
    parent.appendChild(button);
  }
};

const createDownloadCommand = (url: string) => (downloadId: string) => {
  const pathname = new URL(url).pathname;
  const parts = pathname.split("/").filter(Boolean);

  const set = parts.length >= 2 && parts[parts.length - 2] === "sets";

  return sendMessageToBackend({
    type: set ? "DOWNLOAD_SET" : "DOWNLOAD",
    url,
    downloadId,
  });
};

const setupDownloadButtons = ({
  selector,
  getTrackUrl,
  getButtonParent,
  isSmall = false,
  isIconOnly = false,
  isIconFirst = false,
}: SetupDownloadButtonOptions) => {
  const handler = (node: Element) => {
    const initialTrackUrl = getTrackUrl(node);
    if (!initialTrackUrl) {
      return;
    }

    const parent = getButtonParent(node);
    if (!parent) {
      return;
    }

    // The url is resolved on click, because a button group can outlive
    // the track it was created for during client side navigation
    const downloadCommand = (downloadId: string) => {
      const trackUrl = getTrackUrl(node) ?? initialTrackUrl;

      return createDownloadCommand(window.location.origin + trackUrl)(
        downloadId
      );
    };

    addDownloadButtonToParent(
      parent,
      downloadCommand,
      isSmall,
      isIconOnly,
      isIconFirst
    );
  };

  document.querySelectorAll(selector).forEach(handler);

  const event: ObserverEvent = {
    selector,
    callback: handler,
  };

  observer?.addEvent(event);
};

// The newer track page is rendered within a same origin iframe,
// which prefixes every path with "/n"
const getSoundPathname = () => {
  const pathname = window.location.pathname.replace(/^\/n(?=\/|$)/, "");
  const parts = pathname.split("/").filter(Boolean);

  // Anything with less than two segments is a user, not a track or set
  if (parts.length < 2) {
    return null;
  }

  return "/" + parts.join("/");
};

const handlePageLoaded = async () => {
  observer = new DomObserver();

  // Track / set from the new track page (button group next to the comment box)
  setupDownloadButtons({
    selector: 'button[aria-label="Copy link"]',
    getTrackUrl: getSoundPathname,
    getButtonParent: (node) => node.parentElement,
    isIconOnly: true,
  });

  // Track from track page, mix / station / playlist (download all on a page)
  setupDownloadButtons({
    selector:
      ".listenEngagement__footer .sc-button-group, .systemPlaylistDetails__controls",
    getTrackUrl: () => window.location.pathname,
    getButtonParent: (node) => node,
    isIconOnly: true,
  });

  // Track / set tile on the likes, playlists and albums pages
  setupDownloadButtons({
    selector: ".playableTile__actionWrapper",
    getTrackUrl: (node) => {
      const tile = node.closest(".playableTile");
      const el = tile?.querySelector("a.playableTile__artworkLink");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
    isIconOnly: true,
    isIconFirst: true,
  });

  // Track from track page (visual style)
  setupDownloadButtons({
    selector: ".sound__footer .sc-button-group",
    getTrackUrl: (node) => {
      const sound = node.closest(".sound");

      const titleLink = sound?.querySelector("a.soundTitle__title");
      const titleHref = titleLink?.getAttribute("href");
      if (titleHref) return titleHref;

      const ministatLink = sound?.querySelector("a.sc-ministats[href]");
      const ministatHref = ministatLink?.getAttribute("href");
      const stripped = ministatHref?.replace(
        /\/(likes|reposts|comments)$/,
        ""
      );
      return stripped ?? null;
    },
    getButtonParent: (node) => node,
    isIconOnly: true,
  });

  // Single track in playlist / mix / station (download selected track)
  setupDownloadButtons({
    selector: ".trackItem .sc-button-group",
    getTrackUrl: (node) => {
      const trackItem = node.closest(".trackItem");
      const el = trackItem?.querySelector("a.trackItem__trackTitle");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
    isIconOnly: true,
  });

  // Single track in feed / author's page (download selected track)
  setupDownloadButtons({
    selector: ".soundList__item .sc-button-group",
    getTrackUrl: (node) => {
      const trackItem = node.closest(".soundList__item");
      const el = trackItem?.querySelector("a.soundTitle__title");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
    isIconOnly: true,
  });

  setupDownloadButtons({
    selector: ".searchItem .sc-button-group",
    getTrackUrl: (node) => {
      const trackItem = node.closest(".searchItem");
      const el = trackItem?.querySelector("a.soundTitle__title");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
  });

  // Next up modal (download selected track)
  setupDownloadButtons({
    selector: ".queueItemView__actions",
    getTrackUrl: (node) => {
      const el = node
        .closest(".queue__itemWrapper")
        ?.querySelector(".queueItemView__title a");
      return el?.getAttribute("href") ?? null;
    },
    getButtonParent: (node) => node,
    isSmall: true,
    isIconOnly: true,
  });

  observer.start(document.body);
};

const documentState = document.readyState;

if (documentState === "complete" || documentState === "interactive") {
  setTimeout(handlePageLoaded, 0);
}

document.addEventListener("DOMContentLoaded", handlePageLoaded);

window.onbeforeunload = () => {
  observer?.stop();
};

function writeConfigValueToLocalStorage(key: string, value: any) {
  const item = JSON.stringify(value);

  window.localStorage.setItem("SOUNDCLOUD-DL-" + key, item);
}

loadConfiguration(true).then((config) => {
  for (const key of configKeys) {
    if (config[key].secret) continue;

    writeConfigValueToLocalStorage(key, config[key].value);
  }

  setOnConfigValueChanged(writeConfigValueToLocalStorage);
});

## Installation

Download the extension from the [Firefox Add-ons page](https://addons.mozilla.org/firefox/addon/soundcloud-dl).

## Configuration

When visiting `soundcloud.com`, there should be an icon of this extension next to the addressbar.

Click on the icon (and click on 'Options' in Chrome) to get to the configuration section.

### What can be configured?

- Download of high quality version (you need to be a GO+ user)
- Download of the original version (when possible)
- Downloading directly to a default location without a dialog
- Normalization of the track name
- Blocking of reposts in the 'Stream' feed

## Changelog

The Changelog can be found [here](./CHANGELOG.md).

## Donations

If you want to support the development of this extension, consider donating!

[**Donate here**](https://www.paypal.me/nottobii)

## Known issues

1. Tracks that only have HLS streams can currently not be downloaded
2. Changing the user OAuth token, after the user logged in/out can sometimes require a page refresh
3. The normalization of some track names can fail and produce wrong results

## How to report an issue

// todo

## Building instructions for Firefox Add-on review process

### Operating system used

Linux 5.9 (Arch-based)

### Software/Tooling used

- node v13.13.0 - [Installation instructions](https://nodejs.org/en/download/)
- yarn v1.22.4 - [Installation instructions](https://classic.yarnpkg.com/en/docs/install)
- jq v1.6 [Installation instructions](https://stedolan.github.io/jq/download/)

### Build process

To build the addon run the `create-dist.sh` script.

The build artifact `SoundCloud-Downloader-Firefox.zip` can be found in the `dist` directory.

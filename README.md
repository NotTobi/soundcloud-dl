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
- Blocking playlists in the 'Stream' feed
- Including producers as artists

## Changelog

The Changelog can be found [here](./CHANGELOG.md).

## Donations

If you want to support the development of this extension, consider donating!

[**Donate here**](https://www.paypal.me/nottobii)

## Known issues

1. The normalization of some track names can fail and produce wrong results
2. Sometimes the extension fails to recognize a user login/logout. A page refresh can help!
3. The block reposts feature can sometimes not work, checkout [this](https://github.com/NotTobi/soundcloud-dl/issues/12#issuecomment-753988874) for a solution.

## How to report an issue

1. When you encounter an issue, open the following link in the same browser session where the error occured: about:devtools-toolbox?type=extension&id=%7Bc7a839e7-7086-4021-8176-1cfcb7f169ce%7D (GitHub won't let me link this properly)
2. Click on the `Console` tab.
3. You should now be seeing a bunch of log messages
4. Right click on one of the messages, choose `Export Visible Messages To` > `File` and save the file
5. Click the following link to create a new issue: [Link](https://github.com/NotTobi/soundcloud-dl/issues/new)
6. Insert a fitting title for your issue, e.g "Add-On crashes my browser when XYZ"
7. Write any additional information that could be useful in the body of the issue
8. Drag the file you just downloaded in the issue body as well
9. Click on `Submit new issue`

I will try and respond as soon as possible!

## Building instructions for Firefox Add-on review process

### Operating system used

MacOS 15.5

### Software/Tooling used

- node v21.5.0 - [Installation instructions](https://nodejs.org/en/download/)
- yarn v1.22.22 - [Installation instructions](https://classic.yarnpkg.com/en/docs/install)
- jq v1.7.1 [Installation instructions](https://stedolan.github.io/jq/download/)

### Build process

To build the addon run the `create-dist.sh` script.

The build artifact `SoundCloud-Downloader-Firefox.zip` can be found in the `dist` directory.

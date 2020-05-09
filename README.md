# Download this extension from the [Firefox Add-ons page](https://addons.mozilla.org/firefox/addon/soundcloud-dl)

## [Changelog](./CHANGELOG.md)

## [Donations](https://www.paypal.me/nottobii)

## Configuration

If you're on soundcloud.com, there should be an icon of this extension next to the addressbar.

Click on the icon (and click on 'Options' in Chrome) to get to the configuration section.

## Known issues

Changing the user OAuth token, after the user logged in/out can sometimes not work correctly.

Therefor it is a good idea to refresh the page, after you've logged in/out!

## Missing features

- Download favorites

If you want to help implement one of these features, go right ahead! :)

## Building instructions for Firefox Add-on review process

### Operating system used

Linux 5.6 (Arch-based)

### Software/Tooling used

- node v13.13.0 - [Installation instructions](https://nodejs.org/en/download/)
- yarn v1.22.4 - [Installation instructions](https://classic.yarnpkg.com/en/docs/install)
- jq v1.6 [Installation instructions](https://stedolan.github.io/jq/download/)

### Build process

To build the addon run the `create-dist.sh` script.

The build artifact `SoundCloud-Downloader-Firefox.zip` can be found in the `dist` directory.

<hr />

### Developer TODOs

- add download support for HLS only files
- cleanup `background.ts` and `content.ts`
- refactor metadataExtractor and add more tests
- find better way to aquire client_id and oauth token, check if user logged in/out
- better error handling -> also displaying errors to the user

Download this extension from the [Firefox Add-Ons page](https://addons.mozilla.org/en-US/firefox/addon/soundcloud-dl).

## Configuration

todo...

## Missing features

- When downloading high quality .m4a audio files, the Artwork is not set
- Add download buttons in more locations around the page
- Download playlists/albums/favorites
- Better error handling -> also displaying errors to the user

If you want to help implement one of those features, go right ahead! :)

### Developer TODOs

- document configuration
- cross-browser compatibility of `browser.storage.sync` and various other `browser.`-only methods at the moment
- cleanup `background.ts`

## Building the addon

### Operating system used

Linux 5.5.15-1-MANJARO

_Any other operating system should do just fine, since Node is widely supported_

### Software/Tooling used

- Node v13.12.0 - [Installation instructions](https://nodejs.org/en/download/)
- yarn v1.22.4 - [Installation instructions](https://classic.yarnpkg.com/en/docs/install)

### Build process

To build the addon run the `create-dist.sh` script.

The build artifact `SoundCloud-Download.zip` can be found in the `dist` directory.

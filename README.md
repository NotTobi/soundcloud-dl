# Download this extension from the [Firefox Add-Ons page](https://addons.mozilla.org/en-US/firefox/addon/soundcloud-dl)

## Configuration

If you're on soundcloud.com, there should be an icon of this extension next to the addressbar. Click on it to get to the configuration section.

## Missing features

- Download playlists/albums/favorites
- Add download buttons in more locations around the page

If you want to help implement one of those features, go right ahead! :)

#### Developer TODOs

- persist OAuth Token and ClientId, to ease development
- determine file extension of original audio file
- add download support for hls only files
- better error handling -> also displaying errors to the user
- cleanup `background.ts`
- cleanup `mp4TagWriter.ts` and try to improve performance

## Building the addon

### Operating system used

Linux 5.6.7-MANJARO

_Any other operating system should do just fine, since Node is widely supported_

### Software/Tooling used

- Node v13.13.0 - [Installation instructions](https://nodejs.org/en/download/)
- yarn v1.22.4 - [Installation instructions](https://classic.yarnpkg.com/en/docs/install)

### Build process

To build the addon run the `create-dist.sh` script.

The build artifact `SoundCloud-Download.zip` can be found in the root directory.

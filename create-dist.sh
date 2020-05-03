#!/bin/bash

trap "exit 1" ERR

# build package

yarn install

yarn test

yarn run build

# bundle for different browsers

cd dist

# bundle for Chrome

jq -s ".[0] * .[1]" "manifest_original.json" "manifest_chrome.json" > "manifest.json"

zip -r "SoundCloud-Downloader-Chrome.zip" . -x "manifest_*" "*.zip"

# bundle for Firefox

jq -s ".[0] * .[1]" "manifest_original.json" "manifest_firefox.json" > "manifest.json"

zip -r "SoundCloud-Downloader-Firefox.zip" . -x "manifest_*" "*.zip"

# archive source code for firefox review process
cd ..

git archive --format zip --output "dist/SoundCloud-Downloader-Source-Code.zip" master
#!/bin/bash

trap "exit 1" ERR

# build package

yarn install

yarn test

yarn run build

# bundle for different browsers

cd dist

# zip updates existing archives instead of replacing them
rm -f "SoundCloud-Downloader-Chrome.zip" "SoundCloud-Downloader-Firefox.zip" "SoundCloud-Downloader-Source-Code.zip"

# bundle for Chrome

jq -s ".[0] * .[1]" "manifest_original.json" "manifest_chrome.json" > "manifest.json"

zip -r "SoundCloud-Downloader-Chrome.zip" . -x "manifest_*" "*.zip" ".DS_Store"

# bundle for Firefox

jq -s ".[0] * .[1]" "manifest_original.json" "manifest_firefox.json" > "manifest.json"

zip -r "SoundCloud-Downloader-Firefox.zip" . -x "manifest_*" "*.zip" ".DS_Store"

# archive source code for firefox review process
cd ..

git archive --format zip --output "dist/SoundCloud-Downloader-Source-Code.zip" HEAD
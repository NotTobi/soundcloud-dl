#!/bin/bash

# build package

{
    yarn install

    yarn test

    yarn run build
} || exit 1

cd dist

# bundle chrome

jq -s ".[0] * .[1]" "manifest_original.json" "manifest_chrome.json" > "manifest.json"

zip -r "SoundCloud-Downloader-Chrome.zip" . -x "manifest_*" "*.zip"

# bundle firefox

jq -s ".[0] * .[1]" "manifest_original.json" "manifest_firefox.json" > "manifest.json"

zip -r "SoundCloud-Downloader-Firefox.zip" . -x "manifest_*" "*.zip"

# todo clone repo into zip
# zip -r "dist/SoundCloud-Downloader-Source-Code.zip" . -x ".git/*" "node_modules/*" "dist/js/*" "dist/*.zip" "bundle-source-code.sh"
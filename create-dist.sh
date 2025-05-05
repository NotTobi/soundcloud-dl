#!/bin/bash

trap "exit 1" ERR

# build package

# Use npm instead of yarn
echo "Running npm install..."
npm install

echo "Running npm test..."
npm test

# Run webpack directly, not the npm build script
echo "Running webpack..."
webpack # Outputs cleaned js to dist/js

# Create other needed dist directories if they don't exist (icons dir)
echo "Ensuring dist directories exist..."
mkdir -p dist/icons

# Copy static assets into dist
echo "Copying static assets..."
cp src/settings.html dist/
cp -r src/icons/* dist/icons/

# bundle for different browsers
# Operate from the root directory initially

# bundle for Chrome
echo "Bundling Chrome extension..."
jq -s ".[0] * .[1]" "src/manifests/manifest_original.json" "src/manifests/manifest_chrome.json" > "dist/manifest.json" # Output manifest into dist
# Zip specifically required files from dist
cd dist # Now CD into dist to make zip paths relative inside the archive
zip -r "SoundCloud-Downloader-Chrome.zip" manifest.json js/ icons/ settings.html -x "*.zip" # Explicitly list items to zip
cd .. # Go back to root

# bundle for Firefox
echo "Bundling Firefox extension..."
jq -s ".[0] * .[1]" "src/manifests/manifest_original.json" "src/manifests/manifest_firefox.json" > "dist/manifest.json" # Output manifest into dist
# Zip specifically required files from dist
cd dist # CD into dist again
zip -r "SoundCloud-Downloader-Firefox.zip" manifest.json js/ icons/ settings.html -x "*.zip" # Explicitly list items to zip
cd .. # Go back to root

# archive source code for firefox review process
echo "Archiving source code..."
mkdir -p dist # Ensure dist exists before archiving source
git archive --format zip --output "dist/SoundCloud-Downloader-Source-Code.zip" master

echo "Build process complete."
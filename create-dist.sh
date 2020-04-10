#!/bin/bash

yarn run build || exit 1

cp ./manifest.json dist/
cp -r ./icons dist/

zip -r -FS SoundCloud-Downloader.zip dist/*
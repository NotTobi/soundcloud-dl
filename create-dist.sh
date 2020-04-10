#!/bin/bash

yarn run build || exit 1

(cd dist && zip -r SoundCloud-Downloader.zip .)
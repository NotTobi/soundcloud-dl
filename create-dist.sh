#!/bin/bash

yarn run build || exit 1

zip -r -FS SoundCloud-Downloader.zip dist/*
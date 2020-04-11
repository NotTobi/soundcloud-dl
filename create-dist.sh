#!/bin/bash

{
    yarn install

    yarn test

    yarn run build
} || exit 1

(cd dist && zip -r "SoundCloud-Downloader.zip" .)
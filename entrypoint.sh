#!/bin/sh

set -eo pipefail

decrypt() {
    secret=$1
    tempFile=$(mktemp)
    echo $secret | base64 -d > $tempFile
    aws kms decrypt --ciphertext-blob fileb://$tempFile --output text --query Plaintext | base64 -d
    rm $tempFile
}

export SLACK_BOT_TOKEN=$(decrypt $ENCRYPTED_SLACK_BOT_TOKEN)
export SLACK_SIGNING_SECRET=$(decrypt $ENCRYPTED_SLACK_SIGNING_SECRET)
export GOOGLE_PRIVATE_KEY=$(decrypt $ENCRYPTED_GOOGLE_PRIVATE_KEY)
export GOOGLE_SERVICE_ACCOUNT_EMAIL=$(decrypt $ENCRYPTED_GOOGLE_SERVICE_ACCOUNT_EMAIL)

node --enable-source-maps index.js

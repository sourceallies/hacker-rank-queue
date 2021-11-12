#!/bin/bash

positional=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    --env)
    environment="$2"
    shift # past argument
    shift # past value
    ;;
    --secret-name)
    secret_name="$2"
    shift
    shift
    ;;
    *)
    positional+=("$1")
    shift
    ;;
esac
done

cwd=$(dirname ${BASH_SOURCE[0]:-0})
tempfile=$(mktemp)
${EDITOR:-vi} $tempfile

plaintext=$(cat $tempfile | base64)
ciphertext=$(aws kms encrypt --plaintext $plaintext --key-id alias/PIPELINE_KEY --output text --query CiphertextBlob)

rm $tempfile

paramsfile=$cwd/../cdk.json
params=$(cat $paramsfile | jq --arg env "$environment" --arg name "$secret_name" --arg value "$ciphertext" '.context[$env][$name]=$value')
echo $params | jq . > $paramsfile
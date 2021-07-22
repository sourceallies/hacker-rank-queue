#!/bin/bash
set -e
echo ""

CALLER_ID="$(aws sts get-caller-identity --no-cli-pager | grep 729161019481)"
if [[ "$CALLER_ID" == "" ]]; then
    echo -e "\x1b[96m\x1b[1mSign into AWS dev\x1b[0m"
    if [[ "$(which dev | grep 'dev: aliased to pushd')" != "" ]]; then
        dev
    else
        echo "'dev' alias not found, sign in manually"
        exit 1
    fi
fi

# Build and push the image
pushd ..
TAG="729161019481.dkr.ecr.us-east-1.amazonaws.com/sai/hacker-rank-queue:dev"
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 729161019481.dkr.ecr.us-east-1.amazonaws.com
docker build -t $TAG -f docker/Dockerfile .
docker push $TAG

popd
function getOutput {
    key="$1"
    echo "$(aws cloudformation describe-stacks --stack-name HackerRankQueueStack --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text)"
}
CLUSTER_NAME="$(getOutput ClusterName)"
SERVICE_NAME="$(getOutput ServiceName)"
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --force-new-deployment --no-cli-pager

echo ""
echo "Waiting for app to update..."

aws ecs wait services-stable \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME"

echo -e "\x1b[92m\x1b[1mECS Task started!\x1b[0m"
echo ""

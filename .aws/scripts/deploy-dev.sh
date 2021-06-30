#!/bin/bash
set -e

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
SEERVICE_NAME="$(getOutput ServiceName)"
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SEERVICE_NAME" --force-new-deployment --no-cli-pager

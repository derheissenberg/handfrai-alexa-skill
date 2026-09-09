#!/usr/bin/env bash
# Build a deployable zip for the AWS Lambda path.
#
#   ./tools/package-lambda.sh            # SDK transport (default), installs dependencies
#   TRANSPORT=http ./tools/package-lambda.sh   # zero-dependency build, much smaller
#
# Alexa-hosted skills do not need this — there you paste the files into the console editor.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lambda="$here/lambda"
out="$here/handfrai-lambda.zip"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

cp "$lambda/index.js" "$lambda/package.json" "$staging/"
cp -R "$lambda/lib" "$staging/"

if [ "${TRANSPORT:-sdk}" = "http" ]; then
  # Only the Alexa SDK is required; the Claude call uses node:https.
  (cd "$staging" && npm install --omit=dev --silent ask-sdk-core@2.14.0 ask-sdk-model@1.86.0 >/dev/null)
else
  (cd "$staging" && npm install --omit=dev --silent >/dev/null 2>&1 \
    || npm install --omit=dev --silent ask-sdk-core@2.14.0 ask-sdk-model@1.86.0 @anthropic-ai/sdk@0.124.0 >/dev/null)
fi

rm -f "$out"
(cd "$staging" && zip -qr "$out" .)
echo "Built $out ($(du -h "$out" | cut -f1))"
echo "Upload it in the AWS Lambda console under Code → Upload from → .zip file."

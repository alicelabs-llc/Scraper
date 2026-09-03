#!/bin/bash
# smoke_v5.sh — bundle + run the v5 unit smoke (esbuild, like test_reputation)
set -e
cd "$(dirname "$0")/.."
npx esbuild scripts/smoke_v5.mjs --bundle --platform=node --format=esm --outfile=/tmp/smoke_v5.bundle.mjs
node /tmp/smoke_v5.bundle.mjs

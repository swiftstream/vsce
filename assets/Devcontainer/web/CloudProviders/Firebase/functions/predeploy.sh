#!/usr/bin/bash
echo "Copying hosting files into functions folder"
# Read the `hosting.wasm` value from firebase.json
WASM=$(jq -r '.hosting.wasm' firebase.json)

# Check if jq command succeeded
if [ -z "$WASM" ] || [ "$WASM" == "null" ]; then
  echo "Error: Could not read hosting.wasm from firebase.json"
  exit 1
fi

cp firebase.json functions/ && echo "Copied firebase.json"
cp ../DistPublic/main.html functions/ && echo "Copied main.html"
cp "../DistPublic/$WASM.wasm" functions/ && echo "Copied $WASM.wasm"

echo "Done!"
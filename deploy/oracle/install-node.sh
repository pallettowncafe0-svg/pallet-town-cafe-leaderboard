#!/usr/bin/env bash
# Install the latest Node 22 LTS from nodejs.org, verifying its published checksum.
set -euo pipefail
case "$(uname -m)" in aarch64) arch=arm64;; x86_64) arch=x64;; *) echo 'Unsupported architecture' >&2; exit 1;; esac
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o SHASUMS256.txt
archive=$(awk -v arch="$arch" '$2 ~ "^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" {print $2}' SHASUMS256.txt)
test -n "$archive"
curl --fail --silent --show-error --location "https://nodejs.org/dist/latest-v22.x/$archive" -o "$archive"
awk -v archive="$archive" '$2 == archive' SHASUMS256.txt | sha256sum --check --status
sudo mkdir -p /opt/node-v22
sudo tar -xJf "$archive" -C /opt/node-v22 --strip-components=1
for binary in node npm npx; do sudo ln -sfn "/opt/node-v22/bin/$binary" "/usr/bin/$binary"; done
node --version
npm --version

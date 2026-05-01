#!/usr/bin/env bash
set -euo pipefail

git submodule update --init --recursive
git -C stolet.github.io switch master
git -C stolet.github.io pull --ff-only origin master

cp -r webpage/* stolet.github.io/
git -C stolet.github.io add .

msg="rebuilding site $(date)"
if [ -n "$*" ]; then
	msg="$*"
fi

if git -C stolet.github.io diff --cached --quiet; then
	echo "No deploy changes to commit."
else
	git -C stolet.github.io commit -m "$msg"
fi

git -C stolet.github.io push origin master

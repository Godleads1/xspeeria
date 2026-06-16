#!/bin/bash
echo ""
echo "=== Xspeeria GitHub Setup ==="
echo ""
echo "Go to: https://github.com/settings/tokens"
echo "Click: Generate new token (classic)"
echo "Tick:  repo  (full control of private repositories)"
echo "Click: Generate token"
echo "Copy the token (starts with ghp_...)"
echo ""
read -p "Paste or type your GitHub token here: " TOKEN
echo ""

if [ -z "$TOKEN" ]; then
  echo "No token entered. Exiting."
  exit 1
fi

git remote set-url origin "https://${TOKEN}@github.com/Godleads1/xspeeria.git"
echo "Remote URL updated."

echo "Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "SUCCESS! All changes are now on GitHub."
  echo "In VSCode, run:  git pull origin main"
else
  echo ""
  echo "Push failed. Check your token has 'repo' scope."
fi

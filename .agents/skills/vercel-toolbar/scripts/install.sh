#!/bin/bash
set -e

PACKAGE_NAME="vercel"

VC=
if command -v vc &> /dev/null; then
    VC=vc
elif command -v vercel &> /dev/null; then
    VC=vercel
fi

echo "======================================"
echo "Vercel Toolbar Skill - Installation"
echo "======================================"
echo

if [ -z "$VC" ]; then
    echo "Vercel CLI is not installed."
    echo "This will install the 'vercel' command (and 'vc' alias) globally using npm."
    echo
    read -p "Proceed with global installation? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo
        echo "Installation cancelled. Run: npm install -g $PACKAGE_NAME"
        exit 1
    fi
    echo "Installing Vercel CLI globally..."
    if npm install -g "$PACKAGE_NAME"; then
        echo "✓ Vercel CLI installed"
        VC=vercel
    else
        echo "✗ Failed to install. Try: npm install -g $PACKAGE_NAME"
        exit 1
    fi
    echo
fi

echo "======================================"
echo "Authentication"
echo "======================================"
echo

WHOAMI_OUTPUT=$($VC whoami 2>&1)
WHOAMI_EXIT=$?

if [ $WHOAMI_EXIT -eq 0 ] && [ -n "$WHOAMI_OUTPUT" ]; then
    echo "✓ Already authenticated as: $WHOAMI_OUTPUT"
    echo
    read -p "Re-authenticate? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo
        echo "======================================"
        echo "Installation Complete!"
        echo "======================================"
        echo
        echo "You're ready to use the Vercel Toolbar skill."
        exit 0
    fi
fi

echo "You need to log in to Vercel. This will open your browser."
echo
$VC login

echo
echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo
echo "You're ready to use the Vercel Toolbar skill."
echo "Try asking for your toolbar comments in a project that uses Vercel."
echo

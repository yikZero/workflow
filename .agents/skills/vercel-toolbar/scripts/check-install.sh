#!/bin/bash
# Check if Vercel CLI is installed and authenticated
# Returns: 0 if ready, non-zero if setup needed

VC=
if command -v vc &> /dev/null; then
    VC=vc
elif command -v vercel &> /dev/null; then
    VC=vercel
else
    echo "vercel cli not found"
    exit 1
fi

WHOAMI_OUTPUT=$($VC whoami 2>&1)
WHOAMI_EXIT=$?

if [ $WHOAMI_EXIT -ne 0 ] || [ -z "$WHOAMI_OUTPUT" ]; then
    echo "not authenticated"
    exit 2
fi

echo "ok"
exit 0

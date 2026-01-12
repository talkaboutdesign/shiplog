#!/bin/bash
# Script to format GitHub App private key for Convex environment variable
# Usage: ./format_github_key.sh <path-to-private-key.pem>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <path-to-private-key.pem>"
    echo ""
    echo "Example: $0 ~/Downloads/your-app-name.2024-01-01.private-key.pem"
    exit 1
fi

KEY_FILE="$1"

if [ ! -f "$KEY_FILE" ]; then
    echo "Error: File not found: $KEY_FILE"
    exit 1
fi

echo ""
echo "Formatted private key (copy everything below):"
echo "=============================================="
echo ""
cat "$KEY_FILE" | sed ':a;N;$!ba;s/\n/\\n/g'
echo ""
echo ""
echo "=============================================="
echo "Copy the output above and paste it into Convex Dashboard"
echo "as the value for GITHUB_APP_PRIVATE_KEY (with quotes around it)"

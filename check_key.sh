#!/bin/bash
# Script to verify if a GitHub App private key file is valid
# Usage: ./check_key.sh <path-to-private-key.pem>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <path-to-private-key.pem>"
    echo ""
    echo "This script will verify if your private key file is valid"
    exit 1
fi

KEY_FILE="$1"

if [ ! -f "$KEY_FILE" ]; then
    echo "Error: File not found: $KEY_FILE"
    exit 1
fi

echo "Checking key file: $KEY_FILE"
echo ""

# Check with OpenSSL if available
if command -v openssl &> /dev/null; then
    echo "Testing with OpenSSL..."
    if openssl rsa -in "$KEY_FILE" -check -noout 2>/dev/null; then
        echo "✓ Key is valid RSA private key (PKCS#1 format)"
    else
        echo "✗ Key validation FAILED"
        echo ""
        echo "The key file appears to be corrupted or invalid."
        echo "Please re-download the private key from GitHub:"
        echo "1. Go to https://github.com/settings/apps"
        echo "2. Find your GitHub App"
        echo "3. Click 'Generate a new private key'"
        echo "4. Download the new .pem file"
        exit 1
    fi
else
    echo "OpenSSL not available - cannot validate key"
    echo "Please install OpenSSL to validate the key, or re-download from GitHub"
fi

echo ""
echo "If the key is valid, the issue might be with how it's stored in Convex."
echo "Make sure you're using the format_github_key.sh script to format it correctly."

#!/bin/bash
# Script to verify GitHub App private key format
# Usage: ./verify_key_format.sh <path-to-private-key.pem>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <path-to-private-key.pem>"
    echo ""
    echo "This script will show you:"
    echo "1. The key formatted with \\n (for Convex environment variable)"
    echo "2. Verification that the key is valid PEM format"
    exit 1
fi

KEY_FILE="$1"

if [ ! -f "$KEY_FILE" ]; then
    echo "Error: File not found: $KEY_FILE"
    exit 1
fi

echo "=========================================="
echo "1. Formatted key (copy for Convex):"
echo "=========================================="
echo ""
FORMATTED=$(cat "$KEY_FILE" | sed ':a;N;$!ba;s/\n/\\n/g')
echo "\"$FORMATTED\""
echo ""
echo ""
echo "=========================================="
echo "2. Key validation:"
echo "=========================================="

# Check if it's a valid PEM file
if grep -q "BEGIN.*PRIVATE KEY" "$KEY_FILE"; then
    echo "✓ Key has BEGIN header"
else
    echo "✗ Key missing BEGIN header"
fi

if grep -q "END.*PRIVATE KEY" "$KEY_FILE"; then
    echo "✓ Key has END footer"
else
    echo "✗ Key missing END footer"
fi

# Try to validate with openssl if available
if command -v openssl &> /dev/null; then
    echo ""
    echo "Testing with OpenSSL..."
    if openssl rsa -in "$KEY_FILE" -check -noout 2>/dev/null; then
        echo "✓ Key is valid RSA private key (PKCS#1 format)"
        echo ""
        echo "Note: You may need to convert this to PKCS#8 format."
        echo "However, the code should handle the conversion automatically."
    else
        echo "✗ Key validation failed (might be PKCS#8 or invalid)"
    fi
else
    echo "(OpenSSL not available - skipping validation)"
fi

echo ""
echo "=========================================="
echo "3. Instructions:"
echo "=========================================="
echo "Copy the formatted key from section 1 above"
echo "Paste it into Convex Dashboard → Settings → Environment Variables"
echo "Set variable name: GITHUB_APP_PRIVATE_KEY"
echo "Set value: (the formatted key including the quotes)"
echo ""
echo "IMPORTANT: Make sure to include the quotes around the value!"

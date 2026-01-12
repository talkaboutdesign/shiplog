#!/bin/bash
# Command to add all shadcn/ui components that match your custom UI components
# Run this after initializing shadcn/ui with: bunx --bun shadcn@latest init

echo "Adding shadcn/ui components..."
echo ""

# Add all components that match your custom UI components
bunx --bun shadcn@latest add avatar
bunx --bun shadcn@latest add badge
bunx --bun shadcn@latest add button
bunx --bun shadcn@latest add card
bunx --bun shadcn@latest add checkbox
bunx --bun shadcn@latest add input
bunx --bun shadcn@latest add label
bunx --bun shadcn@latest add select
bunx --bun shadcn@latest add sheet
bunx --bun shadcn@latest add skeleton
bunx --bun shadcn@latest add tabs

echo ""
echo "✅ All components added!"
echo ""
echo "Note: After adding these components, you'll need to:"
echo "1. Review any API differences between your custom components and shadcn/ui versions"
echo "2. Update imports across your codebase to use the new shadcn/ui components"
echo "3. Test thoroughly, especially:"
echo "   - Select component (shadcn uses Radix UI, more complex than native select)"
echo "   - Button component (shadcn has more variants: destructive, secondary, link, icon)"
echo "   - Sheet component (shadcn uses Radix Dialog, may have different API)"

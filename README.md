# ShipLog

**AI-Powered GitHub Activity Feed**

Transform GitHub noise into stakeholder-friendly briefings. ShipLog is a real-time activity feed that transforms GitHub events (pushes, PRs, issues) into plain-English summaries using AI.

## Quick Start

### Prerequisites

- Node.js 20.19+ or 22.12+
- Bun (install with `curl -fsSL https://bun.sh/install | bash`)
- GitHub account with a test repository
- OpenAI or Anthropic API key for testing

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd shiplog
bun install
```

### 2. Set Up Clerk (Authentication)

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create new application: "ShipLog"
3. Enable **GitHub** as the only sign-in option
4. Configure GitHub OAuth:
   - Create GitHub OAuth App at GitHub → Settings → Developer settings → OAuth Apps
   - Homepage: `http://localhost:5173`
   - Callback: Get from Clerk dashboard
5. Copy keys:
   - `VITE_CLERK_PUBLISHABLE_KEY` (pk_test_...) → `.env.local`
   - `CLERK_JWT_ISSUER_DOMAIN` → Convex Dashboard Environment Variables

### 3. Set Up Convex

1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Create new project: "shiplog"
3. Run `bunx convex dev` to configure the deployment URL

### 4. Create GitHub App

1. Go to [GitHub App Settings](https://github.com/settings/apps) → New GitHub App

**App Configuration:**
- Name: ShipLog (must be globally unique, try ShipLog-yourname)
- Homepage URL: `http://localhost:5173`
- Callback URL: `http://localhost:5173/github/callback`
- Setup URL: `http://localhost:5173/github/callback`
- Webhook URL: `[Leave blank - add after Convex deploy]`
- Webhook secret: Generate random string, save securely

**Permissions:**
- Contents: Read-only
- Issues: Read-only
- Metadata: Read-only (required)
- Pull requests: Read-only

**Events to Subscribe:**
- Issues
- Pull request
- Pull request review
- Push

**After Creation:**
- Copy App ID, Client ID, Client Secret
- Generate and download Private Key (.pem file)

### 5. Environment Variables

Create `.env.local` in the project root:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_GITHUB_APP_SLUG=shiplog-yourname
```

Add to Convex Dashboard → Settings → Environment Variables:

```bash
CLERK_JWT_ISSUER_DOMAIN=your-clerk-issuer-domain
GITHUB_APP_ID=123456
GITHUB_APP_CLIENT_ID=Iv1.abc123
GITHUB_APP_CLIENT_SECRET=abc123...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

**Note:** For `GITHUB_APP_PRIVATE_KEY`, use **base64 encoding** (recommended):
1. If your PEM file has literal `\n` characters (backslash + n) instead of actual newlines, convert them first:
   ```bash
   sed 's/\\n/\n/g' your-private-key.pem | base64 -i - | tr -d '\n'
   ```
   Otherwise, just base64-encode:
   ```bash
   base64 -i your-private-key.pem | tr -d '\n'
   ```
2. Copy the base64-encoded string and paste it into Convex Dashboard
3. The code will automatically decode it and convert PKCS#1 to PKCS#8 if needed

Alternatively, you can use a single-line format with `\n` replacing newlines, but base64 is more reliable.

### 6. Start Development

```bash
bun run dev
```

This starts both the Vite dev server (frontend) and Convex dev (backend) in parallel.

### 7. Post-Deploy: Update Webhook URL

After deploying to Convex:

1. Get your Convex HTTP URL: `https://your-project.convex.cloud`
2. Go to GitHub App settings
3. Set Webhook URL: `https://your-project.convex.cloud/github/webhook`
4. Enable "Active"

## How It Works

1. **Sign In**: Authenticate with GitHub via Clerk
2. **Install App**: Install ShipLog GitHub App on your repository
3. **Configure API Keys**: Add your OpenAI or Anthropic API key in Settings
4. **Watch Activity**: Push commits, open PRs, or create issues → AI digests appear automatically

## Architecture

- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 + shadcn/ui
- **Backend**: Convex (database + serverless functions)
- **Auth**: Clerk (GitHub OAuth)
- **AI**: Vercel AI SDK 6 with provider packages (BYOK)

## Features

- ✅ Real-time GitHub activity feed
- ✅ AI-powered event summaries (OpenAI GPT-4o-mini or Anthropic Claude 3.5 Haiku)
- ✅ Support for push, PR, issue, and PR review events
- ✅ Filter by event type, contributor, and time range
- ✅ Bring Your Own Key (BYOK) for AI providers

## Project Structure

```
shiplog/
├── convex/              # Backend (Convex functions)
│   ├── schema.ts        # Database schema
│   ├── users.ts         # User management
│   ├── repositories.ts  # Repository management
│   ├── events.ts        # Event storage
│   ├── digests.ts       # Digest queries
│   ├── ai.ts            # AI digest generation
│   ├── github.ts        # GitHub API helpers
│   └── http.ts          # HTTP routes (webhook, callback)
├── src/
│   ├── components/      # React components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities
└── package.json
```

## Troubleshooting

### Webhook Not Receiving Events

- Verify webhook URL is set correctly in GitHub App settings
- Check `GITHUB_WEBHOOK_SECRET` matches in both GitHub App and Convex
- Check Convex logs for webhook errors

### AI Digests Not Generating

- Ensure API key is configured in Settings
- Check that preferred provider matches configured key
- Verify Convex logs for AI API errors
- Check event status in database (may be "failed" or "skipped")

### Authentication Issues

- Verify `VITE_CLERK_PUBLISHABLE_KEY` is set in `.env.local`
- Verify `CLERK_JWT_ISSUER_DOMAIN` is set in Convex Dashboard
- Check Clerk dashboard for GitHub OAuth configuration

### Repository Not Connecting

- Ensure GitHub App is installed on the repository
- Check Convex logs for installation callback errors
- Verify `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, and `GITHUB_APP_PRIVATE_KEY` are set correctly
- **Private Key Format**: When setting `GITHUB_APP_PRIVATE_KEY` in Convex Dashboard:
  - **Recommended: Use base64 encoding**:
    1. Encode your `.pem` file: `base64 -i your-key.pem | tr -d '\n'`
    2. Paste the base64 string into Convex Dashboard
    3. The code will automatically decode it
  - **Alternative: Single-line format**:
    - Replace actual newlines with `\n` (backslash + n)
    - Example: `-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----`
  - The code will automatically convert PKCS#1 to PKCS#8 if needed
  - If you see "DECODER routines::unsupported" error, try base64 encoding instead

## Development

### Running Locally

```bash
bun run dev
```

Runs both frontend (Vite) and backend (Convex dev) in parallel.

### Building for Production

```bash
bun run build
```

### Deploying

1. Deploy Convex: `bunx convex deploy`
2. Deploy Frontend (Vercel): `bunx vercel`
3. Update GitHub App webhook URL to production Convex URL

## License

MIT

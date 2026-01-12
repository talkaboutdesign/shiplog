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
4. **Automatic Indexing**: ShipLog automatically indexes your codebase structure (happens in background)
5. **Watch Activity**: Push commits, open PRs, or create issues → Enhanced AI digests appear automatically with:
   - Deep code analysis (actual file diffs, not just commit messages)
   - Impact assessment (which components/services are affected)
   - Multiple perspectives (BUGFIX, UI, FEATURE, etc.)
   - Risk indicators and confidence scores
   - Business impact explanations

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
- ✅ **Enhanced AI Analysis** (see below)

## Enhanced AI Analysis

ShipLog goes beyond simple commit message rewriting to provide deep code analysis and impact insights:

### Code Surface Indexing

ShipLog automatically indexes your codebase structure to understand components, services, and their relationships:

- **Automatic Indexing**: When you connect a repository, ShipLog scans your codebase structure
- **Lazy Indexing**: Existing repositories are automatically indexed when they receive their first event after the feature is enabled
- **Surface Detection**: Identifies React components, services, utilities, hooks, types, and config files based on naming conventions and file paths
- **Dependency Tracking**: Maps relationships between files through import/require statements

### File Diff Analysis

Instead of just analyzing commit messages, ShipLog fetches and analyzes actual code changes:

- **Real Code Changes**: Fetches file diffs from GitHub API for push and PR events
- **Enhanced Context**: AI analyzes actual code patches, not just metadata
- **Accurate Summaries**: Understands what was actually changed vs. what the commit message says

### Impact Analysis

ShipLog determines which code surfaces are affected by changes and assesses risk:

- **Surface Mapping**: Maps changed files to known components/services
- **Risk Assessment**: Categorizes impact as low, medium, or high risk
- **Confidence Scores**: Provides confidence levels (0-100%) for impact assessments
- **Dependency Detection**: Identifies downstream effects when core components change

### Multi-Perspective Summaries

Each event can generate multiple summaries from different perspectives:

- **BUGFIX Perspective**: Focuses on what was fixed and why it matters
- **UI Perspective**: Highlights user-facing changes and interface improvements
- **FEATURE Perspective**: Explains new functionality and capabilities
- **Additional Perspectives**: Security, performance, refactor, and docs perspectives when relevant
- **Confidence Scores**: Each perspective includes a confidence score

### "Why This Matters" Section

Every digest includes a business impact explanation:

- **User-Facing Impact**: Explains how changes affect end users
- **Business Value**: Highlights the value delivered by the changes
- **Risk Mitigation**: Describes how changes reduce risk or technical debt
- **Stakeholder-Friendly**: Written in plain English for non-technical stakeholders

### How It Works

1. **First Event Processing**: When a repository receives its first event after enabling enhanced analysis:
   - ShipLog checks if the codebase is indexed
   - If not indexed, triggers automatic indexing (runs in background)
   - Generates basic digest while indexing completes
   - Future events get full enhanced analysis once indexing is complete

2. **Subsequent Events**: For each new event:
   - Fetches file diffs from GitHub API
   - Updates surface index incrementally based on changed files
   - Analyzes which surfaces are affected
   - Generates multiple perspective summaries
   - Assesses impact risk and confidence
   - Creates comprehensive digest with all insights

3. **Graceful Degradation**: If indexing isn't complete or fails:
   - System still generates basic digests (backward compatible)
   - Shows indicator that enhanced analysis is in progress
   - Automatically upgrades to full analysis once ready

### Indexing Status

You can check the indexing status of your repositories:

- **Pending**: Repository hasn't been indexed yet
- **Indexing**: Indexing is in progress (first time or after major changes)
- **Completed**: Index is ready, all events get enhanced analysis
- **Failed**: Indexing encountered an error (can be retried)

Indexing typically completes within a few minutes for small to medium repositories. Large repositories may take longer.

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
│   ├── surfaces.ts      # Code surface indexing
│   ├── github.ts        # GitHub API helpers
│   └── http.ts          # HTTP routes (webhook, callback)
├── src/
│   ├── components/      # React components
│   │   ├── feed/       # Feed components
│   │   │   ├── DigestCard.tsx
│   │   │   ├── PerspectiveBadges.tsx
│   │   │   ├── ImpactAnalysis.tsx
│   │   │   ├── SurfaceImpactBadge.tsx
│   │   │   └── WhyThisMatters.tsx
│   │   └── ...
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   │   ├── useDigests.ts
│   │   └── usePerspectives.ts
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

### Enhanced Analysis Not Available

- **Indexing in Progress**: If you see "Enhanced analysis unavailable - indexing in progress", wait a few minutes for indexing to complete
- **Indexing Failed**: Check Convex logs for indexing errors. You can manually trigger re-indexing if needed
- **First Event**: The first event after connecting a repository may only have basic analysis while indexing completes
- **Large Repositories**: Very large repositories may take longer to index. Check indexing status in repository settings

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

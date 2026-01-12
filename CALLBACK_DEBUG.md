# GitHub App Callback Debugging Guide

## Issue: Callback Not Working After GitHub App Installation

### Symptoms
- After clicking "Install app and link repo" on GitHub, the page shows "You are being redirected to Ship Log to continue installation" but stays stuck
- No callback is received
- No logs appear

### Possible Causes

1. **Frontend Server Not Running**
   - The callback URL is `http://localhost:5173/github/callback`
   - If the Vite dev server isn't running, GitHub can't redirect there
   - **Fix**: Make sure `bun run dev` is running and the frontend is accessible at `http://localhost:5173`

2. **GitHub Can't Redirect to Localhost**
   - GitHub (HTTPS) redirecting to localhost (HTTP) can sometimes fail due to browser security
   - **Fix**: Try clicking the callback link manually, or use a tunnel service like ngrok for testing

3. **Callback URL Mismatch**
   - The GitHub App callback URL must match exactly
   - Check your GitHub App settings: Settings → Developer settings → GitHub Apps → Your App
   - **Callback URL** should be: `http://localhost:5173/github/callback`
   - **Setup URL** should be: `http://localhost:5173/github/callback`

4. **Browser Blocking the Redirect**
   - Some browsers block redirects from HTTPS to HTTP
   - **Fix**: Check browser console for errors, try a different browser

### How to Debug

1. **Check if Frontend is Running**
   ```bash
   curl http://localhost:5173
   ```
   Should return the HTML of your app.

2. **Check Browser Console**
   - Open Developer Tools (F12)
   - Go to Console tab
   - Look for any errors when GitHub tries to redirect

3. **Check Network Tab**
   - Open Developer Tools (F12)
   - Go to Network tab
   - Look for a request to `/github/callback` when GitHub redirects

4. **Check Convex Logs**
   - Go to Convex Dashboard → Logs
   - Look for "GitHub callback received at backend" (backend handler should NOT be called if redirecting to frontend)

5. **Try Manual Redirect**
   - After installing the app, manually navigate to:
   - `http://localhost:5173/github/callback?installation_id=YOUR_INSTALLATION_ID`
   - Replace `YOUR_INSTALLATION_ID` with the installation ID from GitHub

### Expected Flow

1. User clicks "Install app" on GitHub
2. GitHub redirects to: `http://localhost:5173/github/callback?installation_id=123&setup_action=install`
3. Frontend React component `GitHubCallback.tsx` loads
4. Component calls `syncInstallation` Convex action
5. Action processes the installation
6. User is redirected to dashboard

### Logging Added

- Frontend: Console logs in `GitHubCallback.tsx` showing URL params and callback process
- Backend: Console logs in `convex/http.ts` (though backend handler shouldn't be called if using frontend callback)

### Next Steps

1. Check if frontend server is running
2. Verify GitHub App callback URL configuration
3. Check browser console for errors
4. Try manually navigating to the callback URL with installation_id parameter

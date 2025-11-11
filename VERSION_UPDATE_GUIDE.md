# Auto-Refresh & Version Update System

## Overview
The app now automatically checks for updates and refreshes on all devices in the following scenarios:

### Update Check Triggers
1. **Every 30 minutes** - Periodic background check
2. **On app startup** - When page loads for the first time
3. **After system shutdown/restart** - Detects wake from sleep (if >10 min passed)
4. **When returning to the app** - When tab becomes visible again (if >5 min passed)
5. **When page regains focus** - When user switches back to the tab (if >5 min passed)

### What Happens on Update Detection
When a new version is detected:
- ✅ All browser caches are cleared automatically
- ✅ Page reloads from server to get latest version
- ✅ User sees fresh content immediately
- ✅ Console logs show which trigger caused the update

## How to Deploy a New Version

### Step 1: Update Version Number
Edit `public/version.json`:
```json
{
  "version": "1.0.2",  // Increment this
  "timestamp": "2025-11-11T12:00:00Z"  // Update timestamp
}
```

### Step 2: Update App Version Constant
Edit `src/hooks/useVersionCheck.ts`:
```typescript
const APP_VERSION = '1.0.2'; // Must match version.json
```

### Step 3: Deploy
Click the **Update** button in Lovable to publish your changes.

**Important**: 
- Frontend changes require clicking "Update" to go live
- Backend changes (database, edge functions) deploy automatically

## Version Number Guidelines
- **Patch**: `1.0.X` - Bug fixes, small updates
- **Minor**: `1.X.0` - New features, non-breaking changes  
- **Major**: `X.0.0` - Breaking changes, major updates

## Testing the System
1. Open browser console (F12)
2. Watch for update check messages:
   - `🔍 Checking for updates (reason)...`
   - `✅ App version is up to date: X.X.X`
   - `🔄 New version available! Reloading app...`

## User Experience
- **Seamless**: Users see updates within 30 minutes or when returning to app
- **No interruption**: Update happens in background
- **Always fresh**: After system restart, users get latest version
- **No manual refresh needed**: Everything is automatic

## Technical Details
- Uses browser visibility API to detect tab/window state
- Tracks last check time to avoid excessive checking
- Clears service worker caches for clean updates
- Network-first strategy ensures fresh content
- 5-minute cooldown prevents rapid repeated checks
- 10-minute threshold detects system sleep/wake

## Troubleshooting

### Updates not applying?
1. Check console for version check messages
2. Verify version.json and APP_VERSION match
3. Hard refresh with Ctrl+Shift+R (or Cmd+Shift+R on Mac)
4. Clear browser cache manually if needed

### Too many reloads?
1. Check that version.json version matches APP_VERSION
2. Look for version mismatch errors in console
3. Ensure timestamp is updated correctly

## Notes
- First check on app load doesn't auto-reload (prevents infinite loops)
- Subsequent checks will auto-reload when version mismatch detected
- System respects check cooldowns to prevent performance issues
- Works across all modern browsers (Chrome, Firefox, Safari, Edge)

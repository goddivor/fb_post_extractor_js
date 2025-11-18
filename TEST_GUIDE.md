# Test Guide - Facebook Post Extractor

## How to Test the Extension

### 1. Reload the Extension
1. Go to `chrome://extensions/`
2. Find "Facebook Post Extractor"
3. Click the reload icon 🔄

### 2. Open Facebook Profile
Go to any Facebook profile or page:
- Example: `https://www.facebook.com/username`
- Or: `https://www.facebook.com/profile.php?id=123456789`

### 3. Open DevTools
Press F12 to open Chrome DevTools and go to the **Console** tab

### 4. Check the Logs
You should see these logs in order:

```
✅ Facebook Post Extractor - Content Script Loaded
✅ Got asyncParams: {...}
✅ Got profile ID from [method]: [numeric_id]
✅ Sent FB context: {...}
```

### 5. Extract Posts
1. Click the extension icon in Chrome toolbar
2. Set max posts (e.g., 10)
3. Click "🚀 Extract Posts"
4. Watch the console for extraction progress

### 6. Expected Console Output
```
Starting extraction...
Waiting for FB context...
Context initialized: {user_id: "...", has_dtsg: true, dtsg_length: ...}
Got profile ID from injected script: 123456789
Profile ID: 123456789
Fetching page 1...
Got 10 posts (total: 10)
Extraction complete: 10 posts
```

### 7. Download Results
Click "📥 Download JSON" to save the extracted posts

## Common Issues

### Issue: "Could not find fb_dtsg token"
- **Solution**: Make sure you're logged in to Facebook
- Reload the page and try again

### Issue: "Profile ID: WSRMD" (username instead of number)
- **Check logs**: Look for "Got profile ID from [method]:" in console
- **Solution**: The new code should automatically extract the numeric ID from the page HTML

### Issue: GraphQL errors
- **Check**: Make sure `asyncParams` was received (check console logs)
- **Solution**: Reload the page to trigger the injected script again

## What to Look For

### ✅ Success Indicators
- Profile ID is a numeric string (10+ digits)
- No GraphQL errors in console
- Posts are extracted with text, dates, images
- JSON download works

### ❌ Error Indicators
- Profile ID is a username (e.g., "WSRMD")
- GraphQL "missing_required_variable_value" errors
- "Could not find fb_dtsg token" error

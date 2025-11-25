# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a pure JavaScript Chrome extension that extracts posts from Facebook profiles. No build process, TypeScript, or compilation required - it runs directly in Chrome.

## Architecture

### Extension Structure
The extension uses Chrome Manifest V3 with four main components:

1. **popup.html/popup.js** - User interface for configuring and triggering extraction
2. **content.js** - Content script that manages extraction logic and communicates with the popup
3. **injected.js** - Script injected into Facebook's page context to access internal Facebook APIs
4. **background.js** - Service worker (minimal, only logs installation)

### Data Flow
```
User (popup) -> content.js -> injected.js -> Facebook APIs
                     ↓
              GraphQL requests to facebook.com/api/graphql/
                     ↓
              Parse & extract post data
                     ↓
              Return to popup -> Download JSON
```

### Critical Architecture Details

#### Facebook Context Extraction (injected.js)
- Runs in the Facebook page context to access `window.require`
- Extracts `asyncParams` via `getAsyncParams('POST')` - this contains ALL necessary Facebook request parameters
- Falls back to `DTSGInitialData.token` and `CurrentUserInitialData.USER_ID` if needed
- Extracts profile ID using multiple methods:
  1. URL parameters (`?id=123456789`)
  2. RouteParamsHook (most reliable)
  3. HTML pattern matching (searches for `userID`, `profile_id`, `pageID`, `ownerID`)
  4. Pathname extraction
- Sends data to content.js via `window.postMessage`

#### GraphQL Request Construction (content.js:186-375)
- Uses `doc_id: '25011764728445626'` for ProfileCometTimelineFeedRefetchQuery
- Variables include 27+ relay providers (required by Facebook's GraphQL)
- If `asyncParams` available: copies all parameters and adds GraphQL-specific ones
- Fallback: manually constructs parameters with `fb_dtsg`, `__user`, `__a`, `__comet_req`, etc.
- Response format: Multiple JSON objects separated by newlines
- Response may have prefix `for (;;);` that must be stripped

#### Post Extraction Logic
- Fetches posts in pages of 3-10 at a time
- Uses cursor-based pagination via `page_info.end_cursor`
- 2-second delay between requests to avoid rate limiting
- Extracts: text, creation_time, author (id, name, url, picture), attachments (photos), post_url

## Development Workflow

### Testing the Extension
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `fb_post_extractor_js` directory
4. After code changes, click the reload icon on the extension card

### Debugging
1. Open Facebook profile page (e.g., `https://www.facebook.com/username`)
2. Open Chrome DevTools (F12) -> Console tab
3. Look for these key log messages:
   - `✅ Facebook Post Extractor - Content Script Loaded`
   - `✅ Got asyncParams: {...}`
   - `✅ Got profile ID from [method]: [numeric_id]`
   - `✅ Sent FB context: {...}`
4. Click extension icon to trigger extraction
5. Monitor console for extraction progress and errors

### Common Issues
- **Profile ID is username (e.g., "WSRMD") instead of numeric**: Check that injected.js successfully extracted the numeric ID from HTML
- **GraphQL "missing_required_variable_value" errors**: Ensure `asyncParams` was captured; if not, relay providers may be missing
- **"Could not find fb_dtsg token"**: User not logged in to Facebook, or Facebook changed their token structure

## Key Technical Constraints

1. **No npm/build process**: All code is vanilla JavaScript, directly loaded by Chrome
2. **Manifest V3**: Uses service worker instead of background page; content scripts can't directly access Facebook's internal APIs
3. **Facebook's obfuscation**: Requires accessing internal `window.require` modules which may change
4. **Rate limiting**: Must space out GraphQL requests to avoid being blocked
5. **Response parsing**: Facebook returns multiple JSON objects with prefixes like `for (;;);`

## Testing Checklist
Reference TEST_GUIDE.md for detailed testing instructions. Key verification points:
- Profile ID extracted as numeric string (10+ digits)
- No GraphQL errors in console
- Posts extracted with complete data (text, dates, images)
- JSON download produces valid output

## File Modification Notes
- When modifying GraphQL variables or relay providers, test on multiple Facebook profiles
- Profile ID extraction has 4 fallback methods - maintain this robustness
- asyncParams is the preferred method for request parameters - preserve this priority
- Rate limiting delay (2s) prevents blocking - do not remove

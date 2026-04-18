# Google Drive Integration - Step-by-Step Visual Guide

## 📋 Overview
This guide links your attendance system directly to Google Drive so data is:
- ✅ Automatically saved to Google Sheets
- ✅ Accessible from any device
- ✅ Shareable with others
- ✅ No manual uploads needed

---

## 🔧 STEP 1: Create Google Cloud Project (5 minutes)

```
1. Go to: https://console.cloud.google.com/
2. Sign in with your Google account
3. Click "Select a Project" dropdown (top-left area)
4. Click "NEW PROJECT"
5. Enter Name: "VBS Church Attendance"
6. Click CREATE
7. Wait ~1 minute for setup
```

**Result**: You have a Google Cloud Project

---

## 📱 STEP 2: Enable APIs (3 minutes)

```
1. In Cloud Console, click: APIs & Services > Library
2. Search for: "Google Sheets API"
3. Click on it > Click ENABLE
4. Wait for it to enable
5. Go back to Library
6. Search for: "Google Drive API"  
7. Click on it > Click ENABLE
```

**Result**: APIs are turned on

---

## 🔑 STEP 3: Create Credentials (5 minutes)

```
1. Click: APIs & Services > Credentials
2. Click: "Create Credentials" > "OAuth client ID"
3. You'll see a warning about consent screen. Click that link.

NEXT SCREEN - OAuth Consent:
1. Select: "External" and click CREATE
2. Fill in:
   - App name: "VBS Church Attendance"
   - User support email: [Your Gmail]
   - Developer contact: [Your Gmail]
3. Click: SAVE AND CONTINUE
4. Click: ADD OR REMOVE SCOPES
5. Search and add these THREE scopes:
   - https://www.googleapis.com/auth/spreadsheets
   - https://www.googleapis.com/auth/drive
   - https://www.googleapis.com/auth/drive.file
6. Click UPDATE > SAVE AND CONTINUE
7. Click ADD USERS > Add your Gmail email
8. Click SAVE AND CONTINUE
9. Review and click BACK TO DASHBOARD
```

**Result**: OAuth consent screen is configured

---

## 🎯 STEP 4: Get Your Client ID (2 minutes)

```
Back in Cloud Console:
1. Click: APIs & Services > Credentials
2. Click: CREATE CREDENTIALS > OAuth 2.0 Client IDs
3. Select: Web application
4. Under "Authorized JavaScript origins" ADD:
   - http://localhost:8000
   - http://127.0.0.1:8000
   - https://[your-github-username].github.io
     (Replace [your-github-username])
     
5. Under "Authorized redirect URIs" ADD:
   - http://localhost:8000/
   - http://127.0.0.1:8000/
   - https://[your-github-username].github.io/
   
6. Click CREATE
7. A popup shows your credentials
8. Copy and save the CLIENT ID (long string like: xxx.apps.googleusercontent.com)
9. Close the popup
```

**Result**: You have your Client ID

---

## 📊 STEP 5: Create Google Sheet (2 minutes)

```
1. Go to: https://sheets.google.com
2. Click: "+" or "Create new spreadsheet"
3. Name it: "VBS Church Attendance Records"
4. In the URL bar, find the sheet ID:
   https://docs.google.com/spreadsheets/d/[ID]/edit
   Copy everything between /d/ and /edit
   This is your SPREADSHEET ID

IMPORTANT: Create tabs for each class:
- Beginners
- Primary
- Junior
- Intermediate
- Senior
- Teachers
- Volunteers
```

**Result**: You have your Spreadsheet ID + tabs ready

---

## 💻 STEP 6: Update Your Web Interface (2 minutes)

```
1. Open index.html in a text editor
2. Find these lines (around line 6-7):
   const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';
   const GOOGLE_SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

3. Replace with YOUR actual credentials:
   const GOOGLE_CLIENT_ID = '[Your Client ID from Step 4]';
   const GOOGLE_SPREADSHEET_ID = '[Your Spreadsheet ID from Step 5]';

4. Save the file
```

**Result**: Code is configured

---

## 🧪 STEP 7: Test Locally (5 minutes)

```
1. Open PowerShell
2. Navigate to your project folder
3. Type: python -m http.server 8000
4. Open browser: http://localhost:8000
5. First, setup as Admin:
   - Click "👨‍💼 Admin Login"
   - Username: VBSGoodShepherdChurch (case-insensitive)
   - Password: VBSGoodShepherdChurch (case-insensitive)
   - Set passwords for each class (use simple passwords like "beginners123")
   - Click "💾 Save Passwords"
   - Click "🚪 Logout"
6. Now test as User:
   - Click "👥 User Login"
   - Select a class (e.g., Beginners)
   - Enter the password you just set
   - Click "✓ Login"
   - Click "🔗 Connect Google" button
   - Authorize with your Google account
   - Add students and mark attendance
7. Open Google Sheets tab
   - Go to your spreadsheet
   - Data should appear in the class tab!
```

**Result**: Google integration is working!

---

## 🚀 STEP 8: Deploy to GitHub (5 minutes)

```
1. In PowerShell:
   git add .
   git commit -m "Add Google Drive integration"
   git push origin main

2. Go to GitHub repository settings
3. Click: Pages (left sidebar)
4. Source: main branch / root folder
5. Wait ~2 minutes
6. Your site is at: https://[username].github.io/[repo-name]/
```

**Result**: Live on the web!

---

## 🟢 STEP 9: Publish Your Google OAuth App

```
1. In Cloud Console, go to: APIs & Services > OAuth consent screen
2. If your app is still in Testing, either:
   - Add test users under Test users, or
   - Switch the app to Production for public access
3. If you switch to Production:
   - Fill in all required fields (app name, logo, support email)
   - Add your app scopes
   - Upload branding and privacy policy if requested
   - Submit for verification
4. Wait for Google approval if verification is required
5. After approval, anyone can sign in with Google
``` 

**Result**: Google sign-in can be used by all authorized users instead of only test users

---

## ✅ Verification Checklist

- [ ] Google Cloud Project created
- [ ] Google Sheets API enabled
- [ ] Google Drive API enabled
- [ ] OAuth consent screen configured
- [ ] Client ID generated and saved
- [ ] Google Sheet created with class tabs
- [ ] Client ID added to index.html
- [ ] Spreadsheet ID added to index.html
- [ ] Tested locally (localhost:8000)
- [ ] Data synced to Google Sheets
- [ ] Pushed to GitHub
- [ ] Site live on GitHub Pages

---

## 🔗 Useful Links
- Google Cloud Console: https://console.cloud.google.com/
- Google Sheets: https://sheets.google.com
- Your GitHub Pages: https://[username].github.io/[repo-name]/

---

## ⚠️ Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Admin login not working | Check spelling (case-insensitive now), no extra spaces. Username/Password: VBSGoodShepherdChurch |
| User login not working / not moving to next screen | First login as Admin, set class passwords, then logout and try User login |
| "Connect Google" button won't work | Use the app from a local web server (http://localhost:8000) or GitHub Pages; Google auth often fails on direct file:// URLs |
| Data not appearing in Sheets | Make sure sheet tabs match class names (Beginners, Primary, etc.) |
| 401 Error | Re-authenticate - click "Connect Google" again |
| Blank page on localhost | Make sure Python server is running, try http://127.0.0.1:8000 |
| Can't access on GitHub Pages | Wait 2-3 minutes, check domain in authorized origins |

---

## 📞 Need Help?

1. Check the detailed guide: `GOOGLE_DRIVE_SETUP.md`
2. Look at browser console for errors (F12 key)
3. Verify all IDs are exactly correct (no extra spaces)
4. Check that sheet tabs exist with exact names

# Google Drive Integration Setup Guide

This guide will help you integrate Google Sheets for storing attendance data on Google Drive.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click "New Project"
4. Enter project name: `VBS Church Attendance`
5. Click "Create"
6. Wait for the project to be created

## Step 2: Enable Required APIs

1. In the Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google Sheets API"
3. Click on it and press **Enable**
4. Go back to Library
5. Search for "Google Drive API"
6. Click on it and press **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client IDs**
3. You'll see a warning "You need to configure the OAuth consent screen first"
4. Click **Configure Consent Screen**

### Configure OAuth Consent Screen:
1. Select **External** user type and click **Create**
2. Fill in the required fields:
   - **App name**: `VBS Church Attendance`
   - **User support email**: Use your Gmail
   - **Developer contact**: Use your Gmail
3. Click **Save and Continue**
4. On "Scopes" page, click **Add or Remove Scopes**
5. Search and add these scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/drive.file`
6. Click **Update** and **Save and Continue**
7. On "Test users" page, add your Gmail address
8. Click **Save and Continue**

## Step 4: Create OAuth Client ID

1. Go back to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client IDs**
3. Choose **Web application**
4. Under "Authorized JavaScript origins", add:
   - `http://localhost:8000`
   - `http://127.0.0.1:8000`
   - Your GitHub Pages URL: `https://yourusername.github.io`
5. Under "Authorized redirect URIs", add:
   - `http://localhost:8000/`
   - `http://127.0.0.1:8000/`
   - `https://yourusername.github.io/`
6. Click **Create**
7. A popup will show your Client ID and Secret
8. **Copy the Client ID** (you'll need it next)

## Step 5: Add Client ID to Your Code

1. Open `index.html` in your editor
2. Find the section marked `<!-- Google API Configuration -->`
3. Replace `YOUR_CLIENT_ID_HERE` with your actual Client ID
4. Replace `YOUR_SPREADSHEET_ID_HERE` with a Google Sheet ID (see Step 6)

## Step 6: Create a Google Sheet for Attendance

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it: `VBS Church Attendance Records`
4. In the URL bar, copy the spreadsheet ID:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```
5. Copy `[SPREADSHEET_ID]` and save it
6. Select all cells and set column widths appropriately
7. Add header row with class names as tabs (optional - system will create them)

## Step 7: Deploy to GitHub Pages

1. Push all files to your GitHub repository
2. In repository settings, enable GitHub Pages from the main branch
3. Your site will be available at `https://yourusername.github.io/`

## How It Works

When you mark attendance:
1. Data is saved to browser's local storage first (for offline capability)
2. System authenticates with Google using OAuth 2.0
3. Data is appended to Google Sheets in your Google Drive
4. Each class has its own tab in the spreadsheet

## Troubleshooting

**"Failed to authenticate"**
- Make sure your Client ID is correct
- Verify your domain is in the "Authorized JavaScript origins"

**"Permission denied"**
- Check that you added your Gmail as a test user
- Verify Google Sheets API and Google Drive API are enabled

**Data not syncing to Google Sheets**
- Check browser console for errors (F12 > Console tab)
- Verify spreadsheet ID is correct
- Make sure you're authenticated (should see your Gmail at top)

## Testing Locally

To test on localhost:
1. Install Python: `python --version`
2. In your project folder, run:
   ```
   python -m http.server 8000
   ```
3. Visit `http://localhost:8000`
4. Login and mark attendance - it should sync to Google Sheets

## Security Notes

- Client ID is public (this is OK for browser-based apps)
- Never share your Spreadsheet ID if you want privacy
- Use test users during development
- For production, configure proper OAuth consent screen

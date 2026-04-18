# Quick Start - Google Drive Integration

## What You Need:
1. Google Account
2. Google Cloud Project (free to create)
3. 10 minutes to set up

## Quick Setup (After Following GOOGLE_DRIVE_SETUP.md):

### 1. Get Your Credentials
After completing the setup guide, you'll have:
- **Client ID**: Looks like `123456789-abc123.apps.googleusercontent.com`
- **Spreadsheet ID**: Found in Google Sheets URL

### 2. Update the Web Interface

In `index.html`, find these lines (around line 6):
```javascript
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';
const GOOGLE_SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
```

Replace with your actual credentials:
```javascript
const GOOGLE_CLIENT_ID = 'your-real-client-id.apps.googleusercontent.com';
const GOOGLE_SPREADSHEET_ID = 'your-real-spreadsheet-id';
```

### 3. Test Locally

Before pushing to GitHub:
```bash
# In Windows PowerShell, navigate to the project folder
python -m http.server 8000
```
Visit: `http://localhost:8000`

### 4. Login and Test
1. **First, login as Admin:**
   - Click "👨‍💼 Admin Login"
   - Username: `VBSGoodShepherdChurch` (case-insensitive)
   - Password: `VBSGoodShepherdChurch` (case-insensitive)
   - Set passwords for each class (simple ones like "beginners123")
   - Click "💾 Save Passwords"
   - Click "🚪 Logout"

2. **Now test as User:**
   - Click "👥 User Login"
   - Select class and enter password you set
   - You'll see "🔗 Connect Google" button
   - Click it to authenticate with your Google account
   - Add students and mark attendance
   - It will sync to Google Sheets automatically!

### 5. Check Google Sheets
Open your spreadsheet and you'll see attendance data with:
- Date
- Student Name
- Status (Present/Absent)
- Timestamp

### 6. Deploy to GitHub Pages
```bash
git add .
git commit -m "Add Google Drive integration"
git push origin main
```

## Troubleshooting

### "Connect Google" button doesn't work
- Check browser console (F12) for errors
- Verify Client ID is correct (no spaces)
- Make sure your domain is in authorized origins

### Data not appearing in Google Sheets
- Click the "Connect Google" button first
- Check spreadsheet ID is correct
- Make sure sheets are named: Beginners, Primary, Junior, Intermediate, Senior, Teachers, Volunteers

### Sheet with that name doesn't exist
- Create the sheet manually or use an existing sheet
- System will append data to existing sheets

## File Structure
```
index.html              - Main interface (update Client ID & Spreadsheet ID here)
script.js              - Contains all logic including Google API calls
style.css              - Styling
GOOGLE_DRIVE_SETUP.md  - Detailed setup instructions
QUICK_START.md         - This file
```

## Support
If you get stuck:
1. Check GOOGLE_DRIVE_SETUP.md for detailed steps
2. Open browser console (F12) to see error messages
3. Make sure all IDS are correct (no extra spaces)

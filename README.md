# VBS Good Shepherd Church - Attendance & Notes Web Interface

A web interface for marking attendance and maintaining class notes for VBS Good Shepherd Church, hosted on GitHub Pages.

## Features

- **Dual Login System**
  - Admin login to set class passwords
  - User login by class selection
  
- **Attendance Management**
  - Add students directly (no popup)
  - Mark attendance with live date-wise reports
  - View attendance in pivot table (students × dates)
  - Automatic "not on roll" for new students
  - Download as CSV
  
- **Class Notes**
  - Save notes per class
  - Date-based availability control
  
- **Google Drive Integration** ⭐ NEW
  - Auto-sync attendance to Google Sheets
  - Secure OAuth 2.0 authentication
  - Save data permanently to Google Drive
  - Access reports from anywhere
  
- **Testing & Production Modes**
  - Demo mode enabled by default (no date restrictions)
  - Production mode (May 6-16, 2026) with date activation

## Setup

### Basic Setup (Localhost Testing)
1. Clone or download this repository
2. Open `index.html` in a web browser

### With Google Drive Integration ⭐
1. Follow the detailed guide in [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)
2. Add your credentials to `index.html`
3. Run locally with `python -m http.server 8000`
4. See [QUICK_START.md](QUICK_START.md) for quick reference

## Login Credentials

**Admin Login:**
- Username: `VBSGoodShepherdChurch`
- Password: `VBSGoodShepherdChurch`

**User Login:**
- Select class from dropdown
- Enter class password (set by admin)

## Classes Supported

- Beginners
- Primary
- Junior
- Intermediate
- Senior
- Teachers
- Volunteers

## Data Storage

- **Local Storage**: Browser storage (automatically)
- **Google Sheets**: Optional cloud backup (with setup)
- **CSV Export**: Download anytime for backup

## Deployment to GitHub Pages

1. Push the code to a GitHub repository
2. Go to repository Settings > Pages
3. Set source to main branch, root folder
4. The site will be available at `https://<username>.github.io/<repo-name>/`

## Files Included

- `index.html` - Main interface
- `script.js` - Core logic + Google API integration
- `style.css` - Responsive design
- `README.md` - This file
- `GOOGLE_DRIVE_SETUP.md` - Detailed integration guide
- `QUICK_START.md` - Quick reference guide

## Browser Compatibility

- Chrome/Chromium ✅
- Firefox ✅
- Safari ✅
- Edge ✅

## Notes

- For production, change testing mode to date-specific in `script.js`
- Data persists in browser unless cleared
- Google integration is optional at any time
- All data remains on your device + Google Drive (your control)

## Support Documentation

- Detailed Setup: See [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)
- Quick Reference: See [QUICK_START.md](QUICK_START.md)
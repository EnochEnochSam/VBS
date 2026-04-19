# Registration System Setup Guide

This guide explains how to set up the Google Sheets structure needed for the user registration and approval system.

## Required Google Sheets

### 1. `Registrations` Sheet
This sheet stores all incoming registration requests.

**Headers (Row 1):**
| Column | Header |
|--------|--------|
| A | Full Name |
| B | Role |
| C | Gmail ID |
| D | Class |
| E | Password |
| F | Status |
| G | Timestamp |

**Data Format:**
- **Full Name**: User's full name (text)
- **Role**: One of: `teacher`, `volunteer`, `student`, `director`
- **Gmail ID**: User's Gmail address (text)
- **Class**: Class name (optional, except for teachers) - one of: `beginners`, `primary`, `junior`, `intermediate`, `senior`, `teachers`, `volunteers`
- **Password**: User's password (text) - stored in sheets for reference
- **Status**: One of: `pending`, `approved`, `rejected`
- **Timestamp**: When the registration was submitted (auto-filled by app)

**Example Row:**
```
John Doe | teacher | john@gmail.com | primary | secure123 | pending | 4/19/2026 2:30:00 PM
```

---

### 2. `ApprovedUsers` Sheet
This sheet stores approved users who can now log in.

**Headers (Row 1):**
| Column | Header |
|--------|--------|
| A | Full Name |
| B | Role |
| C | Gmail ID |
| D | Password |
| E | Class |
| F | Approved Date |

**Data Format:**
- Same as Registrations sheet but only for approved users
- Automatically populated by the admin when they click "Approve" on a registration request

**Example Row:**
```
John Doe | teacher | john@gmail.com | secure123 | primary | 4/19/2026 2:45:00 PM
```

---

### 3. `Passwords` Sheet (Existing)
For class-based passwords (legacy system).

**Headers (Row 1):**
| Column | Header |
|--------|--------|
| A | Class |
| B | Password |

**Classes:**
- beginners
- primary
- junior
- intermediate
- senior
- teachers
- volunteers

---

## Admin Registration Approval Workflow

### Step 1: View Registration Requests
1. Admin logs in with credentials: `VBSGoodShepherdChurch` / `VBSGoodShepherdChurch`
2. Clicks **Registration Requests** tab
3. Views all pending registration requests from the `Registrations` sheet

### Step 2: Approve or Reject
- **To Approve:** Click ✅ **Approve** button
  - Updates the status to `approved` in `Registrations` sheet
  - Adds the user to `ApprovedUsers` sheet
  - User can now login with their Gmail ID and password

- **To Reject:** Click ❌ **Reject** button
  - Updates the status to `rejected` in `Registrations` sheet
  - Removes ability for user to login

### Step 3: User Login
Once approved, users can login using:
- **Gmail ID** and **Password** from the ApprovedUsers sheet
- Their **Role** and **Class** determine their access level

---

## User Registration Flow

### Step 1: Register
1. User clicks **✏️ Register New User** from main screen
2. Fills in registration form:
   - Full Name
   - Role (teacher, volunteer, student, director)
   - Gmail ID
   - Password (confirm)
   - Class (optional for volunteers, required for teachers)

### Step 2: Request Submitted
- Registration data is saved to `Registrations` sheet with **Status: pending**
- User sees message: "✅ Registration submitted! Waiting for admin approval."

### Step 3: Await Admin Approval
- Admin reviews the request
- Admin approves or rejects
- If approved, user is added to `ApprovedUsers` sheet

---

## Role-Based Access Control

### Teacher
- Access: Full
- Features: Add students, mark attendance, view reports, save notes, view Google sheets data
- Class Selection: Required

### Volunteer
- Access: Full
- Features: Add students, mark attendance, view reports, save notes, view Google sheets data
- Class Selection: Optional

### Student
- Access: Limited (Read-only)
- Features: View class attendance, cannot modify data
- Class Selection: Optional

### Director
- Access: Full
- Features: Same as Admin (view/approve registrations, manage all classes, view all attendance)
- Class Selection: Optional

---

## Google Sheets Permissions

Make sure your Google Sheets has the following permissions:

1. **Edit Access** for the service account or OAuth client
2. **Range Access** for at least these ranges:
   - `Registrations!A:G`
   - `ApprovedUsers!A:F`
   - `Passwords!A:B`

---

## Troubleshooting

### "Google not connected" message
- Make sure you've connected to Google using the **Connect Google** button in the class interface
- Check that OAuth scopes include `spreadsheets` and `drive`

### Registration not saving
- Ensure Google is connected before submitting
- Check that the `Registrations` sheet exists in your spreadsheet
- Verify sheet has proper headers in Row 1

### Admin can't see registration requests
- Make sure admin is connected to Google
- Check that `Registrations` sheet exists
- Click **Refresh Requests** button to reload

### User can't login after approval
- Verify user is in `ApprovedUsers` sheet
- Ensure Gmail ID and password match exactly (case-sensitive)
- Check that user's role matches the login method

---

## Default Setup

When you first enable this system, you have two ways users can login:

### Option 1: Class-Based Login (Existing System)
- Users select class dropdown and enter class password
- Passwords stored in `Passwords` sheet
- No Gmail/role distinction

### Option 2: Registration-Based Login (New System)
- Requires admin approval
- Role-based access control
- Gmail ID required
- Need to set up `Registrations` and `ApprovedUsers` sheets

Both systems can work simultaneously!

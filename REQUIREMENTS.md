# VBS Good Shepherd Church Attendance & Rewards - Requirements

## 1. Purpose
Build a browser-based web app for VBS Good Shepherd Church that lets authorized users register, log in, manage attendance, award reward points, and view dashboards for classes and groups.

## 2. Scope
The app must support:
- User authentication and role-based access (login based on manually added user data in Google Sheets)
- Student registration and approval workflow (removed - users will be manually added to Google Sheets)
- Attendance capture and reporting
- Reward point management
- Dashboard summaries for attendance and points
- Direct Google Sheets persistence for all updated data
- Immediate user-visible errors when a save to Google Sheets fails

The app is a static frontend hosted in a browser and may be deployed to GitHub Pages.

## 3. User Roles
### 3.1 Admin
- Can log in with admin credentials.
- Can access all classes.
- Can view attendance and reward dashboards.
- Can configure or review class access data.

### 3.2 Director
- Can access all classes.
- Can add students.
- Can mark attendance.
- Can add reward points.
- Can view dashboards and reports.

### 3.3 Teacher
- Can access their assigned class.
- Can add students for their class.
- Can mark attendance.
- Can add reward points.
- Can view attendance reports and dashboards.

### 3.4 Teacher View Only / Student / Read-Only User
- Can view attendance reports and dashboards.
- Cannot modify attendance, points, or student data.

## 4. Functional Requirements
### 4.1 Authentication
- The app must provide a login flow.
- The app must support Google connection for authenticated sessions.
- The app must support logout.
- The UI must show login actions when the user is logged out and logout actions when the user is logged in.
- The app must show the connected Google account when available.
- Login shall be based on manually added user data in the ApprovedUsers Google Sheet.

### 4.2 Registration
- Registration process is removed.
- User data must be manually added to the ApprovedUsers Google Sheet in the existing format.
- No user-facing registration form or approval workflow.

### 4.3 Class and Student Management
- The app must support the following classes with subclasses:
  - Beginners1, Beginners2
  - Primary1, Primary2
  - Junior1, Junior2
  - Intermediate1, Intermediate2
  - Senior1, Senior2
  - Teachers1, Teachers2
- Authorized users must be able to add new students to a class.
- The app must prevent duplicate students in the same class.
- Student data must include at least:
  - Name
  - Gender
  - Group, if assigned
  - Points
  - Attendance history

### 4.4 Attendance Management
- Authorized users must be able to mark attendance for a class.
- Attendance must support date-wise records.
- Attendance status must include at least:
  - Present
  - Absent
  - Not on roll / empty
- The app must write attendance changes directly to Google Sheets.
- The app must display an error message if Google Sheets save fails.
- The app must not keep a local fallback copy of attendance changes.
- The app must allow viewing an attendance report.
- The report must show student rows against date columns.
- The app must support exporting attendance as CSV.
- Teachers' attendance shall not be displayed anywhere except to directors.
- Only directors can view teachers' attendance records.

### 4.5 Reward Points
- Teachers and directors must be able to add reward points to students.
- Point changes must be written directly to Google Sheets.
- The app must display an error message if Google Sheets save fails.
- The app must not keep a local fallback copy of point changes.
- The app must keep a points log.
- The app must show point totals per student and per group.
- Points allocation shall be done through a dedicated "Add Points" interface on the home page only.
- Points allocation interface shall not be available when accessing a class for attendance updates.

### 4.6 Dashboards
- The app must provide a dashboard section.
- The dashboard must include separate views for:
  - Attendance
  - Points
- The attendance dashboard must show:
  - Total students
  - Total teachers
  - Total directors
  - Today’s attendance
  - Class-wise on-roll counts
  - Class-wise present counts  - Note: Teachers' individual attendance records are not displayed in any dashboard view except to directors through a separate view- The points dashboard must show:
  - Group point totals
  - Top boys leaderboard
  - Top girls leaderboard
- The dashboard must refresh when underlying data changes.

### 4.7 Layout and Responsive Behavior
- The home page must provide a small layout selector.
- The app must support phone, tablet, and laptop layout presets.
- The action buttons on the home page must remain visible on small screens.
- The app must be usable on desktop and mobile browsers.

### 4.8 Data Storage and Sync
- The app must store updated operational data directly in Google Sheets.
- The app must treat Google Sheets as the source of truth for saved changes.
- The app must not rely on browser storage as a persistence layer for updated attendance, points, or related class data.
- If Google Sheets is unavailable or a save fails, the app must show an error and leave the unsaved change uncommitted.
- The app must use consistent class-specific sheet or range mapping.

## 5. Data Requirements
### 5.1 Registration Data
Each registration record should contain:
- Full name
- Role
- Gmail address
- Class
- Password or identifier, if used
- Status
- Timestamp

### 5.2 Approved User Data
Each approved user record should contain:
- Full name
- Role
- Gmail address
- Class
- Approval date

### 5.3 Attendance Data
Each attendance row should contain:
- Student name
- Gender
- Attendance values by date
- Group
- Points
- This data should be persisted in Google Sheets rather than browser storage.

### 5.4 Reward Log Data
Each reward log entry should contain:
- Student name
- Points delta
- Updated by
- Timestamp
- Reward log entries should be stored in Google Sheets.

## 6. Google Sheets Requirements
- The app must use Google Sheets API for reading and writing data.
- The app must support OAuth-based Google authentication.
- The app must store attendance in class-specific sheets or class-specific ranges.
- The app must store registration data in registration sheets.
- The app must store approved users in an approved users sheet.
- The app must tolerate missing or empty sheets by creating or appending where appropriate.
- The app must surface a clear error when any write to Google Sheets fails.

## 7. Non-Functional Requirements
### 7.1 Usability
- The UI must be simple enough for teachers to use without training.
- Important actions must be visible and accessible.
- The app must avoid overflowing controls on mobile screens.

### 7.2 Reliability
- Data writes must fail visibly if Google Sheets cannot be updated.
- The app must not silently continue with local-only saved changes.
- The app must handle empty data states gracefully.

### 7.3 Performance
- Class dashboards should load within a reasonable time on typical school network connections.
- Data rendering should avoid unnecessary repeated loops where possible.

### 7.4 Compatibility
- The app must work in modern Chromium-based browsers, Firefox, Safari, and Edge.
- The app must run as a static web app.

### 7.5 Security
- Google auth tokens must not be exposed in the UI.
- Role-based access must restrict write actions to authorized users.
- Admin credentials should be treated as sensitive configuration.

## 8. Operational Requirements
- The app must support a demo or testing mode.
- The app must support a production date range if enabled.
- The app must allow deployment to GitHub Pages.
- The app must work on localhost for development and testing.

## 9. Out of Scope
- Native mobile apps
- Server-side database
- Offline-first sync conflict resolution
- Email notifications
- Multi-language support
- Advanced analytics beyond the existing dashboards

## 10. Acceptance Criteria
The app is acceptable when:
- Users can log in and out successfully.
- New registrations can be submitted and approved.
- Teachers/directors can add students and mark attendance.
- Attendance data is saved directly to Google Sheets.
- Teachers/directors can add points and those points are written directly to Google Sheets and appear in dashboards.
- Failed saves show an error message instead of silently storing data locally.
- The dashboard shows separate attendance and points views.
- The app remains usable on phone, tablet, and laptop layouts.
- No class notes or save-notes feature remains in the UI.

## 11. Notes
This document reflects the current intended behavior of the VBS Good Shepherd Church Attendance & Rewards app and should be updated whenever a feature is added, removed, or changed.

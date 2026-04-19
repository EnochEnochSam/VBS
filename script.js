// Login credentials
const ADMIN_USER = 'VBSGoodShepherdChurch';
const ADMIN_PASS = 'VBSGoodShepherdChurch';

// Date range for attendance and notes (May 6 - May 16, 2026)
const START_DATE = new Date(2026, 4, 6); // May 6, 2026
const END_DATE = new Date(2026, 4, 16); // May 16, 2026

console.log('Script loaded successfully');

function isWithinDateRange() {
    // TESTING MODE: Set to true to enable features anytime
    // For production, change to: return today >= START_DATE && today <= END_DATE;
    return true;
    
    // Uncomment below for date-specific functionality:
    // const today = new Date();
    // today.setHours(0, 0, 0, 0);
    // return today >= START_DATE && today <= END_DATE;
}

function getDateRangeStatus() {
    const today = new Date();
    if (today < START_DATE) {
        return `Features available from ${START_DATE.toLocaleDateString()}`;
    } else if (today > END_DATE) {
        return `Features were available until ${END_DATE.toLocaleDateString()}`;
    }
    return '';
}

// DOM elements - will be initialized after DOM loads
let loginSection, adminLoginSection, userLoginSection, adminSection, classSection, classTitle, attendanceList, notesTextarea, attendanceReportSection, registrationSection;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM elements
    loginSection = document.getElementById('login-section');
    adminLoginSection = document.getElementById('admin-login-section');
    userLoginSection = document.getElementById('user-login-section');
    registrationSection = document.getElementById('registration-section');
    adminSection = document.getElementById('admin-section');
    classSection = document.getElementById('class-section');
    classTitle = document.getElementById('class-title');
    attendanceList = document.getElementById('attendance-list');
    notesTextarea = document.getElementById('notes');
    attendanceReportSection = document.getElementById('attendance-report-section');
    
    console.log('DOM elements initialized');
    
    // Initialize Google API if needed
    if (typeof gapi !== 'undefined') {
        initGoogleAPI().then(() => {
            if (currentClass) updateGoogleStatus();
        });
    } else {
        console.log('Google API not loaded yet; waiting until window load.');
    }
});

window.addEventListener('load', function() {
    if (typeof gapi !== 'undefined' && !googleInitialized) {
        initGoogleAPI().then(() => {
            if (currentClass) updateGoogleStatus();
        });
    }
});

const CLASS_LIST = ['beginners', 'primary', 'junior', 'intermediate', 'senior', 'teachers', 'volunteers'];
let currentClass = '';
let isAdminMode = false;
let classPasswords = {};

function showAdminLogin() {
    console.log('showAdminLogin called');
    if (!loginSection || !adminLoginSection) {
        console.error('DOM elements not found');
        return;
    }
    loginSection.style.display = 'none';
    adminLoginSection.style.display = 'block';
}

function showUserLogin() {
    loginSection.style.display = 'none';
    userLoginSection.style.display = 'block';
}

function showRegistration() {
    loginSection.style.display = 'none';
    registrationSection.style.display = 'block';
}

function updateRoleFields() {
    const role = document.getElementById('reg-role').value;
    document.getElementById('class-field').style.display = role === 'volunteer' ? 'block' : 'none';
    document.getElementById('class-required-field').style.display = role === 'teacher' ? 'block' : 'none';
}

async function submitRegistration(event) {
    event.preventDefault();

    const fullName = document.getElementById('reg-full-name').value.trim();
    const role = document.getElementById('reg-role').value;
    const gmail = document.getElementById('reg-gmail').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    let selectedClass = '';

    if (password !== confirmPassword) {
        alert('❌ Passwords do not match!');
        return;
    }

    if (role === 'teacher') {
        selectedClass = document.getElementById('reg-class-required').value;
    } else if (role === 'volunteer') {
        selectedClass = document.getElementById('reg-class').value || '';
    }

    const registrationData = {
        fullName,
        role,
        gmail,
        password,
        class: selectedClass,
        status: 'pending',
        timestamp: new Date().toLocaleString()
    };

    const saved = await saveRegistrationToGoogleSheets(registrationData);
    if (saved) {
        alert('✅ Registration submitted! Waiting for admin approval.');
        document.querySelector('#registration-section form').reset();
        backToLoginSelection();
    } else {
        alert('❌ Failed to submit registration. Please try again.');
    }
}

function showAdminTab(tab) {
    document.getElementById('admin-passwords-section').style.display = tab === 'passwords' ? 'block' : 'none';
    document.getElementById('admin-requests-section').style.display = tab === 'requests' ? 'block' : 'none';
    document.getElementById('admin-class-section').style.display = tab === 'class' ? 'block' : 'none';

    const tabs = ['admin-tab-passwords', 'admin-tab-requests', 'admin-tab-class'];
    tabs.forEach(t => {
        const btn = document.getElementById(t);
        if (btn) btn.style.opacity = '0.7';
    });
    
    const activeTab = ['admin-tab-passwords', 'admin-tab-requests', 'admin-tab-class'][['passwords', 'requests', 'class'].indexOf(tab)];
    if (document.getElementById(activeTab)) {
        document.getElementById(activeTab).style.opacity = '1';
    }

    if (tab === 'requests') {
        loadRegistrationRequests();
    }
}

async function loadRegistrationRequests() {
    if (!googleInitialized || !googleAuthToken) {
        document.getElementById('registration-requests-list').innerHTML = '<p style="color: red;">❌ Google not connected. Please connect to Google first.</p>';
        return;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'Registrations!A:G'
        });

        const rows = response.result.values || [];
        if (rows.length <= 1) {
            document.getElementById('registration-requests-list').innerHTML = '<p style="text-align: center; color: #999;">No pending registration requests</p>';
            return;
        }

        let html = '';
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row[0]) continue;

            const fullName = row[0];
            const role = row[1];
            const gmail = row[2];
            const className = row[3] || 'N/A';
            const status = row[5];
            const rowIndex = i;

            if (status === 'pending') {
                html += `
                    <div style="background: white; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #f39c12;">
                        <p style="margin: 5px 0;"><strong>Name:</strong> ${fullName}</p>
                        <p style="margin: 5px 0;"><strong>Role:</strong> ${role}</p>
                        <p style="margin: 5px 0;"><strong>Gmail:</strong> ${gmail}</p>
                        <p style="margin: 5px 0;"><strong>Class:</strong> ${className}</p>
                        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #f39c12; font-weight: bold;">PENDING</span></p>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button onclick="(async () => await approveRegistration(${rowIndex}))()">✅ Approve</button>
                            <button onclick="(async () => await rejectRegistration(${rowIndex}))()">❌ Reject</button>
                        </div>
                    </div>
                `;
            }
        }

        if (html === '') {
            document.getElementById('registration-requests-list').innerHTML = '<p style="text-align: center; color: #999;">No pending registration requests</p>';
            return;
        }

        document.getElementById('registration-requests-list').innerHTML = html;
    } catch (error) {
        console.error('Failed to load registration requests:', error);
        document.getElementById('registration-requests-list').innerHTML = `<p style="color: red;">❌ Error loading requests: ${error.message}</p>`;
    }
}

async function approveRegistration(rowIndex) {
    if (!googleInitialized || !googleAuthToken) {
        alert('❌ Google not connected');
        return;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `Registrations!A${rowIndex + 1}:G${rowIndex + 1}`
        });

        const row = response.result.values?.[0];
        if (!row) {
            alert('❌ Could not find registration');
            return;
        }

        const fullName = row[0];
        const role = row[1];
        const gmail = row[2];
        const className = row[3];
        const password = row[4];

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `Registrations!F${rowIndex + 1}`,
            valueInputOption: 'RAW',
            resource: { values: [['approved']] }
        });

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'ApprovedUsers!A:F',
            valueInputOption: 'RAW',
            resource: {
                values: [[fullName, role, gmail, password, className || '', new Date().toLocaleString()]]
            }
        });

        alert('✅ Registration approved!');
        await loadRegistrationRequests();
    } catch (error) {
        console.error('Failed to approve registration:', error);
        alert('❌ Error approving registration: ' + error.message);
    }
}

async function rejectRegistration(rowIndex) {
    if (!googleInitialized || !googleAuthToken) {
        alert('❌ Google not connected');
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `Registrations!F${rowIndex + 1}`,
            valueInputOption: 'RAW',
            resource: { values: [['rejected']] }
        });

        alert('✅ Registration rejected');
        await loadRegistrationRequests();
    } catch (error) {
        console.error('Failed to reject registration:', error);
        alert('❌ Error rejecting registration: ' + error.message);
    }
}

async function saveRegistrationToGoogleSheets(registrationData) {
    if (!googleInitialized || !googleAuthToken) {
        alert('⚠️ Google not connected. Registration will NOT be saved. Please connect Google first.');
        return false;
    }

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'Registrations!A:G',
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    registrationData.fullName,
                    registrationData.role,
                    registrationData.gmail,
                    registrationData.class,
                    registrationData.password,
                    registrationData.status,
                    registrationData.timestamp
                ]]
            }
        });

        console.log('Registration saved to Google Sheets');
        return true;
    } catch (error) {
        console.error('Failed to save registration:', error);
        return false;
    }
}

async function fetchApprovedUserFromSheets(gmail, role) {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready for user verification');
        return null;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'ApprovedUsers!A:F'
        });

        const rows = response.result.values || [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[2] === gmail && row[1] === role) {
                return {
                    fullName: row[0],
                    role: row[1],
                    gmail: row[2],
                    password: row[3],
                    class: row[4] || ''
                };
            }
        }
        return null;
    } catch (error) {
        console.error('Failed to fetch approved user:', error);
        return null;
    }
}


function backToLoginSelection() {
    adminLoginSection.style.display = 'none';
    userLoginSection.style.display = 'none';
    registrationSection.style.display = 'none';
    loginSection.style.display = 'block';
    document.getElementById('admin-username').value = '';
    document.getElementById('admin-password').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-class-select').value = '';
}

async function adminLogin() {
    const username = document.getElementById('admin-username').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value.trim().toLowerCase();
    if (username === ADMIN_USER.toLowerCase() && password === ADMIN_PASS.toLowerCase()) {
        adminLoginSection.style.display = 'none';
        adminSection.style.display = 'block';
        isAdminMode = true;
        await loadPasswords();
        
        // Ensure admin tabs are properly initialized
        showAdminTab('passwords');
        
        if (googleInitialized && googleAuthToken) {
            await loadRegistrationRequests();
        } else {
            document.getElementById('registration-requests-list').innerHTML = '<p style="color: #f39c12;">Please connect to Google to manage registration requests</p>';
        }
        
        document.getElementById('admin-username').value = '';
        document.getElementById('admin-password').value = '';
    } else {
        alert('❌ Invalid admin credentials. Please try again.');
    }
}

async function userLogin() {
    const selectedClass = document.getElementById('user-class-select').value;
    const enteredPwd = document.getElementById('user-password').value;
    
    if (!selectedClass) {
        alert('❌ Please select a class.');
        return;
    }

    let storedPwd = localStorage.getItem(`${selectedClass}-pwd`);
    let userRole = null;
    let userEmail = null;

    if (googleAuthToken && googleInitialized) {
        const remotePasswords = await fetchClassPasswordsFromGoogleSheets();
        if (remotePasswords) {
            classPasswords = remotePasswords;
            storedPwd = remotePasswords[selectedClass] || storedPwd;
        }
    }

    if (enteredPwd === storedPwd) {
        currentClass = selectedClass;
        userRole = 'class-user';
        userLoginSection.style.display = 'none';
        classSection.style.display = 'block';
        classTitle.textContent = selectedClass.charAt(0).toUpperCase() + selectedClass.slice(1);
        setupRoleBasedAccess(userRole, selectedClass);
        loadClassData();
        document.getElementById('user-password').value = '';
    } else {
        alert('❌ Invalid class password. Please try again.');
    }
}


async function loadPasswords() {
    let passwordMap = {};

    if (googleAuthToken && googleInitialized) {
        const remotePasswords = await fetchClassPasswordsFromGoogleSheets();
        if (remotePasswords) {
            passwordMap = remotePasswords;
            Object.keys(remotePasswords).forEach(cls => {
                localStorage.setItem(`${cls}-pwd`, remotePasswords[cls]);
            });
        }
    }

    if (Object.keys(passwordMap).length === 0) {
        CLASS_LIST.forEach(cls => {
            const pwd = localStorage.getItem(`${cls}-pwd`) || '';
            if (pwd) passwordMap[cls] = pwd;
        });
    }

    classPasswords = passwordMap;
    CLASS_LIST.forEach(cls => {
        document.getElementById(`${cls}-pwd`).value = passwordMap[cls] || '';
    });
}

async function savePasswords() {
    const passwordMap = {};
    CLASS_LIST.forEach(cls => {
        const pwd = document.getElementById(`${cls}-pwd`).value;
        localStorage.setItem(`${cls}-pwd`, pwd);
        if (pwd) passwordMap[cls] = pwd;
    });

    classPasswords = passwordMap;

    if (googleAuthToken && googleInitialized) {
        const saved = await saveClassPasswordsToGoogleSheets(passwordMap);
        if (saved) {
            alert('✅ Passwords saved locally and synced to Google Sheets!');
            return;
        }
    }

    alert('✅ Passwords saved locally. Connect to Google to sync them centrally.');
}

function accessClass() {
    const selectedClass = document.getElementById('class-select').value;
    const enteredPwd = document.getElementById('class-pwd').value;
    let storedPwd = localStorage.getItem(`${selectedClass}-pwd`);

    if (googleAuthToken && googleInitialized && classPasswords[selectedClass]) {
        storedPwd = classPasswords[selectedClass];
    }

    if (enteredPwd === storedPwd) {
        currentClass = selectedClass;
        adminSection.style.display = 'none';
        classSection.style.display = 'block';
        classTitle.textContent = selectedClass.charAt(0).toUpperCase() + selectedClass.slice(1);
        loadClassData();
        document.getElementById('class-pwd').value = '';
    } else {
        alert('❌ Invalid class password. Please try again.');
    }
}

async function fetchClassPasswordsFromGoogleSheets() {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready for password sync');
        return null;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'Passwords!A:B'
        });

        const rows = response.result.values || [];
        const passwordMap = {};
        rows.forEach((row, index) => {
            if (index === 0) return; // skip header row
            const cls = row[0]?.toString().trim().toLowerCase();
            const pwd = row[1]?.toString();
            if (CLASS_LIST.includes(cls) && pwd) {
                passwordMap[cls] = pwd;
            }
        });

        if (Object.keys(passwordMap).length === 0) {
            console.log('No password rows found in Google Sheets. Ensure Passwords sheet exists with headers.');
        }
        return passwordMap;
    } catch (error) {
        console.error('Failed to fetch class passwords from Google Sheets:', error);
        return null;
    }
}

async function saveClassPasswordsToGoogleSheets(passwordMap) {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready for password sync');
        return false;
    }

    try {
        const values = [
            ['Class', 'Password'],
            ...CLASS_LIST.map(cls => [cls, passwordMap[cls] || ''])
        ];

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'Passwords!A:B',
            valueInputOption: 'RAW',
            resource: { values }
        });

        console.log('Class passwords synced to Google Sheets successfully');
        return true;
    } catch (error) {
        console.error('Failed to save class passwords to Google Sheets:', error);
        return false;
    }
}

function updateGoogleStatus() {
    const statusEl = document.getElementById('google-status');
    const authBtn = document.getElementById('google-auth-btn');
    
    if (googleAuthToken && googleInitialized) {
        statusEl.textContent = '✅ Connected to Google - Data will auto-sync';
        statusEl.style.color = '#2e7d32';
        authBtn.textContent = '🔓 Disconnect Google';
    } else if (googleInitialized) {
        statusEl.textContent = '📱 Not connected to Google (data saved locally)';
        statusEl.style.color = '#f57c00';
        authBtn.textContent = '🔗 Connect Google';
    } else {
        statusEl.textContent = '⚠️ Google API not configured';
        statusEl.style.color = '#c62828';
        authBtn.disabled = true;
    }
}

function loadClassData() {
    const withinRange = isWithinDateRange();
    const dateStatus = getDateRangeStatus();
    
    // Show/hide attendance marking based on date
    const markAttendanceBtn = document.querySelector('button[onclick="markAttendance()"]');
    const addStudentBtn = document.querySelector('button[onclick="addStudentFromInput()"]');
    const saveNotesBtn = document.querySelector('button[onclick="saveNotes()"]');
    
    if (!withinRange) {
        if (markAttendanceBtn) markAttendanceBtn.disabled = true;
        if (addStudentBtn) addStudentBtn.disabled = true;
        if (saveNotesBtn) saveNotesBtn.disabled = true;
        
        const statusDiv = document.createElement('div');
        statusDiv.id = 'date-status';
        statusDiv.style.cssText = 'background-color: #ffcccc; padding: 10px; margin: 10px 0; border-radius: 5px; color: #cc0000; font-weight: bold;';
        statusDiv.textContent = dateStatus;
        
        const existingStatus = document.getElementById('date-status');
        if (existingStatus) existingStatus.remove();
        attendanceList.parentElement.insertBefore(statusDiv, attendanceList);
    } else {
        if (markAttendanceBtn) markAttendanceBtn.disabled = false;
        if (addStudentBtn) addStudentBtn.disabled = false;
        if (saveNotesBtn) saveNotesBtn.disabled = false;
        
        const existingStatus = document.getElementById('date-status');
        if (existingStatus) existingStatus.remove();
    }
    
    // Load attendance from today's history
    const attendanceRecords = JSON.parse(localStorage.getItem(`${currentClass}-attendance-history`) || '[]');
    const today = new Date().toLocaleDateString();
    const todayAttendance = attendanceRecords.find(r => r.date === today)?.students || [];
    
    attendanceList.innerHTML = '';
    todayAttendance.forEach(student => {
        const div = document.createElement('div');
        div.className = 'student';
        div.innerHTML = `
            <input type="checkbox" id="${student.name}" ${student.present ? 'checked' : ''} ${!withinRange ? 'disabled' : ''}>
            <label for="${student.name}">${student.name}</label>
        `;
        attendanceList.appendChild(div);
    });

    // Load notes
    const notes = localStorage.getItem(`${currentClass}-notes`) || '';
    notesTextarea.value = notes;
    notesTextarea.disabled = !withinRange;
    
    // Update Google status
    updateGoogleStatus();
}

function addStudentFromInput() {
    if (!isWithinDateRange()) {
        alert(`Features are not available. ${getDateRangeStatus()}`);
        return;
    }
    const input = document.getElementById('student-name-input');
    const name = input.value.trim();
    
    if (!name) {
        alert('❌ Please enter a student name.');
        return;
    }
    
    // Check if student already exists
    const records = JSON.parse(localStorage.getItem(`${currentClass}-attendance-history`) || '[]');
    let studentExists = false;
    records.forEach(record => {
        if (record.students.some(s => s.name === name)) {
            studentExists = true;
        }
    });
    
    if (studentExists) {
        alert('❌ This student is already added.');
        return;
    }
    
    // Add student to today's attendance
    const today = new Date().toLocaleDateString();
    let todayRecord = records.find(r => r.date === today);
    
    if (!todayRecord) {
        todayRecord = { date: today, students: [] };
        records.push(todayRecord);
    }
    
    todayRecord.students.push({ name, present: false });
    localStorage.setItem(`${currentClass}-attendance-history`, JSON.stringify(records));
    
    input.value = '';
    loadClassData();
    alert(`✅ ${name} added successfully!`);
}

function addStudent() {
    if (!isWithinDateRange()) {
        alert(`Features are not available. ${getDateRangeStatus()}`);
        return;
    }
    const name = prompt('Enter student name:');
    if (name) {
        const attendance = JSON.parse(localStorage.getItem(`${currentClass}-attendance`) || '[]');
        attendance.push({ name, present: false });
        localStorage.setItem(`${currentClass}-attendance`, JSON.stringify(attendance));
        loadClassData();
    }
}

function markAttendance() {
    if (!isWithinDateRange()) {
        alert(`⏰ Features are not available. ${getDateRangeStatus()}`);
        return;
    }
    const checkboxes = attendanceList.querySelectorAll('input[type="checkbox"]');
    const today = new Date().toLocaleDateString();
    const attendanceRecords = JSON.parse(localStorage.getItem(`${currentClass}-attendance-history`) || '[]');
    
    const todayRecord = {
        date: today,
        students: []
    };
    
    checkboxes.forEach(cb => {
        todayRecord.students.push({ name: cb.nextElementSibling.textContent, present: cb.checked });
    });
    
    // Check if record for today already exists
    const existingIndex = attendanceRecords.findIndex(r => r.date === today);
    if (existingIndex !== -1) {
        attendanceRecords[existingIndex] = todayRecord;
    } else {
        attendanceRecords.push(todayRecord);
    }
    
    localStorage.setItem(`${currentClass}-attendance-history`, JSON.stringify(attendanceRecords));
    
    // Save to Google Sheets if authenticated
    if (googleAuthToken && googleInitialized) {
        saveAttendanceToGoogleSheets(todayRecord.students).then(success => {
            if (success) {
                alert('✅ Attendance marked and synced to Google Sheets!');
            } else {
                alert('✅ Attendance marked (not synced - will retry when authenticated)');
            }
        });
    } else {
        alert('✅ Attendance marked (saved locally - authenticate with Google to sync)');
    }
}

function saveNotes() {
    if (!isWithinDateRange()) {
        alert(`⏰ Features are not available. ${getDateRangeStatus()}`);
        return;
    }
    const notes = notesTextarea.value;
    localStorage.setItem(`${currentClass}-notes`, notes);
    alert('✅ Notes saved successfully!');

    // Placeholder for Google Docs integration
    // To integrate with Google Docs, use Google Docs API to create or update a document.
    // Example: gapi.client.docs.documents.create({...}) or update
}

function backToAdmin() {
    classSection.style.display = 'none';
    adminSection.style.display = 'block';
}

function logoutAdmin() {
    adminSection.style.display = 'none';
    loginSection.style.display = 'block';
    isAdminMode = false;
    document.getElementById('class-select').value = 'beginners';
    document.getElementById('class-pwd').value = '';
}

function logoutUser() {
    classSection.style.display = 'none';
    attendanceReportSection.style.display = 'none';
    loginSection.style.display = 'block';
    isAdminMode = false;
    currentClass = '';
}

async function viewAttendanceReport() {
    // Try to fetch data from Google Sheets first
    let attendanceRecords = await fetchAttendanceFromGoogleSheets();
    
    // If Google Sheets data is not available, use localStorage
    if (!attendanceRecords) {
        attendanceRecords = JSON.parse(localStorage.getItem(`${currentClass}-attendance-history`) || '[]');
        console.log('Using localStorage data for attendance report');
    }
    
    document.getElementById('report-class-title').textContent = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
    
    if (attendanceRecords.length === 0) {
        document.getElementById('attendance-report-body').innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #999;">No attendance records found</td></tr>';
        classSection.style.display = 'none';
        attendanceReportSection.style.display = 'block';
        return;
    }
    
    // Sort records by date (oldest first)
    const sortedRecords = [...attendanceRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Get all unique dates
    const dates = sortedRecords.map(r => r.date);
    
    // Get all unique students across all dates
    const studentsSet = new Set();
    sortedRecords.forEach(record => {
        record.students.forEach(student => {
            studentsSet.add(student.name);
        });
    });
    const allStudents = Array.from(studentsSet).sort();
    
    // Build table header with dates as columns
    const table = document.getElementById('attendance-table');
    const thead = table.querySelector('thead');
    thead.innerHTML = '';
    
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th style="background-color: #667eea; color: white; min-width: 150px;">Student Name</th>';
    dates.forEach(date => {
        headerRow.innerHTML += `<th style="background-color: #667eea; color: white; padding: 10px; white-space: nowrap;">${date}</th>`;
    });
    thead.appendChild(headerRow);
    
    // Build table body with students as rows
    const tbody = document.getElementById('attendance-report-body');
    tbody.innerHTML = '';
    
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalNotOnRoll = 0;
    
    allStudents.forEach(studentName => {
        const row = document.createElement('tr');
        row.innerHTML = `<td style="font-weight: bold; background-color: #f8f9ff; padding: 10px;">${studentName}</td>`;
        
        // Find the first date this student appears
        let firstDateIndex = -1;
        for (let i = 0; i < sortedRecords.length; i++) {
            const hasStudent = sortedRecords[i].students.some(s => s.name === studentName);
            if (hasStudent) {
                firstDateIndex = i;
                break;
            }
        }
        
        dates.forEach((date, dateIndex) => {
            const record = sortedRecords.find(r => r.date === date);
            let cell = '';
            let cellStyle = 'padding: 10px; text-align: center; font-weight: bold;';
            
            if (record) {
                const studentRecord = record.students.find(s => s.name === studentName);
                if (studentRecord) {
                    if (studentRecord.present) {
                        cell = '✓';
                        cellStyle += ' color: white; background-color: #4CAF50;';
                        totalPresent++;
                    } else {
                        cell = '✗';
                        cellStyle += ' color: white; background-color: #f44336;';
                        totalAbsent++;
                    }
                } else {
                    // Student not on roll for this date (added later)
                    cell = '-';
                    cellStyle += ' color: #999; background-color: #f5f5f5;';
                    totalNotOnRoll++;
                }
            } else {
                cell = '-';
                cellStyle += ' color: #999; background-color: #f5f5f5;';
                totalNotOnRoll++;
            }
            
            row.innerHTML += `<td style="${cellStyle}">${cell}</td>`;
        });
        tbody.appendChild(row);
    });
    
    // Calculate overall statistics
    const totalRecords = totalPresent + totalAbsent;
    const attendanceRate = totalRecords > 0 ? ((totalPresent / totalRecords) * 100).toFixed(2) : 0;
    
    document.getElementById('total-students').textContent = allStudents.length;
    document.getElementById('present-count').textContent = totalPresent;
    document.getElementById('absent-count').textContent = totalAbsent;
    document.getElementById('attendance-rate').textContent = attendanceRate + '%';
    
    classSection.style.display = 'none';
    attendanceReportSection.style.display = 'block';
}

function removeStudent(index) {
    if (confirm('Are you sure you want to remove this student?')) {
        const attendance = JSON.parse(localStorage.getItem(`${currentClass}-attendance`) || '[]');
        attendance.splice(index, 1);
        localStorage.setItem(`${currentClass}-attendance`, JSON.stringify(attendance));
        viewAttendanceReport();
    }
}

async function downloadAttendanceCSV() {
    // Try to fetch data from Google Sheets first
    let attendanceRecords = await fetchAttendanceFromGoogleSheets();
    
    // If Google Sheets data is not available, use localStorage
    if (!attendanceRecords) {
        attendanceRecords = JSON.parse(localStorage.getItem(`${currentClass}-attendance-history`) || '[]');
        console.log('Using localStorage data for CSV download');
    }
    
    const className = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
    
    if (attendanceRecords.length === 0) {
        alert('No attendance records to download');
        return;
    }
    
    // Sort records by date (oldest first)
    const sortedRecords = [...attendanceRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
    const dates = sortedRecords.map(r => r.date);
    
    // Get all unique students
    const studentsSet = new Set();
    sortedRecords.forEach(record => {
        record.students.forEach(student => {
            studentsSet.add(student.name);
        });
    });
    const allStudents = Array.from(studentsSet).sort();
    
    // Build CSV in pivot format (students as rows, dates as columns)
    let csvContent = 'Student Name,' + dates.join(',') + '\n';
    
    allStudents.forEach(studentName => {
        let row = studentName;
        dates.forEach(date => {
            const record = sortedRecords.find(r => r.date === date);
            let status = '-';
            if (record) {
                const studentRecord = record.students.find(s => s.name === studentName);
                if (studentRecord) {
                    status = studentRecord.present ? 'Present' : 'Absent';
                }
            }
            row += ',' + status;
        });
        csvContent += row + '\n';
    });
    
    const link = document.createElement('a');
    link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    const today = new Date().toLocaleDateString().replace(/\//g, '-');
    link.setAttribute('download', `${className}_Attendance_${today}.csv`);
    link.click();
}

function backToClass() {
    attendanceReportSection.style.display = 'none';
    classSection.style.display = 'block';
}

function setupRoleBasedAccess(userRole, userClass) {
    const markAttendanceBtn = classSection.querySelector('button[onclick*="markAttendance"]');
    const addStudentBtn = classSection.querySelector('button[onclick*="addStudentFromInput"]');
    const saveNotesBtn = classSection.querySelector('button[onclick*="saveNotes"]');
    
    switch(userRole) {
        case 'teacher':
        case 'volunteer':
        case 'director':
        case 'class-user':
            if (markAttendanceBtn) markAttendanceBtn.style.display = 'block';
            if (addStudentBtn) addStudentBtn.style.display = 'block';
            if (saveNotesBtn) saveNotesBtn.style.display = 'block';
            break;
        case 'student':
            if (markAttendanceBtn) markAttendanceBtn.style.display = 'none';
            if (addStudentBtn) addStudentBtn.style.display = 'none';
            if (saveNotesBtn) saveNotesBtn.style.display = 'none';
            break;
    }
}

// For Google API integration, add this script tag in HTML: <script src="https://apis.google.com/js/api.js"></script>
// And initialize gapi in a function, with client ID from Google Cloud Console.
// This requires setting up OAuth 2.0 for the domain.

// Google API Integration
let googleAuthToken = null;
let googleInitialized = false;
let googleTokenClient = null;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

async function initGoogleAPI() {
    return new Promise((resolve) => {
        if (typeof gapi === 'undefined' || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            console.error('Google API or Google Identity Services not loaded yet.');
            resolve(false);
            return;
        }

        gapi.load('client', async () => {
            const discoveryDocs = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
            console.log('Google API init config:', {
                clientId: GOOGLE_CLIENT_ID,
                scope: SCOPES.join(' '),
                discoveryDocs
            });

            try {
                await gapi.client.init({
                    discoveryDocs
                });
                googleTokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: SCOPES.join(' '),
                    callback: (tokenResponse) => {
                        if (tokenResponse.error) {
                            console.error('Token client callback error:', tokenResponse);
                            return;
                        }
                        googleAuthToken = tokenResponse.access_token;
                        gapi.client.setToken({access_token: googleAuthToken});
                        updateGoogleStatus();
                    }
                });

                googleInitialized = true;
                resolve(true);
            } catch (error) {
                console.error('Google API initialization failed:', error);
                resolve(false);
            }
        });
    });
}

function handleAuthClick() {
    if (typeof gapi === 'undefined' || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        alert('⚠️ Google API is not loaded. Please run the app from a local web server (http://localhost:8000) or GitHub Pages.');
        return;
    }
    if (!googleInitialized || !googleTokenClient) {
        alert('⚠️ Google API is still loading. Please wait a few seconds and try again.');
        return;
    }

    if (googleAuthToken) {
        google.accounts.oauth2.revoke(googleAuthToken, () => {
            googleAuthToken = null;
            gapi.client.setToken('');
            updateGoogleStatus();
            alert('Logged out from Google');
        });
    } else {
        googleTokenClient.requestAccessToken({prompt: 'select_account'});
    }
}

async function saveAttendanceToGoogleSheets(classData) {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready - data saved locally only');
        return false;
    }

    try {
        const today = new Date().toLocaleDateString();
        const sheetName = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
        
        // Prepare the data
        const values = [
            ['Date', 'Student Name', 'Status', 'Timestamp'],
            ...classData.map(student => [
                today,
                student.name,
                student.present ? 'Present' : 'Absent',
                new Date().toLocaleTimeString()
            ])
        ];

        // Append to sheet
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:D`,
            valueInputOption: 'RAW',
            resource: {
                values: values.slice(1) // Skip header if already exists
            }
        });

        console.log('Data saved to Google Sheets:', response);
        return true;
    } catch (error) {
        console.error('Failed to save to Google Sheets:', error);
        return false;
    }
}

async function fetchAttendanceFromGoogleSheets() {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready - using local data only');
        return null;
    }

    try {
        const sheetName = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
        
        // Read all data from the sheet
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:D`
        });

        const values = response.result.values;
        if (!values || values.length === 0) {
            console.log('No data found in Google Sheets');
            return null;
        }

        // Convert sheet data to attendance records format
        const attendanceRecords = [];
        const recordsByDate = {};

        // Skip header row and process data
        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 3) {
                const date = row[0];
                const studentName = row[1];
                const status = row[2]; // 'Present' or 'Absent'

                if (!recordsByDate[date]) {
                    recordsByDate[date] = { date, students: [] };
                }

                const present = status === 'Present';
                recordsByDate[date].students.push({ name: studentName, present });
            }
        }

        // Convert to array format
        Object.values(recordsByDate).forEach(record => {
            attendanceRecords.push(record);
        });

        console.log('Fetched attendance records from Google Sheets:', attendanceRecords);
        return attendanceRecords;
    } catch (error) {
        console.error('Failed to fetch from Google Sheets:', error);
        return null;
    }
}
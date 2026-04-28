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
let loginSection, adminLoginSection, userLoginSection, adminSection, classSection, classTitle, attendanceList, notesTextarea, attendanceReportSection, registrationSection, dashboardSection;
let homeGoogleStatus, homeActionButtons, homeGoogleAuthBtn;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM elements
    loginSection = document.getElementById('login-section');
    adminLoginSection = document.getElementById('admin-login-section');
    userLoginSection = document.getElementById('user-login-section');
    registrationSection = document.getElementById('registration-section');
    dashboardSection = document.getElementById('dashboard-section');
    adminSection = document.getElementById('admin-section');
    classSection = document.getElementById('class-section');
    classTitle = document.getElementById('class-title');
    attendanceList = document.getElementById('attendance-list');
    notesTextarea = document.getElementById('notes');
    attendanceReportSection = document.getElementById('attendance-report-section');
    
    // Initialize home page elements
    homeGoogleStatus = document.getElementById('home-google-status');
    homeActionButtons = document.querySelector('#login-section > div:last-child'); // The buttons container
    homeGoogleAuthBtn = document.getElementById('home-google-auth-btn');
    
    console.log('DOM elements initialized');
    
    // Update home page state before Google API loads
    updateGoogleStatus();

    // Initialize Google API if needed
    if (typeof gapi !== 'undefined') {
        initGoogleAPI().then(() => {
            updateGoogleStatus();
        });
    } else {
        console.log('Google API not loaded yet; waiting until window load.');
    }
});

window.addEventListener('load', function() {
    if (typeof gapi !== 'undefined' && !googleInitialized) {
        initGoogleAPI().then(() => {
            updateGoogleStatus();
        });
    } else {
        updateGoogleStatus();
    }
});

const CLASS_LIST = ['beginners', 'primary', 'junior', 'intermediate', 'senior', 'teachers'];
let currentClass = '';
let currentRole = '';
let isAdminMode = false;
let currentUser = null;

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

function updateClassRequirement() {
    const role = document.getElementById('reg-role').value;
    const classSelect = document.getElementById('reg-class');
    const classLabel = document.getElementById('reg-class-label');
    
    if (role === 'director') {
        classSelect.required = false;
        classSelect.value = '';
        classLabel.textContent = 'Class (optional for directors - they can access all classes):';
    } else {
        classSelect.required = true;
        classLabel.textContent = 'Class (required):';
    }
}

function showUserLogin() {
    loginSection.style.display = 'none';
    userLoginSection.style.display = 'block';
}

function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    loadDashboardData();
}

function backToHome() {
    registrationSection.style.display = 'none';
    userLoginSection.style.display = 'none';
    dashboardSection.style.display = 'none';
    adminLoginSection.style.display = 'none';
    adminSection.style.display = 'none';
    classSection.style.display = 'none';
    attendanceReportSection.style.display = 'none';
    loginSection.style.display = 'block';
}

function connectGoogle() {
    handleAuthClick();
}

async function submitRegistration(event) {
    event.preventDefault();
    console.log('Registration form submitted');

    const fullName = document.getElementById('reg-full-name').value.trim();
    const role = document.getElementById('reg-role').value;
    const className = document.getElementById('reg-class').value;
    const gmail = document.getElementById('reg-gmail').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (!fullName || !role || !gmail || !password) {
        alert('❌ Please fill in all required fields.');
        return;
    }

    // Class is required for students, teachers, and teacher_view
    if (role !== 'director' && !className) {
        alert('❌ Please select a class.');
        return;
    }

    if (password !== confirmPassword) {
        alert('❌ Passwords do not match!');
        return;
    }

    const registrationData = {
        fullName,
        role,
        class: className,
        gmail,
        password,
        status: 'pending',
        timestamp: new Date().toLocaleString()
    };

    addPendingRegistration(registrationData);

    if (!googleInitialized || !googleAuthToken) {
        alert('✅ Registration saved locally. Connect Google whenever possible to sync it to the sheet.');
        document.querySelector('#registration-section form').reset();
        backToHome();
        return;
    }

    const saveResult = await saveRegistrationToGoogleSheets(registrationData);
    if (saveResult.success) {
        removePendingRegistration(registrationData);
        alert('✅ Registration submitted! Your admin will review and approve your request soon.');
        document.querySelector('#registration-section form').reset();
        backToHome();
    } else {
        alert(`✅ Registration saved locally. Google sync failed: ${saveResult.error}`);
        document.querySelector('#registration-section form').reset();
        backToHome();
    }
}

function showAdminTab(tab) {
    document.getElementById('admin-requests-section').style.display = tab === 'requests' ? 'block' : 'none';
    document.getElementById('admin-class-section').style.display = tab === 'class' ? 'block' : 'none';

    const tabs = ['admin-tab-requests', 'admin-tab-class'];
    tabs.forEach(t => {
        const btn = document.getElementById(t);
        if (btn) btn.style.opacity = '0.7';
    });
    
    const activeTab = ['admin-tab-requests', 'admin-tab-class'][['requests', 'class'].indexOf(tab)];
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
        return {
            success: false,
            error: 'Google not connected. Please click Connect Google first.'
        };
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
        return { success: true, error: '' };
    } catch (error) {
        console.error('Failed to save registration:', error);
        const googleError = error?.result?.error?.message || error?.message || 'Unknown Google Sheets error';
        return {
            success: false,
            error: googleError
        };
    }
}

function getPendingRegistrations() {
    return JSON.parse(localStorage.getItem('pending-registrations') || '[]');
}

function savePendingRegistrations(pending) {
    localStorage.setItem('pending-registrations', JSON.stringify(pending));
}

function addPendingRegistration(registrationData) {
    const pending = getPendingRegistrations();
    pending.push(registrationData);
    savePendingRegistrations(pending);
    console.log('Saved pending registration locally', registrationData);
}

function removePendingRegistration(registrationData) {
    const pending = getPendingRegistrations();
    const filtered = pending.filter(item => item.timestamp !== registrationData.timestamp || item.gmail !== registrationData.gmail);
    savePendingRegistrations(filtered);
    console.log('Removed pending registration locally', registrationData);
}

async function syncPendingRegistrationsToGoogleSheets() {
    const pending = getPendingRegistrations();
    if (!pending.length || !googleInitialized || !googleAuthToken) {
        return;
    }

    try {
        const values = pending.map(data => [
            data.fullName,
            data.role,
            data.gmail,
            data.class,
            data.password,
            data.status,
            data.timestamp
        ]);

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'Registrations!A:G',
            valueInputOption: 'RAW',
            resource: { values }
        });

        savePendingRegistrations([]);
        console.log('Synced pending registrations to Google Sheets');
    } catch (error) {
        console.error('Failed to sync pending registrations:', error);
    }
}

async function fetchApprovedUserFromSheets(gmail) {
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
            if (row[2] && row[2].toString().trim().toLowerCase() === gmail.toLowerCase()) {
                return {
                    fullName: row[0],
                    role: row[1]?.toString().trim().toLowerCase(),
                    gmail: row[2].toString().trim().toLowerCase(),
                    password: row[3]?.toString(),
                    class: row[4]?.toString().trim().toLowerCase() || ''
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
    backToHome();
}

async function adminLogin() {
    const username = document.getElementById('admin-username').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value.trim().toLowerCase();
    if (username === ADMIN_USER.toLowerCase() && password === ADMIN_PASS.toLowerCase()) {
        adminLoginSection.style.display = 'none';
        adminSection.style.display = 'block';
        isAdminMode = true;
        
        // Ensure admin tabs are properly initialized
        showAdminTab('requests');
        
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
    const gmail = document.getElementById('user-gmail').value.trim();
    const password = document.getElementById('user-password').value;

    if (!gmail || !password) {
        alert('❌ Please fill in Gmail and password.');
        return;
    }

    if (!googleInitialized || !googleAuthToken) {
        alert('❌ Google not connected. Please connect Google first to login.');
        return;
    }

    // Check approved users from Google Sheets based on Gmail and password

    try {
        const user = await fetchApprovedUserFromSheets(gmail);
        if (user && user.password === password) {
            currentUser = user;
            currentRole = user.role;

            if (currentRole === 'director') {
                userLoginSection.style.display = 'none';
                adminSection.style.display = 'block';
                isAdminMode = true;
                showAdminTab('requests');
                await loadRegistrationRequests();
                document.getElementById('user-gmail').value = '';
                document.getElementById('user-password').value = '';
                return;
            }

            let chosenClass = user.class || '';
            if (!chosenClass) {
                chosenClass = currentRole === 'teacher' ? 'teachers' : CLASS_LIST[0];
            }
            currentClass = chosenClass;
            userLoginSection.style.display = 'none';
            classSection.style.display = 'block';
            updateClassTitle();
            setupRoleBasedAccess(currentRole, user.class);
            loadClassData();
            document.getElementById('user-gmail').value = '';
            document.getElementById('user-password').value = '';
        } else {
            alert('❌ Invalid credentials or user not approved.');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('❌ Login failed. Please try again.');
    }
}

function updateClassTitle() {
    const roleLabel = currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : 'User';
    const classLabel = currentClass ? ` - ${currentClass.charAt(0).toUpperCase() + currentClass.slice(1)}` : '';
    if (currentUser && currentUser.fullName) {
        classTitle.textContent = `${currentUser.fullName} (${roleLabel})${classLabel}`;
    } else {
        classTitle.textContent = `Admin (${roleLabel})${classLabel}`;
    }
}

function switchClassView() {
    const selectedClass = document.getElementById('class-view-select').value;
    if (!selectedClass) return;
    currentClass = selectedClass;
    updateClassTitle();
    loadClassData();
}

function accessClass() {
    const selectedClass = document.getElementById('class-select').value;
    currentClass = selectedClass;
    currentRole = 'admin';
    adminSection.style.display = 'none';
    classSection.style.display = 'block';
    updateClassTitle();
    setupRoleBasedAccess('admin', selectedClass);
    loadClassData();
}

function updateGoogleStatus() {
    const statusEl = document.getElementById('google-status');
    const authBtn = document.getElementById('google-auth-btn');

    if (googleAuthToken && googleInitialized) {
        if (statusEl) {
            statusEl.textContent = '✅ Connected to Google - Data will auto-sync';
            statusEl.style.color = '#2e7d32';
        }
        if (authBtn) authBtn.textContent = '🔓 Disconnect Google';
        if (homeGoogleStatus) {
            homeGoogleStatus.textContent = '✅ Google connected. Login and registration enabled.';
            homeGoogleStatus.style.backgroundColor = '#d4edda';
            homeGoogleStatus.style.color = '#155724';
            homeGoogleStatus.style.border = '1px solid #c3e6cb';
        }
        if (homeActionButtons) homeActionButtons.style.display = 'flex';
        if (homeGoogleAuthBtn) homeGoogleAuthBtn.textContent = '🔓 Disconnect Google';
    } else if (googleInitialized) {
        if (statusEl) {
            statusEl.textContent = '📱 Not connected to Google (data saved locally)';
            statusEl.style.color = '#f57c00';
        }
        if (authBtn) authBtn.textContent = '🔗 Connect Google';
        if (homeGoogleStatus) {
            homeGoogleStatus.textContent = '⚠️ Connect Google to enable login and registration.';
            homeGoogleStatus.style.backgroundColor = '#fff3cd';
            homeGoogleStatus.style.color = '#856404';
            homeGoogleStatus.style.border = '1px solid #ffeaa7';
        }
        if (homeActionButtons) homeActionButtons.style.display = 'flex';
        if (homeGoogleAuthBtn) homeGoogleAuthBtn.textContent = '🔗 Connect Google';
    } else {
        if (statusEl) {
            statusEl.textContent = '⚠️ Google API not configured';
            statusEl.style.color = '#c62828';
        }
        if (authBtn) authBtn.disabled = true;
        if (homeGoogleStatus) {
            homeGoogleStatus.textContent = '⚠️ Google API not configured. Check your setup.';
            homeGoogleStatus.style.backgroundColor = '#f8d7da';
            homeGoogleStatus.style.color = '#721c24';
            homeGoogleStatus.style.border = '1px solid #f5c6cb';
        }
        if (homeActionButtons) homeActionButtons.style.display = 'flex';
        if (homeGoogleAuthBtn) homeGoogleAuthBtn.textContent = '🔗 Connect Google';
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
    if (currentRole === 'student') {
        notesTextarea.disabled = true;
    } else {
        notesTextarea.disabled = !withinRange;
    }
    
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
    currentClass = '';
    currentRole = '';
    currentUser = null;
    document.getElementById('class-select').value = 'beginners';
}

function logoutUser() {
    classSection.style.display = 'none';
    attendanceReportSection.style.display = 'none';
    loginSection.style.display = 'block';
    isAdminMode = false;
    currentClass = '';
    currentUser = null;
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
    const viewReportBtn = classSection.querySelector('button[onclick*="viewAttendanceReport"]');
    const classSwitcher = document.getElementById('class-switcher');
    const classViewSelect = document.getElementById('class-view-select');
    const addStudentClassSelector = document.getElementById('add-student-class-selector');

    if (userRole === 'teacher') {
        // Teachers can only mark attendance for their assigned class
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'none';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'inline-block';
        if (addStudentBtn) addStudentBtn.style.display = 'inline-block';
        if (saveNotesBtn) saveNotesBtn.style.display = 'inline-block';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else if (userRole === 'teacher_view') {
        // Teacher View Only - can only view reports for their assigned class
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'none';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'none';
        if (addStudentBtn) addStudentBtn.style.display = 'none';
        if (saveNotesBtn) saveNotesBtn.style.display = 'none';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else if (userRole === 'director') {
        // Directors can view and update attendance for ALL classes
        if (classSwitcher) classSwitcher.style.display = 'block';
        if (classViewSelect) classViewSelect.value = currentClass || 'beginners';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'block';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'inline-block';
        if (addStudentBtn) addStudentBtn.style.display = 'inline-block';
        if (saveNotesBtn) saveNotesBtn.style.display = 'inline-block';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else if (userRole === 'admin') {
        // Admins can view and update attendance for ALL classes
        if (classSwitcher) classSwitcher.style.display = 'block';
        if (classViewSelect) classViewSelect.value = currentClass || 'beginners';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'block';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'inline-block';
        if (addStudentBtn) addStudentBtn.style.display = 'inline-block';
        if (saveNotesBtn) saveNotesBtn.style.display = 'inline-block';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else {
        // Students and other roles can only view reports
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'none';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'none';
        if (addStudentBtn) addStudentBtn.style.display = 'none';
        if (saveNotesBtn) saveNotesBtn.style.display = 'none';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
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
                        syncPendingRegistrationsToGoogleSheets();
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
        await ensureAttendanceSheetHeader(sheetName);
        
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

async function ensureAttendanceSheetHeader(sheetName) {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A1:D1`
        });

        const header = response.result.values && response.result.values[0] ? response.result.values[0] : [];
        const normalizedHeader = header.map(cell => (cell || '').toString().trim().toLowerCase());
        const expectedHeader = ['date', 'student name', 'status', 'timestamp'];
        const hasExpectedHeader = expectedHeader.every((value, index) => normalizedHeader[index] === value);

        if (!hasExpectedHeader) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: GOOGLE_SPREADSHEET_ID,
                range: `${sheetName}!A1:D1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['Date', 'Student Name', 'Status', 'Timestamp']]
                }
            });
        }
    } catch (error) {
        console.error('Failed to ensure attendance sheet header:', error);
        throw error;
    }
}

async function fetchAttendanceFromGoogleSheets() {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready - using local data only');
        return null;
    }

    try {
        const sheetName = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
        await ensureAttendanceSheetHeader(sheetName);
        
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

        // Skip header row when present and process data
        const firstRow = values[0] || [];
        const firstRowNormalized = firstRow.map(cell => (cell || '').toString().trim().toLowerCase());
        const startIndex = firstRowNormalized[0] === 'date' && firstRowNormalized[1] === 'student name' ? 1 : 0;

        for (let i = startIndex; i < values.length; i++) {
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



async function loadDashboardData() {
    if (!googleInitialized || !googleAuthToken) {
        document.getElementById('total-students-count').textContent = 'Connect Google first';
        document.getElementById('total-teachers-count').textContent = 'Connect Google first';
        document.getElementById('total-directors-count').textContent = 'Connect Google first';
        document.getElementById('today-attendance-count').textContent = 'Connect Google first';
        return;
    }

    try {
        // Load approved users data
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'ApprovedUsers!A:F'
        });

        const rows = response.result.values || [];
        let students = 0, teachers = 0, directors = 0;

        // Count users by role (skip header)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length >= 2) {
                const role = row[1]?.toString().toLowerCase();
                if (role === 'student') students++;
                else if (role === 'teacher' || role === 'teacher_view') teachers++;
                else if (role === 'director') directors++;
            }
        }

        document.getElementById('total-students-count').textContent = students;
        document.getElementById('total-teachers-count').textContent = teachers;
        document.getElementById('total-directors-count').textContent = directors;

        // Load today's attendance count
        const today = new Date().toLocaleDateString();
        let todayAttendance = 0;

        // Check all class sheets for today's attendance
        for (const className of CLASS_LIST) {
            try {
                const sheetResponse = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SPREADSHEET_ID,
                    range: `${className.charAt(0).toUpperCase() + className.slice(1)}!A:C`
                });

                const sheetRows = sheetResponse.result.values || [];
                for (let i = 1; i < sheetRows.length; i++) {
                    const row = sheetRows[i];
                    if (row.length >= 3 && row[0] === today && row[2] === 'Present') {
                        todayAttendance++;
                    }
                }
            } catch (error) {
                // Sheet might not exist, continue
                console.log(`Sheet ${className} not found or empty`);
            }
        }

        document.getElementById('today-attendance-count').textContent = todayAttendance;

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        document.getElementById('total-students-count').textContent = 'Error';
        document.getElementById('total-teachers-count').textContent = 'Error';
        document.getElementById('total-directors-count').textContent = 'Error';
        document.getElementById('today-attendance-count').textContent = 'Error';
    }
}
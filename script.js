// Login credentials
const ADMIN_USER = 'VBSGoodShepherdChurch';
const ADMIN_PASS = 'VBSGoodShepherdChurch';

// Date range for attendance and notes (May 6 - May 16, 2026)
const START_DATE = new Date(2026, 4, 6); // May 6, 2026
const END_DATE = new Date(2026, 4, 16); // May 16, 2026
let classDataLoadToken = 0;
const GROUP_OPTIONS = ['Girls 1', 'Girls 2', 'Girls 3', 'Girls 4', 'Boys 1', 'Boys 2', 'Boys 3', 'Boys 4'];

function getStudentRewardsStorageKey(className = currentClass) {
    return `${className}-student-rewards`;
}

function getStudentRewardsCache(className = currentClass) {
    return JSON.parse(localStorage.getItem(getStudentRewardsStorageKey(className)) || '[]');
}

function saveStudentRewardsCache(className, students) {
    localStorage.setItem(getStudentRewardsStorageKey(className), JSON.stringify(students));
}

function normalizePointsValue(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildStudentRewardKey(student) {
    return (student.gmail || student.fullName || '').toString().trim().toLowerCase();
}

async function fetchApprovedUsersFromSheets() {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready for approved users lookup');
        return null;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'ApprovedUsers!A:H'
        });

        const rows = response.result.values || [];
        if (rows.length <= 1) {
            return [];
        }

        return rows.slice(1).map(row => ({
            fullName: row[0]?.toString().trim() || '',
            role: row[1]?.toString().trim().toLowerCase() || '',
            gmail: row[2]?.toString().trim().toLowerCase() || '',
            password: row[3]?.toString() || '',
            class: row[4]?.toString().trim().toLowerCase() || '',
            approvedDate: row[5]?.toString() || '',
            group: row[6]?.toString().trim() || '',
            points: normalizePointsValue(row[7])
        }));
    } catch (error) {
        console.error('Failed to load approved users:', error);
        return null;
    }
}

function mergeStudentRewards(remoteStudents, cachedStudents) {
    const cacheMap = new Map((cachedStudents || []).map(student => [buildStudentRewardKey(student), student]));
    const merged = (remoteStudents || []).map(student => {
        const cache = cacheMap.get(buildStudentRewardKey(student)) || {};
        return {
            ...student,
            group: student.group || cache.group || '',
            points: normalizePointsValue(student.points ?? cache.points ?? 0)
        };
    });

    const mergedKeys = new Set(merged.map(student => buildStudentRewardKey(student)));
    (cachedStudents || []).forEach(student => {
        const key = buildStudentRewardKey(student);
        if (!mergedKeys.has(key)) {
            merged.push({
                ...student,
                group: student.group || '',
                points: normalizePointsValue(student.points)
            });
        }
    });

    return merged;
}

async function getClassStudentRewards(className = currentClass) {
    const cachedStudents = getStudentRewardsCache(className);
    const approvedUsers = await fetchApprovedUsersFromSheets();

    if (!approvedUsers) {
        return cachedStudents;
    }

    const classStudents = approvedUsers.filter(user => user.role === 'student' && user.class === className);
    const mergedStudents = mergeStudentRewards(classStudents, cachedStudents);
    saveStudentRewardsCache(className, mergedStudents);
    return mergedStudents;
}

async function updateApprovedUserRewards(gmail, updates) {
    if (!googleInitialized || !googleAuthToken) {
        return false;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'ApprovedUsers!A:H'
        });

        const rows = response.result.values || [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[2] && row[2].toString().trim().toLowerCase() === gmail.toLowerCase()) {
                const group = updates.group !== undefined ? updates.group : (row[6] || '');
                const points = updates.points !== undefined ? normalizePointsValue(updates.points) : normalizePointsValue(row[7]);

                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: GOOGLE_SPREADSHEET_ID,
                    range: `ApprovedUsers!G${i + 1}:H${i + 1}`,
                    valueInputOption: 'RAW',
                    resource: {
                        values: [[group, points]]
                    }
                });
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Failed to update approved user rewards:', error);
        return false;
    }
}

function refreshDashboardIfVisible() {
    if (dashboardSection && dashboardSection.style.display === 'block') {
        loadDashboardData();
    }
}

function getAttendanceDateConfigs() {
    const dates = [];
    const current = new Date(START_DATE);
    current.setHours(0, 0, 0, 0);

    const end = new Date(END_DATE);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }

    return dates.map(date => ({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        label: `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })}`
    }));
}

function getAttendanceSheetName(className = currentClass) {
    return className.charAt(0).toUpperCase() + className.slice(1);
}

function getAttendanceStorageKey(className = currentClass) {
    return `${className}-attendance-grid`;
}

function getAttendanceRosterKey(className = currentClass) {
    return `${className}-student-roster`;
}

function getAttendanceGrid(className = currentClass) {
    return JSON.parse(localStorage.getItem(getAttendanceStorageKey(className)) || '[]');
}

function saveAttendanceGrid(className, grid) {
    localStorage.setItem(getAttendanceStorageKey(className), JSON.stringify(grid));
}

function getStudentRoster(className = currentClass) {
    return JSON.parse(localStorage.getItem(getAttendanceRosterKey(className)) || '[]');
}

function saveStudentRoster(className, roster) {
    localStorage.setItem(getAttendanceRosterKey(className), JSON.stringify(roster));
}

function normalizeStudentName(name) {
    return (name || '').toString().trim();
}

function getAttendanceDateKeyMap() {
    const map = new Map();
    getAttendanceDateConfigs().forEach(config => map.set(config.key, config.label));
    return map;
}

function getDefaultAttendanceGrid(className = currentClass) {
    const roster = getStudentRoster(className);
    const dateConfigs = getAttendanceDateConfigs();

    return roster.map(studentName => {
        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = '';
        });
        return { name: studentName, attendance };
    });
}

function mergeAttendanceGrid(grid, className = currentClass) {
    const dateConfigs = getAttendanceDateConfigs();
    const roster = getStudentRoster(className);
    const sourceGrid = Array.isArray(grid) ? grid : [];
    const sourceByName = new Map(sourceGrid.map(row => [row.name.toLowerCase(), row]));
    const combinedNames = new Map();

    roster.forEach(studentName => combinedNames.set(studentName.toLowerCase(), studentName));
    sourceGrid.forEach(row => {
        if (row?.name) {
            combinedNames.set(row.name.toLowerCase(), row.name);
        }
    });

    if (combinedNames.size === 0) {
        return sourceGrid.map(row => {
            const attendance = {};
            dateConfigs.forEach(config => {
                attendance[config.key] = row.attendance?.[config.key] || '';
            });
            return { name: row.name, attendance };
        });
    }

    const merged = [];
    combinedNames.forEach(studentName => {
        const existingRow = sourceByName.get(studentName.toLowerCase());
        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = existingRow?.attendance?.[config.key] || '';
        });
        merged.push({ name: studentName, attendance });
    });

    return merged;
}

function getCurrentAttendanceGrid(className = currentClass) {
    const storedGrid = getAttendanceGrid(className);
    if (storedGrid.length > 0) {
        return mergeAttendanceGrid(storedGrid, className);
    }

    const legacyRecords = JSON.parse(localStorage.getItem(`${className}-attendance-history`) || '[]');
    if (!legacyRecords.length) {
        return getDefaultAttendanceGrid(className);
    }

    const dateConfigs = getAttendanceDateConfigs();
    const roster = new Map();
    legacyRecords.forEach(record => {
        const dateKey = record.date ? record.date : '';
        (record.students || []).forEach(student => {
            const studentName = normalizeStudentName(student.name);
            if (!studentName) return;
            if (!roster.has(studentName.toLowerCase())) {
                const attendance = {};
                dateConfigs.forEach(config => {
                    attendance[config.key] = '';
                });
                roster.set(studentName.toLowerCase(), { name: studentName, attendance });
            }
            const row = roster.get(studentName.toLowerCase());
            const matchedDate = dateConfigs.find(config => config.label === dateKey || config.key === dateKey || new Date(config.key).toLocaleDateString() === dateKey);
            if (matchedDate) {
                row.attendance[matchedDate.key] = student.present ? 'Present' : 'Absent';
            }
        });
    });

    const grid = Array.from(roster.values());
    saveAttendanceGrid(className, grid);
    saveStudentRoster(className, grid.map(row => row.name));
    return grid;
}

function attendanceGridToSheetValues(grid) {
    const dateConfigs = getAttendanceDateConfigs();
    return [
        ['Student Name', ...dateConfigs.map(config => config.label)],
        ...grid.map(row => [
            row.name,
            ...dateConfigs.map(config => row.attendance?.[config.key] || '')
        ])
    ];
}

function sheetValuesToAttendanceGrid(values) {
    if (!values || values.length === 0) {
        return [];
    }

    const firstRow = values[0] || [];
    const dateConfigs = getAttendanceDateConfigs();
    const dateKeys = dateConfigs.map(config => config.key);

    if ((firstRow[0] || '').toString().trim().toLowerCase() === 'date') {
        const gridMap = new Map();
        for (let i = 1; i < values.length; i++) {
            const row = values[i] || [];
            const dateLabel = row[0];
            const studentName = normalizeStudentName(row[1]);
            const status = row[2] || '';
            if (!studentName) continue;

            if (!gridMap.has(studentName.toLowerCase())) {
                const attendance = {};
                dateConfigs.forEach(config => {
                    attendance[config.key] = '';
                });
                gridMap.set(studentName.toLowerCase(), { name: studentName, attendance });
            }

            const matchedDate = dateConfigs.find(config => config.label === dateLabel || config.key === dateLabel || new Date(config.key).toLocaleDateString() === dateLabel);
            if (matchedDate) {
                gridMap.get(studentName.toLowerCase()).attendance[matchedDate.key] = status;
            }
        }
        return Array.from(gridMap.values());
    }

    const headerMap = firstRow.slice(1).map(value => normalizeStudentName(value));
    const matchingDates = headerMap.map(header => {
        const matched = dateConfigs.find(config => config.label === header || config.key === header);
        return matched || null;
    }).filter(Boolean);

    const rows = [];
    for (let i = 1; i < values.length; i++) {
        const row = values[i] || [];
        const studentName = normalizeStudentName(row[0]);
        if (!studentName) continue;

        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = '';
        });

        matchingDates.forEach((config, index) => {
            attendance[config.key] = row[index + 1] || '';
        });

        rows.push({ name: studentName, attendance });
    }

    return rows;
}

function renderAttendanceGrid(grid, editable) {
    const dateConfigs = getAttendanceDateConfigs();
    attendanceList.innerHTML = '';

    if (!grid || grid.length === 0) {
        attendanceList.innerHTML = '<p style="text-align: center; color: #999; padding: 12px;">No students available. Add students to begin marking attendance.</p>';
        return;
    }

    const table = document.createElement('table');
    table.id = 'attendance-grid-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.backgroundColor = 'white';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.innerHTML = '<th style="position: sticky; left: 0; z-index: 1; background: #667eea; color: white; padding: 10px; text-align: left; min-width: 180px;">Student Name</th>';
    dateConfigs.forEach(config => {
        headRow.innerHTML += `<th style="background: #667eea; color: white; padding: 10px; min-width: 110px; white-space: nowrap;">${config.label}</th>`;
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    grid.forEach(row => {
        const tr = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = row.name;
        nameCell.style.cssText = 'position: sticky; left: 0; background: #f8f9ff; font-weight: 600; padding: 10px; border-top: 1px solid #eee;';
        tr.appendChild(nameCell);

        dateConfigs.forEach(config => {
            const td = document.createElement('td');
            td.style.cssText = 'padding: 8px; border-top: 1px solid #eee; text-align: center;';

            if (editable) {
                const select = document.createElement('select');
                select.dataset.student = row.name;
                select.dataset.date = config.key;
                select.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;';
                select.innerHTML = `
                    <option value="">-</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                `;
                select.value = row.attendance?.[config.key] || '';
                td.appendChild(select);
            } else {
                const value = row.attendance?.[config.key] || '';
                td.textContent = value || '-';
                td.style.fontWeight = '600';
                if (value === 'Present') {
                    td.style.color = '#fff';
                    td.style.backgroundColor = '#4CAF50';
                } else if (value === 'Absent') {
                    td.style.color = '#fff';
                    td.style.backgroundColor = '#f44336';
                } else {
                    td.style.color = '#999';
                    td.style.backgroundColor = '#f5f5f5';
                }
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    attendanceList.appendChild(table);
}

function getAttendanceGridFromUI() {
    const grid = getCurrentAttendanceGrid();
    const dateConfigs = getAttendanceDateConfigs();
    const gridByName = new Map(grid.map(row => [row.name.toLowerCase(), row]));

    attendanceList.querySelectorAll('select[data-student][data-date]').forEach(select => {
        const studentName = normalizeStudentName(select.dataset.student);
        const dateKey = select.dataset.date;
        const row = gridByName.get(studentName.toLowerCase());
        if (row) {
            row.attendance[dateKey] = select.value;
        }
    });

    return Array.from(gridByName.values()).map(row => {
        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = row.attendance?.[config.key] || '';
        });
        return { name: row.name, attendance };
    });
}

function renderStudentRewardsTable(students, options = {}) {
    if (!studentRewardsList) {
        return;
    }

    const canAssignGroup = !!options.canAssignGroup;
    const canAddPoints = !!options.canAddPoints;
    studentRewardsList.innerHTML = '';

    if (!students || students.length === 0) {
        studentRewardsList.innerHTML = '<p style="text-align: center; color: #999; padding: 12px;">No students found for this class.</p>';
        return;
    }

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.backgroundColor = 'white';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th style="background: #667eea; color: white; padding: 10px; text-align: left;">Student</th>
        <th style="background: #667eea; color: white; padding: 10px; text-align: left;">Group</th>
        <th style="background: #667eea; color: white; padding: 10px; text-align: left;">Points</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    students.forEach((student, index) => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = student.fullName;
        nameCell.style.cssText = 'padding: 10px; border-top: 1px solid #eee; font-weight: 600;';
        row.appendChild(nameCell);

        const groupCell = document.createElement('td');
        groupCell.style.cssText = 'padding: 10px; border-top: 1px solid #eee;';
        if (canAssignGroup) {
            const select = document.createElement('select');
            select.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;';
            select.innerHTML = ['<option value="">-- No Group --</option>', ...GROUP_OPTIONS.map(group => `<option value="${group}">${group}</option>`)].join('');
            select.value = student.group || '';
            select.onchange = async () => {
                student.group = select.value;
                saveStudentRewardsCache(currentClass, students);
                if (!student.gmail || !googleInitialized || !googleAuthToken) {
                    refreshDashboardIfVisible();
                    return;
                }
                const saved = await updateApprovedUserRewards(student.gmail, { group: student.group, points: student.points });
                if (saved) {
                    refreshDashboardIfVisible();
                } else {
                    alert('❌ Could not save group. Please connect Google and try again.');
                }
            };
            groupCell.appendChild(select);
        } else {
            groupCell.textContent = student.group || '-';
        }
        row.appendChild(groupCell);

        const pointsCell = document.createElement('td');
        pointsCell.style.cssText = 'padding: 10px; border-top: 1px solid #eee;';
        const pointsWrap = document.createElement('div');
        pointsWrap.style.cssText = 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap;';

        const pointsValue = document.createElement('strong');
        pointsValue.textContent = String(normalizePointsValue(student.points));
        pointsValue.style.minWidth = '40px';
        pointsWrap.appendChild(pointsValue);

        if (canAddPoints) {
            const pointsInput = document.createElement('input');
            pointsInput.type = 'number';
            pointsInput.value = '1';
            pointsInput.style.cssText = 'width: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 6px;';

            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.textContent = '+ Add';
            addButton.onclick = async () => {
                const delta = normalizePointsValue(pointsInput.value);
                if (delta === 0) {
                    alert('❌ Enter a points value greater than 0.');
                    return;
                }
                student.points = normalizePointsValue(student.points) + delta;
                saveStudentRewardsCache(currentClass, students);
                if (!student.gmail || !googleInitialized || !googleAuthToken) {
                    pointsValue.textContent = String(student.points);
                    refreshDashboardIfVisible();
                    alert(`✅ ${student.fullName} awarded ${delta} points locally.`);
                    return;
                }
                const saved = await updateApprovedUserRewards(student.gmail, { group: student.group, points: student.points });
                if (saved) {
                    pointsValue.textContent = String(student.points);
                    refreshDashboardIfVisible();
                    alert(`✅ ${student.fullName} awarded ${delta} points.`);
                } else {
                    alert('❌ Could not save points. Please connect Google and try again.');
                }
            };

            pointsWrap.appendChild(pointsInput);
            pointsWrap.appendChild(addButton);
        }

        pointsCell.appendChild(pointsWrap);
        row.appendChild(pointsCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    studentRewardsList.appendChild(table);
}

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
let loginSection, adminLoginSection, userLoginSection, adminSection, classSection, classTitle, attendanceList, studentRewardsSection, studentRewardsList, notesTextarea, attendanceReportSection, registrationSection, dashboardSection;
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
    studentRewardsSection = document.getElementById('student-rewards-section');
    studentRewardsList = document.getElementById('student-rewards-list');
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
            range: 'ApprovedUsers!A:H',
            valueInputOption: 'RAW',
            resource: {
                values: [[fullName, role, gmail, password, className || '', new Date().toLocaleString(), '', 0]]
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
    try {
        if (!googleInitialized || !googleAuthToken) {
            console.log('Google API not ready for user verification');
            return null;
        }

        const approvedUsers = await fetchApprovedUsersFromSheets();
        return (approvedUsers || []).find(user => user.gmail === gmail.toLowerCase()) || null;
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
            await loadClassData();
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

async function switchClassView() {
    const selectedClass = document.getElementById('class-view-select').value;
    if (!selectedClass) return;
    currentClass = selectedClass;
    updateClassTitle();
    await loadClassData();
    // Auto-open rewards panel for directors when switching class view
    if (currentRole === 'director' && studentRewardsSection) {
        studentRewardsSection.style.display = 'block';
        try { studentRewardsSection.scrollIntoView({ behavior: 'smooth' }); } catch (e) {}
    }
}

async function accessClass() {
    const selectedClass = document.getElementById('class-select').value;
    currentClass = selectedClass;
    adminSection.style.display = 'none';
    classSection.style.display = 'block';
    updateClassTitle();
    setupRoleBasedAccess(currentRole || 'admin', selectedClass);
    await loadClassData();
    // Auto-open rewards panel for directors immediately after accessing a class
    if (currentRole === 'director' && studentRewardsSection) {
        studentRewardsSection.style.display = 'block';
        try { studentRewardsSection.scrollIntoView({ behavior: 'smooth' }); } catch (e) {}
    }
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

async function loadClassData() {
    const loadToken = ++classDataLoadToken;
    const activeClass = currentClass;
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
    
    const editable = !['teacher_view', 'student'].includes(currentRole);
    const canAssignGroup = currentRole === 'director' || currentRole === 'admin';
    const canAddPoints = currentRole === 'director' || currentRole === 'admin' || currentRole === 'teacher';
    let attendanceGrid = getCurrentAttendanceGrid(activeClass);
    renderAttendanceGrid(attendanceGrid, editable);

    const cachedRewards = getStudentRewardsCache(activeClass);
    renderStudentRewardsTable(cachedRewards, { canAssignGroup, canAddPoints });

    if (googleInitialized && googleAuthToken) {
        try {
            const remoteGrid = await fetchAttendanceFromGoogleSheets(activeClass);
            if (loadToken !== classDataLoadToken || activeClass !== currentClass) {
                return;
            }

            if (remoteGrid && remoteGrid.length > 0) {
                attendanceGrid = mergeAttendanceGrid(remoteGrid, activeClass);
                saveAttendanceGrid(activeClass, attendanceGrid);
                saveStudentRoster(activeClass, attendanceGrid.map(row => row.name));
                renderAttendanceGrid(attendanceGrid, editable);
            }

            const remoteRewards = await getClassStudentRewards(activeClass);
            if (loadToken !== classDataLoadToken || activeClass !== currentClass) {
                return;
            }
            renderStudentRewardsTable(remoteRewards, { canAssignGroup, canAddPoints });
        } catch (error) {
            console.error('Failed to load Google attendance grid:', error);
        }
    }

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

async function addStudentFromInput() {
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
    
    const grid = getCurrentAttendanceGrid();
    const studentExists = grid.some(row => row.name.toLowerCase() === name.toLowerCase());

    if (studentExists) {
        alert('❌ This student is already added.');
        return;
    }

    const dateConfigs = getAttendanceDateConfigs();
    const newRow = { name, attendance: {} };
    dateConfigs.forEach(config => {
        newRow.attendance[config.key] = '';
    });

    const updatedGrid = [...grid, newRow];
    saveAttendanceGrid(currentClass, updatedGrid);
    saveStudentRoster(currentClass, updatedGrid.map(row => row.name));

    const rewardsCache = getStudentRewardsCache(currentClass);
    if (!rewardsCache.some(student => student.fullName.toLowerCase() === name.toLowerCase())) {
        rewardsCache.push({
            fullName: name,
            gmail: '',
            role: 'student',
            class: currentClass,
            approvedDate: '',
            group: '',
            points: 0
        });
        saveStudentRewardsCache(currentClass, rewardsCache);
    }

    if (googleInitialized && googleAuthToken) {
        await saveAttendanceToGoogleSheets(updatedGrid, currentClass);
    }
    
    input.value = '';
    await loadClassData();
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
    const updatedGrid = getAttendanceGridFromUI();
    saveAttendanceGrid(currentClass, updatedGrid);
    saveStudentRoster(currentClass, updatedGrid.map(row => row.name));

    if (googleAuthToken && googleInitialized) {
        saveAttendanceToGoogleSheets(updatedGrid, currentClass).then(success => {
            if (success) {
                alert('✅ Attendance saved and synced to Google Sheets!');
            } else {
                alert('✅ Attendance saved locally (Google sync failed - will retry when connected)');
            }
        });
    } else {
        alert('✅ Attendance saved locally (connect Google to sync)');
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
    let attendanceRecords = await fetchAttendanceFromGoogleSheets();
    if (!attendanceRecords) {
        attendanceRecords = getCurrentAttendanceGrid(currentClass);
        console.log('Using localStorage data for attendance report');
    }
    
    document.getElementById('report-class-title').textContent = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
    
    if (attendanceRecords.length === 0) {
        document.getElementById('attendance-report-body').innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #999;">No attendance records found</td></tr>';
        classSection.style.display = 'none';
        attendanceReportSection.style.display = 'block';
        return;
    }
    
    const dateConfigs = getAttendanceDateConfigs();
    const sortedRecords = [...attendanceRecords].sort((a, b) => a.name.localeCompare(b.name));

    const table = document.getElementById('attendance-table');
    const thead = table.querySelector('thead');
    thead.innerHTML = '';
    
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th style="background-color: #667eea; color: white; min-width: 150px;">Student Name</th>';
    dateConfigs.forEach(config => {
        headerRow.innerHTML += `<th style="background-color: #667eea; color: white; padding: 10px; white-space: nowrap;">${config.label}</th>`;
    });
    thead.appendChild(headerRow);
    
    // Build table body with students as rows
    const tbody = document.getElementById('attendance-report-body');
    tbody.innerHTML = '';
    
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalNotOnRoll = 0;

    sortedRecords.forEach(studentRow => {
        const row = document.createElement('tr');
        row.innerHTML = `<td style="font-weight: bold; background-color: #f8f9ff; padding: 10px;">${studentRow.name}</td>`;

        dateConfigs.forEach(config => {
            const value = studentRow.attendance?.[config.key] || '';
            let cell = value || '-';
            let cellStyle = 'padding: 10px; text-align: center; font-weight: bold;';

            if (value === 'Present') {
                cellStyle += ' color: white; background-color: #4CAF50;';
                totalPresent++;
            } else if (value === 'Absent') {
                cellStyle += ' color: white; background-color: #f44336;';
                totalAbsent++;
            } else {
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
    
    document.getElementById('total-students').textContent = sortedRecords.length;
    document.getElementById('present-count').textContent = totalPresent;
    document.getElementById('absent-count').textContent = totalAbsent;
    document.getElementById('attendance-rate').textContent = attendanceRate + '%';
    
    classSection.style.display = 'none';
    attendanceReportSection.style.display = 'block';
}

function removeStudent(index) {
    if (confirm('Are you sure you want to remove this student?')) {
        const attendance = getCurrentAttendanceGrid();
        attendance.splice(index, 1);
        saveAttendanceGrid(currentClass, attendance);
        saveStudentRoster(currentClass, attendance.map(row => row.name));
        viewAttendanceReport();
    }
}

async function downloadAttendanceCSV() {
    let attendanceRecords = await fetchAttendanceFromGoogleSheets();
    if (!attendanceRecords) {
        attendanceRecords = getCurrentAttendanceGrid(currentClass);
        console.log('Using localStorage data for CSV download');
    }
    
    const className = currentClass.charAt(0).toUpperCase() + currentClass.slice(1);
    
    if (attendanceRecords.length === 0) {
        alert('No attendance records to download');
        return;
    }
    
    const dateConfigs = getAttendanceDateConfigs();
    let csvContent = 'Student Name,' + dateConfigs.map(config => config.label).join(',') + '\n';

    attendanceRecords.sort((a, b) => a.name.localeCompare(b.name)).forEach(studentRow => {
        let row = studentRow.name;
        dateConfigs.forEach(config => {
            row += ',' + (studentRow.attendance?.[config.key] || '-');
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
    const rewardsSection = document.getElementById('student-rewards-section');

    const canManageRewards = userRole === 'director' || userRole === 'admin' || userRole === 'teacher';
    if (rewardsSection) {
        rewardsSection.style.display = canManageRewards ? 'block' : 'none';
    }

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
        if (classSwitcher) classSwitcher.style.display = 'none';
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

async function saveAttendanceToGoogleSheets(classData, className = currentClass) {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready - data saved locally only');
        return false;
    }

    try {
        const sheetName = getAttendanceSheetName(className);
        const values = attendanceGridToSheetValues(classData);

        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:Z`
        });

        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource: {
                values
            }
        });

        console.log('Data saved to Google Sheets:', response);
        return true;
    } catch (error) {
        console.error('Failed to save to Google Sheets:', error);
        return false;
    }
}

async function fetchAttendanceFromGoogleSheets(className = currentClass) {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready - using local data only');
        return null;
    }

    try {
        const sheetName = getAttendanceSheetName(className);
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:Z`
        });

        const values = response.result.values;
        if (!values || values.length === 0) {
            console.log('No data found in Google Sheets');
            return null;
        }

        const attendanceGrid = sheetValuesToAttendanceGrid(values);
        console.log('Fetched attendance grid from Google Sheets:', attendanceGrid);
        return attendanceGrid;
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
        const topStudentsList = document.getElementById('top-students-list');
        const groupPointsList = document.getElementById('group-points-list');
        if (topStudentsList) topStudentsList.innerHTML = '<p style="color: #999;">Connect Google first</p>';
        if (groupPointsList) groupPointsList.innerHTML = '<p style="color: #999;">Connect Google first</p>';
        return;
    }

    try {
        // Load approved users data
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'ApprovedUsers!A:H'
        });

        const rows = response.result.values || [];
        let students = 0, teachers = 0, directors = 0;
        const studentLeaderboard = [];
        const groupTotals = new Map(GROUP_OPTIONS.map(group => [group, 0]));

        // Count users by role (skip header)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length >= 2) {
                const role = row[1]?.toString().toLowerCase();
                if (role === 'student') students++;
                else if (role === 'teacher' || role === 'teacher_view') teachers++;
                else if (role === 'director') directors++;
            }

            const role = row[1]?.toString().toLowerCase();
            if (role === 'student') {
                const fullName = row[0]?.toString().trim() || '';
                const className = row[4]?.toString().trim() || '';
                const group = row[6]?.toString().trim() || '';
                const points = normalizePointsValue(row[7]);
                studentLeaderboard.push({ fullName, className, group, points });
                if (!groupTotals.has(group)) {
                    groupTotals.set(group, 0);
                }
                groupTotals.set(group, groupTotals.get(group) + points);
            }
        }

        document.getElementById('total-students-count').textContent = students;
        document.getElementById('total-teachers-count').textContent = teachers;
        document.getElementById('total-directors-count').textContent = directors;

        // Load today's attendance count
        const dashboardDateKey = (function () {
            const dateConfigs = getAttendanceDateConfigs();
            const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
            return dateConfigs.some(config => config.key === todayKey) ? todayKey : dateConfigs[0].key;
        })();
        let todayAttendance = 0;

        // Check all class sheets for the selected attendance day
        for (const className of CLASS_LIST) {
            try {
                const sheetResponse = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SPREADSHEET_ID,
                    range: `${className.charAt(0).toUpperCase() + className.slice(1)}!A:Z`
                });

                const attendanceGrid = sheetValuesToAttendanceGrid(sheetResponse.result.values || []);
                attendanceGrid.forEach(row => {
                    if (row.attendance?.[dashboardDateKey] === 'Present') {
                        todayAttendance++;
                    }
                });
            } catch (error) {
                // Sheet might not exist, continue
                console.log(`Sheet ${className} not found or empty`);
            }
        }

        document.getElementById('today-attendance-count').textContent = todayAttendance;

        const topStudentsList = document.getElementById('top-students-list');
        if (topStudentsList) {
            const top10 = studentLeaderboard
                .sort((a, b) => b.points - a.points || a.fullName.localeCompare(b.fullName))
                .slice(0, 10);

            if (!top10.length) {
                topStudentsList.innerHTML = '<p style="color: #999;">No student points available</p>';
            } else {
                topStudentsList.innerHTML = top10.map((student, index) => `
                    <div style="display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eee;">
                        <div>
                            <strong>${index + 1}. ${student.fullName}</strong><br>
                            <span style="color: #666; font-size: 0.9em;">${student.className}${student.group ? ` • ${student.group}` : ''}</span>
                        </div>
                        <div style="font-weight: 700; color: #667eea;">${student.points} pts</div>
                    </div>
                `).join('');
            }
        }

        const groupPointsList = document.getElementById('group-points-list');
        if (groupPointsList) {
            const orderedGroups = [...GROUP_OPTIONS, ...Array.from(groupTotals.keys()).filter(group => !GROUP_OPTIONS.includes(group))];
            groupPointsList.innerHTML = orderedGroups.map(group => `
                <div style="display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eee;">
                    <strong>${group || 'Unassigned'}</strong>
                    <span style="font-weight: 700; color: #2e7d32;">${groupTotals.get(group) || 0} pts</span>
                </div>
            `).join('');
        }

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        document.getElementById('total-students-count').textContent = 'Error';
        document.getElementById('total-teachers-count').textContent = 'Error';
        document.getElementById('total-directors-count').textContent = 'Error';
        document.getElementById('today-attendance-count').textContent = 'Error';
        const topStudentsList = document.getElementById('top-students-list');
        const groupPointsList = document.getElementById('group-points-list');
        if (topStudentsList) topStudentsList.innerHTML = '<p style="color: red;">Error loading top students</p>';
        if (groupPointsList) groupPointsList.innerHTML = '<p style="color: red;">Error loading group points</p>';
    }
}
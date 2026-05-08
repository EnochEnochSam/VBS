// Login credentials
const ADMIN_USER = 'VBSGoodShepherdChurch';
const ADMIN_PASS = 'VBSGoodShepherdChurch';

// Date range for attendance (May 6 - May 16, 2026)
const START_DATE = new Date(2026, 4, 6); // May 6, 2026
const END_DATE = new Date(2026, 4, 16); // May 16, 2026
let classDataLoadToken = 0;
const GIRLS_GROUP_OPTIONS = ['Deborah', 'Elezebath', 'Esther', 'Mary'];
const BOYS_GROUP_OPTIONS = ['Abharam', 'Moses', 'Joseph', 'David'];
const GROUP_OPTIONS = [...GIRLS_GROUP_OPTIONS, ...BOYS_GROUP_OPTIONS];
let classSheetRewardsMigrationDone = false;
let classSheetRewardsMigrationPromise = null;
const attendanceGridMemory = new Map();
const studentRewardsMemory = new Map();
const pointsLogMemory = new Map();

function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
}

function clearLegacyOperationalStorage() {
    if (typeof localStorage === 'undefined') {
        return;
    }

    const suffixes = [
        '-student-rewards',
        '-points-log',
        '-attendance-grid',
        '-student-roster',
        '-attendance-history'
    ];
    const exactKeys = new Set(['pending-registrations']);

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (exactKeys.has(key) || suffixes.some(suffix => key.endsWith(suffix)))) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
}

function getStudentRewardsStorageKey(className = currentClass) {
    return `${className}-student-rewards`;
}

function getStudentRewardsCache(className = currentClass) {
    return cloneDeep(studentRewardsMemory.get(getStudentRewardsStorageKey(className)) || []);
}

function saveStudentRewardsCache(className, students) {
    studentRewardsMemory.set(getStudentRewardsStorageKey(className), cloneDeep(students || []));
}

function getPointsLogStorageKey(className = currentClass) {
    return `${className}-points-log`;
}

function getPointsLog(className = currentClass) {
    return cloneDeep(pointsLogMemory.get(getPointsLogStorageKey(className)) || []);
}

function savePointsLog(className, log) {
    pointsLogMemory.set(getPointsLogStorageKey(className), cloneDeep(log || []));
}

function addPointsLogEntry(className, studentName, pointsDelta, updatedBy) {
    const log = getPointsLog(className);
    log.push({
        studentName,
        pointsDelta,
        updatedBy,
        timestamp: new Date().toLocaleString(),
        timestampISO: new Date().toISOString()
    });
    savePointsLog(className, log);
}

function normalizePointsValue(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildStudentRewardKey(student) {
    return (student.gmail || student.fullName || '').toString().trim().toLowerCase();
}

function normalizeGenderValue(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (normalized === 'male' || normalized === 'boy' || normalized === 'boys') return 'Male';
    if (normalized === 'female' || normalized === 'girl' || normalized === 'girls') return 'Female';
    return '';
}

function getGroupOptionsForStudent(student) {
    const gender = normalizeGenderValue(student?.gender);
    if (gender === 'Female') {
        return GIRLS_GROUP_OPTIONS;
    }
    if (gender === 'Male') {
        return BOYS_GROUP_OPTIONS;
    }
    return GROUP_OPTIONS;
}

function getConnectedGoogleLabel() {
    if (!currentGoogleUser) {
        return 'No Google account connected';
    }

    const labelName = currentGoogleUser.name || currentGoogleUser.email || 'Connected user';
    const labelEmail = currentGoogleUser.email ? ` (${currentGoogleUser.email})` : '';
    return `${labelName}${labelEmail}`;
}

async function fetchConnectedGoogleUser() {
    if (!googleInitialized || !googleAuthToken) {
        return null;
    }

    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${googleAuthToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load Google profile (${response.status})`);
        }

        const profile = await response.json();
        return {
            email: (profile.email || '').trim().toLowerCase(),
            name: (profile.name || profile.given_name || profile.email || '').trim(),
            picture: profile.picture || ''
        };
    } catch (error) {
        console.error('Failed to fetch connected Google user:', error);
        return null;
    }
}

async function fetchApprovedUsersFromSheets() {
    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready for approved users lookup');
        return null;
    }

    try {
        const rows = await getSheetRows('ApprovedUsers');
        if (rows.length === 0) {
            return [];
        }

        const headerIsPresent = detectHeaderRow(rows[0], ['full name', 'role', 'gmail']);
        const headerRow = headerIsPresent ? rows[0] : [];
        const headerMap = buildHeaderIndexMap(headerRow);

        const idxFullName = resolveFieldIndex('full name', headerMap, ['fullname', 'name'], 0);
        const idxRole = resolveFieldIndex('role', headerMap, [], 1);
        const idxGmail = resolveFieldIndex('gmail', headerMap, ['email'], 2);
        const idxPassword = resolveFieldIndex('password', headerMap, ['passcode'], 3);
        const idxClass = resolveFieldIndex('class', headerMap, ['class name'], 4);
        const idxApprovedDate = resolveFieldIndex('approved date', headerMap, ['approval date', 'approved on'], 5);
        const idxGroup = resolveFieldIndex('group', headerMap, [], 6);
        const idxPoints = resolveFieldIndex('points', headerMap, ['reward points'], 7);

        const startRow = headerIsPresent ? 1 : 0;
        return rows.slice(startRow).map(row => ({
            fullName: row[idxFullName]?.toString().trim() || '',
            role: row[idxRole]?.toString().trim().toLowerCase() || '',
            gmail: row[idxGmail]?.toString().trim().toLowerCase() || '',
            password: row[idxPassword]?.toString() || '',
            class: row[idxClass]?.toString().trim().toLowerCase() || '',
            approvedDate: row[idxApprovedDate]?.toString() || '',
            group: row[idxGroup]?.toString().trim() || '',
            points: normalizePointsValue(row[idxPoints])
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
    const normalizedClassName = (className || '').toString().trim().toLowerCase();
    if (normalizedClassName === 'teachers') {
        return [];
    }
    const cachedStudents = getStudentRewardsCache(className);
    const approvedUsers = await fetchApprovedUsersFromSheets();

    // If Google not available, fall back to cache
    if (!approvedUsers) {
        return cachedStudents;
    }

    // Build a map of approved students for this class
    const classApproved = approvedUsers.filter(user => {
        const userRole = (user.role || '').toString().trim().toLowerCase();
        const userClass = (user.class || '').toString().trim().toLowerCase();
        return userRole === 'student' && userClass === normalizedClassName;
    });

    // Try to read group/points from the class sheet
    let sheetStudents = [];
    if (googleInitialized && googleAuthToken) {
        const remoteGrid = await fetchAttendanceFromGoogleSheets(className);
        if (remoteGrid && remoteGrid.length > 0) {
            sheetStudents = remoteGrid.map(row => ({
                fullName: row.name,
                group: row.group || '',
                points: normalizePointsValue(row.points || 0)
            }));
        }

        // Fallback: if the parsed grid is empty, read the raw sheet and use the
        // first column names directly so Add Points still works.
        if (sheetStudents.length === 0) {
            try {
                const sheetName = getAttendanceSheetName(className);
                const rawResponse = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SPREADSHEET_ID,
                    range: `${sheetName}!A:Z`
                });
                const rawRows = rawResponse.result.values || [];
                const startRow = rawRows.length > 0 && detectHeaderRow(rawRows[0], ['student name', 'gender']) ? 1 : 0;

                sheetStudents = rawRows.slice(startRow)
                    .map(row => {
                        const fullName = normalizeStudentName(row?.[0]);
                        if (!fullName) return null;
                        return {
                            fullName,
                            group: row?.[rawRows[0]?.length - 2] || '',
                            points: normalizePointsValue(row?.[rawRows[0]?.length - 1])
                        };
                    })
                    .filter(Boolean);
            } catch (rawError) {
                console.warn('Raw attendance fallback failed for Add Points:', rawError);
            }
        }
    }

    // Merge approved users with sheet data and cache
    const sheetMap = new Map((sheetStudents || []).map(s => [s.fullName.toLowerCase(), s]));
    const merged = classApproved.map(user => {
        const key = (user.fullName || '').toLowerCase();
        const sheetEntry = sheetMap.get(key) || {};
        const cacheEntry = (cachedStudents || []).find(c => buildStudentRewardKey(c) === buildStudentRewardKey(user)) || {};
        return {
            fullName: user.fullName,
            gmail: user.gmail,
            role: user.role,
            class: user.class,
            group: sheetEntry.group || cacheEntry.group || user.group || '',
            points: normalizePointsValue(sheetEntry.points ?? cacheEntry.points ?? user.points ?? 0)
        };
    });

    // Include any sheet-only students that are not in approved list.
    // This keeps Add Points usable for students added directly to class sheets.
    const mergedKeys = new Set(merged.map(s => (s.fullName || '').toLowerCase()));
    (sheetStudents || []).forEach(s => {
        const key = (s.fullName || '').toLowerCase();
        if (!key || mergedKeys.has(key)) {
            return;
        }
        merged.push({
            fullName: s.fullName,
            gmail: '',
            role: 'student',
            class: normalizedClassName,
            group: s.group || '',
            points: normalizePointsValue(s.points)
        });
        mergedKeys.add(key);
    });

    // Include any cached-only students that are not in approved list/sheet.
    const mergedKeysWithSheet = new Set(merged.map(s => (s.fullName || '').toLowerCase()));
    (cachedStudents || []).forEach(c => {
        const cacheKey = (c.fullName || '').toLowerCase();
        if (!cacheKey || !mergedKeysWithSheet.has(cacheKey)) {
            merged.push({
                fullName: c.fullName,
                gmail: c.gmail || '',
                role: 'student',
                class: normalizedClassName,
                group: c.group || '',
                points: normalizePointsValue(c.points)
            });
            mergedKeysWithSheet.add(cacheKey);
        }
    });

    saveStudentRewardsCache(className, merged);
    return merged;
}

async function updateApprovedUserRewards(gmail, updates = {}) {
    // Persist group/points to the class attendance sheet for the student's class
    if (!googleInitialized || !googleAuthToken) {
        return false;
    }

    try {
        const fallbackFullName = (updates.fullName || updates.studentName || '').toString().trim();
        const fallbackClass = (updates.className || currentClass || '').toString().trim().toLowerCase();

        // First find the student's full name and class from ApprovedUsers
        let rows = [];
        let fullName = null;
        let studentClass = null;

        if (gmail) {
            const resp = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: GOOGLE_SPREADSHEET_ID,
                range: 'ApprovedUsers!A:E'
            });
            rows = resp.result.values || [];
            for (let i = 1; i < rows.length; i++) {
                const r = rows[i];
                if (r[2] && r[2].toString().trim().toLowerCase() === gmail.toLowerCase()) {
                    fullName = r[0]?.toString().trim() || null;
                    studentClass = r[4]?.toString().trim().toLowerCase() || currentClass;
                    break;
                }
            }
        }

        if (!fullName && fallbackFullName) {
            fullName = fallbackFullName;
        }
        if (!studentClass && fallbackClass) {
            studentClass = fallbackClass;
        }

        if (!fullName) {
            console.warn('Could not resolve student name for reward update');
            return false;
        }

        // Fallback: if we couldn't find via ApprovedUsers, use currentClass and attempt match by name
        const targetClass = studentClass || currentClass;
        const sheetName = getAttendanceSheetName(targetClass);
        const dateConfigs = getAttendanceDateConfigs();

        // Fetch sheet values
        const sheetResp = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:Z`
        });
        const values = sheetResp.result.values || [];

        // Find student row by fullName (or by gmail-mapped fullname)
        let rowIndex = -1;
        for (let i = 1; i < values.length; i++) {
            const r = values[i] || [];
            const name = normalizeStudentName(r[0]);
            if (fullName && name.toLowerCase() === fullName.toLowerCase()) {
                rowIndex = i + 1;
                break;
            }
        }

        const existingRow = rowIndex > -1 ? (values[rowIndex - 1] || []) : [];
        const existingGroup = existingRow[dateConfigs.length + 1] || '';
        const existingPoints = normalizePointsValue(existingRow[dateConfigs.length + 2]);
        const groupVal = updates.group !== undefined ? updates.group : existingGroup;
        const pointsVal = updates.points !== undefined ? normalizePointsValue(updates.points) : existingPoints;

        // If not found, append a new row for the student
        if (rowIndex === -1) {
            const emptyDates = dateConfigs.map(() => '');
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: GOOGLE_SPREADSHEET_ID,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                resource: { values: [[fullName || '', ...emptyDates, groupVal, String(pointsVal)]] }
            });
            // Update local cache/grid
            const localGrid = getAttendanceGrid(targetClass) || [];
            const newRow = { name: fullName || '', attendance: {} };
            dateConfigs.forEach(cfg => newRow.attendance[cfg.key] = '');
            newRow.group = groupVal;
            newRow.points = pointsVal;
            localGrid.push(newRow);
            saveAttendanceGrid(targetClass, localGrid);
            const rewardsCache = getStudentRewardsCache(targetClass) || [];
            rewardsCache.push({ fullName: fullName || '', gmail: gmail || '', role: 'student', class: targetClass, group: groupVal, points: pointsVal });
            saveStudentRewardsCache(targetClass, rewardsCache);
            refreshDashboardIfVisible();
            return true;
        }

        // Compute column letters for Group and Points
        const dateCount = dateConfigs.length;
        const groupColIndex = 1 + dateCount + 1; // 1-based: A=1
        const pointsColIndex = groupColIndex + 1;
        const groupCol = columnLetter(groupColIndex);
        const pointsCol = columnLetter(pointsColIndex);

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!${groupCol}${rowIndex}:${pointsCol}${rowIndex}`,
            valueInputOption: 'RAW',
            resource: { values: [[groupVal, String(pointsVal)]] }
        });

        // Update local cache/grid
        const localGrid = getAttendanceGrid(targetClass) || [];
        const keyName = (fullName || '').toLowerCase();
        let found = false;
        for (let i = 0; i < localGrid.length; i++) {
            if ((localGrid[i].name || '').toLowerCase() === keyName) {
                localGrid[i].group = groupVal;
                localGrid[i].points = pointsVal;
                found = true;
                break;
            }
        }
        if (!found) {
            const newRow = { name: fullName || '', attendance: {} };
            dateConfigs.forEach(cfg => newRow.attendance[cfg.key] = '');
            newRow.group = groupVal;
            newRow.points = pointsVal;
            localGrid.push(newRow);
        }
        saveAttendanceGrid(targetClass, localGrid);
        // Update rewards cache
        const rewardsCache = getStudentRewardsCache(targetClass) || [];
        const cacheIndex = rewardsCache.findIndex(s => (s.fullName || '').toLowerCase() === keyName || (s.gmail || '').toLowerCase() === (gmail || '').toLowerCase());
        if (cacheIndex >= 0) {
            rewardsCache[cacheIndex].group = groupVal;
            rewardsCache[cacheIndex].points = pointsVal;
        } else {
            rewardsCache.push({ fullName: fullName || '', gmail: gmail || '', role: 'student', class: targetClass, group: groupVal, points: pointsVal });
        }
        saveStudentRewardsCache(targetClass, rewardsCache);

        refreshDashboardIfVisible();
        return true;
    } catch (error) {
        console.error('Failed to update class student rewards:', error);
        return false;
    }
}

// Helper: convert 1-based column index to letter (1 -> A)
function columnLetter(n) {
    let s = '';
    while (n > 0) {
        let m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function refreshDashboardIfVisible() {
    if (dashboardSection && dashboardSection.style.display === 'block') {
        showDashboardTab(dashboardActiveTab);
        loadDashboardData();
    }
}

function renderDashboardAttendanceSummary(attendanceSummaries, dateConfigs) {
    const headRow = document.getElementById('attendance-summary-head-row');
    const body = document.getElementById('attendance-summary-body');
    if (!headRow || !body) return;

    const dynamicHeaders = dateConfigs.map(config => `<th>${config.label}</th>`).join('');
    headRow.innerHTML = `<th>Class</th><th>On Roll</th><th>Today Present</th>${dynamicHeaders}`;

    if (!attendanceSummaries.length) {
        body.innerHTML = `<tr><td colspan="${3 + dateConfigs.length}">No attendance data found.</td></tr>`;
        return;
    }

    const totals = { roll: 0, today: 0, daily: Object.fromEntries(dateConfigs.map(config => [config.key, 0])) };

    body.innerHTML = attendanceSummaries.map(summary => {
        totals.roll += summary.rollCount;
        totals.today += summary.todayPresent;
        dateConfigs.forEach(config => {
            totals.daily[config.key] += summary.dayPresentCounts[config.key] || 0;
        });

        const dayCells = dateConfigs.map(config => `<td>${summary.dayPresentCounts[config.key] || 0}</td>`).join('');
        return `
            <tr>
                <td style="text-align:left; font-weight:700;">${summary.classLabel}</td>
                <td>${summary.rollCount}</td>
                <td>${summary.todayPresent}</td>
                ${dayCells}
            </tr>
        `;
    }).join('') + `
        <tr class="total-row">
            <td style="text-align:left;">Total</td>
            <td>${totals.roll}</td>
            <td>${totals.today}</td>
            ${dateConfigs.map(config => `<td>${totals.daily[config.key] || 0}</td>`).join('')}
        </tr>
    `;
}

function renderDashboardPoints(studentLeaderboard, groupTotals) {
    const topGirlsList = document.getElementById('top-girls-students-list');
    const topBoysList = document.getElementById('top-boys-students-list');
    const groupPointsList = document.getElementById('group-points-list');
    const groupPointsCards = document.getElementById('group-points-cards');

    const filteredStudents = dashboardSelectedGroup
        ? studentLeaderboard.filter(student => (student.group || '') === dashboardSelectedGroup)
        : studentLeaderboard;

    const girlsLeaderboard = filteredStudents.filter(student => student.gender === 'Female');
    const top10Girls = girlsLeaderboard.sort((a, b) => b.points - a.points || a.fullName.localeCompare(b.fullName)).slice(0, 10);
    if (topGirlsList) {
        topGirlsList.innerHTML = top10Girls.length ? top10Girls.map((student, index) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee;">
                <div style="min-width:0">
                    <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${index + 1}. ${student.fullName}</div>
                    <div style="color:#666;font-size:0.85em;margin-top:4px;">${student.className}${student.group ? ` • ${student.group}` : ''}</div>
                </div>
                <div style="font-weight:800;color:#0f172a;margin-left:12px;">${student.points} pts</div>
            </div>
        `).join('') : '<p style="color: #999;">No girls student points available</p>';
    }

    const boysLeaderboard = filteredStudents.filter(student => student.gender === 'Male');
    const top10Boys = boysLeaderboard.sort((a, b) => b.points - a.points || a.fullName.localeCompare(b.fullName)).slice(0, 10);
    if (topBoysList) {
        topBoysList.innerHTML = top10Boys.length ? top10Boys.map((student, index) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee;">
                <div style="min-width:0">
                    <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${index + 1}. ${student.fullName}</div>
                    <div style="color:#666;font-size:0.85em;margin-top:4px;">${student.className}${student.group ? ` • ${student.group}` : ''}</div>
                </div>
                <div style="font-weight:800;color:#0f172a;margin-left:12px;">${student.points} pts</div>
            </div>
        `).join('') : '<p style="color: #999;">No boys student points available</p>';
    }

    if (groupPointsList) {
        const orderedGroups = [...GROUP_OPTIONS, ...Array.from(groupTotals.keys()).filter(group => !GROUP_OPTIONS.includes(group))];
        groupPointsList.innerHTML = orderedGroups.map(group => `
            <div style="display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eee;">
                <strong>${group || 'Unassigned'}</strong>
                <span style="font-weight: 700; color: #2e7d32;">${groupTotals.get(group) || 0} pts</span>
            </div>
        `).join('');
    }

    if (groupPointsCards) {
        groupPointsCards.innerHTML = `<div class="group-cards-grid">` + GROUP_OPTIONS.map(group => `
            <div class="group-card" data-group="${(group || '').replace(/"/g, '&quot;')}">
                <div class="group-name">${group || 'Unassigned'}</div>
                <div class="group-points">${groupTotals.get(group) || 0} pts</div>
            </div>
        `).join('') + `</div>`;

        const cards = groupPointsCards.querySelectorAll('.group-card');
        cards.forEach(card => {
            const groupName = card.dataset.group || '';
            card.classList.toggle('active', (dashboardSelectedGroup || '') === groupName);
            card.addEventListener('click', () => {
                dashboardSelectedGroup = dashboardSelectedGroup === groupName ? null : groupName;
                renderDashboardPoints(studentLeaderboard, groupTotals);
            });
        });
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
    const storageKey = getAttendanceStorageKey(className);
    if (attendanceGridMemory.has(storageKey)) {
        return cloneDeep(attendanceGridMemory.get(storageKey));
    }
    return cloneDeep([]);
}

function saveAttendanceGrid(className, grid) {
    const storageKey = getAttendanceStorageKey(className);
    attendanceGridMemory.set(storageKey, cloneDeep(grid || []));
}

function getStudentRoster(className = currentClass) {
    const attendanceGrid = getAttendanceGrid(className);
    if (attendanceGrid.length > 0) {
        return attendanceGrid.map(row => row.name).filter(Boolean);
    }

    return [];
}

function saveStudentRoster(className, roster) {
    const attendanceGrid = getAttendanceGrid(className);
    const rosterNames = Array.isArray(roster) ? roster.filter(Boolean) : [];
    if (attendanceGrid.length > 0 && rosterNames.length > 0) {
        attendanceGridMemory.set(getAttendanceStorageKey(className), attendanceGrid.map(row => ({
            ...row,
            name: row.name || rosterNames.find(name => name.toLowerCase() === (row.name || '').toLowerCase()) || row.name
        })));
    }
}

function normalizeStudentName(name) {
    return (name || '').toString().trim();
}

function getAttendanceSheetColumnLayout(headerRow = []) {
    const normalizedHeader = (headerRow || []).map(value => normalizeStudentName(value).toLowerCase());
    const headerMap = buildHeaderIndexMap(headerRow);

    const studentIndex = headerMap.has('student name')
        ? headerMap.get('student name')
        : headerMap.has('student')
            ? headerMap.get('student')
            : 0;

    const genderIndex = headerMap.has('gender')
        ? headerMap.get('gender')
        : normalizedHeader[1] === 'gender'
            ? 1
            : -1;

    const groupIndex = headerMap.has('group') ? headerMap.get('group') : -1;
    const pointsIndex = headerMap.has('points') ? headerMap.get('points') : -1;
    const hasGenderColumn = genderIndex >= 0;
    const dateStartIndex = hasGenderColumn ? genderIndex + 1 : studentIndex + 1;
    const dateCount = getAttendanceDateConfigs().length;

    return {
        studentIndex,
        hasGenderColumn,
        genderIndex,
        dateStartIndex,
        dateCount,
        groupIndex,
        pointsIndex
    };
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
        return { name: studentName, gender: '', attendance };
    });
}

function mergeAttendanceGrid(grid, className = currentClass) {
    const dateConfigs = getAttendanceDateConfigs();
    const roster = getStudentRoster(className);
    const sourceGrid = Array.isArray(grid) ? grid : [];
    const sourceByName = new Map(sourceGrid.filter(row => row?.name).map(row => [row.name.toLowerCase(), row]));
    const combinedNames = new Map();

    roster.forEach(studentName => combinedNames.set(studentName.toLowerCase(), studentName));
    sourceGrid.forEach(row => {
        if (row?.name) {
            combinedNames.set(row.name.toLowerCase(), row.name);
        }
    });

    if (combinedNames.size === 0) {
        return sourceGrid.filter(row => row?.name).map(row => {
            const attendance = {};
            dateConfigs.forEach(config => {
                attendance[config.key] = row.attendance?.[config.key] || '';
            });
            return { name: row.name, gender: row.gender || '', attendance, group: row.group || '', points: normalizePointsValue(row.points) };
        });
    }

    const merged = [];
    combinedNames.forEach(studentName => {
        const existingRow = sourceByName.get(studentName.toLowerCase());
        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = existingRow?.attendance?.[config.key] || '';
        });
        merged.push({ name: studentName, gender: existingRow?.gender || '', attendance, group: existingRow?.group || '', points: normalizePointsValue(existingRow?.points) });
    });

    return merged;
}

function getCurrentAttendanceGrid(className = currentClass) {
    const storedGrid = getAttendanceGrid(className);
    if (storedGrid.length > 0) {
        return mergeAttendanceGrid(storedGrid, className);
    }

    return getDefaultAttendanceGrid(className);
}

function attendanceGridToSheetValues(grid) {
    const dateConfigs = getAttendanceDateConfigs();
    return [
        ['Student Name', 'Gender', ...dateConfigs.map(config => config.label), 'Group', 'Points'],
        ...grid.map(row => [
            row.name,
            row.gender || '',
            ...dateConfigs.map(config => row.attendance?.[config.key] || ''),
            row.group || '',
            String(normalizePointsValue(row.points))
        ])
    ];
}

function sheetValuesToAttendanceGrid(values) {
    if (!values || values.length === 0) {
        return [];
    }

    const firstRow = values[0] || [];
    const dateConfigs = getAttendanceDateConfigs();
    const normalizedHeader = (firstRow || []).map(value => normalizeStudentName(value).toLowerCase());

    if ((firstRow[0] || '').toString().trim().toLowerCase() === 'date') {
        const gridMap = new Map();
        for (let i = 1; i < values.length; i++) {
            const row = values[i] || [];
            const dateLabel = row[0];
            const studentName = normalizeStudentName(row[1] || row[2]);
            const status = row[2] || '';
            if (!studentName) continue;

            if (!gridMap.has(studentName.toLowerCase())) {
                const attendance = {};
                dateConfigs.forEach(config => {
                    attendance[config.key] = '';
                });
                gridMap.set(studentName.toLowerCase(), { name: studentName, gender: '', attendance });
            }

            const matchedDate = dateConfigs.find(config => config.label === dateLabel || config.key === dateLabel || new Date(config.key).toLocaleDateString() === dateLabel);
            if (matchedDate) {
                gridMap.get(studentName.toLowerCase()).attendance[matchedDate.key] = status;
            }
        }
        return Array.from(gridMap.values());
    }

    const layout = getAttendanceSheetColumnLayout(firstRow);
    const isHeaderRow = firstRow.some(cell => {
        const normalized = normalizeStudentName(cell).toLowerCase();
        return normalized === 'student name' || normalized === 'student' || normalized === 'gender' ||
               dateConfigs.some(config => config.label.toLowerCase() === normalized || config.key === normalized) ||
               normalized === 'group' || normalized === 'points';
    });

    const dataStartIndex = isHeaderRow ? 1 : 0;
    const dateColumns = dateConfigs.map((config, index) => {
        const expectedValues = [config.label.toLowerCase(), config.key.toLowerCase()];
        let matchedIndex = normalizedHeader.findIndex((value, idx) => expectedValues.includes(value) && idx !== layout.studentIndex && idx !== layout.genderIndex && idx !== layout.groupIndex && idx !== layout.pointsIndex);
        if (matchedIndex < 0) {
            matchedIndex = layout.dateStartIndex + index;
        }
        return { config, columnIndex: matchedIndex };
    });

    const groupIndex = layout.groupIndex >= 0 ? layout.groupIndex : layout.dateStartIndex + dateConfigs.length;
    const pointsIndex = layout.pointsIndex >= 0 ? layout.pointsIndex : groupIndex + 1;

    const rows = [];
    for (let i = dataStartIndex; i < values.length; i++) {
        const row = values[i] || [];
        const studentName = normalizeStudentName(row[layout.studentIndex] || row[0] || row[1] || row[2]);
        if (!studentName) continue;

        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = '';
        });

        dateColumns.forEach(({ config, columnIndex }) => {
            attendance[config.key] = row[columnIndex] || '';
        });

        const gender = layout.hasGenderColumn ? (row[layout.genderIndex] || '') : '';
        const group = row[groupIndex] || '';
        const points = normalizePointsValue(row[pointsIndex]);

        rows.push({ name: studentName, gender, attendance, group: group || '', points });
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
    headRow.innerHTML += '<th style="background: #667eea; color: white; padding: 10px; min-width: 140px; white-space: nowrap;">Gender</th>';
    dateConfigs.forEach(config => {
        headRow.innerHTML += `<th style="background: #667eea; color: white; padding: 10px; min-width: 110px; white-space: nowrap;">${config.label}</th>`;
    });
    headRow.innerHTML += '<th style="background: #667eea; color: white; padding: 10px; min-width: 100px; white-space: nowrap;">Days Present</th>';
    headRow.innerHTML += '<th style="background: #667eea; color: white; padding: 10px; min-width: 120px; white-space: nowrap;">Group</th>';
    headRow.innerHTML += '<th style="background: #667eea; color: white; padding: 10px; min-width: 80px; white-space: nowrap;">Points</th>';
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    grid.forEach(row => {
        const tr = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = row.name;
        nameCell.style.cssText = 'position: sticky; left: 0; background: #f8f9ff; font-weight: 600; padding: 10px; border-top: 1px solid #eee;';
        tr.appendChild(nameCell);

        const genderCell = document.createElement('td');
        genderCell.style.cssText = 'padding: 8px; border-top: 1px solid #eee; text-align: center;';

        if (editable) {
            const select = document.createElement('select');
            select.dataset.student = row.name;
            select.dataset.gender = 'true';
            select.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;';
            select.innerHTML = `
                    <option value="">-</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                `;
            select.value = row.gender || '';
            genderCell.appendChild(select);
        } else {
            genderCell.textContent = row.gender || '-';
            genderCell.style.fontWeight = '600';
        }

        tr.appendChild(genderCell);

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

        // Days Present column
        const daysCell = document.createElement('td');
        daysCell.style.cssText = 'padding: 8px; border-top: 1px solid #eee; text-align: center; font-weight: 700; background: #e3f2fd; color: #1976d2;';
        const daysPresent = Object.values(row.attendance || {}).filter(status => status === 'Present').length;
        daysCell.textContent = String(daysPresent);
        tr.appendChild(daysCell);

        // Group column
        const groupCell = document.createElement('td');
        groupCell.style.cssText = 'padding: 8px; border-top: 1px solid #eee; text-align: center;';
        
        // Group assignment is a one-time activity by director
        const groupIsAssigned = row.group && row.group.trim() !== '';
        
        if (editable && currentRole === 'director' && !groupIsAssigned) {
            // Only show select if group is not yet assigned
            const select = document.createElement('select');
            select.dataset.student = row.name;
            select.dataset.group = 'true';
            select.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;';
            const options = ['','-- No Group --', ...getGroupOptionsForStudent(row)];
            select.innerHTML = options.map(opt => opt === '' ? `<option value="">-</option>` : `<option value="${opt}">${opt}</option>`).join('');
            select.value = row.group || '';
            select.onchange = async () => {
                const studentName = normalizeStudentName(select.dataset.student);
                const grid = getCurrentAttendanceGrid();
                const target = grid.find(r => (r.name || '').toLowerCase() === studentName.toLowerCase());
                if (target) {
                    target.group = select.value;
                    saveAttendanceGrid(currentClass, grid);
                    const rewards = getStudentRewardsCache(currentClass) || [];
                    const idx = rewards.findIndex(s => (s.fullName || '').toLowerCase() === studentName.toLowerCase());
                    if (idx >= 0) {
                        rewards[idx].group = select.value;
                    } else {
                        rewards.push({ fullName: studentName, gmail: '', role: 'student', class: currentClass, group: select.value, points: 0 });
                    }
                    saveStudentRewardsCache(currentClass, rewards);
                    if (googleInitialized && googleAuthToken) {
                        await saveAttendanceToGoogleSheets(grid, currentClass);
                    }
                    refreshDashboardIfVisible();
                }
            };
            groupCell.appendChild(select);
        } else {
            // Show as read-only text (either already assigned or non-director viewing)
            groupCell.textContent = row.group || '-';
            groupCell.style.fontWeight = '600';
            if (groupIsAssigned) {
                groupCell.style.backgroundColor = '#e8f5e9';
                groupCell.style.color = '#2e7d32';
                groupCell.title = 'Group assignment is locked (one-time only)';
            }
        }
        tr.appendChild(groupCell);

        // Points column (read-only here)
        const pointsCell = document.createElement('td');
        pointsCell.style.cssText = 'padding: 8px; border-top: 1px solid #eee; text-align: center; font-weight: 700;';
        pointsCell.textContent = String(normalizePointsValue(row.points || 0));
        tr.appendChild(pointsCell);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    attendanceList.appendChild(table);
}

function getAttendanceGridFromUI() {
    const grid = getCurrentAttendanceGrid();
    const dateConfigs = getAttendanceDateConfigs();
    const gridByName = new Map(grid.map(row => [row.name.toLowerCase(), row]));

    attendanceList.querySelectorAll('select[data-student][data-gender]').forEach(select => {
        const studentName = normalizeStudentName(select.dataset.student);
        const row = gridByName.get(studentName.toLowerCase());
        if (row) {
            row.gender = select.value;
        }
    });

    attendanceList.querySelectorAll('select[data-student][data-date]').forEach(select => {
        const studentName = normalizeStudentName(select.dataset.student);
        const dateKey = select.dataset.date;
        const row = gridByName.get(studentName.toLowerCase());
        if (row) {
            row.attendance[dateKey] = select.value;
        }
    });

    const result = Array.from(gridByName.values()).map(row => {
        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = row.attendance?.[config.key] || '';
        });

        let groupVal = row.group || '';
        try {
            const sel = attendanceList.querySelector(`select[data-student][data-group][data-student="${CSS.escape(row.name)}"]`);
            if (sel) groupVal = sel.value || groupVal;
        } catch (e) {
            const sel2 = attendanceList.querySelectorAll('select[data-student][data-group]');
            for (const s of sel2) {
                if ((s.dataset.student || '').toLowerCase() === (row.name || '').toLowerCase()) {
                    groupVal = s.value || groupVal;
                    break;
                }
            }
        }

        return { name: row.name, gender: row.gender || '', attendance, group: groupVal, points: normalizePointsValue(row.points) };
    });

    if (result.length === 0) {
        const domGrid = parseAttendanceGridFromDOM();
        if (domGrid.length > 0) {
            return domGrid;
        }
    }

    return result;
}

function parseAttendanceGridFromDOM() {
    const dateConfigs = getAttendanceDateConfigs();
    const rows = [];
    const tableRows = attendanceList.querySelectorAll('table#attendance-grid-table tbody tr');
    tableRows.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length === 0) return;

        const studentName = normalizeStudentName(cells[0].textContent);
        if (!studentName) return;

        const attendance = {};
        dateConfigs.forEach(config => {
            attendance[config.key] = '';
        });

        const rowDateSelects = tr.querySelectorAll('select[data-student][data-date]');
        rowDateSelects.forEach(select => {
            const dateKey = select.dataset.date;
            if (dateKey && attendance.hasOwnProperty(dateKey)) {
                attendance[dateKey] = select.value;
            }
        });

        const genderSelect = tr.querySelector('select[data-student][data-gender]');
        const groupSelect = tr.querySelector('select[data-student][data-group]');
        const gender = genderSelect ? genderSelect.value : normalizeStudentName(cells[1]?.textContent);
        const group = groupSelect ? groupSelect.value : normalizeStudentName(cells[cells.length - 2]?.textContent);
        const pointsValue = normalizePointsValue(groupSelect ? '' : cells[cells.length - 1]?.textContent);

        rows.push({ name: studentName, gender, attendance, group, points: pointsValue });
    });

    return rows;
}

function renderStudentRewardsTable(students, options = {}) {
    if (!studentRewardsList) {
        return;
    }

    const canAssignGroup = !!options.canAssignGroup;
    const canAddPoints = !!options.canAddPoints;
    studentRewardsList.innerHTML = '';

    // Hide rewards for teachers class
    if (currentClass && currentClass.toLowerCase().startsWith('teachers')) {
        studentRewardsList.innerHTML = '<p style="text-align: center; color: #999; padding: 12px;">Rewards management is not available for this class.</p>';
        return;
    }

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
        
        // Group assignment is a one-time activity by director
        const groupIsAssigned = student.group && student.group.trim() !== '';
        
        if (canAssignGroup && !groupIsAssigned) {
            // Only show select if group is not yet assigned
            const select = document.createElement('select');
            select.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;';
            const groupOptions = getGroupOptionsForStudent(student);
            select.innerHTML = ['<option value="">-- No Group --</option>', ...groupOptions.map(group => `<option value="${group}">${group}</option>`)].join('');
            select.value = student.group || '';
            if (select.value && !groupOptions.includes(select.value)) {
                select.value = '';
            }
            select.onchange = async () => {
                student.group = select.value;
                if (!googleInitialized || !googleAuthToken) {
                    alert('❌ Google Sheets is required to save group changes. Please connect Google first.');
                    refreshDashboardIfVisible();
                    return;
                }
                const saved = await updateApprovedUserRewards(student.gmail, { group: student.group, points: student.points, fullName: student.fullName, className: currentClass });
                if (saved) {
                    saveStudentRewardsCache(currentClass, students);
                    refreshDashboardIfVisible();
                } else {
                    alert('❌ Could not save group. Please connect Google and try again.');
                }
            };
            groupCell.appendChild(select);
        } else {
            // Show as read-only text (either already assigned or not authorized)
            groupCell.textContent = student.group || '-';
            if (groupIsAssigned) {
                groupCell.style.backgroundColor = '#e8f5e9';
                groupCell.style.color = '#2e7d32';
                groupCell.style.fontWeight = '600';
                groupCell.title = 'Group assignment is locked (one-time only)';
            }
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
                // Log the points update with who made it
                const updatedBy = currentUser?.fullName || 'Unknown';
                addPointsLogEntry(currentClass, student.fullName, delta, updatedBy);
                if (!googleInitialized || !googleAuthToken) {
                    alert('❌ Google Sheets is required to save points. Please connect Google first.');
                    return;
                }
                const saved = await updateApprovedUserRewards(student.gmail, { group: student.group, points: student.points, fullName: student.fullName, className: currentClass });
                if (saved) {
                    saveStudentRewardsCache(currentClass, students);
                    pointsValue.textContent = String(student.points);
                    refreshDashboardIfVisible();
                    alert(`✅ ${student.fullName} awarded ${delta} points by ${updatedBy}.`);
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

function renderPointsLog(className = currentClass) {
    const pointsLogList = document.getElementById('points-log-list');
    if (!pointsLogList) return;

    if ((className || '').toString().trim().toLowerCase() === 'teachers') {
        pointsLogList.innerHTML = '<p style="text-align: center; color: #999; padding: 12px;">Points are not tracked for the teachers class.</p>';
        return;
    }

    const log = getPointsLog(className);
    if (!log || log.length === 0) {
        pointsLogList.innerHTML = '<p style="text-align: center; color: #999; padding: 12px;">No points updates yet.</p>';
        return;
    }

    // Sort by timestamp descending (newest first)
    const sorted = [...log].sort((a, b) => new Date(b.timestampISO) - new Date(a.timestampISO));

    pointsLogList.innerHTML = sorted.map((entry, index) => `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 0.95em;">
            <div style="flex: 1;">
                <div style="font-weight: 600; color: #333;">${entry.studentName}</div>
                <div style="color: #666; font-size: 0.9em; margin-top: 4px;">
                    <strong>+${entry.pointsDelta}</strong> points by <strong>${entry.updatedBy}</strong>
                </div>
                <div style="color: #999; font-size: 0.85em; margin-top: 2px;">${entry.timestamp}</div>
            </div>
        </div>
    `).join('');
}

function togglePointsLogView() {
    const pointsLogList = document.getElementById('points-log-list');
    if (!pointsLogList) return;
    
    if (pointsLogList.style.display === 'none') {
        renderPointsLog(currentClass);
        pointsLogList.style.display = 'block';
    } else {
        pointsLogList.style.display = 'none';
    }
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
let loginSection, adminLoginSection, userLoginSection, adminSection, classSection, classTitle, attendanceList, studentRewardsSection, studentRewardsList, attendanceReportSection, dashboardSection, addPointsSection;
let homeGoogleStatus, homeActionButtons, homeGoogleUser, userGoogleAccount, topRightConnectBtn, topRightLoginBtn, topRightLogoutBtn;

document.addEventListener('DOMContentLoaded', function() {
    clearLegacyOperationalStorage();
    // Initialize DOM elements
    loginSection = document.getElementById('login-section');
    adminLoginSection = document.getElementById('admin-login-section');
    userLoginSection = document.getElementById('user-login-section');
    dashboardSection = document.getElementById('dashboard-section');
    adminSection = document.getElementById('admin-section');
    classSection = document.getElementById('class-section');
    addPointsSection = document.getElementById('add-points-section');
    classTitle = document.getElementById('class-title');
    attendanceList = document.getElementById('attendance-list');
    studentRewardsSection = document.getElementById('student-rewards-section');
    studentRewardsList = document.getElementById('student-rewards-list');
    attendanceReportSection = document.getElementById('attendance-report-section');
    
    // Initialize home page elements
    homeGoogleStatus = document.getElementById('home-google-status');
    homeGoogleUser = document.getElementById('home-google-user');
    userGoogleAccount = document.getElementById('user-google-account');
    homeActionButtons = document.querySelector('#login-section > div:last-child'); // The buttons container
    topRightConnectBtn = document.getElementById('top-right-connect-btn');
    topRightLoginBtn = document.getElementById('top-right-login-btn');
    topRightLogoutBtn = document.getElementById('top-right-logout-btn');
    
    // Populate class selectors
    populateAddPointsClassSelector();
    
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

    // Initialize layout selector from stored preference
    try {
        initLayoutFromStorage();
        const sel = document.getElementById('layout-selector');
        if (sel) sel.addEventListener('change', (e) => onLayoutSelectorChange(e));
    } catch (e) {
        console.warn('Layout selector init failed', e);
    }
});

// Layout selector helpers
let uiLayoutManualOverride = false; // Track if user manually selected a layout

function detectLayoutFromViewport() {
    const width = window.innerWidth;
    if (width < 640) {
        return 'phone';
    } else if (width < 1200) {
        return 'tablet';
    } else {
        return 'laptop';
    }
}

function applyLayoutSelection(layout) {
    document.documentElement.classList.remove('layout-phone', 'layout-tablet', 'layout-laptop');
    const cls = layout === 'phone' ? 'layout-phone' : (layout === 'tablet' ? 'layout-tablet' : 'layout-laptop');
    document.documentElement.classList.add(cls);
}

function setLayoutSelection(layout, isManual = false) {
    if (!layout) layout = 'laptop';
    if (!['phone', 'tablet', 'laptop'].includes(layout)) layout = 'laptop';
    
    if (isManual) {
        // User manually selected; save and override auto-detect
        uiLayoutManualOverride = true;
        localStorage.setItem('ui-layout-selection', layout);
        localStorage.setItem('ui-layout-manual-override', 'true');
    }
    
    applyLayoutSelection(layout);
    const sel = document.getElementById('layout-selector');
    if (sel) sel.value = layout;
}

function autoApplyLayoutFromViewport() {
    if (uiLayoutManualOverride) {
        // If user manually selected, don't auto-override
        return;
    }
    const detectedLayout = detectLayoutFromViewport();
    applyLayoutSelection(detectedLayout);
    const sel = document.getElementById('layout-selector');
    if (sel) sel.value = detectedLayout;
}

function initLayoutFromStorage() {
    const isManualOverride = localStorage.getItem('ui-layout-manual-override') === 'true';
    const stored = localStorage.getItem('ui-layout-selection');
    
    if (isManualOverride && stored) {
        // User had manually selected before; use that
        uiLayoutManualOverride = true;
        setLayoutSelection(stored, false);
    } else {
        // No manual override; auto-detect based on viewport
        uiLayoutManualOverride = false;
        autoApplyLayoutFromViewport();
    }
}

function onLayoutSelectorChange(e) {
    const value = (e && e.target && e.target.value) ? e.target.value : (e || 'laptop');
    setLayoutSelection(value, true); // Mark as manual selection
}

window.addEventListener('load', function() {
    if (typeof gapi !== 'undefined' && !googleInitialized) {
        initGoogleAPI().then(() => {
            updateGoogleStatus();
        });
    } else {
        updateGoogleStatus();
    }
});

// Auto-apply layout on window resize (if not manually overridden)
window.addEventListener('resize', function() {
    autoApplyLayoutFromViewport();
});

const CLASS_LIST = ['beginners', 'primary1', 'primary2', 'junior1', 'junior2', 'intermediate1', 'intermediate2', 'senior1', 'senior2', 'teachers'];
let currentClass = '';
let currentRole = '';
let isAdminMode = false;
let currentUser = null;
let currentGoogleUser = null;
let pendingPostLoginAction = 'home';
// Dashboard selected group filter (null = show all)
let dashboardSelectedGroup = null;
let dashboardActiveTab = 'attendance';

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
    showUserLoginForAction('home');
}

function showUserLoginForAction(action = 'home') {
    pendingPostLoginAction = action === 'attendance' ? 'attendance' : 'home';
    loginSection.style.display = 'none';
    userLoginSection.style.display = 'block';
    const loginTitle = document.getElementById('user-login-title');
    const loginDescription = document.getElementById('user-login-description');
    if (loginTitle && loginDescription) {
        if (pendingPostLoginAction === 'attendance') {
            loginTitle.textContent = '✅ Update Attendance';
            loginDescription.textContent = 'Login with your connected Google account to mark attendance for your approved class.';
        } else {
            loginTitle.textContent = '👤 User Login';
            loginDescription.textContent = 'Login with your connected Google account.';
        }
    }
    updateGoogleStatus();
}

function showAttendanceLogin() {
    if (currentUser && currentRole && googleAuthToken && googleInitialized) {
        openAttendanceDestinationForCurrentUser();
        return;
    }
    showUserLoginForAction('attendance');
}

async function openAttendanceDestinationForCurrentUser() {
    loginSection.style.display = 'none';
    userLoginSection.style.display = 'none';

    if (currentRole === 'director') {
        adminSection.style.display = 'block';
        isAdminMode = true;
        showAdminTab('class');
        updateGoogleStatus();
        return;
    }

    currentClass = currentUser?.class || currentClass || CLASS_LIST[0];
    classSection.style.display = 'block';
    updateClassTitle();
    setupRoleBasedAccess(currentRole, currentUser?.class);
    await loadClassData();
    updateGoogleStatus();
}

function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    dashboardActiveTab = 'attendance';
    showDashboardTab(dashboardActiveTab);
    loadDashboardData();
}

function showDashboardTab(tabName) {
    dashboardActiveTab = tabName === 'points' ? 'points' : 'attendance';

    const attendancePanel = document.getElementById('dashboard-attendance-panel');
    const pointsPanel = document.getElementById('dashboard-points-panel');
    const attendanceTab = document.getElementById('dashboard-tab-attendance');
    const pointsTab = document.getElementById('dashboard-tab-points');

    if (attendancePanel) attendancePanel.style.display = dashboardActiveTab === 'attendance' ? 'block' : 'none';
    if (pointsPanel) pointsPanel.style.display = dashboardActiveTab === 'points' ? 'block' : 'none';
    if (attendanceTab) attendanceTab.classList.toggle('active', dashboardActiveTab === 'attendance');
    if (pointsTab) pointsTab.classList.toggle('active', dashboardActiveTab === 'points');
    
    // Hide attendance report section when switching tabs
    if (attendanceReportSection) attendanceReportSection.style.display = 'none';
}

function backToHome() {
    pendingPostLoginAction = 'home';
    userLoginSection.style.display = 'none';
    dashboardSection.style.display = 'none';
    adminLoginSection.style.display = 'none';
    adminSection.style.display = 'none';
    classSection.style.display = 'none';
    attendanceReportSection.style.display = 'none';
    addPointsSection.style.display = 'none';
    loginSection.style.display = 'block';
    
    // Update UI button visibility when returning home
    updateGoogleStatus();
}

function connectGoogle() {
    handleAuthClick();
}

function showAdminTab(tab) {
    document.getElementById('admin-class-section').style.display = tab === 'class' ? 'block' : 'none';

    const tabs = ['admin-tab-class'];
    tabs.forEach(t => {
        const btn = document.getElementById(t);
        if (btn) btn.style.opacity = '0.7';
    });
    
    const activeTab = 'admin-tab-class';
    if (document.getElementById(activeTab)) {
        document.getElementById(activeTab).style.opacity = '1';
    }
}

function backToAdminPanel() {
    if (adminSection) {
        adminSection.style.display = 'block';
    }
    showAdminTab('class');
}

function normalizeHeaderName(value) {
    return (value || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function buildHeaderIndexMap(headerRow) {
    const indexMap = new Map();
    (headerRow || []).forEach((cell, index) => {
        const key = normalizeHeaderName(cell);
        if (key && !indexMap.has(key)) {
            indexMap.set(key, index);
        }
    });
    return indexMap;
}

function detectHeaderRow(row, requiredHeaders = []) {
    const normalized = new Set((row || []).map(cell => normalizeHeaderName(cell)).filter(Boolean));
    return requiredHeaders.some(header => normalized.has(normalizeHeaderName(header)));
}

function resolveFieldIndex(fieldName, headerMap, aliases = [], fallbackIndex = 0) {
    const candidates = [fieldName, ...aliases].map(normalizeHeaderName);
    for (const candidate of candidates) {
        if (headerMap.has(candidate)) {
            return headerMap.get(candidate);
        }
    }
    return fallbackIndex;
}

async function getSheetRows(sheetName) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SPREADSHEET_ID,
        range: `${sheetName}!A:Z`
    });
    return response.result.values || [];
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
        // Set user session for logout tracking
        currentUser = { fullName: 'Admin', role: 'admin' };
        currentRole = 'admin';
        
        adminLoginSection.style.display = 'none';
        adminSection.style.display = 'block';
        isAdminMode = true;
        
        // Ensure admin tabs are properly initialized
        showAdminTab('class');
        
        document.getElementById('admin-username').value = '';
        document.getElementById('admin-password').value = '';
        
        // Update UI to show logout button
        updateGoogleStatus();
    } else {
        alert('❌ Invalid admin credentials. Please try again.');
    }
}

async function userLogin() {
    const gmail = currentGoogleUser?.email || '';

    if (!currentGoogleUser || !gmail) {
        alert('❌ Please connect Google first.');
        return;
    }

    if (!googleInitialized || !googleAuthToken) {
        alert('❌ Google not connected. Please connect Google first to login.');
        return;
    }

    // Check approved users from Google Sheets based on Gmail only

    try {
        const allApprovedUsers = await fetchApprovedUsersFromSheets();
        console.log('All approved users:', allApprovedUsers);
        console.log('Current Google email:', gmail, 'Lowercase:', gmail.toLowerCase());
        
        const user = await fetchApprovedUserFromSheets(gmail);
        console.log('User lookup result:', user);
        
        if (user) {
            currentUser = user;
            currentRole = user.role;

            let chosenClass = user.class || '';
            if (!chosenClass) {
                chosenClass = currentRole === 'teacher' || currentRole === 'teacher_view'
                    ? CLASS_LIST.find(c => c.startsWith('teachers')) || CLASS_LIST[0]
                    : CLASS_LIST[0];
            }
            currentClass = chosenClass;
            userLoginSection.style.display = 'none';

            if (pendingPostLoginAction === 'attendance') {
                if (currentRole === 'director') {
                    adminSection.style.display = 'block';
                    isAdminMode = true;
                    showAdminTab('class');
                } else {
                    classSection.style.display = 'block';
                    updateClassTitle();
                    setupRoleBasedAccess(currentRole, user.class);
                    await loadClassData();
                }
            } else {
                backToHome();
            }

            updateGoogleStatus();
        } else {
            console.error('User not found in approved users list');
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
    
    // Teachers' attendance shall not be displayed except to directors
    if (selectedClass.toLowerCase().startsWith('teachers') && currentRole !== 'director') {
        alert('Teachers\' attendance records are only accessible to directors.');
        document.getElementById('class-view-select').value = currentClass || 'beginners';
        return;
    }
    
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
    
    // Pre-fill class selectors with the selected class
    const classViewSelect = document.getElementById('class-view-select');
    const addStudentClassSelect = document.getElementById('add-student-class-select');
    if (classViewSelect) classViewSelect.value = selectedClass;
    if (addStudentClassSelect) addStudentClassSelect.value = selectedClass;
    
    setupRoleBasedAccess(currentRole || 'admin', selectedClass);
    await loadClassData();
    // Hide student-rewards section when accessing class from attendance flow
    if (studentRewardsSection) {
        studentRewardsSection.style.display = 'none';
    }
}

function updateGoogleStatus() {
    const statusEl = document.getElementById('google-status');
    const authBtn = document.getElementById('google-auth-btn');
    const googleLabel = getConnectedGoogleLabel();
    const isLoggedIn = !!currentUser || !!currentRole;
    const isHomePage = loginSection && loginSection.style.display !== 'none';
    const showLogoutOnly = isHomePage && isLoggedIn;
    const showLoginControls = isHomePage && !isLoggedIn;
    const showConnectOnly = !isHomePage;

    const applyConnectedState = () => {
        if (homeGoogleUser) {
            homeGoogleUser.style.display = 'block';
            homeGoogleUser.textContent = currentUser?.fullName
                ? `Logged in as ${currentUser.fullName} (${googleLabel})`
                : `Connected as ${googleLabel}`;
        }
        if (userGoogleAccount) {
            userGoogleAccount.textContent = currentUser?.fullName
                ? `Logged in as ${currentUser.fullName} (${googleLabel})`
                : `Connected Google account: ${googleLabel}`;
        }
    };

    const applyDisconnectedState = (message) => {
        if (homeGoogleUser) {
            homeGoogleUser.style.display = 'none';
            homeGoogleUser.textContent = '';
        }
        if (userGoogleAccount) {
            userGoogleAccount.textContent = message;
        }
    };

    if (googleAuthToken && googleInitialized) {
        if (statusEl) {
            statusEl.textContent = `✅ Connected to Google: ${googleLabel}`;
            statusEl.style.color = '#2e7d32';
        }
        if (authBtn) authBtn.textContent = '🔓 Disconnect Google';
        if (homeGoogleStatus) {
            homeGoogleStatus.textContent = `✅ Google connected. Login enabled.`;
            homeGoogleStatus.style.backgroundColor = '#d4edda';
            homeGoogleStatus.style.color = '#155724';
            homeGoogleStatus.style.border = '1px solid #c3e6cb';
        }
        if (homeActionButtons) homeActionButtons.style.display = 'flex';
        if (topRightConnectBtn) {
            topRightConnectBtn.textContent = '🔗 Connect Google';
            topRightConnectBtn.style.display = (showLoginControls || showConnectOnly) ? 'inline-flex' : 'none';
        }
        if (topRightLoginBtn) topRightLoginBtn.style.display = showLoginControls ? 'inline-flex' : 'none';
        if (topRightLogoutBtn) topRightLogoutBtn.style.display = showLogoutOnly ? 'inline-flex' : 'none';
        applyConnectedState();
    } else if (googleInitialized) {
        if (statusEl) {
            statusEl.textContent = '📱 Not connected to Google (data saved locally)';
            statusEl.style.color = '#f57c00';
        }
        if (authBtn) authBtn.textContent = '🔗 Connect Google';
        if (homeGoogleStatus) {
            homeGoogleStatus.textContent = '⚠️ Connect Google to enable login.';
            homeGoogleStatus.style.backgroundColor = '#fff3cd';
            homeGoogleStatus.style.color = '#856404';
            homeGoogleStatus.style.border = '1px solid #ffeaa7';
        }
        if (homeActionButtons) homeActionButtons.style.display = 'flex';
        if (topRightConnectBtn) {
            topRightConnectBtn.textContent = '🔗 Connect Google';
            topRightConnectBtn.style.display = (showLoginControls || showConnectOnly) ? 'inline-flex' : 'none';
        }
        if (topRightLoginBtn) topRightLoginBtn.style.display = showLoginControls ? 'inline-flex' : 'none';
        if (topRightLogoutBtn) topRightLogoutBtn.style.display = showLogoutOnly ? 'inline-flex' : 'none';
        applyDisconnectedState('Connect Google first to continue.');
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
        if (topRightConnectBtn) {
            topRightConnectBtn.textContent = '🔗 Connect Google';
            topRightConnectBtn.style.display = (showLoginControls || showConnectOnly) ? 'inline-flex' : 'none';
        }
        if (topRightLoginBtn) topRightLoginBtn.style.display = showLoginControls ? 'inline-flex' : 'none';
        if (topRightLogoutBtn) topRightLogoutBtn.style.display = showLogoutOnly ? 'inline-flex' : 'none';
        applyDisconnectedState('Google API not configured. Check your setup.');
    }
}

function logoutCurrentSession() {
    // Clear user session data
    currentUser = null;
    currentRole = null;
    currentClass = null;
    isAdminMode = false;
    
    // Hide all sections except login
    if (userLoginSection) userLoginSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'none';
    if (adminLoginSection) adminLoginSection.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (classSection) classSection.style.display = 'none';
    if (attendanceReportSection) attendanceReportSection.style.display = 'none';
    if (addPointsSection) addPointsSection.style.display = 'none';
    
    // Show login section
    if (loginSection) loginSection.style.display = 'block';
    
    // Update UI to reflect logout
    updateGoogleStatus();
    
    // Show confirmation message
    alert('✅ Logged out successfully!');
}

async function loadClassData() {
    const loadToken = ++classDataLoadToken;
    const activeClass = currentClass;
    const withinRange = isWithinDateRange();
    const dateStatus = getDateRangeStatus();
    
    // Show/hide attendance marking based on date
    const markAttendanceBtn = document.querySelector('button[onclick="markAttendance()"]');
    const addStudentBtn = document.querySelector('button[onclick="addStudentFromInput()"]');
    
    if (!withinRange) {
        if (markAttendanceBtn) markAttendanceBtn.disabled = true;
        if (addStudentBtn) addStudentBtn.disabled = true;
        
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
        
        const existingStatus = document.getElementById('date-status');
        if (existingStatus) existingStatus.remove();
    }
    
    const editable = !['teacher_view', 'student'].includes(currentRole);
    const canAssignGroup = currentRole === 'director';
    const canAddPoints = (currentRole === 'director' || currentRole === 'admin') && activeClass !== 'teachers';
    let attendanceGrid = [];

    if (googleInitialized && googleAuthToken) {
        try {
            await ensureClassSheetRewardsMigrated();
            console.log('Loading class data for:', activeClass);
            const remoteGrid = await fetchAttendanceFromGoogleSheets(activeClass);
            console.log('Remote grid result for', activeClass, ':', remoteGrid);
            if (loadToken !== classDataLoadToken || activeClass !== currentClass) {
                return;
            }

            if (remoteGrid && remoteGrid.length > 0) {
                attendanceGrid = remoteGrid;
                saveAttendanceGrid(activeClass, attendanceGrid);
                saveStudentRoster(activeClass, attendanceGrid.map(row => row.name));
                console.log('Loaded from Google Sheets:', attendanceGrid.length, 'students');
            } else {
                console.log('No data in Google Sheets for', activeClass, '- checking approved users');
                // If no students in class sheet, load from Approved Users
                const approvedUsers = await fetchApprovedUsersFromSheets();
                const classStudents = (approvedUsers || []).filter(user => user.role === 'student' && user.class === activeClass);
                console.log('Found approved users for', activeClass, ':', classStudents.length);
                if (classStudents.length > 0 && loadToken === classDataLoadToken && activeClass === currentClass) {
                    const dateConfigs = getAttendanceDateConfigs();
                    attendanceGrid = classStudents.map(student => {
                        const attendance = {};
                        dateConfigs.forEach(config => {
                            attendance[config.key] = '';
                        });
                        return {
                            name: student.fullName,
                            gender: student.gender || '',
                            attendance,
                            group: student.group || '',
                            points: normalizePointsValue(student.points)
                        };
                    });
                    saveAttendanceGrid(activeClass, attendanceGrid);
                    saveStudentRoster(activeClass, attendanceGrid.map(row => row.name));
                    console.log('Loaded from approved users:', attendanceGrid.length, 'students');
                }
            }
        } catch (error) {
            console.error('Failed to load Google attendance grid for', activeClass, ':', error);
        }
    }

    // Fallback to local storage if Google fetch didn't work
    if (!attendanceGrid || attendanceGrid.length === 0) {
        attendanceGrid = getCurrentAttendanceGrid(activeClass);
    }

    renderAttendanceGrid(attendanceGrid, editable);

    const cachedRewards = getStudentRewardsCache(activeClass);
    renderStudentRewardsTable(cachedRewards, { canAssignGroup, canAddPoints });
    renderPointsLog(activeClass);

    // Update Google status
    updateGoogleStatus();
}

async function addStudentFromInput() {
    if (!isWithinDateRange()) {
        alert(`Features are not available. ${getDateRangeStatus()}`);
        return;
    }
    const input = document.getElementById('student-name-input');
    const genderSelect = document.getElementById('student-gender-select');
    const name = input.value.trim();
    const gender = genderSelect?.value || '';
    
    if (!name) {
        alert('❌ Please enter a student name.');
        return;
    }

    if (!googleInitialized || !googleAuthToken) {
        alert('❌ Google Sheets is required to add students. Please connect Google first.');
        return;
    }
    
    const grid = (await fetchAttendanceFromGoogleSheets(currentClass)) || [];
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
    newRow.gender = gender;

    const updatedGrid = [...grid, newRow];
    const saved = await saveAttendanceToGoogleSheets(updatedGrid, currentClass);
    if (!saved) {
        alert('❌ Could not save student to Google Sheets. No local copy was stored.');
        return;
    }

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
            gender: gender,
            group: '',
            points: 0
        });
        saveStudentRewardsCache(currentClass, rewardsCache);
    }
    
    input.value = '';
    genderSelect.value = '';
    await loadClassData();
    alert(`✓ ${name} added successfully!`);
}

async function updateClassStudentRewards(className, studentName, updates = {}, gmail = '') {
    if (!googleInitialized || !googleAuthToken) {
        return false;
    }

    try {
        const targetClass = (className || currentClass || '').toString().trim().toLowerCase();
        const sheetName = getAttendanceSheetName(targetClass);
        const dateConfigs = getAttendanceDateConfigs();
        const sheetResp = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:Z`
        });
        const values = sheetResp.result.values || [];
        const normalizedStudentName = (studentName || '').toString().trim().toLowerCase();

        let rowIndex = -1;
        for (let i = 1; i < values.length; i++) {
            const r = values[i] || [];
            const name = normalizeStudentName(r[0]).toLowerCase();
            if (name && name === normalizedStudentName) {
                rowIndex = i + 1;
                break;
            }
        }

        const existingRow = rowIndex > -1 ? (values[rowIndex - 1] || []) : [];
        const existingGroup = existingRow[dateConfigs.length + 2] || '';
        const existingPoints = normalizePointsValue(existingRow[dateConfigs.length + 3]);
        const groupVal = updates.group !== undefined ? updates.group : existingGroup;
        const pointsVal = updates.points !== undefined ? normalizePointsValue(updates.points) : existingPoints;

        if (rowIndex === -1) {
            const emptyDates = dateConfigs.map(() => '');
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: GOOGLE_SPREADSHEET_ID,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                resource: { values: [[studentName || '', '', ...emptyDates, groupVal, String(pointsVal)]] }
            });
        } else {
            const dateCount = dateConfigs.length;
            const groupColIndex = 2 + dateCount;
            const pointsColIndex = groupColIndex + 1;
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: GOOGLE_SPREADSHEET_ID,
                range: `${sheetName}!${columnLetter(groupColIndex)}${rowIndex}:${columnLetter(pointsColIndex)}${rowIndex}`,
                valueInputOption: 'RAW',
                resource: { values: [[groupVal, String(pointsVal)]] }
            });
        }

        const localGrid = getAttendanceGrid(targetClass) || [];
        let localFound = false;
        for (let i = 0; i < localGrid.length; i++) {
            if ((localGrid[i].name || '').toLowerCase() === normalizedStudentName) {
                localGrid[i].group = groupVal;
                localGrid[i].points = pointsVal;
                localFound = true;
                break;
            }
        }
        if (!localFound) {
            const newRow = { name: studentName || '', attendance: {} };
            dateConfigs.forEach(cfg => newRow.attendance[cfg.key] = '');
            newRow.group = groupVal;
            newRow.points = pointsVal;
            localGrid.push(newRow);
        }
        saveAttendanceGrid(targetClass, localGrid);

        const rewardsCache = getStudentRewardsCache(targetClass) || [];
        const cacheIndex = rewardsCache.findIndex(s => (s.fullName || '').toLowerCase() === normalizedStudentName);
        if (cacheIndex >= 0) {
            rewardsCache[cacheIndex].group = groupVal;
            rewardsCache[cacheIndex].points = pointsVal;
        } else {
            rewardsCache.push({ fullName: studentName || '', gmail: gmail || '', role: 'student', class: targetClass, group: groupVal, points: pointsVal });
        }
        saveStudentRewardsCache(targetClass, rewardsCache);

        refreshDashboardIfVisible();
        if (dashboardSection && dashboardSection.style.display === 'block') {
            await loadDashboardData();
        }
        return true;
    } catch (error) {
        console.error('Failed to update class student rewards:', error);
        return false;
    }
}

async function markAttendance() {
    try {
        const grid = getAttendanceGridFromUI();
        
        if (!grid || grid.length === 0) {
            alert('❌ No students to mark attendance for.');
            return;
        }

        console.log('markAttendance invoked', { googleInitialized, hasToken: !!googleAuthToken, class: currentClass, students: grid.length });
        const statusEl = document.getElementById('attendance-save-status');
        if (statusEl) statusEl.textContent = 'Attempting to save attendance...';
        // Ensure we have a target class
        if (!currentClass || currentClass === '') {
            const fallback = (document.getElementById('class-view-select') && document.getElementById('class-view-select').value) ||
                (document.getElementById('class-select') && document.getElementById('class-select').value) || CLASS_LIST[0];
            currentClass = fallback;
            console.warn('markAttendance: currentClass was empty; falling back to', currentClass);
        }

        if (!googleInitialized || !googleAuthToken) {
            alert('❌ Google Sheets is required to save attendance. Please connect Google first.');
            return;
        }

        const saved = await saveAttendanceToGoogleSheets(grid, currentClass);
        if (!saved) {
            if (statusEl) statusEl.textContent = '❌ Failed to save attendance. See alerts/console.';
            alert('❌ Attendance could not be saved to Google Sheets. No local copy was stored.');
            return;
        }

        saveAttendanceGrid(currentClass, grid);
        
        // Refresh dashboard if visible
        refreshDashboardIfVisible();
        if (statusEl) statusEl.textContent = `✅ Attendance saved (${grid.length} students)`;
        alert(`✅ Attendance marked and saved to Google Sheets for ${grid.length} student(s)!`);
    } catch (error) {
        console.error('Error marking attendance:', error);
        const statusElCatch = document.getElementById('attendance-save-status');
        if (statusElCatch) statusElCatch.textContent = '❌ Error marking attendance. Check console.';
        alert('❌ Error marking attendance. Check console for details.');
    }
}

async function viewAttendanceReport() {
    // Teachers' attendance shall not be displayed except to directors
    if (currentClass.toLowerCase().startsWith('teachers') && currentRole !== 'director') {
        document.getElementById('attendance-report-body').innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #d32f2f;">Teachers\' attendance records are only visible to directors.</td></tr>';
        classSection.style.display = 'none';
        attendanceReportSection.style.display = 'block';
        return;
    }

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

async function backToClass() {
    attendanceReportSection.style.display = 'none';
    classSection.style.display = 'block';
    if (currentClass) {
        await loadClassData();
    }
}

// Hide/show Teachers options in class selectors based on user role
function filterTeachersFromClassSelectors(userRole) {
    try {
        console.log('filterTeachersFromClassSelectors called with role:', userRole);
        const classViewSelect = document.getElementById('class-view-select');
        const addStudentClassSelector = document.getElementById('add-student-class-selector');

        console.log('classViewSelect:', classViewSelect);
        console.log('addStudentClassSelector:', addStudentClassSelector);

        [classViewSelect, addStudentClassSelector].forEach(selector => {
            console.log('Processing selector:', selector ? selector.id : 'null');
            if (!selector) {
                console.log('Selector is null');
                return;
            }
            console.log('Selector options:', selector.options);
            if (!selector.options || selector.options.length === 0) {
                console.log('Selector has no options or options is undefined');
                return;
            }
            try {
                // Convert HTMLCollection to array safely
                const optionsArray = [];
                for (let i = 0; i < selector.options.length; i++) {
                    optionsArray.push(selector.options[i]);
                }
                const teachersOptions = optionsArray.filter(opt => opt && opt.value && opt.value.startsWith('teachers'));
                console.log('Found teachers options:', teachersOptions.length);
                teachersOptions.forEach(option => {
                    if (userRole === 'director' || userRole === 'admin') {
                        option.style.display = 'block';
                    } else {
                        option.style.display = 'none';
                    }
                });
            } catch (error) {
                console.error('Error processing selector options:', error);
            }
        });
    } catch (error) {
        console.error('Error in filterTeachersFromClassSelectors:', error);
    }
}

function setupRoleBasedAccess(userRole, userClass) {
    const markAttendanceBtn = classSection.querySelector('button[onclick*="markAttendance"]');
    const addStudentBtn = classSection.querySelector('button[onclick*="addStudentFromInput"]');
    const viewReportBtn = classSection.querySelector('button[onclick*="viewAttendanceReport"]');
    const classSwitcher = document.getElementById('class-switcher');
    const classViewSelect = document.getElementById('class-view-select');
    const addStudentClassSelector = document.getElementById('add-student-class-selector');
    const rewardsSection = document.getElementById('student-rewards-section');

    // Filter Teachers option based on user role
    filterTeachersFromClassSelectors(userRole);

    const canManageRewards = userRole === 'director' || userRole === 'admin' || userRole === 'teacher';
    const isTeachersClass = userClass && userClass.toLowerCase().startsWith('teachers');
    if (rewardsSection) {
        rewardsSection.style.display = (canManageRewards && !isTeachersClass) ? 'block' : 'none';
    }
    const pointsLogSection = document.getElementById('points-log-section');
    if (pointsLogSection) {
        pointsLogSection.style.display = (canManageRewards && !isTeachersClass) ? 'block' : 'none';
    }

    if (userRole === 'teacher') {
        // Teachers can only mark attendance for their assigned class
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (classViewSelect) classViewSelect.style.display = 'none';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'none';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'inline-block';
        if (addStudentBtn) addStudentBtn.style.display = 'inline-block';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else if (userRole === 'teacher_view') {
        // Teacher View Only - can only view reports for their assigned class
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (classViewSelect) classViewSelect.style.display = 'none';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'none';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'none';
        if (addStudentBtn) addStudentBtn.style.display = 'none';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else if (userRole === 'director') {
        // Directors can view and update attendance for ALL classes
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (classViewSelect) classViewSelect.value = currentClass || 'beginners';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'block';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'inline-block';
        if (addStudentBtn) addStudentBtn.style.display = 'inline-block';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else if (userRole === 'admin') {
        // Admins can view and update attendance for ALL classes
        if (classSwitcher) classSwitcher.style.display = 'block';
        if (classViewSelect) classViewSelect.value = currentClass || 'beginners';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'block';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'inline-block';
        if (addStudentBtn) addStudentBtn.style.display = 'inline-block';
        if (viewReportBtn) viewReportBtn.style.display = 'inline-block';
    } else {
        // Students and other roles can only view reports
        if (classSwitcher) classSwitcher.style.display = 'none';
        if (addStudentClassSelector) addStudentClassSelector.style.display = 'none';
        if (markAttendanceBtn) markAttendanceBtn.style.display = 'none';
        if (addStudentBtn) addStudentBtn.style.display = 'none';
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

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'openid',
    'email',
    'profile'
];

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
                    callback: async (tokenResponse) => {
                        if (tokenResponse.error) {
                            console.error('Token client callback error:', tokenResponse);
                            return;
                        }
                        googleAuthToken = tokenResponse.access_token;
                        gapi.client.setToken({access_token: googleAuthToken});
                        currentGoogleUser = await fetchConnectedGoogleUser();
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
            currentGoogleUser = null;
            gapi.client.setToken('');
            updateGoogleStatus();
            alert('Logged out from Google');
        });
    } else {
        googleTokenClient.requestAccessToken({prompt: 'select_account'});
    }
}

async function saveAttendanceToGoogleSheets(classData, className = currentClass) {
    const statusElSave = document.getElementById('attendance-save-status');

    if (!googleInitialized || !googleAuthToken) {
        console.log('Google API not ready - data saved locally only');
        if (statusElSave) statusElSave.textContent = '❌ Connect Google first';
        return false;
    }

    if (!className || className.toString().trim() === '') {
        console.error('saveAttendanceToGoogleSheets: invalid className', className);
        if (statusElSave) statusElSave.textContent = '❌ No class selected';
        try { alert('❌ Attendance save failed: no class selected.'); } catch (e) {}
        return false;
    }

    try {
        const sheetName = getAttendanceSheetName((className || '').toString().trim());
        const values = attendanceGridToSheetValues(classData);

        console.log('Saving attendance to Sheets', { sheetName, rows: values.length });
        if (statusElSave) statusElSave.textContent = `Saving to sheet ${sheetName}...`;

        // Clear existing sheet range before writing full table
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
        try { if (statusElSave) statusElSave.textContent = '✅ Saved to Google Sheets'; } catch (e) {}
        return true;
    } catch (error) {
        console.error('Failed to save to Google Sheets:', error);
        const googleError = error?.result?.error?.message || error?.message || JSON.stringify(error);
        try { if (statusElSave) statusElSave.textContent = '❌ ' + googleError; } catch(e) {}
        try { alert('❌ Failed to save attendance to Google Sheets: ' + googleError); } catch(e) {}
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
        console.log('Fetching attendance from sheet:', sheetName, 'for class:', className);
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: `${sheetName}!A:Z`
        });

        const values = response.result.values;
        console.log('Raw sheet data for', sheetName, ':', values);
        if (!values || values.length === 0) {
            console.log('No data found in Google Sheets for', sheetName);
            return null;
        }

        const attendanceGrid = sheetValuesToAttendanceGrid(values);
        console.log('Processed attendance grid from Google Sheets:', attendanceGrid);
        return attendanceGrid;
    } catch (error) {
        console.error('Failed to fetch from Google Sheets for', className, ':', error);
        return null;
    }
}



async function loadDashboardData() {
    const dateConfigs = getAttendanceDateConfigs();
    const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    const dashboardDateKey = dateConfigs.some(config => config.key === todayKey) ? todayKey : dateConfigs[0]?.key;

    const setDashboardText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    const setDashboardMessage = (id, message) => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = `<p style="color:#999;">${message}</p>`;
    };

    if (!googleInitialized || !googleAuthToken) {
        setDashboardText('total-students-count', 'Connect Google first');
        setDashboardText('total-teachers-count', 'Connect Google first');
        setDashboardText('total-directors-count', 'Connect Google first');
        setDashboardText('today-attendance-count', 'Connect Google first');
        const attendanceBody = document.getElementById('attendance-summary-body');
        if (attendanceBody) attendanceBody.innerHTML = `<tr><td colspan="${3 + dateConfigs.length}">Connect Google first</td></tr>`;
        setDashboardMessage('top-girls-students-list', 'Connect Google first');
        setDashboardMessage('top-boys-students-list', 'Connect Google first');
        setDashboardMessage('group-points-list', 'Connect Google first');
        const groupPointsCards = document.getElementById('group-points-cards');
        if (groupPointsCards) groupPointsCards.innerHTML = '<p style="color:#999;">Connect Google first</p>';
        return;
    }

    try {
        await ensureClassSheetRewardsMigrated();

        const approvedUsers = await fetchApprovedUsersFromSheets();
        const rows = (approvedUsers || []).map(user => [
            user.fullName,
            user.role,
            user.gmail,
            user.password,
            user.class,
            user.approvedDate,
            user.group,
            user.points
        ]);
        let students = 0;
        let teachers = 0;
        let directors = 0;
        const studentLeaderboard = [];
        const groupTotals = new Map(GROUP_OPTIONS.map(group => [group, 0]));
        const attendanceSummaries = [];
        let todayAttendance = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.length >= 2) {
                const role = row[1]?.toString().toLowerCase();
                if (role === 'student') students++;
                else if (role === 'teacher' || role === 'teacher_view') teachers++;
                else if (role === 'director') directors++;
            }
        }

        for (const className of CLASS_LIST) {
            // Teachers' attendance shall not be displayed except to directors
            if (className.toLowerCase().startsWith('teachers') && currentRole !== 'director') {
                continue;
            }

            const classLabel = getAttendanceSheetName(className);
            const emptyDayCounts = Object.fromEntries(dateConfigs.map(config => [config.key, 0]));

            try {
                const sheetResponse = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: GOOGLE_SPREADSHEET_ID,
                    range: `${classLabel}!A:Z`
                });

                const values = sheetResponse.result.values || [];
                const grid = sheetValuesToAttendanceGrid(values);
                const dayPresentCounts = { ...emptyDayCounts };

                grid.forEach(row => {
                    const fullName = (row.name || '').trim();
                    if (!fullName) return;

                    const gender = normalizeGenderValue(row.gender);
                    const group = row.group || '';
                    const points = normalizePointsValue(row.points || 0);

                    // Exclude teachers class from leaderboard
                    if (!classLabel.toLowerCase().startsWith('teachers')) {
                        studentLeaderboard.push({ fullName, className: classLabel, gender, group, points });
                        if (!groupTotals.has(group)) groupTotals.set(group, 0);
                        groupTotals.set(group, groupTotals.get(group) + points);
                    }

                    dateConfigs.forEach(config => {
                        if (row.attendance?.[config.key] === 'Present') {
                            dayPresentCounts[config.key] += 1;
                        }
                    });
                });

                attendanceSummaries.push({
                    classLabel,
                    rollCount: grid.length,
                    todayPresent: dashboardDateKey ? (dayPresentCounts[dashboardDateKey] || 0) : 0,
                    dayPresentCounts
                });

                todayAttendance += dashboardDateKey ? (dayPresentCounts[dashboardDateKey] || 0) : 0;
            } catch (error) {
                console.log(`Sheet ${classLabel} not found or empty while loading dashboard`, error);
                attendanceSummaries.push({
                    classLabel,
                    rollCount: 0,
                    todayPresent: 0,
                    dayPresentCounts: emptyDayCounts
                });
            }
        }

        setDashboardText('total-students-count', students);
        setDashboardText('total-teachers-count', teachers);
        setDashboardText('total-directors-count', directors);
        setDashboardText('today-attendance-count', todayAttendance);

        renderDashboardAttendanceSummary(attendanceSummaries, dateConfigs);
        renderDashboardPoints(studentLeaderboard, groupTotals);
        showDashboardTab(dashboardActiveTab);
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        setDashboardText('total-students-count', 'Error');
        setDashboardText('total-teachers-count', 'Error');
        setDashboardText('total-directors-count', 'Error');
        setDashboardText('today-attendance-count', 'Error');

        const attendanceBody = document.getElementById('attendance-summary-body');
        if (attendanceBody) {
            attendanceBody.innerHTML = `<tr><td colspan="${3 + dateConfigs.length}">Error loading attendance data</td></tr>`;
        }

        const topGirlsList = document.getElementById('top-girls-students-list');
        const topBoysList = document.getElementById('top-boys-students-list');
        const groupPointsList = document.getElementById('group-points-list');
        const groupPointsCards = document.getElementById('group-points-cards');
        if (topGirlsList) topGirlsList.innerHTML = '<p style="color: red;">Error loading girls student data</p>';
        if (topBoysList) topBoysList.innerHTML = '<p style="color: red;">Error loading boys student data</p>';
        if (groupPointsList) groupPointsList.innerHTML = '<p style="color: red;">Error loading group points</p>';
        if (groupPointsCards) groupPointsCards.innerHTML = '<p style="color: red;">Error loading group points</p>';
    }
}

async function ensureClassSheetRewardsMigrated() {
    if (classSheetRewardsMigrationDone) {
        return true;
    }
    if (classSheetRewardsMigrationPromise) {
        return classSheetRewardsMigrationPromise;
    }
    if (!googleInitialized || !googleAuthToken) {
        return false;
    }

    classSheetRewardsMigrationPromise = (async () => {
        try {
            const approvedUsers = await fetchApprovedUsersFromSheets();
            if (!approvedUsers || approvedUsers.length === 0) {
                classSheetRewardsMigrationDone = true;
                return true;
            }

            const dateConfigs = getAttendanceDateConfigs();
            const emptyDates = dateConfigs.map(() => '');
            const groupColIndex = 2 + dateConfigs.length; // A + Gender + dates + Group
            const pointsColIndex = groupColIndex + 1;
            const groupCol = columnLetter(groupColIndex);
            const pointsCol = columnLetter(pointsColIndex);

            for (const className of CLASS_LIST) {
                const students = approvedUsers.filter(user => user.role === 'student' && user.class === className);
                if (!students.length) {
                    continue;
                }

                const sheetName = getAttendanceSheetName(className);
                let values = [];

                try {
                    const sheetResp = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: GOOGLE_SPREADSHEET_ID,
                        range: `${sheetName}!A:Z`
                    });
                    values = sheetResp.result.values || [];
                } catch (error) {
                    console.log(`Skipping migration for ${sheetName}: sheet not found or inaccessible`);
                    continue;
                }

                const nameToRow = new Map();
                for (let i = 1; i < values.length; i++) {
                    const rowName = normalizeStudentName(values[i]?.[0]);
                    if (rowName) {
                        nameToRow.set(rowName.toLowerCase(), i + 1);
                    }
                }

                for (const student of students) {
                    const fullName = normalizeStudentName(student.fullName);
                    if (!fullName) {
                        continue;
                    }

                    const key = fullName.toLowerCase();
                    const groupVal = student.group || '';
                    const pointsVal = String(normalizePointsValue(student.points));

                    if (nameToRow.has(key)) {
                        const rowNumber = nameToRow.get(key);
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: GOOGLE_SPREADSHEET_ID,
                            range: `${sheetName}!${groupCol}${rowNumber}:${pointsCol}${rowNumber}`,
                            valueInputOption: 'RAW',
                            resource: { values: [[groupVal, pointsVal]] }
                        });
                    } else {
                        await gapi.client.sheets.spreadsheets.values.append({
                            spreadsheetId: GOOGLE_SPREADSHEET_ID,
                            range: `${sheetName}!A:Z`,
                            valueInputOption: 'RAW',
                            resource: {
                                values: [[fullName, '', ...emptyDates, groupVal, pointsVal]]
                            }
                        });
                    }
                }
            }

            classSheetRewardsMigrationDone = true;
            console.log('Class sheet rewards migration completed');
            return true;
        } catch (error) {
            console.error('Class sheet rewards migration failed:', error);
            return false;
        } finally {
            classSheetRewardsMigrationPromise = null;
        }
    })();

    return classSheetRewardsMigrationPromise;
}

// ==================== ADD POINTS SECTION ====================

function showAddPoints() {
    // Check if user is logged in and is a teacher or director
    if (!currentGoogleUser || !currentGoogleUser.email) {
        alert('❌ Please connect Google first.');
        return;
    }

    if (!googleInitialized || !googleAuthToken) {
        alert('❌ Google not connected. Please connect Google first.');
        return;
    }

    loginSection.style.display = 'none';
    addPointsSection.style.display = 'block';
    updateAddPointsUI();
}

function populateAddPointsClassSelector() {
    const selector = document.getElementById('add-points-class');
    if (!selector) return;
    
    // Clear existing options except the first placeholder
    while (selector.options.length > 1) {
        selector.remove(1);
    }
    
    // Add class options
    CLASS_LIST.forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = className.charAt(0).toUpperCase() + className.slice(1);
        selector.appendChild(option);
    });
}

async function loadStudentsForAddPoints() {
    const classSelector = document.getElementById('add-points-class');
    const studentSelector = document.getElementById('add-points-student');
    const selectedClass = classSelector.value;
    
    if (!selectedClass) {
        studentSelector.innerHTML = '<option value="">-- Select Student --</option>';
        return;
    }
    
    try {
        const students = await getClassStudentRewards(selectedClass);
        
        // Clear student selector
        studentSelector.innerHTML = '<option value="">-- Select Student --</option>';
        
        if (students && students.length > 0) {
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.fullName;
                option.textContent = `${student.fullName} (${student.points || 0} pts)`;
                studentSelector.appendChild(option);
            });
        } else {
            studentSelector.innerHTML = '<option value="">-- No students found --</option>';
        }
    } catch (error) {
        console.error('Failed to load students:', error);
        studentSelector.innerHTML = '<option value="">-- Error loading students --</option>';
    }
}

async function submitAddPoints(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    
    const selectedClass = document.getElementById('add-points-class').value;
    const selectedStudent = document.getElementById('add-points-student').value;
    const pointsAmount = normalizePointsValue(document.getElementById('add-points-amount').value);
    
    if (!selectedClass || !selectedStudent || pointsAmount <= 0) {
        alert('❌ Please fill in all fields correctly.');
        return;
    }
    
    // Verify user is authorized (teacher or director)
    const userEmail = currentGoogleUser?.email || '';
    try {
        const user = await fetchApprovedUserFromSheets(userEmail);
        const userRole = (user?.role || '').toLowerCase();
        
        if (userRole !== 'director' && userRole !== 'teacher') {
            alert('❌ Only teachers and directors can add points.');
            return;
        }
        
        // Get current student data
        const students = await getClassStudentRewards(selectedClass);
        const student = students.find(s => s.fullName === selectedStudent);
        
        if (!student) {
            alert('❌ Student not found.');
            return;
        }
        
        // Calculate new points
        const oldPoints = normalizePointsValue(student.points || 0);
        const newPoints = oldPoints + pointsAmount;
        
        // Update student points
        student.points = newPoints;
        
        // Log the points addition
        const updatedBy = currentUser?.fullName || currentGoogleUser?.name || 'Unknown';
        addPointsLogEntry(selectedClass, selectedStudent, pointsAmount, updatedBy);
        
        // Update Google Sheets if available
        if (!googleInitialized || !googleAuthToken) {
            alert('❌ Google Sheets is required to save points. Please connect Google first.');
            return;
        }

        try {
            const saved = await updateClassStudentRewards(selectedClass, selectedStudent, {
                points: newPoints,
                fullName: selectedStudent,
                className: selectedClass
            }, userEmail);

            if (!saved) {
                alert('❌ Could not save points to Google Sheets. No local copy was stored.');
                return;
            }

            saveStudentRewardsCache(selectedClass, students);
        } catch (err) {
            console.warn('Failed to update Google Sheets:', err);
            alert('❌ Could not save points to Google Sheets. No local copy was stored.');
            return;
        }
        
        // Reset form
        document.getElementById('add-points-class').value = '';
        document.getElementById('add-points-student').value = '';
        document.getElementById('add-points-amount').value = '';
        document.getElementById('add-points-student').innerHTML = '<option value="">-- Select Student --</option>';
        
        alert(`✓ Added ${pointsAmount} points to ${selectedStudent}!\nNew total: ${newPoints} points`);
        
        // Refresh dashboard if visible
        refreshDashboardIfVisible();

        // Keep the dashboard data cache fresh even if the dashboard is currently hidden
        if (googleInitialized && googleAuthToken) {
            await loadDashboardData();
        }
        
    } catch (error) {
        console.error('Failed to add points:', error);
        alert('❌ Error adding points. Please try again.');
    }
}

function updateAddPointsUI() {
    const addPointsGoogleAccount = document.getElementById('add-points-google-account');
    if (addPointsGoogleAccount) {
        const googleLabel = getConnectedGoogleLabel();
        if (currentGoogleUser && currentGoogleUser.email) {
            addPointsGoogleAccount.textContent = `Logged in as ${googleLabel}`;
            addPointsGoogleAccount.style.backgroundColor = '#e8f5e9';
            addPointsGoogleAccount.style.color = '#2e7d32';
            addPointsGoogleAccount.style.borderColor = '#81c784';
        }
    }
}
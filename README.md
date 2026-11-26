# SyllabusTrack

A standalone student syllabus and exam-progress tracker built with HTML5, CSS3 and vanilla JavaScript. No frameworks, backend or external APIs.

## Features
- Dashboard: total subjects/units/topics, completed/pending topics, overall progress, subject cards, recently updated subjects, upcoming exams
- Subjects: add, edit, delete (with confirmation), search by name/code, filter by semester and status
- Units and topics per subject with add/edit/delete and completion checkboxes
- Exam Planner: upcoming and overdue exams from subject records (local calendar dates)
- Light/dark theme (persisted), responsive layout with collapsible mobile menu
- JSON export, validated JSON import, Clear All Data

## Progress rules
Progress = completed topics / total topics × 100, rounded. Overall progress counts every topic once (not an average of subject percentages). Zero topics = 0% and "Not Started".

## Folder structure
```
SyllabusTrack/
├── index.html
├── css/style.css
├── js/script.js
└── README.md
```

## Running
Open `index.html` in a modern browser, or serve the folder:
```
cd SyllabusTrack
python3 -m http.server 8000   # then visit http://localhost:8000
```

## LocalStorage
- `syllabustrack:data` holds all subjects, units, topics, timestamps and the schema version.
- `syllabustrack:theme` holds the theme.
- Unreadable data is copied to `syllabustrack:data:corrupt-backup` and the app starts empty; sample data is never inserted.
- Data stays in this browser on this device and does not sync.

## Export / Import
Settings → Export JSON downloads `syllabustrack-backup-YYYY-MM-DD.json`. Import validates structure, schema version, IDs, relationships, statuses and dates, asks for confirmation, and replaces data only if everything is valid. Invalid files are rejected and existing data is untouched.

## Known limitations
- Clearing browser site data deletes your data; export backups regularly.
- No cross-device sync, no undo, topics cannot be reordered.
- Not yet verified in a real browser by the author (see delivery report).

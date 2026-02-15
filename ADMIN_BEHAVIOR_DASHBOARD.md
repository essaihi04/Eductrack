# Admin Behavioral Dashboard - Implementation Guide

## Overview
A comprehensive read-only dashboard for admins to monitor student behavior across all classes, focusing on discipline (dormance) and phone usage without entering pedagogical details.

## Features Implemented

### 1. Backend API Endpoints (`/api/admin/behavior/*`)

#### GET `/api/admin/behavior/daily?date=YYYY-MM-DD`
Returns daily behavioral metrics for a specific date:
- **Discipline metrics**: % Correct, % Moyen, % Perturbateur
- **Phone usage metrics**: % Non utilisé, % Avertissement, % Abusif
- **Class-level breakdown**: Metrics per class

#### GET `/api/admin/behavior/classes?date=YYYY-MM-DD`
Returns behavioral metrics by class:
- Class name and level
- Discipline distribution (correct, moyen, perturbateur)
- Phone usage distribution (non utilisé, avertissement, abusif)
- Dominant status for quick visual identification

#### GET `/api/admin/behavior/trends?days=7|30`
Returns trend data over 7 or 30 days:
- Daily discipline percentage (perturbateur incidents)
- Daily phone usage percentage (abusif incidents)
- Used for line charts showing evolution

#### GET `/api/admin/behavior/alerts?date=YYYY-MM-DD`
Returns intelligent alerts for the day:
- Phone usage > 30% triggers alert
- Sleeping/dormance > 20% triggers alert
- Each alert includes: title, level (info/attention), description, class reference

### 2. Frontend Dashboard Component

**File**: `frontend/src/pages/dashboards/BehaviorDashboard.jsx`

#### Sections:

**Header & Context**
- Date selector (default: today)
- School name
- Total students tracked
- Active classes count

**KPI Cards (Indicators)**
- Discipline: 🟢 Correct | 🟡 Moyen | 🔴 Perturbateur
- Phone Usage: 🟢 Non utilisé | 🟡 Avertissement | 🔴 Abusif
- Each card shows percentage and optional trend (↑ ↓)

**Alerts Section**
- Displays intelligent alerts from backend
- Color-coded by severity (yellow for attention)
- Shows percentage and class name
- "Voir détails" button for drill-down

**Class View Table**
- Rows: Classes
- Columns: Class name, Discipline status, Phone status, Actions
- Click to expand and see detailed breakdown
- Expandable detail panel with:
  - Discipline distribution (progress bars)
  - Phone usage distribution (progress bars)
  - Percentages for each category

**Trends Section**
- Toggle between 7 days and 30 days
- Two charts:
  - Discipline evolution (% perturbateur over time)
  - Phone usage evolution (% abusif over time)
- Simple horizontal progress bars per day

### 3. Navigation Integration

**Sidebar Update** (`frontend/src/components/Layout/Sidebar.jsx`)
- Added "Comportement" menu item for admins
- Path: `/behavior`
- Icon: BarChart3

**Routes** (`frontend/src/App.jsx`)
- Added route: `<Route path="behavior" element={<BehaviorDashboard />} />`
- Imported BehaviorDashboard component

## Data Model

### Tracking Data Used
- `session_tracking.sleeping` (boolean) → Discipline metric
- `session_tracking.phone_use` (boolean) → Phone usage metric
- `sessions.date` → Date filtering
- `sessions.class_id` → Class grouping
- `classes.name`, `classes.level` → Class identification

### Calculation Logic

**Discipline Score**
- Correct: sleeping = false
- Perturbateur: sleeping = true
- Moyen: 0% (not currently tracked, reserved for future)

**Phone Usage Score**
- Non utilisé: phone_use = false
- Abusif: phone_use = true
- Avertissement: 0% (not currently tracked, reserved for future)

**Alerts**
- Phone alert: if (phone_abusif / total) > 30%
- Sleeping alert: if (sleeping / total) > 20%

## UX Principles Applied

✅ **Readable in <30 seconds**: KPI cards show key metrics immediately
✅ **Aggregated data**: No individual student names, class-level only
✅ **Behavior focus**: Only discipline and phone usage
✅ **Simple interface**: Color-coded status indicators (🟢🟡🔴)
✅ **Responsive**: Grid layouts adapt to mobile/tablet/desktop
✅ **Read-only**: No admin input fields, pure monitoring

## Testing Checklist

- [ ] Backend API endpoints return correct data structure
- [ ] Date filtering works (today, past dates)
- [ ] Class metrics aggregate correctly
- [ ] Alerts trigger at correct thresholds (30% phone, 20% sleeping)
- [ ] Trends display correctly for 7 and 30 days
- [ ] Frontend loads without errors
- [ ] Date picker updates all sections
- [ ] Class detail expansion works smoothly
- [ ] Responsive design on mobile/tablet
- [ ] No student names visible anywhere

## Future Enhancements

1. **Export functionality**: Download daily/weekly reports as PDF
2. **Comparison**: Compare current week vs previous week
3. **Predictive alerts**: Machine learning to predict behavior issues
4. **Class ranking**: Rank classes by behavior score
5. **Teacher notifications**: Auto-notify teachers of alerts
6. **Historical analysis**: Trend analysis over months
7. **Customizable thresholds**: Admin can set alert thresholds
8. **Drill-down to sessions**: See which sessions caused alerts

## API Response Examples

### Daily Metrics Response
```json
{
  "date": "2024-12-24",
  "discipline": {
    "correct": "75.0",
    "moyen": "0.0",
    "perturbateur": "25.0"
  },
  "phone": {
    "nonUtilise": "85.0",
    "avertissement": "0.0",
    "abusif": "15.0"
  },
  "classMetrics": {
    "class-id-1": {
      "discipline": { "correct": 8, "moyen": 0, "perturbateur": 2 },
      "phone": { "nonUtilise": 9, "avertissement": 0, "abusif": 1 },
      "count": 10
    }
  }
}
```

### Alerts Response
```json
[
  {
    "id": "phone-class-id-1",
    "title": "Usage abusif du téléphone - 6ème A",
    "level": "attention",
    "description": "35% des élèves ont utilisé le téléphone",
    "classId": "class-id-1"
  }
]
```

## Notes

- All times are in server timezone (adjust as needed)
- Percentages are rounded to 1 decimal place
- Empty data returns 0% for all metrics
- Dashboard is read-only (no modifications possible)
- Data is real-time from session_tracking table

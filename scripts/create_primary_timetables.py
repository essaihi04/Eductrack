from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "emplois-du-temps-ecole-principale"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT = 2600, 1800
MARGIN = 95
TABLE_TOP = 430
TABLE_BOTTOM = 1640
TIME_COL = 280
DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]
TIMES = [
    "08:00 - 09:00",
    "09:00 - 10:00",
    "10:15 - 11:15",
    "11:15 - 12:15",
    "14:00 - 15:00",
    "15:00 - 16:00",
]

BASE = {
    "Lundi": ["Mathématiques", "Arabe", "Français", "Sciences", "Anglais", "EPS"],
    "Mardi": ["Français", "Mathématiques", "Arabe", "Histoire-Géographie", "Éducation islamique", "Informatique"],
    "Mercredi": ["Arabe", "Français", "Mathématiques", "Sciences", "Anglais", "EPS"],
    "Jeudi": ["Mathématiques", "Arabe", "Français", "Histoire-Géographie", "Éducation islamique", "Informatique"],
    "Vendredi": ["Français", "Mathématiques", "Arabe", "Mathématiques", "Français", "Arabe"],
}

TEST_TEACHERS = {
    "Mathématiques": "Prof Test Mathématiques",
    "Arabe": "Prof Test Arabe",
    "Français": "Prof Test Français",
    "Sciences": "Zouhair ESSAIHI",
    "Anglais": "Prof Test Anglais",
    "EPS": "Prof Test EPS",
    "Éducation islamique": "Prof Test Éducation islamique",
}

DEMO_TEACHERS = {
    "Mathématiques": "Prof Démo Mathématiques",
    "Arabe": "Prof Démo Arabe",
    "Français": "Prof Démo Français",
    "Sciences": "Zouhair ESSAIHI",
    "Anglais": "Prof Test Anglais",
    "EPS": "Prof Test EPS",
    "Éducation islamique": "Prof Test Éducation islamique",
}

SUBJECT_COLORS = {
    "Mathématiques": "#E8F1FF",
    "Arabe": "#E8F8F0",
    "Français": "#F4EAFF",
    "Sciences": "#E6F8FA",
    "Anglais": "#FFF1E3",
    "EPS": "#FFE8EE",
    "Histoire-Géographie": "#FFF8D9",
    "Éducation islamique": "#EAF8E3",
    "Informatique": "#E9EDF8",
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


F_TITLE = font(72, True)
F_SCHOOL = font(42, True)
F_META = font(32)
F_HEAD = font(32, True)
F_TIME = font(29, True)
F_SUBJECT = font(30, True)
F_TEACHER = font(23)
F_FOOTER = font(23)


def centered(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, fnt, fill: str) -> None:
    left, top, right, bottom = box
    bbox = draw.textbbox((0, 0), text, font=fnt)
    x = left + (right - left - (bbox[2] - bbox[0])) / 2
    y = top + (bottom - top - (bbox[3] - bbox[1])) / 2 - bbox[1]
    draw.text((x, y), text, font=fnt, fill=fill)


def schedule_for(offset: int) -> dict[str, list[str]]:
    result = {}
    for day, subjects in BASE.items():
        result[day] = subjects[offset:] + subjects[:offset]
    return result


def rounded_cell(draw: ImageDraw.ImageDraw, box, fill, outline="#CBD5E1", radius=16, width=3):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def render(class_name: str, offset: int, teachers: dict[str, str], filename: str) -> Path:
    img = Image.new("RGB", (WIDTH, HEIGHT), "#F8FAFC")
    draw = ImageDraw.Draw(img)

    # Header band
    draw.rounded_rectangle((MARGIN, 62, WIDTH - MARGIN, 360), radius=34, fill="#FFFFFF", outline="#D8E2EE", width=3)
    draw.rounded_rectangle((MARGIN, 62, MARGIN + 26, 360), radius=13, fill="#0F766E")
    draw.text((MARGIN + 72, 94), "EMPLOI DU TEMPS HEBDOMADAIRE", font=F_TITLE, fill="#12304A")
    draw.text((MARGIN + 74, 203), "École Principale", font=F_SCHOOL, fill="#0F766E")
    draw.text((MARGIN + 74, 275), f"Classe : {class_name}", font=F_META, fill="#334155")
    meta = "Niveau : 5ème Année Primaire   •   Année scolaire : 2025/2026"
    mb = draw.textbbox((0, 0), meta, font=F_META)
    draw.text((WIDTH - MARGIN - (mb[2] - mb[0]) - 52, 275), meta, font=F_META, fill="#334155")

    table_left = MARGIN
    table_right = WIDTH - MARGIN
    header_h = 105
    row_h = (TABLE_BOTTOM - TABLE_TOP - header_h) // len(TIMES)
    day_w = (table_right - table_left - TIME_COL) // len(DAYS)

    # Table headers
    rounded_cell(draw, (table_left, TABLE_TOP, table_left + TIME_COL - 8, TABLE_TOP + header_h), "#12304A", "#12304A", 18, 2)
    centered(draw, (table_left, TABLE_TOP, table_left + TIME_COL - 8, TABLE_TOP + header_h), "Horaires", F_HEAD, "#FFFFFF")
    for i, day in enumerate(DAYS):
        x1 = table_left + TIME_COL + i * day_w
        x2 = table_right if i == len(DAYS) - 1 else x1 + day_w - 8
        rounded_cell(draw, (x1, TABLE_TOP, x2, TABLE_TOP + header_h), "#0F766E", "#0F766E", 18, 2)
        centered(draw, (x1, TABLE_TOP, x2, TABLE_TOP + header_h), day, F_HEAD, "#FFFFFF")

    schedule = schedule_for(offset)
    for row, time in enumerate(TIMES):
        y1 = TABLE_TOP + header_h + row * row_h + 8
        y2 = TABLE_TOP + header_h + (row + 1) * row_h
        rounded_cell(draw, (table_left, y1, table_left + TIME_COL - 8, y2), "#E8EEF5")
        centered(draw, (table_left, y1, table_left + TIME_COL - 8, y2), time, F_TIME, "#12304A")

        for col, day in enumerate(DAYS):
            subject = schedule[day][row]
            teacher = teachers.get(subject, "")
            x1 = table_left + TIME_COL + col * day_w
            x2 = table_right if col == len(DAYS) - 1 else x1 + day_w - 8
            rounded_cell(draw, (x1, y1, x2, y2), SUBJECT_COLORS[subject])

            subject_bbox = draw.textbbox((0, 0), subject, font=F_SUBJECT)
            subject_y = y1 + 39
            draw.text((x1 + (x2 - x1 - (subject_bbox[2] - subject_bbox[0])) / 2, subject_y), subject, font=F_SUBJECT, fill="#172033")
            if teacher:
                teacher_bbox = draw.textbbox((0, 0), teacher, font=F_TEACHER)
                teacher_x = x1 + (x2 - x1 - (teacher_bbox[2] - teacher_bbox[0])) / 2
                draw.text((teacher_x, subject_y + 61), teacher, font=F_TEACHER, fill="#4B5563")

    footer = "Chaque case indique la matière puis le professeur • Samedi : sans cours"
    centered(draw, (MARGIN, 1668, WIDTH - MARGIN, 1745), footer, F_FOOTER, "#64748B")

    path = OUT_DIR / filename
    img.save(path, format="PNG", optimize=True, dpi=(180, 180))
    return path


def verify_conflicts() -> None:
    schedules = [schedule_for(i) for i in range(3)]
    maps = [TEST_TEACHERS, TEST_TEACHERS, DEMO_TEACHERS]
    for day in DAYS:
        for slot in range(len(TIMES)):
            assigned = []
            for schedule, teacher_map in zip(schedules, maps):
                teacher = teacher_map.get(schedule[day][slot])
                if teacher:
                    assigned.append(teacher)
            if len(assigned) != len(set(assigned)):
                raise RuntimeError(f"Conflit professeur: {day}, créneau {slot + 1}: {assigned}")


if __name__ == "__main__":
    verify_conflicts()
    outputs = [
        render("test 1", 0, TEST_TEACHERS, "emploi-du-temps-test-1.png"),
        render("testtt", 1, TEST_TEACHERS, "emploi-du-temps-testtt.png"),
        render("CLASSE DÉMO", 2, DEMO_TEACHERS, "emploi-du-temps-classe-demo.png"),
    ]
    for output in outputs:
        print(output)

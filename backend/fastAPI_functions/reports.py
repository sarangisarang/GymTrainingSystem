"""PDF report generator (Issue #8).

Two endpoints — `/reports/weekly` and `/reports/monthly` — return a PDF built
with reportlab containing total volume, top exercises, new personal records and
streak info for the current ISO-week / calendar month.
"""

from __future__ import annotations

import io
from datetime import date, timedelta
from calendar import monthrange

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .security import get_current_user
from data_base_sql.database import get_db
from data_base_sql.crud import get_report_period_data


router = APIRouter(prefix="/reports", tags=["Reports"])


INDIGO = colors.HexColor("#6366f1")
INDIGO_DARK = colors.HexColor("#3730a3")
NEUTRAL_50 = colors.HexColor("#fafafa")
NEUTRAL_200 = colors.HexColor("#e5e5e5")
NEUTRAL_500 = colors.HexColor("#737373")
NEUTRAL_700 = colors.HexColor("#404040")
NEUTRAL_900 = colors.HexColor("#171717")


def _build_pdf(period_label: str, user_label: str, data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Gym Tracker Report - {period_label}",
        author="Gym Tracker",
    )

    base = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1",
        parent=base["Heading1"],
        textColor=NEUTRAL_900,
        fontSize=22,
        leading=26,
        spaceAfter=2,
    )
    h2 = ParagraphStyle(
        "h2",
        parent=base["Heading2"],
        textColor=NEUTRAL_900,
        fontSize=13,
        leading=16,
        spaceBefore=10,
        spaceAfter=6,
    )
    sub = ParagraphStyle(
        "sub",
        parent=base["Normal"],
        textColor=NEUTRAL_500,
        fontSize=10,
        leading=13,
    )
    body = ParagraphStyle(
        "body",
        parent=base["Normal"],
        textColor=NEUTRAL_900,
        fontSize=10,
        leading=13,
    )
    muted = ParagraphStyle(
        "muted",
        parent=body,
        textColor=NEUTRAL_500,
        fontSize=9,
    )

    story: list = []

    story.append(Paragraph("Gym Tracker", h1))
    story.append(Paragraph(f"Trainings-Report &middot; {period_label}", sub))
    story.append(Paragraph(f"Sportler: {user_label}", sub))
    story.append(Spacer(1, 10))

    stat_cells = [
        [
            Paragraph(str(data["completed_count"]), ParagraphStyle("sv", parent=body, fontSize=16, textColor=INDIGO_DARK, alignment=1)),
            Paragraph(f"{data['total_volume_kg']:,.0f} kg".replace(",", "."), ParagraphStyle("sv", parent=body, fontSize=16, textColor=INDIGO_DARK, alignment=1)),
            Paragraph(str(data["current_streak"]), ParagraphStyle("sv", parent=body, fontSize=16, textColor=INDIGO_DARK, alignment=1)),
            Paragraph(str(data["best_streak"]), ParagraphStyle("sv", parent=body, fontSize=16, textColor=INDIGO_DARK, alignment=1)),
        ],
        [
            Paragraph("Workouts", ParagraphStyle("sl", parent=muted, alignment=1)),
            Paragraph("Gesamtvolumen", ParagraphStyle("sl", parent=muted, alignment=1)),
            Paragraph("Aktuelle Streak", ParagraphStyle("sl", parent=muted, alignment=1)),
            Paragraph("Beste Streak", ParagraphStyle("sl", parent=muted, alignment=1)),
        ],
    ]
    stat_table = Table(stat_cells, colWidths=[42 * mm] * 4)
    stat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NEUTRAL_50),
        ("BOX", (0, 0), (-1, -1), 0.5, NEUTRAL_200),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, NEUTRAL_200),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(stat_table)

    story.append(Paragraph("Top-Uebungen nach Volumen", h2))
    if data["top_exercises"]:
        rows = [["#", "Uebung", "Volumen (kg)"]]
        for i, ex in enumerate(data["top_exercises"], 1):
            rows.append([str(i), ex["name"], f"{ex['volume_kg']:,.0f}".replace(",", ".")])
        t = Table(rows, colWidths=[14 * mm, 110 * mm, 50 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, NEUTRAL_50]),
            ("GRID", (0, 0), (-1, -1), 0.25, NEUTRAL_200),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("Keine abgeschlossenen Workouts in diesem Zeitraum.", muted))

    story.append(Paragraph("Neue Personal Records", h2))
    if data["new_prs"]:
        rows = [["Uebung", "Vorher (kg)", "Neu (kg)"]]
        for pr in data["new_prs"]:
            prev = f"{pr['previous_kg']:.1f}" if pr["previous_kg"] is not None else "-"
            rows.append([pr["name"], prev, f"{pr['weight_kg']:.1f}"])
        t = Table(rows, colWidths=[100 * mm, 37 * mm, 37 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (-1, 1), (-1, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (-1, 1), (-1, -1), INDIGO_DARK),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, NEUTRAL_50]),
            ("GRID", (0, 0), (-1, -1), 0.25, NEUTRAL_200),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("Keine neuen PRs im Zeitraum.", muted))

    story.append(Paragraph("Workouts im Zeitraum", h2))
    if data["workouts"]:
        rows = [["Datum", "Uebungen", "Saetze", "Dauer", "Volumen (kg)"]]
        for w in data["workouts"]:
            dur = f"{w['duration_min']:.0f} min" if w["duration_min"] is not None else "-"
            rows.append([
                w["date"],
                str(w["exercises"]),
                str(w["sets"]),
                dur,
                f"{w['volume_kg']:,.0f}".replace(",", "."),
            ])
        t = Table(rows, colWidths=[34 * mm, 32 * mm, 26 * mm, 30 * mm, 52 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, NEUTRAL_50]),
            ("GRID", (0, 0), (-1, -1), 0.25, NEUTRAL_200),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("Keine Workouts in diesem Zeitraum.", muted))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        f"Erstellt am {date.today().isoformat()} &middot; Zeitraum {data['start_date']} bis {data['end_date']}",
        muted,
    ))

    doc.build(story)
    return buf.getvalue()


def _streaming_pdf(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/weekly")
def api_weekly_report(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    today = date.today()
    start = today - timedelta(days=today.weekday())  # Monday
    end = start + timedelta(days=6)                   # Sunday
    iso = today.isocalendar()
    period_label = f"KW {iso.week:02d} / {iso.year}"
    user_label = current_user.name or current_user.email
    data = get_report_period_data(db, current_user.id, start, end)
    pdf = _build_pdf(period_label, user_label, data)
    filename = f"GymTracker-Weekly-{iso.year}-W{iso.week:02d}.pdf"
    return _streaming_pdf(pdf, filename)


@router.get("/monthly")
def api_monthly_report(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    today = date.today()
    start = date(today.year, today.month, 1)
    end = date(today.year, today.month, monthrange(today.year, today.month)[1])
    months_de = [
        "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
    ]
    period_label = f"{months_de[today.month - 1]} {today.year}"
    user_label = current_user.name or current_user.email
    data = get_report_period_data(db, current_user.id, start, end)
    pdf = _build_pdf(period_label, user_label, data)
    filename = f"GymTracker-Monthly-{today.year}-{today.month:02d}.pdf"
    return _streaming_pdf(pdf, filename)

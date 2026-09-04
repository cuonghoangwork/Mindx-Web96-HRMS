/**
 * AttendanceTrendChart — HRMS Design System
 *
 * Displays attendance trend for the last 7 days using pure SVG.
 * No additional libraries required.
 *
 * Props:
 *   attendance  — array from StoreContext (required)
 *   totalStaff  — total staff count (to calculate % when date data is missing)
 *   height      — SVG height, default 160
 *   showLegend  — show legend, default true
 *   showTooltip — show hover tooltip, default true
 *
 * Usage:
 *   import AttendanceTrendChart from "../components/AttendanceTrendChart";
 *   <AttendanceTrendChart attendance={attendance} totalStaff={employees.length} />
 */

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

function formatDateLabel(dateStr, dayLabels) {
  const d = new Date(dateStr);
  return `${dayLabels[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateShort(dateStr, dayLabels) {
  const d = new Date(dateStr);
  return dayLabels[d.getDay()];
}

/* Determine Late status from checkIn (mirrors Attendance.jsx logic) */
function resolveStatus(record) {
  let status = record.status;
  if (record.checkIn && status === "Present") {
    const [hours] = record.checkIn.split(":").map(Number);
    if (hours >= 9) status = "Late";
  }
  return status;
}

/* Generate last 7 days from real data + fallback mock */
function buildChartData(attendance, totalStaff, dayLabels) {
  const grouped = {};
  attendance.forEach((r) => {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  });

  const realDates = Object.keys(grouped).sort();

  // Build 7 consecutive days — use real dates if available, otherwise mock
  const result = [];
  const baseDate = realDates.length > 0
    ? new Date(realDates[realDates.length - 1])
    : new Date("2026-01-15");

  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const records = grouped[key] || [];

    let present = 0, late = 0, leave = 0, absent = 0;

    if (records.length > 0) {
      records.forEach((r) => {
        const s = resolveStatus(r);
        if (s === "Present") present++;
        else if (s === "Late") late++;
        else if (s === "On Leave") leave++;
        else absent++;
      });
    } else {
      // Reasonable mock data based on day of week
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const base = isWeekend ? 0 : totalStaff;
      const seed = (d.getDate() * 7 + i * 3) % 20;
      present = isWeekend ? 0 : Math.max(0, base - Math.floor(seed / 4));
      late    = isWeekend ? 0 : Math.floor(seed / 8);
      leave   = isWeekend ? 0 : Math.floor(seed / 10);
      absent  = isWeekend ? 0 : Math.max(0, base - present - late - leave);
    }

    const total = totalStaff || records.length || 1;
    const pct   = total > 0 ? Math.min(100, Math.round(((present + late) / total) * 100)) : 0;

    result.push({
      date: key,
      label: formatDateShort(key, dayLabels),
      fullLabel: formatDateLabel(key, dayLabels),
      present,
      late,
      leave,
      absent,
      total,
      pct,
      isToday: i === 0,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return result;
}

/* ─── Tooltip ─── */
function Tooltip({ x, y, data, svgW, t }) {
  if (!data) return null;
  const W = 148, H = 96;
  const tx = Math.min(Math.max(x - W / 2, 4), svgW - W - 4);
  const ty = y - H - 12 < 0 ? y + 16 : y - H - 12;

  const rows = [
    { label: t("attendance.status.present", { defaultValue: "Present" }), value: data.present, color: "var(--clr-success-500)" },
    { label: t("attendance.status.late", { defaultValue: "Late" }), value: data.late, color: "var(--clr-warning-500)" },
    { label: t("attendance.status.onLeave", { defaultValue: "On Leave" }), value: data.leave, color: "var(--clr-info-500)" },
    { label: t("attendance.status.absent", { defaultValue: "Absent" }), value: data.absent, color: "var(--clr-danger-500)" },
  ];

  return (
    <g>
      <rect x={tx} y={ty} width={W} height={H}
        fill="var(--bg-surface)" stroke="var(--bdr-default)" strokeWidth="1" />
      <text x={tx + 10} y={ty + 18} fontSize="11" fontWeight="600" fill="var(--txt-primary)">
        {data.fullLabel}{data.isToday ? t("attendanceTrendChart.todaySuffix", { defaultValue: " (today)" }) : ""}
      </text>
      {rows.map((row, i) => (
        <g key={row.label}>
          <rect x={tx + 10} y={ty + 28 + i * 16} width="7" height="7" fill={row.color} />
          <text x={tx + 22} y={ty + 36 + i * 16} fontSize="11" fill="var(--txt-secondary)">{row.label}</text>
          <text x={tx + W - 10} y={ty + 36 + i * 16} fontSize="11" fontWeight="500"
            fill="var(--txt-primary)" textAnchor="end">{row.value}</text>
        </g>
      ))}
      <text x={tx + 10} y={ty + H - 8} fontSize="10" fill="var(--txt-secondary)">
        {t("attendanceTrendChart.rateFooter", { pct: data.pct, total: data.total, defaultValue: "Rate: {{pct}}% / {{total}} staff" })}
      </text>
    </g>
  );
}

/* ─── Main component ─── */
export default function AttendanceTrendChart({
  attendance = [],
  totalStaff  = 8,
  height      = 160,
  showLegend  = true,
  showTooltip = true,
}) {
  const { t } = useTranslation();
  const dayLabels = t("common.days", { returnObjects: true });
  const [hovered, setHovered] = useState(null);

  const data = useMemo(
    () => buildChartData(attendance, totalStaff, dayLabels),
    [attendance, totalStaff, dayLabels]
  );

  /* SVG dimensions */
  const W       = 560;
  const H       = height;
  const padL    = 32;
  const padR    = 12;
  const padT    = 16;
  const padB    = 28;
  const innerW  = W - padL - padR;
  const innerH  = H - padT - padB;

  /* Y-axis: 0–100% */
  const yTicks = [0, 25, 50, 75, 100];

  const xPos = (i) => padL + (i / (data.length - 1)) * innerW;
  const yPos = (pct) => padT + innerH - (pct / 100) * innerH;

  /* Line path */
  const linePts = data.map((d, i) => `${xPos(i).toFixed(1)},${yPos(d.pct).toFixed(1)}`);
  const areaPath = [
    ...linePts,
    `${xPos(data.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`,
    `${padL.toFixed(1)},${(padT + innerH).toFixed(1)}`,
  ].join(" ");

  /* Status bar (stacked) at bottom of each point */
  const barW = Math.min(28, (innerW / data.length) * 0.55);

  const legendItems = [
    { label: t("attendance.status.present", { defaultValue: "Present" }), color: "var(--clr-success-400)" },
    { label: t("attendance.status.late", { defaultValue: "Late" }), color: "var(--clr-warning-400)" },
    { label: t("attendance.status.onLeave", { defaultValue: "On Leave" }), color: "var(--clr-info-300)" },
    { label: t("attendance.status.absent", { defaultValue: "Absent" }), color: "var(--clr-danger-300)" },
  ];

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H + (showLegend ? 0 : 0)}`}
        style={{ width: "100%", height, display: "block", overflow: "visible" }}
        role="img"
        aria-label={t("attendanceTrendChart.ariaLabel", { defaultValue: "Attendance trend chart — last 7 days" })}
        onMouseLeave={() => setHovered(null)}
      >
        {/* ── Grid lines ── */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL} x2={W - padR}
              y1={yPos(tick)} y2={yPos(tick)}
              stroke="var(--bdr-subtle)" strokeWidth="0.5"
              strokeDasharray={tick === 0 ? "none" : "3 3"}
            />
            <text
              x={padL - 5} y={yPos(tick) + 4}
              fontSize="9" fill="var(--txt-secondary)" textAnchor="end"
            >{tick}%</text>
          </g>
        ))}

        {/* ── Area fill ── */}
        <polygon points={areaPath} fill="var(--clr-primary-400)" fillOpacity="0.08" />

        {/* ── Line ── */}
        <polyline
          points={linePts.join(" ")}
          fill="none"
          stroke="var(--clr-primary-400)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ── Stacked status bars + dots + labels ── */}
        {data.map((d, i) => {
          const cx   = xPos(i);
          const barX = cx - barW / 2;
          const barMaxH = 20;
          const total   = d.present + d.late + d.leave + d.absent || 1;
          let   barY    = padT + innerH + 2;

          const segs = [
            { value: d.absent,  color: "var(--clr-danger-300)" },
            { value: d.leave,   color: "var(--clr-info-300)" },
            { value: d.late,    color: "var(--clr-warning-400)" },
            { value: d.present, color: "var(--clr-success-400)" },
          ];

          return (
            <g
              key={d.date}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => showTooltip && setHovered({ ...d, cx, cy: yPos(d.pct) })}
            >
              {/* Hover hit area */}
              <rect
                x={cx - (innerW / data.length) * 0.45}
                y={padT}
                width={(innerW / data.length) * 0.9}
                height={innerH + barMaxH + 4}
                fill="transparent"
              />

              {/* Stacked bar */}
              {segs.map((seg, si) => {
                const segH = Math.round((seg.value / total) * barMaxH);
                const y    = barY;
                barY += segH;
                return segH > 0 ? (
                  <rect key={si} x={barX} y={y} width={barW} height={segH}
                    fill={seg.color} opacity={d.isWeekend ? 0.4 : 0.85} />
                ) : null;
              })}

              {/* Day label */}
              <text
                x={cx} y={padT + innerH + barMaxH + 14}
                fontSize="10" textAnchor="middle"
                fill={d.isToday ? "var(--clr-primary-400)" : "var(--txt-secondary)"}
                fontWeight={d.isToday ? "600" : "400"}
              >{d.label}</text>

              {/* Dot on line */}
              <circle
                cx={cx} cy={yPos(d.pct)} r={d.isToday ? 5 : 3.5}
                fill={d.isToday ? "var(--clr-primary-400)" : "var(--bg-surface)"}
                stroke={d.isToday ? "var(--clr-primary-400)" : "var(--clr-primary-300)"}
                strokeWidth={d.isToday ? 0 : 1.5}
              />

              {/* % label on hover or today */}
              {(d.isToday || (hovered && hovered.date === d.date)) && (
                <g>
                  <rect
                    x={cx - 16} y={yPos(d.pct) - 22}
                    width="32" height="16"
                    fill={d.isToday ? "var(--clr-primary-400)" : "var(--bg-surface-alt)"}
                    stroke="var(--bdr-default)" strokeWidth="1"
                  />
                  <text
                    x={cx} y={yPos(d.pct) - 10}
                    fontSize="10" fontWeight="600" textAnchor="middle"
                    fill={d.isToday ? "white" : "var(--txt-primary)"}
                  >{d.pct}%</text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Tooltip ── */}
        {showTooltip && hovered && (
          <Tooltip
            x={hovered.cx} y={hovered.cy}
            data={hovered}
            svgW={W} svgH={H}
            t={t}
          />
        )}
      </svg>

      {/* ── Legend ── */}
      {showLegend && (
        <div style={{
          display: "flex", gap: "var(--sp-5)", flexWrap: "wrap",
          marginTop: "var(--sp-2)",
        }}>
          {legendItems.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "10px", height: "10px",
                background: l.color, display: "inline-block", flexShrink: 0,
              }} />
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                {l.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

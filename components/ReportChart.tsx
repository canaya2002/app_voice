import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/lib/constants';
import { FONT } from '@/lib/styles';

/* ─── Types ────────────────────────────────────────────── */

export interface ChartDataItem {
  label: string;
  value: number;
  color?: string;
}

export interface ChartConfig {
  type: 'bar';
  title: string;
  data: ChartDataItem[];
}

/* ─── Parse helper (safe extraction from AI result) ───── */

export function parseCharts(result: Record<string, unknown>): ChartConfig[] {
  const raw = result.charts;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is ChartConfig => {
    if (typeof c !== 'object' || c === null) return false;
    const obj = c as Record<string, unknown>;
    return (
      typeof obj.type === 'string' &&
      typeof obj.title === 'string' &&
      Array.isArray(obj.data) &&
      (obj.data as unknown[]).length > 0
    );
  });
}

/* ─── Bar Chart (horizontal) ───────────────────────────── */

function BarChart({ title, data }: { title: string; data: ChartDataItem[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <View style={s.card}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.total}>Total: {total}</Text>
      {data.map((item, i) => {
        const pct = Math.max((item.value / maxVal) * 100, 3);
        return (
          <View key={i} style={s.row}>
            <Text style={s.label} numberOfLines={1}>
              {item.label}
            </Text>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  { width: `${pct}%`, backgroundColor: item.color || '#3B82F6' },
                ]}
              />
            </View>
            <Text style={s.value}>{item.value}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ─── Main export ──────────────────────────────────────── */

export default function ReportCharts({ charts }: { charts: ChartConfig[] }) {
  if (!charts || charts.length === 0) return null;

  return (
    <View style={s.container}>
      {charts.map((chart, i) => (
        <BarChart key={i} title={chart.title} data={chart.data} />
      ))}
    </View>
  );
}

/* ─── HTML builder for PDF/DOCX exports ────────────────── */

export function buildChartsHtml(charts: ChartConfig[]): string {
  if (!charts || charts.length === 0) return '';

  return charts
    .map((chart) => {
      const maxVal = Math.max(...chart.data.map((d) => d.value), 1);
      const total = chart.data.reduce((sum, d) => sum + d.value, 0);
      const bars = chart.data
        .map((item) => {
          const pct = Math.max((item.value / maxVal) * 100, 3);
          const color = item.color || '#3B82F6';
          return `<div style="display:flex;align-items:center;margin-bottom:6px;gap:8px;">
            <span style="width:80px;font-size:12px;color:#475569;font-weight:500;flex-shrink:0;">${item.label}</span>
            <div style="flex:1;height:18px;background:#E2E8F0;border-radius:9px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:9px;"></div>
            </div>
            <span style="width:30px;text-align:right;font-size:13px;font-weight:700;color:#0B0B0B;">${item.value}</span>
          </div>`;
        })
        .join('');

      return `<div style="background:#F8FAFC;border-radius:8px;padding:14px;margin:12px 0;border:1px solid #E2E8F0;">
        <div style="font-size:13px;font-weight:600;color:#0B0B0B;margin-bottom:2px;">${chart.title}</div>
        <div style="font-size:11px;color:#94A3B8;margin-bottom:10px;">Total: ${total}</div>
        ${bars}
      </div>`;
    })
    .join('');
}

/* ─── Styles ───────────────────────────────────────────── */

const s = StyleSheet.create({
  container: {
    gap: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  title: {
    fontSize: 14,
    fontFamily: FONT.semibold,
    color: COLORS.primary,
    marginBottom: 2,
  },
  total: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#94A3B8',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  label: {
    width: 72,
    fontSize: 13,
    fontFamily: FONT.medium,
    color: '#475569',
  },
  track: {
    flex: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 10,
    minWidth: 4,
  },
  value: {
    width: 32,
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.primary,
    textAlign: 'right',
  },
});

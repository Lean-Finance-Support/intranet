"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyPoint } from "@/lib/google-sheets/client";
import { formatEur, formatEurCompact } from "@/lib/format";

interface Props {
  data: MonthlyPoint[];
  accent: "navy" | "teal";
}

export default function DashboardMonthlyChart({ data, accent }: Props) {
  const stroke = accent === "teal" ? "#00B0B7" : "#0F1A45";
  const fill = accent === "teal" ? "#00B0B7" : "#0F1A45";
  const gradId = `gradient-${accent}`;

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center h-[180px] text-xs text-text-muted italic">
        Sin datos en el periodo seleccionado.
      </div>
    );
  }

  return (
    <div className="h-[180px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.35} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={formatEurCompact}
          />
          <Tooltip
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "3 3" }}
            contentStyle={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 12,
              padding: "6px 10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
            formatter={(value) => [formatEur(typeof value === "number" ? value : Number(value) || 0), ""]}
            labelStyle={{ color: "#0F1A45", fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

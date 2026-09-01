"use client";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatMeasurementDate,
  formatWeightGrams,
  sortWeightsChronological,
  type WeightRecord,
} from "@/lib/weights/core";

export function WeightChart({ records }: { records: WeightRecord[] }) {
  if (!records.length)
    return (
      <div className="empty-state text-sm">
        Add a measurement to start the weight chart.
      </div>
    );
  const data = sortWeightsChronological(records).map((record) => ({
    date: record.recorded_at,
    label: formatMeasurementDate(record.recorded_at),
    weight: record.weight_grams,
  }));
  return (
    <div
      className="weight-chart"
      role="img"
      aria-label={`Weight chart with ${data.length} measurements from ${data[0].label} to ${data.at(-1)?.label}. Exact values are listed below.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 18, bottom: 8, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="#e3d8c4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => String(value).slice(5)}
            stroke="#75685d"
          />
          <YAxis
            unit=" g"
            domain={["dataMin - 25", "dataMax + 25"]}
            stroke="#75685d"
          />
          <Tooltip
            labelFormatter={(value) => formatMeasurementDate(String(value))}
            formatter={(value) => [formatWeightGrams(Number(value)), "Weight"]}
          />
          <Line
            type="linear"
            dataKey="weight"
            stroke="#6ea15d"
            strokeWidth={3}
            dot={{ fill: "#f6a56b", r: 4 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

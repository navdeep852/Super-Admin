import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

interface BarMetricsChartProps {
  data: any[];
  xKey: string;
  bars: Array<{
    key: string;
    label: string;
    color: string;
  }>;
  height?: number;
  formatValue?: (val: number) => string;
}

export const BarMetricsChart: React.FC<BarMetricsChartProps> = ({
  data,
  xKey,
  bars,
  height = 300,
  formatValue = (v) => `${v}`,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const gridColor = isDark ? '#1e293b' : '#f1f5f9';
  const tickColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke={tickColor}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke={tickColor}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => {
              if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
              if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
              return `${val}`;
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#1e293b' : '#e2e8f0',
              borderRadius: '0.75rem',
              fontSize: '12px',
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
            formatter={(value: any, name: any) => [
              formatValue(Number(value)),
              bars.find((b) => b.key === name)?.label || name,
            ]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={36}
            iconType="circle"
            formatter={(val) => (
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium ml-1">
                {bars.find((b) => b.key === val)?.label || val}
              </span>
            )}
          />
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.key}
              fill={bar.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};


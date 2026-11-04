import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

interface TrendChartProps {
  data: Array<{
    date: string;
    value: number;
    secondaryValue?: number;
    [key: string]: any;
  }>;
  valueKey?: string;
  secondaryValueKey?: string;
  valueLabel?: string;
  secondaryValueLabel?: string;
  height?: number;
  formatValue?: (val: number) => string;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  valueKey = 'value',
  secondaryValueKey,
  valueLabel = 'Revenue',
  secondaryValueLabel = 'Secondary',
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
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="date"
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
              if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
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
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              fontSize: '12px',
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
            formatter={(val: any, name: any) => [
              typeof val === 'number' ? formatValue(val) : val,
              name === valueKey ? valueLabel : secondaryValueLabel,
            ]}
          />
          <Area
            type="monotone"
            dataKey={valueKey}
            name={valueKey}
            stroke="#10b981"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#emeraldGradient)"
          />
          {secondaryValueKey && (
            <Area
              type="monotone"
              dataKey={secondaryValueKey}
              name={secondaryValueKey}
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#cyanGradient)"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};


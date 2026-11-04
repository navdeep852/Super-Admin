import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

interface DistributionItem {
  name: string;
  value: number;
  color?: string;
  percentage?: number;
  [key: string]: any;
}

interface DistributionPieChartProps {
  data: DistributionItem[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  formatValue?: (val: number) => string;
}

const DEFAULT_COLORS = [
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#64748b', // Slate
];

export const DistributionPieChart: React.FC<DistributionPieChartProps> = ({
  data,
  height = 280,
  innerRadius = 60,
  outerRadius = 90,
  formatValue = (v) => `${v}`,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#1e293b' : '#e2e8f0',
              borderRadius: '0.75rem',
              fontSize: '12px',
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
            formatter={(value: any) => [formatValue(Number(value)), 'Count / Share']}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(val) => (
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium ml-1">
                {val}
              </span>
            )}
          />
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={4}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                stroke={isDark ? '#090d16' : '#ffffff'}
                strokeWidth={2}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};


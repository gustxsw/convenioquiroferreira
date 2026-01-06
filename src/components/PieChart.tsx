import React from "react";

interface PieChartProps {
  data: Array<{
    label: string;
    value: number;
    color: string;
  }>;
  size?: number;
}

const PieChart: React.FC<PieChartProps> = ({ data, size = 200 }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-gray-400 text-sm">Sem dados</p>
      </div>
    );
  }

  let currentAngle = -90;
  const slices = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    const startX = 100 + 80 * Math.cos((startAngle * Math.PI) / 180);
    const startY = 100 + 80 * Math.sin((startAngle * Math.PI) / 180);
    const endX = 100 + 80 * Math.cos((endAngle * Math.PI) / 180);
    const endY = 100 + 80 * Math.sin((endAngle * Math.PI) / 180);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = [
      `M 100 100`,
      `L ${startX} ${startY}`,
      `A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      `Z`,
    ].join(" ");

    currentAngle = endAngle;

    return (
      <g key={index}>
        <path d={pathData} fill={item.color} className="transition-opacity hover:opacity-80" />
      </g>
    );
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 200 200">
        <g>{slices}</g>
        <circle cx="100" cy="100" r="50" fill="white" />
        <text
          x="100"
          y="95"
          textAnchor="middle"
          className="text-xl font-bold fill-gray-900"
        >
          {total}
        </text>
        <text
          x="100"
          y="110"
          textAnchor="middle"
          className="text-xs fill-gray-500"
        >
          Total
        </text>
      </svg>

      <div className="mt-4 space-y-2 w-full">
        {data.map((item, index) => {
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-700">{item.label}</span>
              </div>
              <span className="font-semibold text-gray-900">
                {item.value} ({percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PieChart;

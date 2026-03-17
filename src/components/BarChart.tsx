import React from "react";

interface BarChartProps {
  data: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
}

const BarChart: React.FC<BarChartProps> = ({ data }) => {
  const maxValue = data.reduce((max, item) => Math.max(max, item.value), 0);

  if (maxValue === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 text-sm">Sem dados</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-end gap-4 h-40">
        {data.map((item, index) => {
          const heightPercent = (item.value / maxValue) * 100;
          const color = item.color || (index === 0 ? "#F59E0B" : "#10B981");
          return (
            <div
              key={item.label}
              className="flex-1 flex flex-col items-center h-full"
            >
              <div
                className="w-6 sm:w-8 rounded-t-md"
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: color,
                  transition: "height 0.3s ease",
                }}
                title={`${item.label}: ${item.value}`}
              />
              <span className="mt-2 text-xs text-gray-600 text-center">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BarChart;

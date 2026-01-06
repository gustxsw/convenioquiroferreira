import React from "react";

interface BarChartProps {
  data: Array<{
    label: string;
    value: number;
    color: string;
    percentage?: string;
  }>;
  height?: number;
}

const BarChart: React.FC<BarChartProps> = ({ data, height = 300 }) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="w-full">
      <div className="space-y-6">
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * 100;

          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{item.label}</span>
                <span className="font-bold text-gray-900">
                  {item.value}
                  {item.percentage && (
                    <span className="text-xs text-gray-500 ml-2">
                      ({item.percentage}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="relative w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full flex items-center justify-end px-3 transition-all duration-500 ease-out"
                  style={{
                    width: `${barHeight}%`,
                    backgroundColor: item.color,
                  }}
                >
                  {barHeight > 15 && (
                    <span className="text-xs font-semibold text-white">
                      {item.value}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BarChart;

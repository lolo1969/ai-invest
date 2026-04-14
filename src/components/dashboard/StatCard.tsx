import type React from 'react';

const colorClasses = {
  indigo: 'bg-indigo-500/20 text-indigo-500',
  blue: 'bg-blue-500/20 text-blue-500',
  green: 'bg-green-500/20 text-green-500',
  red: 'bg-red-500/20 text-red-500',
  yellow: 'bg-yellow-500/20 text-yellow-500',
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'indigo' | 'blue' | 'green' | 'red' | 'yellow';
}

export function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
      <div className="flex items-start md:items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-gray-400 text-xs md:text-sm truncate">{title}</p>
          <p className="text-base md:text-2xl font-bold text-white mt-0.5 md:mt-1 truncate">{value}</p>
          {subtitle && <p className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1 line-clamp-2">{subtitle}</p>}
        </div>
        <div className={`p-2 md:p-3 rounded-lg flex-shrink-0 ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}


import React from 'react';
import { cn } from '@/lib/utils';

interface GaugeMeterProps {
  value: number; // 0 to 100
  size?: number;
  className?: string;
}

export const GaugeMeter: React.FC<GaugeMeterProps> = ({ value, size = 100, className }) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  const angle = (clampedValue / 100) * 180; // Map 0-100 to 0-180 degrees
  const radius = size / 2 - size / 10;
  const strokeWidth = size / 10;
  const circumference = Math.PI * radius;
  const center = size / 2;

  const getPath = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(center, center, radius, endAngle);
    const end = polarToCartesian(center, center, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
  };

  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 180) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size / 2 }}>
      <svg width={size} height={size / 2} viewBox={`0 0 ${size} ${size / 2}`} className="overflow-visible">
        {/* Background Arc */}
        <path
          d={getPath(0, 180)}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Green segment */}
        <path
          d={getPath(0, 60)}
          fill="none"
          stroke="hsl(var(--chart-1))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Yellow segment */}
        <path
          d={getPath(60, 120)}
          fill="none"
          stroke="hsl(var(--chart-4))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Red segment */}
        <path
          d={getPath(120, 180)}
          fill="none"
          stroke="hsl(var(--chart-2))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Needle */}
        <g transform={`rotate(${angle} ${center} ${center})`}>
          <line
            x1={center}
            y1={center}
            x2={center - radius + strokeWidth / 2}
            y2={center}
            stroke="hsl(var(--foreground))"
            strokeWidth={size/50}
            strokeLinecap="round"
          />
          <circle cx={center} cy={center} r={size/20} fill="hsl(var(--foreground))" />
        </g>
      </svg>
    </div>
  );
};

import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

export interface RadarSeries {
  interviewerName: string;
  color: string;
  // scores in the same order as `criteriaLabels`
  scores: number[]; // 0-5
}

interface RadarChartProps {
  criteriaLabels: string[];
  series: RadarSeries[];
  size?: number;
}

/**
 * Renders one polygon per interviewer over the same criteria axes, so
 * disagreements between panel members are visible at a glance (section 19).
 * Pure react-native-svg — no third-party charting dependency that might
 * not support React Native.
 */
export function RadarChart({ criteriaLabels, series, size = 280 }: RadarChartProps) {
  const { colors } = useTheme();
  const center = size / 2;
  const radius = size / 2 - 40; // leave room for labels
  const maxScore = 5;
  const angleStep = (2 * Math.PI) / criteriaLabels.length;

  const pointFor = (axisIndex: number, value: number) => {
    const angle = axisIndex * angleStep - Math.PI / 2;
    const r = (value / maxScore) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const gridLevels = [1, 2, 3, 4, 5];

  return (
    <View>
      <Svg width={size} height={size} accessibilityLabel="Radar chart comparing interviewer scores across criteria">
        {/* Grid rings */}
        {gridLevels.map((level) => {
          const points = criteriaLabels
            .map((_, i) => {
              const p = pointFor(i, level);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          return <Polygon key={level} points={points} fill="none" stroke={colors.border} strokeWidth={1} />;
        })}

        {/* Axis lines + labels */}
        {criteriaLabels.map((label, i) => {
          const outer = pointFor(i, maxScore);
          const labelPoint = pointFor(i, maxScore + 0.9);
          return (
            <React.Fragment key={label}>
              <Line x1={center} y1={center} x2={outer.x} y2={outer.y} stroke={colors.border} strokeWidth={1} />
              <SvgText
                x={labelPoint.x}
                y={labelPoint.y}
                fontSize={11}
                fill={colors.secondaryText}
                textAnchor="middle"
              >
                {label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* One polygon per interviewer */}
        {series.map((s) => {
          const points = s.scores.map((score, i) => {
            const p = pointFor(i, score);
            return `${p.x},${p.y}`;
          }).join(' ');
          return (
            <Polygon
              key={s.interviewerName}
              points={points}
              fill={s.color}
              fillOpacity={0.15}
              stroke={s.color}
              strokeWidth={2}
            />
          );
        })}

        {/* Data point dots */}
        {series.map((s) =>
          s.scores.map((score, i) => {
            const p = pointFor(i, score);
            return <Circle key={`${s.interviewerName}-${i}`} cx={p.x} cy={p.y} r={3} fill={s.color} />;
          })
        )}
      </Svg>

      {/* Legend */}
      <View className="flex-row flex-wrap justify-center mt-3 gap-3">
        {series.map((s) => (
          <View key={s.interviewerName} className="flex-row items-center">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color, marginRight: 6 }} />
            <Text className="text-xs" style={{ color: colors.secondaryText }}>{s.interviewerName}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

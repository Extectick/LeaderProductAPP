// components/BrandedBackground.tsx
import { gradientColors } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
    Canvas,
    Group,
    Paint,
    RadialGradient,
    Rect,
    vec,
} from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    GestureResponderEvent,
    LayoutChangeEvent,
    StyleSheet,
    View,
    ViewProps,
} from 'react-native';

type Props = ViewProps & {
  /** Переопределение палитры (≥2 цвета). По умолчанию — палитра текущей темы */
  palette?: readonly string[];
  /** Яркость/контраст эффекта (0..1) */
  intensity?: number;
  /** Период полного цикла (мс) */
  periodMs?: number;
  /** Кол-во «узлов» меша */
  nodes?: number;
  /** Реакция на касание: отталкивание/притяжение/нет */
  reactToTouch?: 'push' | 'pull' | 'none';
  /** Включить еле заметную техно-сетку поверх */
  showGrid?: boolean;
};

function withAlpha(hex: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  const n = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
  if (/^#([0-9a-f]{3})$/i.test(hex)) {
    const [, rgb] = hex.match(/^#([0-9a-f]{3})$/i)!;
    const r = rgb[0] + rgb[0];
    const g = rgb[1] + rgb[1];
    const b = rgb[2] + rgb[2];
    return `#${r}${g}${b}${n}`;
  }
  return `${hex}${n}`;
}

export default function BrandedBackground({
  style,
  children,
  palette,
  intensity = 1,
  periodMs = 16000,
  nodes = 6,
  reactToTouch = 'push',
  showGrid = false,
  ...rest
}: Props) {
  const { theme } = useTheme();

  // Базовые цвета темы
  const baseBg  = useThemeColor({}, 'background');
  const baseCard = useThemeColor({}, 'cardBackground');

  // Палитра для «пятен» (многокрасочная)
  const themeGrad = gradientColors[theme as keyof typeof gradientColors] ?? gradientColors.light;
  const colors = (palette?.length ? palette : themeGrad) as string[];

  // Геометрия
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setW(width);
    setH(height);
  };

  // Простая анимация: RAF → обновляем «тик», чтобы пересчитать позиции узлов
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number>(Date.now());
  const [, setTick] = useState(0);
  const loop = useCallback(() => {
    setTick(Date.now());
    frameRef.current = requestAnimationFrame(loop);
  }, []);
  useEffect(() => {
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [loop]);

  // Касание: точка, время, состояние
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [lastTouch, setLastTouch] = useState<number>(-1);
  const [pressed, setPressed] = useState(false);

  const onTouchStart = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setTouchPos({ x: locationX, y: locationY });
    setLastTouch(Date.now());
    setPressed(true);
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setTouchPos({ x: locationX, y: locationY });
  };
  const onTouchEnd = () => setPressed(false);

  // Константы движения
  const nodesConfig = useMemo(() => {
    // Кратные множители дают идеальную «зацикленность» за periodMs
    const mults = [1, 2, 3] as const;
    return Array.from({ length: nodes }, (_, i) => {
      const kx = mults[i % mults.length];
      const ky = mults[(i + 1) % mults.length];
      const phase = (i / nodes) * Math.PI * 2;
      const rFrac = 0.35 + ((i * 37) % 30) / 100; // 0.35..0.65
      const col = colors[i % colors.length];
      return { kx, ky, phase, rFrac, col };
    });
  }, [nodes, colors]);

  // Пересчёт «пятен» на каждый кадр
  const blobs = useMemo(() => {
    if (!w || !h) return [] as Array<{ cx: number; cy: number; r: number; colors: string[] }>;
    const now = Date.now();
    const elapsed = now - startRef.current;
    const theta = ((elapsed % periodMs) / periodMs) * Math.PI * 2; // 0..2π

    const minDim = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;

    const ampBase = minDim * 0.18;

    // Пульс от касания (экспоненциальное затухание)
    const dt = lastTouch < 0 ? 1e9 : Math.max(0, now - lastTouch);
    const pulse = Math.exp(-dt / 900); // 0..1
    const ampPulse = ampBase * 0.4 * pulse * (pressed ? 1.0 : 0.6);

    // Влияние касания на позицию узлов
    const pullCoeff = pulse * 0.15;     // притяжение
    const pushCoeff = pulse * 0.15;     // отталкивание
    const tp = touchPos ?? { x: cx, y: cy };

    return nodesConfig.map((cfg, idx) => {
      const { kx, ky, phase, rFrac, col } = cfg;

      // База — лиссажу
      const x0 = cx + ampBase * Math.cos(theta * kx + phase);
      const y0 = cy + ampBase * Math.sin(theta * ky + phase + Math.PI / 3);

      // «дыхание»
      const x1 = x0 + ampPulse * Math.cos(theta * (2 + (idx % 2)) + phase);
      const y1 = y0 + ampPulse * Math.sin(theta * (3 + (idx % 3)) + phase / 2);

      // Касание
      let x2 = x1;
      let y2 = y1;
      if (reactToTouch !== 'none' && pulse > 0.01) {
        const dx = tp.x - x1;
        const dy = tp.y - y1;
        if (reactToTouch === 'pull') {
          // тянем к точке
          x2 = x1 + dx * pullCoeff;
          y2 = y1 + dy * pullCoeff;
        } else {
          // отталкиваем от точки
          x2 = x1 - dx * pushCoeff;
          y2 = y1 - dy * pushCoeff;
        }
      }

      const r = minDim * rFrac * 0.6;
      const inner = withAlpha(col, Math.min(0.9, 0.65 * intensity));
      const outer = withAlpha(col, 0);

      return { cx: x2, cy: y2, r, colors: [inner, outer] };
    });
  }, [w, h, periodMs, nodesConfig, intensity, lastTouch, pressed, reactToTouch, touchPos]);

  // Сетка поверх (опционально)
  const gridRects = useMemo(() => {
    if (!showGrid || !w || !h) return [] as { x: number; y: number; w: number; h: number }[];
    const lines: { x: number; y: number; w: number; h: number }[] = [];
    const step = Math.max(32, Math.min(w, h) / 18);
    for (let x = step; x < w; x += step) lines.push({ x, y: 0, w: 1, h });
    for (let y = step; y < h; y += step) lines.push({ x: 0, y, w, h: 1 });
    return lines;
  }, [w, h, showGrid]);

  return (
    <View
      {...rest}
      style={[styles.container, style]}
      onLayout={onLayout}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* === ФОН: канвас снизу, не перехватывает события === */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* База: мягкий радиальный градиент из цветов темы */}
        <Rect x={0} y={0} width={w} height={h}>
          <Paint>
            <RadialGradient
              c={vec(w * 0.25, h * 0.3)}
              r={Math.max(w, h) * 0.9}
              colors={[withAlpha(baseBg, 1), withAlpha(baseCard, 1)]}
            />
          </Paint>
        </Rect>

        {/* Mesh-пятна со смешиванием Screen */}
        <Group blendMode="screen">
          {blobs.map((b, i) => (
            <Rect key={i} x={0} y={0} width={w} height={h}>
              <Paint>
                <RadialGradient c={vec(b.cx, b.cy)} r={b.r} colors={b.colors} positions={[0, 1]} />
              </Paint>
            </Rect>
          ))}
        </Group>

        {/* Опциональная техно-сетка */}
        {showGrid && (
          <Group blendMode="overlay">
            {gridRects.map((ln, i) => (
              <Rect key={`g${i}`} x={ln.x} y={ln.y} width={ln.w} height={ln.h} color={withAlpha('#FFFFFF', 0.035)} />
            ))}
          </Group>
        )}
      </Canvas>

      {/* Контент поверх — принимает все интеракции */}
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', overflow: 'hidden' },
  content: { flex: 1 },
});

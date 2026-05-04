'use client';

import { useRef, useCallback, useState } from 'react';

interface TouchGesturesOptions {
  onTap?: () => void;
  onDoubleTap?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum swipe distance in pixels to trigger swipe (default: 50) */
  swipeThreshold?: number;
  /** Maximum time between taps to count as double tap (ms, default: 300) */
  doubleTapDelay?: number;
}

/**
 * Hook for detecting mobile touch gestures: tap, double tap, swipe left/right.
 */
export function useTouchGestures(options: TouchGesturesOptions = {}) {
  const {
    onTap,
    onDoubleTap,
    onSwipeLeft,
    onSwipeRight,
    swipeThreshold = 50,
    doubleTapDelay = 300,
  } = options;

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const [gestureFeedback, setGestureFeedback] = useState('');

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;

    // Check for swipe (horizontal movement dominates, fast enough)
    if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy) && dt < 500) {
      if (dx > 0) {
        onSwipeRight?.();
        setGestureFeedback('⏮ 上一首');
      } else {
        onSwipeLeft?.();
        setGestureFeedback('⏭ 下一首');
      }
      setTimeout(() => setGestureFeedback(''), 600);
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
      // It's a tap
      const now = Date.now();
      if (now - lastTapRef.current < doubleTapDelay) {
        onDoubleTap?.();
        setGestureFeedback('⏯ 播放/暂停');
        setTimeout(() => setGestureFeedback(''), 600);
      } else {
        onTap?.();
      }
      lastTapRef.current = now;
    }

    touchStartRef.current = null;
  }, [onTap, onDoubleTap, onSwipeLeft, onSwipeRight, swipeThreshold, doubleTapDelay]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    gestureFeedback,
  };
}

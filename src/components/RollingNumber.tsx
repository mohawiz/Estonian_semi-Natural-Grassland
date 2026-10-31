import { useMotionValue, useMotionValueEvent, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';
import { useMeadow } from '../features/meadow/conditions';

/** Numbers roll to their new value with a spring. */
export function RollingNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const { reduced } = useMeadow();
  const mv = useMotionValue(reduced ? value : 0);
  const spring = useSpring(mv, { stiffness: 90, damping: 20 });
  const [text, setText] = useState(format(reduced ? value : 0));
  useMotionValueEvent(spring, 'change', (v) => setText(format(v)));
  useEffect(() => {
    if (reduced) {
      spring.jump(value);
      setText(format(value));
    } else mv.set(value);
  }, [value, reduced, mv, spring, format]);
  return (
    <span aria-label={format(value)}>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}


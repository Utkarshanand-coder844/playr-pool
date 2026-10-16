import React from 'react';

/**
 * Cricket Over Dots Visualizer
 */
export function OverDots({ balls = [] }) {
  const getBallClass = (b) => {
    if (!b || b === '•') return 'ball dot';
    if (b === 'W' || b?.includes('/W') || b?.includes('W')) return 'ball bw';
    if (b === '4' || b === '4NB') return 'ball b4';
    if (b === '6') return 'ball b6';
    return 'ball';
  };

  const slots = Array(6).fill('•');
  balls.slice(0, 20).forEach((b, i) => { if (i < 6) slots[i] = b; });

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {slots.map((b, i) => (
        <span key={i} className={getBallClass(b)}>
          {b === '•' ? '·' : b === 'W' ? 'W' : b}
        </span>
      ))}
    </div>
  );
}

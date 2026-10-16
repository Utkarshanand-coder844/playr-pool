import React from 'react';

/**
 * Cricket Over Dots Visualizer
 */
export function OverDots({ balls = [] }) {
  const getStyle = (b) => {
    if (!b || b === '•') return { bg: 'transparent', color: '#71717a', border: 'rgba(255,255,255,0.1)' };
    if (b === 'W' || b?.includes('/W')) return { bg: '#f43f5e22', color: '#f43f5e', border: '#f43f5e55' };
    if (b === '4' || b === '4NB') return { bg: '#38bdf822', color: '#38bdf8', border: '#38bdf855' };
    if (b === '6') return { bg: '#a855f722', color: '#a855f7', border: '#a855f755' };
    if (b?.includes('Wd')) return { bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b55' };
    if (b?.includes('NB')) return { bg: '#f97316aa', color: '#fff', border: '#f97316' };
    return { bg: 'rgba(255,255,255,0.06)', color: '#f4f4f5', border: 'rgba(255,255,255,0.18)' };
  };

  const slots = Array(6).fill('•');
  balls.slice(0, 20).forEach((b, i) => { if (i < 6) slots[i] = b; });

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {slots.map((b, i) => {
        const st = getStyle(b);
        return (
          <div key={i} style={{
            width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
            background: st.bg, color: st.color, border: `1.5px solid ${st.border}`,
            transition: 'all 0.25s ease',
            ...(b && b !== '•' ? { boxShadow: `0 0 10px ${st.border}66` } : {})
          }}>
            {b === 'W' ? '🅆' : b}
          </div>
        );
      })}
    </div>
  );
}

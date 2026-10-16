import React from 'react';
import '../styles/IntroSplash.css';

const EMBERS = [
  { x: '7%', s: '3px', d: '2.8s', t: '0.1s', dx: '15px' },
  { x: '14%', s: '4px', d: '3.4s', t: '0.6s', dx: '-20px' },
  { x: '21%', s: '2px', d: '2.5s', t: '1.2s', dx: '25px' },
  { x: '28%', s: '5px', d: '3.8s', t: '0.3s', dx: '-15px' },
  { x: '35%', s: '3px', d: '3.0s', t: '0.9s', dx: '10px' },
  { x: '42%', s: '4px', d: '4.2s', t: '0.2s', dx: '-30px' },
  { x: '49%', s: '2px', d: '2.6s', t: '1.5s', dx: '18px' },
  { x: '55%', s: '5px', d: '3.6s', t: '0.5s', dx: '-12px' },
  { x: '62%', s: '3px', d: '3.1s', t: '1.1s', dx: '22px' },
  { x: '68%', s: '4px', d: '4.0s', t: '0.4s', dx: '-25px' },
  { x: '75%', s: '2px', d: '2.7s', t: '1.4s', dx: '12px' },
  { x: '82%', s: '5px', d: '3.5s', t: '0.2s', dx: '-18px' },
  { x: '89%', s: '3px', d: '3.2s', t: '0.8s', dx: '15px' },
  { x: '94%', s: '4px', d: '3.9s', t: '1.0s', dx: '-10px' },
  { x: '18%', s: '3px', d: '3.3s', t: '1.7s', dx: '20px' },
  { x: '32%', s: '2px', d: '2.9s', t: '2.0s', dx: '-16px' },
  { x: '46%', s: '4px', d: '3.7s', t: '1.3s', dx: '14px' },
  { x: '59%', s: '3px', d: '2.8s', t: '1.9s', dx: '-22px' },
  { x: '73%', s: '4px', d: '4.1s', t: '0.7s', dx: '16px' },
  { x: '86%', s: '2px', d: '3.0s', t: '1.8s', dx: '-14px' }
];

export const CampusClashLoader = ({ isExiting = false, onDismiss }) => {
  return (
    <div
      className={`pp-intro ${isExiting ? 'leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading Playr-Pool"
    >
      {/* Orange stadium glow behind the emblem */}
      <div className="pp-intro-glow" aria-hidden="true" />

      {/* Emblem with blur slam and light sweep */}
      <div className="pp-intro-logo">
        <img
          src="/intro-emblem.jpg"
          alt="Playr-Pool"
          decoding="async"
        />
        <div
          className="pp-intro-shine"
          style={{ '--pp-logo': 'url(/intro-emblem.jpg)' }}
          aria-hidden="true"
        />
      </div>

      {/* Embers rising from bottom */}
      <ul className="pp-intro-embers" aria-hidden="true">
        {EMBERS.map((ember, i) => (
          <li
            key={i}
            style={{
              '--x': ember.x,
              '--s': ember.s,
              '--d': ember.d,
              '--t': ember.t,
              '--dx': ember.dx
            }}
          />
        ))}
      </ul>

      {/* Loading progress bar */}
      <div className="pp-intro-bar" aria-label="Loading progress">
        <span />
      </div>

      {/* Accessible skip button */}
      {onDismiss && (
        <button
          type="button"
          className="pp-intro-skip"
          onClick={onDismiss}
          aria-label="Skip intro animation"
        >
          Skip
        </button>
      )}
    </div>
  );
};

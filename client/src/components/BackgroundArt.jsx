import React from 'react';
import './BackgroundArt.css';

// left %, size, duration, delay, sideways drift
const EMBERS = [
  ['5%', '3px', '13s', '0s', '30px'], ['13%', '4px', '16s', '4s', '-24px'],
  ['22%', '3px', '12s', '7s', '20px'], ['31%', '5px', '15s', '2s', '-34px'],
  ['42%', '3px', '14s', '9s', '26px'], ['52%', '4px', '17s', '5s', '-18px'],
  ['63%', '3px', '12s', '1s', '22px'], ['72%', '5px', '16s', '8s', '-28px'],
  ['81%', '3px', '13s', '3s', '16px'], ['90%', '4px', '15s', '6s', '-20px'],
];

/**
 * Animated, theme-matched background.
 *   <BackgroundArt />                          sports artwork photo + glow + embers
 *   <BackgroundArt photo="/custom.jpg" />      custom photo
 *   <BackgroundArt showLogo={true} />          adds logo watermark
 */
export default function BackgroundArt({ photo, showLogo = true }) {
  return (
    <div
      className="pp-bg"
      aria-hidden="true"
      style={photo ? { '--pp-photo': `url(${photo})` } : undefined}
    >
      {photo && <div className="pp-bg-photo" />}
      <div className="pp-bg-glow a" />
      <div className="pp-bg-glow b" />
      {showLogo && (
        <div className="pp-bg-logo">
          <img
            src="/playr-pool-logo.webp"
            alt=""
            width="800"
            height="800"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      )}
      <ul className="pp-bg-embers">
        {EMBERS.map(([x, s, d, t, dx], i) => (
          <li key={i} style={{ '--x': x, '--s': s, '--d': d, '--t': t, '--dx': dx }} />
        ))}
      </ul>
      <div className="pp-bg-vignette" />
    </div>
  );
}

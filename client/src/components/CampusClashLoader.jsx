import React from 'react';
import '../styles/IntroSplash.css';

const STREAKS = [
  { top: '16%', h: '2.5px', w: '65vw', dur: '0.65s', delay: '0.04s' },
  { top: '32%', h: '4px', w: '75vw', dur: '0.72s', delay: '0.15s' },
  { top: '48%', h: '3px', w: '55vw', dur: '0.58s', delay: '0.28s' },
  { top: '64%', h: '5px', w: '80vw', dur: '0.78s', delay: '0.1s' },
  { top: '78%', h: '2px', w: '60vw', dur: '0.62s', delay: '0.35s' },
  { top: '40%', h: '3.5px', w: '70vw', dur: '0.68s', delay: '0.45s' },
  { top: '88%', h: '4px', w: '60vw', dur: '0.7s', delay: '0.22s' }
];

export const CampusClashLoader = ({ isExiting = false, onDismiss }) => {
  return (
    <div
      className={`pp-intro ${isExiting ? 'leaving' : ''}`}
      onClick={onDismiss}
      role="status"
      aria-live="polite"
      aria-label="Loading Playr-Pool"
    >
      {/* 1. The Entrance: Black screen with yellowish-light orange streaks sweeping across */}
      <div className="pp-intro-streaks" aria-hidden="true">
        {STREAKS.map((streak, i) => (
          <div
            key={i}
            className="pp-streak"
            style={{
              top: streak.top,
              '--h': streak.h,
              '--w': streak.w,
              '--dur': streak.dur,
              '--delay': streak.delay
            }}
          />
        ))}
      </div>

      {/* 2. Logo Reveal: Flash of yellowish-light orange light & shockwave */}
      <div className="pp-intro-flash" aria-hidden="true" />
      <div className="pp-intro-glow" aria-hidden="true" />
      <div className="pp-intro-shockwave" aria-hidden="true" />

      {/* Logo scales up dramatically into focus */}
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

      <div className="pp-intro-caption" aria-hidden="true">
        Playr-Pool
      </div>

      {/* Accessible Skip Button */}
      {onDismiss && (
        <button
          type="button"
          className="pp-intro-skip"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Skip intro animation"
        >
          Skip
        </button>
      )}
    </div>
  );
};

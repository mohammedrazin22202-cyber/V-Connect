import { useState, useEffect, useRef } from 'react';
import { RURAL_SLOGANS, getHourlySloganIndex } from '../data/slogans';
import './ClockSloganWidget.css';

/**
 * Clock & Slogan Widget
 * Positioned in the top right of the application.
 * Features:
 * - Real-time 12-hour digital clock with live seconds and date.
 * - Dynamic slogan system featuring 300+ curated rural development and empowerment slogans.
 * - Automatically rotates to the next slogan every 1 hour (on the hour).
 * - Interactive shuffle and preview controls allowing exploration of the 300+ slogans.
 * - Responsive glassmorphism badge with minimize/expand toggle.
 */
export default function ClockSloganWidget() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [customIndex, setCustomIndex] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);
  const prevHourlyIndexRef = useRef(getHourlySloganIndex(new Date()));

  // Live timer tick every 1000ms
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      const currentHourlyIdx = getHourlySloganIndex(now);
      if (currentHourlyIdx !== prevHourlyIndexRef.current) {
        prevHourlyIndexRef.current = currentHourlyIdx;
        // Trigger fade animation on hourly rollover
        setFadeKey(k => k + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const hourlyIndex = getHourlySloganIndex(currentTime);
  const isCustom = customIndex !== null;
  const activeIndex = isCustom ? customIndex : hourlyIndex;
  const slogan = RURAL_SLOGANS[activeIndex] || RURAL_SLOGANS[0];

  // Format 12-hour time with live seconds (e.g. "10:15:30 AM")
  const timeFormatted = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  // Format Date (e.g. "Thu, Oct 22, 2026")
  const dateFormatted = currentTime.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Cycle to next slogan
  const handleNextSlogan = () => {
    setCustomIndex(prev => {
      const next = prev === null ? (hourlyIndex + 1) % RURAL_SLOGANS.length : (prev + 1) % RURAL_SLOGANS.length;
      return next;
    });
    setFadeKey(k => k + 1);
  };

  // Random slogan
  const handleRandomSlogan = () => {
    const randomIdx = Math.floor(Math.random() * RURAL_SLOGANS.length);
    setCustomIndex(randomIdx);
    setFadeKey(k => k + 1);
  };

  // Reset back to hourly rotation
  const handleResetToHourly = () => {
    setCustomIndex(null);
    setFadeKey(k => k + 1);
  };

  return (
    <aside
      className={`clock-slogan-widget ${isCollapsed ? 'is-collapsed' : ''}`}
      aria-label="Application Clock and Slogan"
      id="top-right-clock-slogan"
    >
      {/* Slogan Container */}
      <div className="csw-slogan-container">
        <div className="csw-slogan-header">
          <span className="csw-slogan-badge">
            <span className="csw-slogan-badge-icon">🌾</span>
            {isCustom ? `Slogan #${activeIndex + 1} of ${RURAL_SLOGANS.length}` : `Hourly Vision #${activeIndex + 1}`}
          </span>

          <div className="csw-actions">
            {isCustom && (
              <button
                type="button"
                className="csw-action-btn csw-reset-btn"
                onClick={handleResetToHourly}
                title="Return to the active hourly slogan"
              >
                ↻ Current Hour
              </button>
            )}
            <button
              type="button"
              className="csw-action-btn"
              onClick={handleRandomSlogan}
              title="Shuffle another slogan from the 300+ library"
            >
              🎲
            </button>
            <button
              type="button"
              className="csw-action-btn"
              onClick={handleNextSlogan}
              title="Next slogan"
            >
              &gt;
            </button>
          </div>
        </div>

        <p key={fadeKey} className="csw-slogan-text csw-slogan-fade" title={slogan}>
          &ldquo;{slogan}&rdquo;
        </p>
      </div>

      {/* Clock Container */}
      <div className="csw-clock-container">
        <div className="csw-time-row">
          <span className="csw-live-pulse" title="Live clock active" />
          <time className="csw-time-digits" dateTime={currentTime.toISOString()}>
            {timeFormatted}
          </time>
        </div>
        <div className="csw-date-text">{dateFormatted}</div>
      </div>

      {/* Collapse/Expand Toggle */}
      <button
        type="button"
        className="csw-toggle-collapse-btn"
        onClick={() => setIsCollapsed(c => !c)}
        title={isCollapsed ? 'Expand slogan & details' : 'Collapse slogan to compact clock'}
        aria-label={isCollapsed ? 'Expand slogan' : 'Collapse slogan'}
      >
        {isCollapsed ? '◀' : '▶'}
      </button>
    </aside>
  );
}

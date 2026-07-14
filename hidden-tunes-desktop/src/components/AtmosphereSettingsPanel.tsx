import {
  ATMOSPHERE_INTENSITY_DESCRIPTIONS,
  ATMOSPHERE_INTENSITY_LABELS,
  ATMOSPHERE_INTENSITY_MODES,
} from '../lib/atmospherePreferences'
import { useAtmosphere } from '../context/AtmosphereContext'

export function AtmosphereSettingsPanel() {
  const {
    activeAtmosphereId,
    setActiveAtmosphereId,
    atmosphereIntensity,
    setAtmosphereIntensity,
    atmosphereEnabled,
    setAtmosphereEnabled,
    resolvedAtmosphere,
    availableAtmospheres,
  } = useAtmosphere()

  return (
    <section className="settings-panel settings-panel--atmosphere">
      <h2>Atmosphere</h2>
      <p className="settings-panel-desc">
        Control ambient worlds, glow intensity, and your default listening environment.
        Saved locally on this device — playback stays unchanged.
      </p>

      <div className="settings-row">
        <div className="settings-label">
          <span>Atmosphere visuals</span>
          <small>
            {atmosphereEnabled
              ? `Active · ${resolvedAtmosphere.name}`
              : 'Paused — preferences still saved'}
          </small>
        </div>
        <button
          type="button"
          className={`atmosphere-toggle${atmosphereEnabled ? ' is-on' : ''}`}
          role="switch"
          aria-checked={atmosphereEnabled}
          onClick={() => setAtmosphereEnabled(!atmosphereEnabled)}
        >
          <span className="atmosphere-toggle-track" aria-hidden="true">
            <span className="atmosphere-toggle-thumb" />
          </span>
          <span className="atmosphere-toggle-label">
            {atmosphereEnabled ? 'On' : 'Off'}
          </span>
        </button>
      </div>

      <div className="settings-row settings-row--stacked">
        <div className="settings-label">
          <span>Intensity</span>
          <small>{ATMOSPHERE_INTENSITY_DESCRIPTIONS[atmosphereIntensity]}</small>
        </div>
        <div
          className="atmosphere-intensity-selector"
          role="group"
          aria-label="Atmosphere intensity"
        >
          {ATMOSPHERE_INTENSITY_MODES.map((mode) => {
            const active = atmosphereIntensity === mode
            return (
              <button
                key={mode}
                type="button"
                className={`atmosphere-intensity-option${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => setAtmosphereIntensity(mode)}
              >
                {ATMOSPHERE_INTENSITY_LABELS[mode]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="settings-row settings-row--stacked">
        <div className="settings-label">
          <span>Default world</span>
          <small>Used when no track or world override is active</small>
        </div>
        <div
          className="atmosphere-world-grid"
          role="radiogroup"
          aria-label="Default atmosphere world"
        >
          {availableAtmospheres.map((atmosphere) => {
            const isActive = activeAtmosphereId === atmosphere.id
            return (
              <button
                key={atmosphere.id}
                type="button"
                className={`atmosphere-world-card${isActive ? ' is-active' : ''}`}
                role="radio"
                aria-checked={isActive}
                onClick={() => setActiveAtmosphereId(atmosphere.id)}
              >
                <span className="atmosphere-world-card-head">
                  <strong>{atmosphere.name}</strong>
                  {isActive ? (
                    <span className="settings-badge atmosphere-world-badge">Selected</span>
                  ) : null}
                </span>
                <span className="atmosphere-world-card-desc">{atmosphere.description}</span>
                <span className="atmosphere-world-card-meta">{atmosphere.colorMood}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

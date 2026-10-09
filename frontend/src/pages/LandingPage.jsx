import {
  ArrowRight, Sparkles, Scissors, Layers3, WandSparkles,
  AudioLines, Play, CheckCircle2, Film,
} from "lucide-react";

export default function LandingPage({ onLaunch }) {
  return (
    <main className="landing-shell min-h-screen overflow-auto text-white">
      <nav className="landing-nav">
        <a href="#home" className="landing-brand" aria-label="VidClips home">
          <span className="landing-mark"><Sparkles size={19} /></span>
          <span>Vid<span className="brand-accent">Clips</span></span>
          <span className="landing-edition">STUDIO</span>
        </a>
        <div className="landing-nav-right">
          <span className="landing-status"><span className="status-dot" /> AI workspace</span>
          <button type="button" className="landing-nav-cta" onClick={onLaunch}>Open editor <ArrowRight size={15} /></button>
        </div>
      </nav>

      <section id="home" className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> VIDEO WORKFLOW, REIMAGINED</div>
          <h1>Every frame has<br />a <span className="hero-gradient">story.</span></h1>
          <p className="hero-description">Explore your footage, understand every scene, and shape your edit in one focused workspace.</p>
          <div className="hero-actions">
            <button type="button" className="hero-primary" onClick={onLaunch}>Launch workspace <ArrowRight size={17} /></button>
            <div className="hero-note"><CheckCircle2 size={15} /> Runs in your browser</div>
          </div>
          <div className="hero-metrics">
            <div><strong>01</strong><span>Import footage</span></div>
            <div className="metric-divider" />
            <div><strong>02</strong><span>Analyze scenes</span></div>
            <div className="metric-divider" />
            <div><strong>03</strong><span>Build your timeline</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Illustration of the VidClips editing workspace">
          <div className="visual-glow" />
          <div className="mock-window">
            <div className="mock-topbar">
              <div className="mock-brand"><span className="mock-brand-icon"><Sparkles size={11} /></span> VidClips <span className="mock-project">/ Untitled project</span></div>
              <div className="mock-window-dots"><i /><i /><i /></div>
            </div>
            <div className="mock-menu"><span>Project</span><span>Edit</span><span>View</span><span>Timeline</span><span>Export</span><span className="mock-ready">● Ready</span></div>
            <div className="mock-workspace">
              <div className="mock-sidebar">
                <div className="mock-sidebar-label">WORKSPACE</div>
                <div className="mock-nav active"><Film size={12} /> Project</div>
                <div className="mock-nav"><Layers3 size={12} /> Scenes</div>
                <div className="mock-nav"><WandSparkles size={12} /> Effects</div>
                <div className="mock-nav"><AudioLines size={12} /> Audio</div>
                <div className="mock-sidebar-card"><span className="mock-card-icon"><Film size={13} /></span><span>My footage<small>Video project</small></span></div>
              </div>
              <div className="mock-main">
                <div className="mock-preview-head"><span>PREVIEW</span><span>00:12:08 <span className="preview-divider">/</span> 00:42:16</span></div>
                <div className="mock-preview">
                  <div className="preview-sun" />
                  <div className="preview-hill hill-back" />
                  <div className="preview-hill hill-front" />
                  <div className="preview-play"><Play size={15} fill="currentColor" /></div>
                  <span className="preview-label">SCENE 04 <i /> 4K · 24 FPS</span>
                </div>
                <div className="mock-timeline-head"><span>EDIT TIMELINE</span><span>−　＋</span></div>
                <div className="mock-ruler"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span><span>00:40</span></div>
                <div className="mock-track"><span className="track-label">V1</span><div className="track-block clip-a"><b>01</b><i /><i /><i /></div><div className="track-block clip-b"><b>02</b><i /><i /><i /></div><div className="track-block clip-c"><b>03</b><i /><i /></div></div>
                <div className="mock-track audio-track"><span className="track-label">A1</span><div className="audio-wave">{Array.from({ length: 72 }, (_, i) => <i key={i} style={{ height: `${8 + ((i * 17 + i * i * 3) % 24)}px` }} />)}</div></div>
                <div className="mock-playhead" />
              </div>
              <div className="mock-inspector"><div className="inspector-title">INSPECTOR</div><div className="inspector-thumb"><Scissors size={16} /></div><div className="inspector-line wide" /><div className="inspector-line" /><div className="inspector-section">CLIP SETTINGS</div><div className="inspector-setting"><span>Scale</span><b>100%</b></div><div className="inspector-slider"><i /></div><div className="inspector-setting"><span>Opacity</span><b>100%</b></div><div className="inspector-slider"><i /></div><div className="inspector-setting"><span>Blend</span><b>Normal</b></div></div>
            </div>
          </div>
          <div className="floating-chip chip-top"><span className="chip-spark"><Sparkles size={13} /></span> Scene analysis <b>Ready</b></div>
          <div className="floating-chip chip-bottom"><span className="chip-pulse" /> Timeline synced <b>●</b></div>
        </div>
      </section>

      <section className="landing-features">
        <div className="features-heading"><div><span className="features-kicker">BUILT FOR THE EDIT</span><h2>Your footage. <span>Your flow.</span></h2></div><p>A thoughtful workspace for the details that make a video work.</p></div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-icon blue"><Film size={18} /></span><h3>Scene intelligence</h3><p>Move through detected scenes and find the moments worth keeping.</p><span className="feature-number">01 / EXPLORE</span></article>
          <article className="feature-card"><span className="feature-icon violet"><Layers3 size={18} /></span><h3>A timeline that makes sense</h3><p>Review clips, navigate your footage, and organize the edit visually.</p><span className="feature-number">02 / ARRANGE</span></article>
          <article className="feature-card"><span className="feature-icon mint"><WandSparkles size={18} /></span><h3>One focused workspace</h3><p>Keep your preview, analysis tools, and project controls close at hand.</p><span className="feature-number">03 / CREATE</span></article>
        </div>
      </section>
      <footer className="landing-footer"><span className="footer-brand">Vid<span>Clips</span></span><span>Made for people who think in frames.</span><button type="button" onClick={onLaunch}>Open workspace <ArrowRight size={14} /></button></footer>
    </main>
  );
}

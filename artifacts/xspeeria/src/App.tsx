import { useState } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { Background } from "@/components/Background";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { TrustBar } from "@/components/TrustBar";
import { WhyP2P } from "@/components/WhyP2P";
import { FeaturesBento } from "@/components/FeaturesBento";
import { HowItWorks } from "@/components/HowItWorks";
import { Calculator } from "@/components/Calculator";
import { Testimonials } from "@/components/Testimonials";
import { Markets } from "@/components/Markets";
import { AppDownload } from "@/components/AppDownload";
import { CtaFooter } from "@/components/CtaFooter";
import { VideoModal } from "@/components/VideoModal";
function XspeeriaApp() {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <>
      <Background />
      <Nav onVideoOpen={() => setVideoOpen(true)} />
      <div className="coming-soon-bar" aria-label="Xspeeria waitlist">
        <div className="csb-track">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="csb-item">
              <span className="csb-dot" aria-hidden="true">✦</span>
              <span className="csb-text">
                <span className="csb-brand">Xspeeria</span> is coming.
              </span>
              <span className="csb-cta">Get early access — join the waitlist now</span>
            </span>
          ))}
        </div>
      </div>
      <main>
        <Hero onVideoOpen={() => setVideoOpen(true)} />
        <TrustBar />
        <WhyP2P />
        <FeaturesBento />
        <HowItWorks />
        <Calculator />
        <Testimonials />
        <Markets />
        <AppDownload />
      </main>
      <CtaFooter />
      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} videoUrl="" />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <XspeeriaApp />
    </ThemeProvider>
  );
}

export default App;

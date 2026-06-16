import { useState } from "react";
import { Logo } from "./Logo";

export function CtaFooter() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("Free to join. No credit card required.");
  const [msgColor, setMsgColor] = useState("var(--text-dim)");

  const joinWaitlist = () => {
    if (email && /\S+@\S+\.\S+/.test(email)) {
      setEmail("");
      setMsg("🎉 Welcome aboard! We'll be in touch soon.");
      setMsgColor("var(--mint)");
      setTimeout(() => {
        setMsg("Free to join. No credit card required.");
        setMsgColor("var(--text-dim)");
      }, 4000);
    }
  };

  return (
    <footer id="cta-footer">
      <div className="container">
        <div className="cta-block">
          <div className="eyebrow" style={{ marginBottom: "12px" }}>Get Early Access</div>
          <h2>Ready to Exchange<br />at the Real Rate?</h2>
          <p>Join thousands of people who are already saving on every international transfer.</p>
          <div className="waitlist-form">
            <input
              type="email"
              id="waitlist-email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") joinWaitlist(); }}
            />
            <button onClick={joinWaitlist}>Join Waitlist</button>
          </div>
          <div className="waitlist-note" style={{ color: msgColor }}>{msg}</div>
        </div>

        <div className="footer-links-row">
          <div className="footer-brand">
            <div style={{ marginBottom: "12px" }}>
              <Logo />
            </div>
            <p>The P2P FX marketplace by IntelYtics Limited. Connecting People. Connecting Currencies. Connecting Benefit.</p>
            <small>© 2025 IntelYtics Limited. All rights reserved.</small>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#why">Why P2P</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#how">How It Works</a></li>
              <li><a href="#calculator">Calculator</a></li>
              <li><a href="#app-download">Download App</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#">About Us</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Press</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Compliance</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copy">
            © 2025 IntelYtics Limited · Xspeeria is a registered trademark
          </div>
          <div className="cert-pills">
            <span className="cert-pill">ISO 27001</span>
            <span className="cert-pill">KYC/AML</span>
            <span className="cert-pill">AES-256</span>
            <span className="cert-pill">Escrow-Protected</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

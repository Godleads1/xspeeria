export function Background() {
  return (
    <>
      {/* Dot grid */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage:
            "radial-gradient(var(--bg-dot) 2px, transparent 2px)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Ambient gradient orbs */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: [
            "radial-gradient(ellipse 800px 600px at 88% 8%, var(--orb-blue) 0%, transparent 65%)",
            "radial-gradient(ellipse 600px 500px at 4% 72%, var(--orb-mint) 0%, transparent 65%)",
            "radial-gradient(ellipse 500px 400px at 55% 95%, var(--orb-purple) 0%, transparent 65%)",
          ].join(","),
        }}
      />
    </>
  );
}

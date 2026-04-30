// One-line "this section works best on a wider screen" banner shown
// only on mobile (controlled by globals.css's .desktop-hide rule).
// Server-renderable so it can sit at the top of admin / my-office
// layouts without forcing them into client components.
export default function MobileAdminHint() {
  return (
    <div
      className="desktop-hide"
      style={{
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#9a3412",
        fontSize: 12,
        padding: "8px 12px",
        borderRadius: 8,
        marginBottom: 12,
        lineHeight: 1.4
      }}
    >
      Admin tools are dense — wide tables and inline editors work best on a larger screen. Pinch to zoom or rotate as needed.
    </div>
  );
}

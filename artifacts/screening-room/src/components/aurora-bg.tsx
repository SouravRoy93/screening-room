export function AuroraBg() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#08080d]">
      <div
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] animate-pulse"
        style={{ background: "#8b5cf6" }}
      />
      <div
        className="absolute -bottom-48 -right-48 w-[700px] h-[700px] rounded-full opacity-15 blur-[150px] animate-pulse"
        style={{ background: "#ec4899", animationDelay: "1s" }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10 blur-[100px] animate-pulse"
        style={{ background: "#ffd36b", animationDelay: "2s" }}
      />
    </div>
  );
}

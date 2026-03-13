export function ThreeDotLoader({
  size = 10,
  className = "bg-pink-300",
}: {
  size?: number;
  className?: string;
}) {
  const scale = size / 10;
  return (
    <span
      className="inline-flex items-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        style={{
          width: 10,
          height: 10,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            position: "relative",
            display: "block",
            animation: "threeDotTriangleSpin 1.5s linear infinite",
            transformOrigin: "5px 5px",
          }}
        >
          {/* Top dot */}
          <span
            className={`absolute w-[3px] h-[3px] rounded-full ${className}`}
            style={{
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              animation: "threeDotPulse 1.2s ease-in-out infinite",
              animationDelay: "0s",
            }}
          />
          {/* Bottom-left dot */}
          <span
            className={`absolute w-[3px] h-[3px] rounded-full ${className}`}
            style={{
              bottom: 0,
              left: 0,
              animation: "threeDotPulse 1.2s ease-in-out infinite",
              animationDelay: "0.2s",
            }}
          />
          {/* Bottom-right dot */}
          <span
            className={`absolute w-[3px] h-[3px] rounded-full ${className}`}
            style={{
              bottom: 0,
              right: 0,
              animation: "threeDotPulse 1.2s ease-in-out infinite",
              animationDelay: "0.4s",
            }}
          />
        </span>
      </span>
      <style>{`@keyframes threeDotPulse { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } } @keyframes threeDotTriangleSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

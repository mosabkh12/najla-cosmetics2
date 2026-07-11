import { Children, type ReactNode } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export function Reveal({
  children,
  className = "",
  direction = "up",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  direction?: "up" | "down" | "start" | "end" | "scale" | "zoom";
  delay?: number;
}) {
  const { ref, visible } = useScrollReveal(0.12);
  const delayClass = delay > 0 ? `reveal-delay-${delay}` : "";
  return (
    <div
      ref={ref}
      className={`reveal-base reveal-${direction} ${delayClass} ${visible ? "revealed" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

function RevealItem({ children, index }: { children: ReactNode; index: number }) {
  const { ref, visible } = useScrollReveal(0.08);
  const staggerDelay = Math.min(index * 0.03, 0.3);
  return (
    <div
      ref={ref}
      className={`scroll-reveal-item ${visible ? "revealed" : ""}`}
      style={{ transitionDelay: visible ? `${staggerDelay}s` : "0s" }}
    >
      {children}
    </div>
  );
}

export function StaggerGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) =>
        child ? <RevealItem index={i}>{child}</RevealItem> : null,
      )}
    </div>
  );
}

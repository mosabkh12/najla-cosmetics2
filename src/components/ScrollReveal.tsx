import type { ReactNode } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export function Reveal({ children, className = "", direction = "up", delay = 0 }: {
  children: ReactNode;
  className?: string;
  direction?: "up" | "down" | "start" | "end" | "scale" | "zoom";
  delay?: number;
}) {
  const { ref, visible } = useScrollReveal(0.12);
  const delayClass = delay > 0 ? `reveal-delay-${delay}` : "";
  return (
    <div ref={ref} className={`reveal-base reveal-${direction} ${delayClass} ${visible ? "revealed" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function StaggerGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useScrollReveal(0.08);
  return (
    <div ref={ref} className={`stagger-children ${visible ? "revealed" : ""} ${className}`}>
      {children}
    </div>
  );
}

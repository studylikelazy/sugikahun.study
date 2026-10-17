/** Midnight UI atoms — 工場の計測器。ダークな産業UI、数字はモノフォント。 */
import type { ReactNode } from "react";
import type { Grade } from "@shared/midnight/types";

export const GRADE_COLOR: Record<Grade, string> = {
  C: "#9FB0C3",
  B: "#7dd87d",
  A: "#39D7E6",
  S: "#FF7A1A",
  LEGENDARY: "#D9A441",
};

export function Panel({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-white/10 bg-[#12161C] ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <h3 className="text-[11px] font-black tracking-[0.18em] text-[#9FB0C3]">{title}</h3>
          {right}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Btn({
  children, onClick, disabled, kind = "default", title, className = "",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: "default" | "primary" | "gold" | "danger" | "ghost"; title?: string; className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-[12px] font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
  const kinds: Record<string, string> = {
    default: "border-white/15 bg-white/5 text-[#E6EDF3] hover:bg-white/10",
    primary: "border-[#FF7A1A]/60 bg-[#FF7A1A]/15 text-[#FFB27A] hover:bg-[#FF7A1A]/25",
    gold: "border-[#D9A441]/60 bg-[#D9A441]/10 text-[#EBCB8A] hover:bg-[#D9A441]/20",
    danger: "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    ghost: "border-transparent bg-transparent text-[#9FB0C3] hover:text-white",
  };
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${kinds[kind]} ${className}`}>{children}</button>;
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "cyan" | "gold" | "red" | "orange" }) {
  const tones: Record<string, string> = {
    default: "border-white/15 text-[#9FB0C3]",
    cyan: "border-[#39D7E6]/50 text-[#39D7E6]",
    gold: "border-[#D9A441]/60 text-[#D9A441]",
    red: "border-red-500/50 text-red-300",
    orange: "border-[#FF7A1A]/50 text-[#FFB27A]",
  };
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function GradeBadge({ grade, size = "sm" }: { grade: Grade | string; size?: "sm" | "lg" }) {
  const c = GRADE_COLOR[grade as Grade] ?? "#9FB0C3";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm border font-black ${size === "lg" ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[10px]"}`}
      style={{ color: c, borderColor: c + "88", background: c + "1A" }}
    >
      {grade}
    </span>
  );
}

/** 0..1 の状態バー。invert=true は「低いほど良い」 */
export function Bar({ value, invert = false, width = "w-full" }: { value: number; invert?: boolean; width?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const good = invert ? v <= 0.3 : v >= 0.7;
  const mid = invert ? v <= 0.6 : v >= 0.4;
  const color = good ? "#4ade80" : mid ? "#D9A441" : "#f87171";
  return (
    <span className={`inline-block h-1.5 overflow-hidden rounded bg-white/10 align-middle ${width}`}>
      <span className="block h-full" style={{ width: `${Math.round(v * 100)}%`, background: color }} />
    </span>
  );
}

export function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={`rounded border border-white/10 bg-black/30 px-2.5 py-2 ${className}`}>
      <div className="text-[9px] font-black tracking-[0.16em] text-[#7C8B9E]">{label}</div>
      <div className="font-mono text-base font-bold leading-tight text-[#E6EDF3]">{value}</div>
      {sub && <div className="text-[10px] leading-tight text-[#7C8B9E]">{sub}</div>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-[12px] leading-relaxed text-[#7C8B9E]">{text}</p>;
}

export const INPUT_CLS = "w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono text-[13px] text-[#E6EDF3] outline-none focus:border-[#FF7A1A]/70";
export const SELECT_CLS = "w-full appearance-none rounded border border-white/15 bg-[#161B22] px-2 py-1.5 text-[12px] font-bold text-[#E6EDF3] outline-none focus:border-[#FF7A1A]/70";

/** 表示帯（未鑑定は±0.25、鑑定で狭まる） */
export function ConditionBand({ min, max, level }: { min: number; max: number; level: 0 | 1 | 2 }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-2 w-24 overflow-hidden rounded bg-white/10 align-middle">
        <span
          className="absolute top-0 h-full bg-[#39D7E6]/70"
          style={{ left: `${Math.round(min * 100)}%`, width: `${Math.max(2, Math.round((max - min) * 100))}%` }}
        />
      </span>
      <span className="font-mono text-[11px] text-[#A8E6EC]">
        {Math.round(min * 100)}–{Math.round(max * 100)}%
      </span>
      <span className="text-[10px] text-[#7C8B9E]">{level === 0 ? "未鑑定" : level === 1 ? "Lv1鑑定" : "Lv2計測"}</span>
    </span>
  );
}

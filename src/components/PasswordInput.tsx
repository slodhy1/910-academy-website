"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = {
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  className?: string;
  id?: string;
  placeholder?: string;
};

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  className = "auth-input",
  id,
  placeholder,
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${className} pw-input`}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="pw-toggle"
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        tabIndex={0}
      >
        {revealed ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
      <style>{`
        .pw-wrap { position: relative; display: block; }
        .pw-wrap .pw-input { width: 100%; padding-right: 44px; }
        .pw-toggle {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          color: var(--fg-muted);
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: color 0.15s;
        }
        .pw-toggle:hover { color: var(--fg); }
        .pw-toggle:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
      `}</style>
    </div>
  );
}

export function MinLengthIndicator({ value, min }: { value: string; min: number }) {
  if (value.length === 0) return null;
  const ok = value.length >= min;
  return (
    <p className={`pw-indicator${ok ? " pw-indicator-ok" : " pw-indicator-bad"}`}>
      <span aria-hidden>{ok ? "✓" : "✗"}</span> At least {min} characters
      <style>{`
        .pw-indicator { font-size: 12px; line-height: 1.4; margin-top: 2px; display: flex; gap: 6px; align-items: center; letter-spacing: 0.02em; }
        .pw-indicator-ok { color: #5fd16a; }
        .pw-indicator-bad { color: #ff6b6b; }
      `}</style>
    </p>
  );
}

export function MatchIndicator({ a, b }: { a: string; b: string }) {
  if (b.length === 0) return null;
  const ok = a === b;
  return (
    <p className={`pw-indicator${ok ? " pw-indicator-ok" : " pw-indicator-bad"}`}>
      <span aria-hidden>{ok ? "✓" : "✗"}</span> {ok ? "Passwords match" : "Passwords don't match"}
      <style>{`
        .pw-indicator { font-size: 12px; line-height: 1.4; margin-top: 2px; display: flex; gap: 6px; align-items: center; letter-spacing: 0.02em; }
        .pw-indicator-ok { color: #5fd16a; }
        .pw-indicator-bad { color: #ff6b6b; }
      `}</style>
    </p>
  );
}

"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border px-4 py-2">
      인쇄
    </button>
  );
}

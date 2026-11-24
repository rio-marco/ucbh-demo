"use client";

import { useEffect } from "react";

export default function KeepAlivePing() {
  useEffect(() => {
    const ping = async () => {
      try {
        await fetch("/api/keep-alive", { cache: "no-store" });
      } catch {}
    };

    void ping();
    const interval = setInterval(() => {
      void ping();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return null;
}

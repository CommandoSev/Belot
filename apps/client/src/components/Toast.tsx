import { useEffect, useState } from "react";
import type { LastError } from "../socket";

const TOAST_MS = 4000;

export function Toast({ error }: { error: LastError | null }) {
  const [visible, setVisible] = useState<LastError | null>(null);

  useEffect(() => {
    if (!error) return;
    setVisible(error);
    const timer = setTimeout(() => setVisible(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [error]);

  if (!visible) return null;
  return (
    <div className="toast" role="alert">
      {visible.message}
    </div>
  );
}

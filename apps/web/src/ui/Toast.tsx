import { useEffect } from "react";
import { usePlanStore } from "../store/planStore";

export function Toast() {
  const notice = usePlanStore((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => usePlanStore.setState({ notice: null }), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return <div className="toast" role="status">{notice.text}</div>;
}

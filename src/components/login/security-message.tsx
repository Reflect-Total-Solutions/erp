import { Shield } from "lucide-react";

export function SecurityMessage() {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-[#94A3B8]">
      <Shield className="h-3.5 w-3.5" />
      <span>Secure access • Protected by enterprise-grade security</span>
    </div>
  );
}

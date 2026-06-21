import type { AttendancePolicy } from "./types.js";

export const ATTENDANCE_POLICIES: AttendancePolicy[] = [
  "manual-ok",
  "agents-foreground",
  "all-foreground",
  "host-directed"
];

export function parseAttendancePolicy(value: string): AttendancePolicy {
  if (ATTENDANCE_POLICIES.includes(value as AttendancePolicy)) return value as AttendancePolicy;
  throw new Error(`attendance policy must be one of: ${ATTENDANCE_POLICIES.join(", ")}`);
}

export function describeAttendancePolicy(policy: AttendancePolicy): string {
  if (policy === "manual-ok") return "Manual/drop-in participation is allowed.";
  if (policy === "agents-foreground") return "Agent participants should run foreground attendance until the room closes.";
  if (policy === "all-foreground") return "All agent participants are expected to stay in foreground attendance until released.";
  return "Participants may start manual/standby and switch to foreground when the host asks; fully idle agents will not see that request.";
}

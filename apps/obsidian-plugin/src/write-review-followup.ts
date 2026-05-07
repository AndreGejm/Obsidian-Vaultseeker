import type { ApplyApprovedVaultWriteOperationStatus } from "./write-apply-controller";

export type AcceptedWriteFollowupInput = {
  status: ApplyApprovedVaultWriteOperationStatus;
  targetPath: string;
  activePath: string | null;
};

export function shouldRefreshIndexAfterAcceptedWrite(input: AcceptedWriteFollowupInput): boolean {
  return input.status === "applied" && input.activePath !== null && input.targetPath === input.activePath;
}

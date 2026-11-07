import { ActionButton } from "@/components/client/action-button";
import { deleteAction } from "@/app/(app)/delete-action";
import type { DeletableType } from "@/server/services/deletion";

/**
 * Delete with confirmation. The server refuses (with a reason) when the record has history,
 * so the button can be shown wherever the user has the permission.
 */
export function DeleteButton({ type, id, label, small, children = "Sil" }: { type: DeletableType; id: string; label: string; small?: boolean; children?: React.ReactNode }) {
  return (
    <ActionButton
      className={`btn btn-danger${small ? " btn-sm" : ""}`}
      action={deleteAction.bind(null, type, id)}
      confirm={`“${label}” birdəfəlik silinsin? Bu əməliyyat geri qaytarılmır. Tarixçəsi olan qeydlər silinmir — sistem səbəbini göstərəcək.`}
    >
      {children}
    </ActionButton>
  );
}

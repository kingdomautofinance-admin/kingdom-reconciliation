import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';

interface DeleteReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  mode: 'delete' | 'view';
  existingReason?: string;
  onRestore?: () => void;
}

export function DeleteReceivableModal({
  isOpen,
  onClose,
  onConfirm,
  mode,
  existingReason,
  onRestore,
}: DeleteReceivableModalProps) {
  const [reason, setReason] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  if (!isOpen) return null;

  const handleDelete = () => {
    if (mode === 'delete' && !showConfirmation) {
      setShowConfirmation(true);
      return;
    }

    if (mode === 'delete' && reason.trim()) {
      onConfirm(reason.trim());
      setReason('');
      setShowConfirmation(false);
      onClose();
    }
  };

  const handleRestore = () => {
    if (onRestore) {
      onRestore();
      onClose();
    }
  };

  const handleClose = () => {
    setReason('');
    setShowConfirmation(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-receivable-title">
      <Card className="w-full max-w-[95vw] sm:max-w-md p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="delete-receivable-title" className="text-xl font-semibold">
            {mode === 'delete' ? 'Delete Receivable' : 'Deletion Reason'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {mode === 'delete' && !showConfirmation && (
          <>
            <p className="text-sm text-muted-foreground">
              Please provide a reason for deleting this receivable. This action can be reversed later.
            </p>
            <div className="space-y-2">
              <label htmlFor="delete-reason" className="text-sm font-medium">
                Deletion Reason *
              </label>
              <Input
                id="delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for deletion..."
                className="w-full"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!reason.trim()}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {mode === 'delete' && showConfirmation && (
          <>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this receivable?
            </p>
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-1">Reason:</p>
              <p className="text-sm">{reason}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowConfirmation(false)}
              >
                Back
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Confirm Delete
              </Button>
            </div>
          </>
        )}

        {mode === 'view' && (
          <>
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-1">Reason for deletion:</p>
              <p className="text-sm">{existingReason || 'No reason provided'}</p>
            </div>
            <div className="flex gap-2 justify-end">
              {onRestore && (
                <Button variant="default" onClick={handleRestore}>
                  Restore Receivable
                </Button>
              )}
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

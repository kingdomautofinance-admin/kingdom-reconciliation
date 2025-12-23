import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { X, Calendar } from 'lucide-react';
import type { DealerReceivable } from '@/lib/database.types';
import { formatISODateToUS, parseUSDateToISO, formatUSDateInput } from '@/lib/utils';

interface EditReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updates: Partial<DealerReceivable>) => void;
  receivable: DealerReceivable | null;
}

export function EditReceivableModal({
  isOpen,
  onClose,
  onConfirm,
  receivable,
}: EditReceivableModalProps) {
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [client, setClient] = useState('');
  const [depositor, setDepositor] = useState('');
  const datePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (receivable) {
      setDate(formatISODateToUS(receivable.date.slice(0, 10)) || '');
      setAmount(receivable.amount?.toString() || '');
      setClient(receivable.client || '');
      setDepositor(receivable.depositor || '');
    }
  }, [receivable]);

  const openDatePicker = () => {
    const input = datePickerRef.current;
    if (input && typeof input.showPicker === 'function') {
      input.showPicker();
    }
  };

  if (!isOpen || !receivable) return null;

  const handleSave = () => {
    const updates: Partial<DealerReceivable> = {};

    const isoDate = parseUSDateToISO(date);
    if (isoDate && isoDate !== receivable.date.slice(0, 10)) {
      updates.date = isoDate;
    }

    const numericAmount = parseFloat(amount.replace(/[^\d.-]/g, ''));
    const currentValue = typeof receivable.amount === 'string'
      ? parseFloat(receivable.amount)
      : receivable.amount;
    if (!isNaN(numericAmount) && numericAmount !== currentValue) {
      updates.amount = numericAmount.toString();
    }

    if (client !== (receivable.client || '')) {
      updates.client = client || null;
    }

    if (depositor !== (receivable.depositor || '')) {
      updates.depositor = depositor || null;
    }

    if (Object.keys(updates).length > 0) {
      onConfirm(updates);
    }

    handleClose();
  };

  const handleClose = () => {
    setDate('');
    setAmount('');
    setClient('');
    setDepositor('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-receivable-title">
      <Card className="w-full max-w-[95vw] sm:max-w-lg p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="edit-receivable-title" className="text-xl font-semibold">Edit Receivable</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="edit-date" className="text-sm font-medium">
              Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="edit-date"
                type="text"
                placeholder="MM/DD/YYYY"
                value={date}
                onChange={(e) => setDate(formatUSDateInput(e.target.value))}
                onClick={openDatePicker}
                className="pl-9 cursor-pointer"
                maxLength={10}
              />
              <input
                ref={datePickerRef}
                type="date"
                lang="en-US"
                tabIndex={-1}
                aria-hidden="true"
                value={parseUSDateToISO(date) ?? ''}
                onChange={(e) => setDate(e.target.value ? formatISODateToUS(e.target.value) : '')}
                className="absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-amount" className="text-sm font-medium">
              Amount
            </label>
            <Input
              id="edit-amount"
              type="text"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-client" className="text-sm font-medium">
              Client
            </label>
            <Input
              id="edit-client"
              type="text"
              placeholder="Client name..."
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-depositor" className="text-sm font-medium">
              Depositor
            </label>
            <Input
              id="edit-depositor"
              type="text"
              placeholder="Depositor name..."
              value={depositor}
              onChange={(e) => setDepositor(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}

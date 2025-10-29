import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';
import type { Transaction } from '@/lib/database.types';
import { formatISODateToUS, parseUSDateToISO, formatUSDateInput } from '@/lib/utils';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updates: Partial<Transaction>) => void;
  transaction: Transaction | null;
}

export function EditTransactionModal({
  isOpen,
  onClose,
  onConfirm,
  transaction,
}: EditTransactionModalProps) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [depositor, setDepositor] = useState('');
  const [car, setCar] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');

  useEffect(() => {
    if (transaction) {
      setDate(formatISODateToUS(transaction.date) || '');
      setName(transaction.name || '');
      setDepositor(transaction.depositor || '');
      setCar(transaction.car || '');
      setPaymentMethod(transaction.payment_method || '');
      setAmount(transaction.value?.toString() || '');
      setSource(transaction.source || '');
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const handleSave = () => {
    const updates: Partial<Transaction> = {};
    
    const isoDate = parseUSDateToISO(date);
    if (isoDate && isoDate !== transaction.date) {
      updates.date = isoDate;
    }
    
    if (name !== (transaction.name || '')) {
      updates.name = name || null;
    }
    
    if (depositor !== (transaction.depositor || '')) {
      updates.depositor = depositor || null;
    }
    
    if (car !== (transaction.car || '')) {
      updates.car = car || null;
    }
    
    if (paymentMethod !== (transaction.payment_method || '')) {
      updates.payment_method = paymentMethod || null;
    }
    
    const numericAmount = parseFloat(amount.replace(/[^\d.-]/g, ''));
    const currentValue = typeof transaction.value === 'string' 
      ? parseFloat(transaction.value) 
      : transaction.value;
    if (!isNaN(numericAmount) && numericAmount !== currentValue) {
      updates.value = numericAmount.toString();
    }
    
    if (source !== (transaction.source || '')) {
      updates.source = source || null;
    }

    if (Object.keys(updates).length > 0) {
      onConfirm(updates);
    }
    
    handleClose();
  };

  const handleClose = () => {
    setDate('');
    setName('');
    setDepositor('');
    setCar('');
    setPaymentMethod('');
    setAmount('');
    setSource('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Transaction</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="edit-date" className="text-sm font-medium">
              Date
            </label>
            <Input
              id="edit-date"
              type="text"
              placeholder="MM/DD/YYYY"
              value={date}
              onChange={(e) => setDate(formatUSDateInput(e.target.value))}
              maxLength={10}
            />
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
            <label htmlFor="edit-name" className="text-sm font-medium">
              Client / Name
            </label>
            <Input
              id="edit-name"
              type="text"
              placeholder="Client name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          <div className="space-y-2">
            <label htmlFor="edit-car" className="text-sm font-medium">
              Car
            </label>
            <Input
              id="edit-car"
              type="text"
              placeholder="Car..."
              value={car}
              onChange={(e) => setCar(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-method" className="text-sm font-medium">
              Payment Method
            </label>
            <Input
              id="edit-method"
              type="text"
              placeholder="Payment method..."
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
          </div>

          <div className="space-y-2 col-span-2">
            <label htmlFor="edit-source" className="text-sm font-medium">
              Source
            </label>
            <Input
              id="edit-source"
              type="text"
              placeholder="Source..."
              value={source}
              onChange={(e) => setSource(e.target.value)}
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

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const ACCESS_TOKEN_KEY = 'kr-access-until';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'Kingdom2025!$$';

type PasswordGateProps = {
  onAuthenticated: () => void;
};

export function getAccessExpiry(): number | null {
  const raw = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function hasValidAccess(): boolean {
  const expiry = getAccessExpiry();
  return typeof expiry === 'number' && expiry > Date.now();
}

function setAccessExpiry() {
  const expiry = Date.now() + SESSION_TTL_MS;
  localStorage.setItem(ACCESS_TOKEN_KEY, String(expiry));
}

export default function PasswordGate({ onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Please enter the password.');
      return;
    }

    if (password !== PASSWORD) {
      setError('Incorrect password.');
      return;
    }

    setAccessExpiry();
    onAuthenticated();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-slate-950/70" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle>Reconciliation System</CardTitle>
            <CardDescription>
              Enter the password to access Kingdom Auto Finance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                />
              </div>
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full">
                Unlock
              </Button>
              <p className="text-xs text-muted-foreground">
                You will be asked again after 24 hours.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

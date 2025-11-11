import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useWizardStore } from '../state/wizardStore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { onboardingApi } from '../services/onboardingApi';

function toError(error: unknown): Error {
  if (error instanceof Error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (responseMessage && responseMessage !== error.message) {
      return new Error(responseMessage);
    }
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const responseMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (responseMessage) {
      return new Error(responseMessage);
    }
    const message = (error as { message?: string }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return new Error(message);
    }
  }

  return new Error('Unexpected error while looking up the customer.');
}

export function CustomerIntakePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { reset, setSessionId, setCustomerProfile, setVehicles, setParts } = useWizardStore();
  const [username, setUsername] = useState('');

  const startMutation = useMutation({
    mutationFn: async () => {
      try {
        const lookup = await onboardingApi.lookupCustomer({ username: username.trim() });
        return await onboardingApi.bootstrapCustomer({
          customerId: lookup.customerId,
          displayName: lookup.displayName,
          notes: ''
        });
      } catch (error) {
        throw toError(error);
      }
    },
    onSuccess: (data) => {
      queryClient.clear();
      reset();
      setSessionId(data.session.sessionId);
      setCustomerProfile(data.session.customer);
      setVehicles(data.vehicles);
      setParts(data.parts);
      // Navigate with sessionId in URL path - start with employees
      navigate(`/onboarding/${data.session.sessionId}/employees`);
    }
  });

  const canSubmit = username.trim().length > 0;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <section className="panel stack" aria-labelledby="customer-intake-heading">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto var(--space-lg)',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            borderRadius: 'var(--radius-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            boxShadow: 'var(--shadow-lg)'
          }}>
            🚀
          </div>
          <h2 id="customer-intake-heading" style={{ marginBottom: 'var(--space-sm)' }}>Start Customer Onboarding</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
            Enter the customer username to begin the migration process
          </p>
        </div>

        <label className="stack" style={{ gap: '0.5rem' }}>
          <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>Customer Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. smith-and-sons"
            className="input"
            style={{ fontSize: '1rem', padding: 'var(--space-md)' }}
            autoFocus
          />
        </label>

        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
          <button
            className="button"
            onClick={() => startMutation.mutate()}
            disabled={!canSubmit || startMutation.isPending}
            style={{ padding: 'var(--space-md) var(--space-2xl)', fontSize: '1rem' }}
          >
            {startMutation.isPending ? '🔄 Preparing workspace…' : '✨ Begin Onboarding'}
          </button>
        </div>

        {startMutation.isError && (
          <div role="alert" className="alert" style={{ textAlign: 'center' }}>
            <strong>Error:</strong> {(startMutation.error as Error).message || 'Unable to prepare onboarding workspace.'}
          </div>
        )}
      </section>

    </div>
  );
}

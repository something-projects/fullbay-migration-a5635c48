import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { onboardingApi } from '../services/onboardingApi';
import { useWizardStore } from '../state/wizardStore';
import type { PartUpdatePayload } from '../../shared/onboarding';

export function PartsReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    customer,
    parts,
    setParts,
    updatePart,
    partSummary,
    setPartSummary
  } = useWizardStore();
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PartUpdatePayload>({});
  const [isPartsListExpanded, setIsPartsListExpanded] = useState(false);

  useEffect(() => {
    if (!customer) {
      navigate('/onboarding', { replace: true });
    }
  }, [customer, navigate]);

  const partsQuery = useQuery({
    queryKey: ['parts', customer?.customerId],
    enabled: !!customer?.customerId,
    queryFn: async () => onboardingApi.fetchParts(customer!.customerId)
  });

  useEffect(() => {
    if (partsQuery.data) {
      setParts(partsQuery.data.parts);
      setPartSummary(partsQuery.data.summary);
    }
  }, [partsQuery.data, setParts, setPartSummary]);

  useEffect(() => {
    if (!parts.length) {
      if (selectedPartId !== null) {
        setSelectedPartId(null);
      }
      return;
    }

    const selectedExists = selectedPartId ? parts.some((part) => part.partId === selectedPartId) : false;
    if (!selectedExists) {
      setSelectedPartId(parts[0].partId);
    }
  }, [parts, selectedPartId]);

  const selectedPart = useMemo(
    () => parts.find((part) => part.partId === selectedPartId),
    [parts, selectedPartId]
  );

  useEffect(() => {
    if (selectedPart) {
      setFormState({
        overridePartNumber: selectedPart.oemPartNumber,
        overrideDescription: selectedPart.description
      });
    } else {
      setFormState({});
    }
  }, [selectedPart]);

  const updateMutation = useMutation({
    mutationFn: async (payload: PartUpdatePayload) => {
      if (!customer || !selectedPart) throw new Error('No part selected');
      const updated = await onboardingApi.updatePart(customer.customerId, selectedPart.partId, payload);
      return updated;
    },
    onSuccess: (updatedPart) => {
      updatePart(updatedPart.partId, () => updatedPart);
      queryClient.invalidateQueries({ queryKey: ['parts', customer?.customerId] });
    }
  });

  const legacyMutation = useMutation({
    mutationFn: async () => {
      if (!customer || !selectedPart) throw new Error('No part selected');
      const updated = await onboardingApi.updatePart(customer.customerId, selectedPart.partId, {
        markAsLegacy: true
      });
      return updated;
    },
    onSuccess: (updatedPart) => {
      updatePart(updatedPart.partId, () => updatedPart);
      queryClient.invalidateQueries({ queryKey: ['parts', customer?.customerId] });
    }
  });

  const handleInputChange = <K extends keyof PartUpdatePayload>(key: K, value: PartUpdatePayload[K]) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => updateMutation.mutate(formState);
  const handleLegacy = () => legacyMutation.mutate();

  const handleApplySuggestion = (payload: PartUpdatePayload) => {
    setFormState((prev) => ({
      ...prev,
      ...(payload.overridePartNumber !== undefined ? { overridePartNumber: payload.overridePartNumber ?? '' } : {}),
      ...(payload.overrideDescription !== undefined ? { overrideDescription: payload.overrideDescription ?? '' } : {})
    }));

    if (payload.markAsLegacy) {
      legacyMutation.mutate();
    }
  };

  const allPartsReviewed = parts.length === 0 || parts.every((part) => part.status !== 'pending');

  if (!customer) {
    return null;
  }

  return (
    <div className="stack" style={{ gap: '2rem' }}>
      <section className="panel stack">
        <div className="split" style={{ alignItems: 'center' }}>
          <div>
            <h2>Parts matching review</h2>
            <p>Confirm AutoCare PIES matches, correct part metadata, or mark legacy inventory no longer serviced.</p>
          </div>
          <div className="metric">
            <span>Total parts</span>
            <strong>{parts.length}</strong>
          </div>
          <div className="metric">
            <span>Validated</span>
            <strong>{parts.filter((part) => part.status === 'validated').length}</strong>
          </div>
        </div>
      </section>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customer.customerId}/vehicles`)}>
          ← Back to vehicles
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${customer.customerId}/service-orders`)}>
          Continue to service orders →
        </button>
      </nav>

      {partSummary && (
        <section className="panel stack" style={{ gap: '1rem' }}>
          <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="metric">
              <span>Validated</span>
              <strong>{partSummary.totals.validated}</strong>
            </div>
            <div className="metric">
              <span>Legacy</span>
              <strong>{partSummary.totals.legacy}</strong>
            </div>
            <div className="metric">
              <span>Pending</span>
              <strong>{partSummary.totals.pending}</strong>
            </div>
            <div className="metric">
              <span>Total parts</span>
              <strong>{partSummary.totals.total}</strong>
            </div>
          </div>
        </section>
      )}

      {selectedPart && selectedPart.suggestions.length > 0 && (
        <section className="panel stack" style={{ gap: '1rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              ✨ Recommended Actions
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', fontSize: '0.875rem' }}>
              Quick fixes for {selectedPart.oemPartNumber || selectedPart.partId}
            </p>
          </div>
          <div className="suggestion-grid">
            {selectedPart.suggestions.map((suggestion) => (
              <div key={suggestion.suggestionId} className="suggestion-card">
                <div>
                  <strong>{suggestion.title}</strong>
                  {suggestion.description && (
                    <p className="suggestion-copy">{suggestion.description}</p>
                  )}
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => handleApplySuggestion(suggestion.payload)}
                >
                  Apply suggestion
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedPart && (
        <section className="panel" style={{ background: 'rgba(16,185,129,0.08)' }}>
          <div className="stack" style={{ gap: '1.5rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Review part: {selectedPart.oemPartNumber || selectedPart.partId}</h3>
              <p style={{ color: 'rgba(15,23,42,0.65)', marginTop: '0.35rem' }}>
                Update part identifiers or descriptions so downstream systems can reconcile inventory.
              </p>
            </div>

            {selectedPart.autoCareReference?.partName && (
              <div className="info-strip">
                <span>AutoCare reference:</span>
                <span>{selectedPart.autoCareReference.partName}</span>
                {selectedPart.autoCareReference.matchingMethod && (
                  <span className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#0f766e' }}>
                    Method {selectedPart.autoCareReference.matchingMethod}
                  </span>
                )}
                {typeof selectedPart.autoCareReference.confidence === 'number' && (
                  <span className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#0f766e' }}>
                    Confidence {Math.round((selectedPart.autoCareReference.confidence ?? 0) * 100)}%
                  </span>
                )}
              </div>
            )}

            <div className="split">
              <label className="stack" style={{ gap: '0.4rem' }}>
                <span>Part number</span>
                <input
                  className="input"
                  value={formState.overridePartNumber ?? ''}
                  onChange={(event) => handleInputChange('overridePartNumber', event.target.value)}
                  placeholder="OEM or supplier part number"
                />
              </label>
              <label className="stack" style={{ gap: '0.4rem' }}>
                <span>Description</span>
                <input
                  className="input"
                  value={formState.overrideDescription ?? ''}
                  onChange={(event) => handleInputChange('overrideDescription', event.target.value)}
                  placeholder="Short description"
                />
              </label>
            </div>

            <div className="stack" style={{ gap: '0.35rem' }}>
              <span>Top unmatched attributes</span>
              <div className="split">
                {selectedPart.unmatchedAttributes.length > 0 ? (
                  selectedPart.unmatchedAttributes.map((attribute) => (
                    <span key={attribute} className="badge">{attribute}</span>
                  ))
                ) : (
                  <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#166534' }}>
                    Matched across all attributes
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="button" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving…' : 'Save part'}
              </button>
              <button className="button button-secondary" onClick={handleLegacy} disabled={legacyMutation.isPending}>
                {legacyMutation.isPending ? 'Marking…' : 'Mark as legacy'}
              </button>
            </div>

            {(updateMutation.isError || legacyMutation.isError) && (
              <p role="alert" className="alert">
                {(updateMutation.error as Error)?.message || (legacyMutation.error as Error)?.message || 'Unable to update part.'}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="panel stack" style={{ gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>All Parts ({parts.length})</h3>
          <button
            className="button button-secondary"
            onClick={() => setIsPartsListExpanded(!isPartsListExpanded)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
          >
            {isPartsListExpanded ? '▼ Collapse list' : '▶ Expand list'}
          </button>
        </div>

        {isPartsListExpanded && (
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Description</th>
                  <th>Match rate</th>
                  <th>Unmatched attributes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <tr
                    key={part.partId}
                    onClick={() => setSelectedPartId(part.partId)}
                    style={{
                      backgroundColor: selectedPartId === part.partId ? 'rgba(16, 185, 129, 0.12)' : undefined,
                      cursor: 'pointer'
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong>{part.oemPartNumber || part.partId}</strong>
                        {part.category && (
                          <span style={{ fontSize: '0.85rem', color: 'rgba(15,23,42,0.65)' }}>{part.category}</span>
                        )}
                      </div>
                    </td>
                    <td>{part.description || '—'}</td>
                    <td>{Math.round((part.matchRate ?? 0) * 100)}%</td>
                    <td>
                      {part.unmatchedAttributes.length > 0 ? (
                        <div className="stack" style={{ gap: '0.35rem' }}>
                          {part.unmatchedAttributes.slice(0, 3).map((attribute) => (
                            <span key={attribute} className="badge">{attribute}</span>
                          ))}
                          {part.unmatchedAttributes.length > 3 && (
                            <span style={{ fontSize: '0.8rem', color: 'rgba(15,23,42,0.55)' }}>
                              +{part.unmatchedAttributes.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#166534' }}>
                          Fully matched
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="status-pill" data-status={part.status}>{part.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {partsQuery.isLoading && <p>Loading parts…</p>}
        {partsQuery.isError && (
          <p role="alert" className="alert">
            {(partsQuery.error as Error).message || 'Unable to load parts data.'}
          </p>
        )}
      </section>

      {partSummary && partSummary.topFailures.length > 0 && (
        <section className="panel stack" style={{ gap: '1rem' }}>
          <h3 style={{ margin: 0 }}>Most common part issues</h3>
          <div className="split" style={{ gap: '0.75rem' }}>
            {partSummary.topFailures.map((failure) => (
              <div key={failure.reason} className="badge" style={{ fontSize: '0.9rem', background: 'rgba(248, 113, 113, 0.15)', color: '#991b1b' }}>
                {failure.reason} • {failure.count}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customer.customerId}/vehicles`)}>
          ← Back to vehicles
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${customer.customerId}/service-orders`)}>
          Continue to service orders →
        </button>
      </footer>
    </div>
  );
}

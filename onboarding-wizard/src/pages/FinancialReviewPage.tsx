import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { FinancialMatch, FinancialUpdatePayload } from '../../shared/onboarding';
import { onboardingApi } from '../services/onboardingApi';

export default function FinancialReviewPage() {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isNeedsAttentionExpanded, setIsNeedsAttentionExpanded] = useState(false);
  const [isValidatedExpanded, setIsValidatedExpanded] = useState(false);
  const [isSkippingAll, setIsSkippingAll] = useState(false);
  const [isMarkingSelected, setIsMarkingSelected] = useState(false);

  // Load real data from API
  const { data: financialData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['financial', customerId],
    queryFn: async () => {
      if (!customerId) throw new Error('No customerId');
      return onboardingApi.fetchFinancial(customerId);
    },
    enabled: !!customerId,
  });

  const invoices = financialData?.invoices || [];

  // Mutation for updating invoices
  const updateMutation = useMutation({
    mutationFn: async ({ invoiceId, payload }: { invoiceId: string; payload: FinancialUpdatePayload }) => {
      if (!customerId) throw new Error('No customerId');
      return onboardingApi.updateFinancial(customerId, invoiceId, payload);
    },
    onSuccess: () => {
      // Refresh data immediately to avoid delay
      refetch();
    },
  });

  // Group invoices by status
  const { needsAttention, validated, legacy } = useMemo(() => {
    return {
      needsAttention: invoices.filter(i => i.status === 'pending'),
      validated: invoices.filter(i => i.status === 'validated'),
      legacy: invoices.filter(i => i.status === 'legacy'),
    };
  }, [invoices]);

  // Financial calculations
  const totalRevenue = invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + (i.paidAmount || 0), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.balanceDue || 0), 0);
  const paidInvoices = invoices.filter(i => i.paymentStatus === 'paid').length;
  const unpaidInvoices = invoices.filter(i => i.paymentStatus === 'unpaid').length;

  const handleSelectAll = () => {
    setSelectedIds(new Set(needsAttention.map(i => i.invoiceId)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleMarkAsLegacy = async (ids: string[]) => {
    setIsMarkingSelected(true);
    try {
      for (const invoiceId of ids) {
        await updateMutation.mutateAsync({
          invoiceId,
          payload: { markAsLegacy: true }
        });
      }
      setSelectedIds(new Set());
    } finally {
      setIsMarkingSelected(false);
    }
  };

  const handleSkipAll = async () => {
    setIsSkippingAll(true);
    try {
      const allIds = needsAttention.map(i => i.invoiceId);
      for (const invoiceId of allIds) {
        await updateMutation.mutateAsync({
          invoiceId,
          payload: { markAsLegacy: true }
        });
      }
    } finally {
      setIsSkippingAll(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getPaymentStatusColor = (status?: string) => {
    switch (status) {
      case 'paid': return { bg: '#dcfce7', color: '#166534' };
      case 'partial': return { bg: '#fef3c7', color: '#854d0e' };
      case 'unpaid': return { bg: '#fee2e2', color: '#991b1b' };
      case 'void': return { bg: '#e2e8f0', color: '#475569' };
      default: return { bg: '#f1f5f9', color: '#64748b' };
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="stack" style={{ gap: '2rem', maxWidth: '800px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>⏳</div>
          <h2>Loading financial data...</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>Please wait while we fetch invoice and payment records.</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (isError) {
    return (
      <div className="stack" style={{ gap: '2rem', maxWidth: '800px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fee2e2', borderColor: '#fca5a5' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>❌</div>
          <h2>Error loading financial data</h2>
          <p style={{ color: '#991b1b' }}>{(error as Error)?.message || 'Failed to load financial data'}</p>
          <button onClick={() => navigate('/onboarding')} className="button" style={{ marginTop: 'var(--space-lg)' }}>
            ← Back to start
          </button>
        </div>
      </div>
    );
  }

  // Show no data state
  if (invoices.length === 0) {
    return (
      <div className="stack" style={{ gap: '2rem', maxWidth: '800px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fef3c7', borderColor: '#fde047' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📭</div>
          <h2>No financial data</h2>
          <p style={{ color: '#854d0e' }}>This entity has no invoice or payment records to display.</p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', marginTop: 'var(--space-lg)' }}>
            <button onClick={() => navigate(`/onboarding/${customerId}/service-orders`)} className="button button-secondary">
              ← Back to service orders
            </button>
            <button onClick={() => navigate(`/onboarding/${customerId}/summary`)} className="button">
              Continue to summary →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '2rem' }}>
      <section className="panel stack">
        <div>
          <h2>Financial Review</h2>
          <p>Validate invoices and payment records before migration</p>
        </div>
      </section>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customerId}/service-orders`)}>
          ← Back to service orders
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${customerId}/summary`)}>
          Continue to summary →
        </button>
      </nav>

      {/* Financial stats summary */}
      <section className="panel stack" style={{ gap: '1rem' }}>
        <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="metric">
            <span>Need Review</span>
            <strong style={{ color: needsAttention.length > 0 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
              {needsAttention.length}
            </strong>
          </div>
          <div className="metric">
            <span>Validated</span>
            <strong style={{ color: 'var(--color-success)' }}>{validated.length}</strong>
          </div>
          <div className="metric">
            <span>Paid Invoices</span>
            <strong style={{ color: 'var(--color-success)' }}>{paidInvoices}</strong>
          </div>
          <div className="metric">
            <span>Unpaid Invoices</span>
            <strong style={{ color: 'var(--color-warning)' }}>{unpaidInvoices}</strong>
          </div>
          <div className="metric">
            <span>Total Revenue</span>
            <strong style={{ fontSize: '1.5rem' }}>${totalRevenue.toLocaleString()}</strong>
          </div>
          <div className="metric">
            <span>Outstanding Balance</span>
            <strong style={{ fontSize: '1.5rem', color: totalOutstanding > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
              ${totalOutstanding.toLocaleString()}
            </strong>
          </div>
        </div>
      </section>

      {/* Critical financial data notice */}
      <section className="panel" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)', borderColor: '#3b82f6' }}>
        <div className="stack" style={{ gap: '0.75rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            🔒 Financial Data Protection
          </h3>
          <p style={{ margin: 0 }}><strong>All financial data will be preserved regardless of validation status.</strong></p>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            <li>Invoice totals, payments, and balances are automatically migrated</li>
            <li>Missing invoice numbers or dates won't block migration</li>
            <li>You can mark invoices as "legacy" if repair orders are incomplete</li>
            <li>Financial reporting remains accurate after migration</li>
          </ul>
        </div>
      </section>

      {/* Bulk Actions */}
      {needsAttention.length > 0 && (
        <section className="panel stack" style={{ gap: '1rem', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.05) 0%, rgba(245, 158, 11, 0.05) 100%)' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              ⚡ Quick Actions
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', fontSize: '0.875rem' }}>
              {needsAttention.length} invoice{needsAttention.length !== 1 ? 's' : ''} need{needsAttention.length === 1 ? 's' : ''} attention
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <button onClick={handleSelectAll} className="button button-secondary">
              Select all ({needsAttention.length})
            </button>
            {selectedIds.size > 0 && (
              <>
                <button onClick={handleClearSelection} className="button button-secondary">
                  Clear selection
                </button>
                <button
                  onClick={() => handleMarkAsLegacy(Array.from(selectedIds))}
                  className="button"
                  style={{ background: 'var(--color-warning)', color: 'white' }}
                  disabled={isMarkingSelected}
                >
                  {isMarkingSelected ? (
                    <>
                      <span className="spinner" style={{ marginRight: '8px' }}></span>
                      Marking {selectedIds.size} as legacy...
                    </>
                  ) : (
                    `Mark ${selectedIds.size} as legacy`
                  )}
                </button>
              </>
            )}
            <button
              onClick={handleSkipAll}
              className="button"
              style={{ background: 'var(--color-danger)', color: 'white' }}
              disabled={isSkippingAll}
            >
              {isSkippingAll ? (
                <>
                  <span className="spinner" style={{ marginRight: '8px' }}></span>
                  Marking as legacy...
                </>
              ) : (
                'Skip all & import as legacy'
              )}
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="info-strip" style={{ background: 'var(--color-warning-light)' }}>
              <span><strong>{selectedIds.size}</strong> invoice{selectedIds.size !== 1 ? 's' : ''} selected</span>
            </div>
          )}
        </section>
      )}

      {/* Needs Attention Section */}
      {needsAttention.length > 0 && (
        <section className="panel stack" style={{ gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Needs Attention ({needsAttention.length})</h3>
            <button
              className="button button-secondary"
              onClick={() => setIsNeedsAttentionExpanded(!isNeedsAttentionExpanded)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
            >
              {isNeedsAttentionExpanded ? '▼ Collapse list' : '▶ Expand list'}
            </button>
          </div>

          {/* Invoice list */}
          {isNeedsAttentionExpanded && (
            <div className="vehicle-list">
              {needsAttention.map(inv => {
              const statusColors = getPaymentStatusColor(inv.paymentStatus);
              return (
                <div key={inv.invoiceId} className="vehicle-card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inv.invoiceId)}
                      onChange={() => handleToggleSelect(inv.invoiceId)}
                      style={{ marginTop: '4px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                            {inv.invoiceNumber || <span style={{ color: 'var(--color-danger)' }}>Missing Invoice Number</span>}
                          </h4>
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-xs)' }}>
                            {inv.customerName} • RO: {inv.roNumber || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Issued: {inv.invoiceDate} • Due: {inv.dueDate || <span style={{ color: 'var(--color-warning)' }}>Not set</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                          <div
                            className="badge"
                            style={{ background: statusColors.bg, color: statusColors.color }}
                          >
                            {inv.paymentStatus || 'Unknown'}
                          </div>
                          <div
                            className="badge"
                            style={{
                              background: inv.matchRate === 100 ? '#dcfce7' : inv.matchRate >= 75 ? '#fef3c7' : '#fee2e2',
                              color: inv.matchRate === 100 ? '#166534' : inv.matchRate >= 75 ? '#854d0e' : '#991b1b',
                            }}
                          >
                            {inv.matchRate}%
                          </div>
                          <button
                            onClick={() => toggleExpanded(inv.invoiceId)}
                            className="button button-secondary button-sm"
                          >
                            {expandedId === inv.invoiceId ? 'Hide' : 'Details'}
                          </button>
                        </div>
                      </div>

                      {/* Financial breakdown */}
                      <div style={{ display: 'flex', gap: 'var(--space-lg)', marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Subtotal</div>
                          <div style={{ fontWeight: 500 }}>${(inv.subtotal || 0).toFixed(2)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Tax</div>
                          <div style={{ fontWeight: 500 }}>${(inv.taxAmount || 0).toFixed(2)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Total</div>
                          <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>${(inv.totalAmount || 0).toFixed(2)}</div>
                        </div>
                        {inv.balanceDue && inv.balanceDue > 0 && (
                          <>
                            <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--space-md)' }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Paid</div>
                              <div style={{ fontWeight: 500, color: 'var(--color-success)' }}>${(inv.paidAmount || 0).toFixed(2)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Balance Due</div>
                              <div style={{ fontWeight: 600, fontSize: '1.125rem', color: 'var(--color-warning)' }}>${inv.balanceDue.toFixed(2)}</div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Expanded details */}
                      {expandedId === inv.invoiceId && (
                        <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
                            <div>
                              <strong>Invoice Date:</strong> {inv.invoiceDate || 'N/A'}
                            </div>
                            <div>
                              <strong>Due Date:</strong> {inv.dueDate || <span style={{ color: 'var(--color-warning)' }}>Not set</span>}
                            </div>
                            <div>
                              <strong>Paid Date:</strong> {inv.paidDate || <span style={{ color: 'var(--color-text-secondary)' }}>Not paid</span>}
                            </div>
                            <div>
                              <strong>Payment Method:</strong> {inv.paymentMethod || <span style={{ color: 'var(--color-text-secondary)' }}>N/A</span>}
                            </div>
                            <div>
                              <strong>Has Payment Records:</strong> {inv.hasPayments ? '✓ Yes' : <span style={{ color: 'var(--color-warning)' }}>No</span>}
                            </div>
                            <div>
                              <strong>Repair Order:</strong> {inv.roNumber || <span style={{ color: 'var(--color-danger)' }}>Missing link</span>}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Issues */}
                      {inv.issues && inv.issues.length > 0 && (
                        <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#fee2e2', borderRadius: 'var(--radius-md)' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#991b1b' }}>Issues:</strong>
                          <ul style={{ marginTop: '4px', marginLeft: 'var(--space-md)', fontSize: '0.875rem' }}>
                            {inv.issues.map(issue => (
                              <li key={issue} style={{ color: '#991b1b' }}>{issue.replace(/-/g, ' ')}</li>
                            ))}
                          </ul>
                          <div style={{ marginTop: 'var(--space-xs)', fontSize: '0.875rem', color: '#991b1b' }}>
                            💡 Financial data will be preserved regardless of these issues
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </section>
      )}

      {/* Validated Section */}
      {validated.length > 0 && (
        <section className="panel stack" style={{ gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>✓ Validated ({validated.length})</h3>
            <button
              className="button button-secondary"
              onClick={() => setIsValidatedExpanded(!isValidatedExpanded)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
            >
              {isValidatedExpanded ? '▼ Collapse list' : '▶ Expand list'}
            </button>
          </div>

          {isValidatedExpanded && (
            <div className="vehicle-list">
              {validated.map(inv => {
                const statusColors = getPaymentStatusColor(inv.paymentStatus);
                return (
                  <div key={inv.invoiceId} className="vehicle-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                          {inv.invoiceNumber}
                        </h4>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                          {inv.customerName} • ${inv.totalAmount?.toFixed(2)} • {inv.invoiceDate}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <div className="badge" style={{ background: statusColors.bg, color: statusColors.color }}>
                          {inv.paymentStatus}
                        </div>
                        <div className="badge" style={{ background: '#dcfce7', color: '#166534' }}>
                          ✓ Ready
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Legacy Section */}
      {legacy.length > 0 && (
        <section className="panel stack" style={{ gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Legacy ({legacy.length})</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', fontSize: '0.875rem' }}>
              Imported as-is. Financial data fully preserved. Can be updated later.
            </p>
          </div>
          <div className="vehicle-list">
            {legacy.map(inv => (
              <div key={inv.invoiceId} className="vehicle-card" style={{ background: '#fef3c7', borderColor: '#fde047' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                      {inv.invoiceNumber || inv.invoiceId}
                    </h4>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {inv.customerName} • ${inv.totalAmount?.toFixed(2)}
                    </div>
                  </div>
                  <button className="button button-secondary button-sm">
                    Remove from legacy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action footer */}
      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-lg)', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: '0.875rem' }}>
          <strong>{validated.length + legacy.length}</strong> of {invoices.length} invoices ready • ${totalRevenue.toLocaleString()} total revenue
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customerId}/service-orders`)}>
            ← Back to service orders
          </button>
          <button
            onClick={() => navigate(`/onboarding/${customerId}/summary`)}
            className="button"
          >
            Continue to summary →
          </button>
        </div>
      </footer>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CustomerMatch, CustomerUpdatePayload } from '../../shared/onboarding';
import { useMutation, useQuery } from '@tanstack/react-query';
import { onboardingApi } from '../services/onboardingApi';

export default function CustomersReviewPage() {
  const navigate = useNavigate();
  const { customerId: sessionId } = useParams<{ customerId: string }>();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isNeedsAttentionExpanded, setIsNeedsAttentionExpanded] = useState(false);
  const [isValidatedExpanded, setIsValidatedExpanded] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerMatch | null>(null);
  const [editForm, setEditForm] = useState<CustomerUpdatePayload>({});

  // Load real data from API using session
  const { data: customersData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customers', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      return onboardingApi.fetchCustomers(sessionId);
    },
    enabled: !!sessionId,
  });

  const customers = customersData?.customers || [];

  // Group customers by status
  const { needsAttention, validated, legacy } = useMemo(() => {
    return {
      needsAttention: customers.filter(c => c.status === 'pending'),
      validated: customers.filter(c => c.status === 'validated'),
      legacy: customers.filter(c => c.status === 'legacy'),
    };
  }, [customers]);

  // Mutation for marking customers as legacy
  const markLegacyMutation = useMutation({
    mutationFn: async (customerIds: string[]) => {
      if (!sessionId) throw new Error('No session ID');
      // Mark each as legacy
      for (const customerId of customerIds) {
        await onboardingApi.updateCustomer(sessionId, customerId, { markAsLegacy: true });
      }
    },
    onSuccess: () => {
      refetch(); // Refresh data immediately
      setSelectedIds(new Set());
    }
  });

  // Mutation for removing from legacy
  const removeLegacyMutation = useMutation({
    mutationFn: async (customerId: string) => {
      if (!sessionId) throw new Error('No session ID');
      return onboardingApi.updateCustomer(sessionId, customerId, { markAsLegacy: false });
    },
    onSuccess: () => {
      refetch(); // Refresh data immediately
    }
  });

  // Mutation for updating customer
  const updateMutation = useMutation({
    mutationFn: async ({ customerRecordId, payload }: { customerRecordId: string; payload: CustomerUpdatePayload }) => {
      if (!sessionId) throw new Error('No session ID');
      return onboardingApi.updateCustomer(sessionId, customerRecordId, payload);
    },
    onSuccess: () => {
      refetch(); // Refresh data immediately
      setEditingCustomer(null);
      setEditForm({});
    },
  });

  const handleSelectAll = () => {
    setSelectedIds(new Set(needsAttention.map(c => c.customerId)));
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

  const handleMarkAsLegacy = (ids: string[]) => {
    markLegacyMutation.mutate(ids);
  };

  const handleSkipAll = () => {
    const allIds = needsAttention.map(c => c.customerId);
    markLegacyMutation.mutate(allIds);
  };

  const handleRemoveLegacy = (customerId: string) => {
    removeLegacyMutation.mutate(customerId);
  };

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleEdit = (customer: CustomerMatch) => {
    setEditingCustomer(customer);
    setEditForm({
      customerName: customer.customerName,
      legalName: customer.legalName || '',
      accountNumber: customer.accountNumber || '',
      taxId: customer.taxId || '',
      billingAddress: customer.billingAddress || {},
      primaryContact: customer.primaryContact || {},
      customerType: customer.customerType,
      creditLimit: customer.creditLimit,
      paymentTerms: customer.paymentTerms || ''
    });
  };

  const handleCloseModal = () => {
    setEditingCustomer(null);
    setEditForm({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    await updateMutation.mutateAsync({
      customerRecordId: editingCustomer.customerId,
      payload: editForm
    });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="stack" style={{ gap: '2rem', maxWidth: '800px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>⏳</div>
          <h2>Loading customer data...</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>Please wait while we fetch your customer information.</p>
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
          <h2>Error loading customers</h2>
          <p style={{ color: '#991b1b' }}>{(error as Error)?.message || 'Failed to load customer data'}</p>
          <button onClick={() => navigate('/onboarding')} className="button" style={{ marginTop: 'var(--space-lg)' }}>
            ← Back to start
          </button>
        </div>
      </div>
    );
  }

  // Show no data state
  if (customers.length === 0) {
    return (
      <div className="stack" style={{ gap: '2rem', maxWidth: '800px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fef3c7', borderColor: '#fde047' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📭</div>
          <h2>No customer data</h2>
          <p style={{ color: '#854d0e' }}>This entity has no customer records to display.</p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', marginTop: 'var(--space-lg)' }}>
            <button onClick={() => navigate(`/onboarding/${sessionId}/employees`)} className="button button-secondary">
              ← Back to employees
            </button>
            <button onClick={() => navigate(`/onboarding/${sessionId}/vehicles`)} className="button">
              Continue to vehicles →
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
          <h2>Customer Review</h2>
          <p>Validate customer data before migration</p>
        </div>
      </section>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${sessionId}/employees`)}>
          ← Back to employees
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${sessionId}/vehicles`)}>
          Continue to vehicles →
        </button>
      </nav>

      {/* Stats summary */}
      <section className="panel stack" style={{ gap: '1rem' }}>
        <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="metric">
            <span>Need Attention</span>
            <strong style={{ color: needsAttention.length > 0 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
              {needsAttention.length}
            </strong>
          </div>
          <div className="metric">
            <span>Validated</span>
            <strong style={{ color: 'var(--color-success)' }}>{validated.length}</strong>
          </div>
          <div className="metric">
            <span>Legacy</span>
            <strong>{legacy.length}</strong>
          </div>
          <div className="metric">
            <span>Total Units</span>
            <strong>{customers.reduce((sum, c) => sum + (c.unitCount || 0), 0)}</strong>
          </div>
        </div>
      </section>


      {/* Legacy explanation panel */}
      <section className="panel" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)', borderColor: '#bfdbfe' }}>
        <div className="stack" style={{ gap: '0.75rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            💡 About Legacy Customers
          </h3>
          <p style={{ margin: 0 }}>Can't complete all customer data right now? Mark customers as "legacy" to import them as-is.</p>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            <li>Preserve customer records, units, and repair history</li>
            <li>Financial data remains intact</li>
            <li>Can be updated incrementally as needed</li>
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
              {needsAttention.length} customer{needsAttention.length !== 1 ? 's' : ''} need{needsAttention.length === 1 ? 's' : ''} attention
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <button
              onClick={handleSelectAll}
              className="button button-secondary"
              disabled={markLegacyMutation.isPending}
            >
              Select all ({needsAttention.length})
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleClearSelection}
                  className="button button-secondary"
                  disabled={markLegacyMutation.isPending}
                >
                  Clear selection
                </button>
                <button
                  onClick={() => handleMarkAsLegacy(Array.from(selectedIds))}
                  className="button"
                  style={{ background: 'var(--color-warning)', color: 'white' }}
                  disabled={markLegacyMutation.isPending}
                >
                  {markLegacyMutation.isPending ? (
                    <>
                      <span className="spinner"></span>
                      Marking as legacy...
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
              disabled={markLegacyMutation.isPending}
            >
              {markLegacyMutation.isPending ? (
                <>
                  <span className="spinner"></span>
                  Marking as legacy...
                </>
              ) : (
                'Skip all & import as legacy'
              )}
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="info-strip" style={{ background: 'var(--color-warning-light)' }}>
              <span><strong>{selectedIds.size}</strong> customer{selectedIds.size !== 1 ? 's' : ''} selected</span>
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

          {/* Customer list */}
          {isNeedsAttentionExpanded && (
            <div className="vehicle-list">
            {needsAttention.map(cust => (
              <div key={cust.customerId} className="vehicle-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(cust.customerId)}
                    onChange={() => handleToggleSelect(cust.customerId)}
                    style={{ marginTop: '4px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                          {cust.customerName}
                        </h4>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-sm)' }}>
                          {cust.unitCount} units • {cust.repairOrderCount} repair orders • ${(cust.totalSpent || 0).toLocaleString()} total
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        <div
                          className="badge"
                          style={{
                            background: cust.matchRate === 100 ? '#dcfce7' : cust.matchRate >= 75 ? '#fef3c7' : '#fee2e2',
                            color: cust.matchRate === 100 ? '#166534' : cust.matchRate >= 75 ? '#854d0e' : '#991b1b',
                          }}
                        >
                          {cust.matchRate}% complete
                        </div>
                        <button
                          onClick={() => handleEdit(cust)}
                          className="button button-primary button-sm"
                          style={{ marginRight: 'var(--space-xs)' }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => toggleExpanded(cust.customerId)}
                          className="button button-secondary button-sm"
                        >
                          {expandedId === cust.customerId ? 'Hide details' : 'Show details'}
                        </button>
                      </div>
                    </div>

                    {/* Summary details */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                      <div>
                        <strong>Account #:</strong> {cust.accountNumber || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                      </div>
                      <div>
                        <strong>Tax ID:</strong> {cust.taxId || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                      </div>
                      <div>
                        <strong>Type:</strong> {cust.customerType || 'Unknown'}
                      </div>
                      <div>
                        <strong>Credit Limit:</strong> {cust.creditLimit ? `$${cust.creditLimit.toLocaleString()}` : <span style={{ color: 'var(--color-danger)' }}>Not set</span>}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expandedId === cust.customerId && (
                      <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                          <strong>Legal Name:</strong> {cust.legalName || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                        </div>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                          <strong>Billing Address:</strong><br />
                          {cust.billingAddress?.street || <span style={{ color: 'var(--color-danger)' }}>Missing street</span>}<br />
                          {cust.billingAddress?.city && cust.billingAddress?.state && cust.billingAddress?.zip
                            ? `${cust.billingAddress.city}, ${cust.billingAddress.state} ${cust.billingAddress.zip}`
                            : <span style={{ color: 'var(--color-danger)' }}>Incomplete city/state/zip</span>}
                        </div>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                          <strong>Primary Contact:</strong><br />
                          Name: {cust.primaryContact?.name || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}<br />
                          Email: {cust.primaryContact?.email || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}<br />
                          Phone: {cust.primaryContact?.phone || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                        </div>
                        <div>
                          <strong>Payment Terms:</strong> {cust.paymentTerms || <span style={{ color: 'var(--color-danger)' }}>Not set</span>}
                        </div>
                      </div>
                    )}

                    {/* Issues */}
                    {cust.issues && cust.issues.length > 0 && (
                      <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#fee2e2', borderRadius: 'var(--radius-md)' }}>
                        <strong style={{ fontSize: '0.875rem', color: '#991b1b' }}>Issues:</strong>
                        <ul style={{ marginTop: '4px', marginLeft: 'var(--space-md)', fontSize: '0.875rem' }}>
                          {cust.issues.map(issue => (
                            <li key={issue} style={{ color: '#991b1b' }}>{issue.replace(/-/g, ' ')}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
              {validated.map(cust => (
                <div key={cust.customerId} className="vehicle-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                        {cust.customerName}
                      </h4>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        {cust.unitCount} units • {cust.repairOrderCount} orders • ${(cust.totalSpent || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="badge" style={{ background: '#dcfce7', color: '#166534' }}>
                      ✓ Ready
                    </div>
                  </div>
                </div>
              ))}
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
              Imported as-is. Financial data preserved. Can be updated later.
            </p>
          </div>
          <div className="vehicle-list">
            {legacy.map(cust => (
              <div key={cust.customerId} className="vehicle-card" style={{ background: '#fef3c7', borderColor: '#fde047' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                      {cust.customerName}
                    </h4>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {cust.unitCount} units • {cust.repairOrderCount} orders
                    </div>
                  </div>
                  <button
                    className="button button-secondary button-sm"
                    onClick={() => handleRemoveLegacy(cust.customerId)}
                    disabled={removeLegacyMutation.isPending}
                  >
                    {removeLegacyMutation.isPending ? 'Removing...' : 'Remove from legacy'}
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
          <strong>{validated.length + legacy.length}</strong> of {customers.length} customers ready
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button className="button button-secondary" onClick={() => navigate(`/onboarding/${sessionId}/employees`)}>
            ← Back to employees
          </button>
          <button
            onClick={() => navigate(`/onboarding/${sessionId}/vehicles`)}
            className="button"
          >
            Continue to vehicles →
          </button>
        </div>
      </footer>

      {/* Edit Modal */}
      {editingCustomer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-lg)'
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-xl)',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <h2 style={{ margin: 0 }}>Edit Customer</h2>
              <button
                onClick={handleCloseModal}
                className="button button-secondary"
                disabled={updateMutation.isPending}
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {/* Basic Information */}
                <section style={{ background: '#f8fafc', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>Basic Information</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Customer Name *
                      </label>
                      <input
                        type="text"
                        value={editForm.customerName || ''}
                        onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                        required
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Legal Name
                      </label>
                      <input
                        type="text"
                        value={editForm.legalName || ''}
                        onChange={(e) => setEditForm({ ...editForm, legalName: e.target.value })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={editForm.accountNumber || ''}
                        onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Tax ID
                      </label>
                      <input
                        type="text"
                        value={editForm.taxId || ''}
                        onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                  </div>
                </section>

                {/* Billing Address */}
                <section style={{ background: '#f8fafc', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>Billing Address</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-md)' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Street
                      </label>
                      <input
                        type="text"
                        value={editForm.billingAddress?.street || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          billingAddress: { ...editForm.billingAddress, street: e.target.value }
                        })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--space-md)' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                          City
                        </label>
                        <input
                          type="text"
                          value={editForm.billingAddress?.city || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            billingAddress: { ...editForm.billingAddress, city: e.target.value }
                          })}
                          style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                          State
                        </label>
                        <input
                          type="text"
                          value={editForm.billingAddress?.state || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            billingAddress: { ...editForm.billingAddress, state: e.target.value }
                          })}
                          style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                          ZIP
                        </label>
                        <input
                          type="text"
                          value={editForm.billingAddress?.zip || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            billingAddress: { ...editForm.billingAddress, zip: e.target.value }
                          })}
                          style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Primary Contact */}
                <section style={{ background: '#f8fafc', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>Primary Contact</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.primaryContact?.name || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          primaryContact: { ...editForm.primaryContact, name: e.target.value }
                        })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={editForm.primaryContact?.email || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          primaryContact: { ...editForm.primaryContact, email: e.target.value }
                        })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={editForm.primaryContact?.phone || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          primaryContact: { ...editForm.primaryContact, phone: e.target.value }
                        })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                  </div>
                </section>

                {/* Financial & Terms */}
                <section style={{ background: '#f8fafc', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>Financial & Terms</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Customer Type
                      </label>
                      <select
                        value={editForm.customerType || 'fleet'}
                        onChange={(e) => setEditForm({ ...editForm, customerType: e.target.value as any })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      >
                        <option value="fleet">Fleet</option>
                        <option value="individual">Individual</option>
                        <option value="government">Government</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Credit Limit
                      </label>
                      <input
                        type="number"
                        value={editForm.creditLimit || ''}
                        onChange={(e) => setEditForm({ ...editForm, creditLimit: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }}>
                        Payment Terms
                      </label>
                      <input
                        type="text"
                        value={editForm.paymentTerms || ''}
                        onChange={(e) => setEditForm({ ...editForm, paymentTerms: e.target.value })}
                        placeholder="e.g., Net 30"
                        style={{ width: '100%', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                  </div>
                </section>

                {/* Form Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="button button-secondary"
                    disabled={updateMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

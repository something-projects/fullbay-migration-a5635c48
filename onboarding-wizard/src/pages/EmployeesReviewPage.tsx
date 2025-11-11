import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EmployeeMatch, EmployeeUpdatePayload } from '../../shared/onboarding';
import { onboardingApi } from '../services/onboardingApi';

export default function EmployeesReviewPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'matchRate' | 'role'>('matchRate');
  const [editingEmployee, setEditingEmployee] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSkippingAll, setIsSkippingAll] = useState(false);
  const [isMarkingSelected, setIsMarkingSelected] = useState(false);

  // Load real data from API using session
  const { data: employeesData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['employees', customerId],
    queryFn: async () => {
      if (!customerId) throw new Error('No customerId');
      return onboardingApi.fetchEmployees(customerId);
    },
    enabled: !!customerId,
  });

  const employees = employeesData?.employees || [];

  // Mutation for updating employees
  const updateMutation = useMutation({
    mutationFn: async ({ employeeId, payload }: { employeeId: string; payload: EmployeeUpdatePayload }) => {
      if (!customerId) throw new Error('No customerId');
      return onboardingApi.updateEmployee(customerId, employeeId, payload);
    },
    onSuccess: () => {
      // Refresh data immediately to avoid delay
      refetch();
    },
  });

  // Get unique job titles for filter
  const jobTitles = useMemo(() => {
    const titles = new Set(employees.map(e => e.jobTitle).filter(Boolean));
    return Array.from(titles).sort();
  }, [employees]);

  // Filter and sort employees
  const filteredEmployees = useMemo(() => {
    let filtered = employees.filter(emp => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        const email = (emp.email || '').toLowerCase();
        const jobTitle = (emp.jobTitle || '').toLowerCase();
        if (!fullName.includes(query) && !email.includes(query) && !jobTitle.includes(query)) {
          return false;
        }
      }

      if (filterRole !== 'all' && emp.jobTitle !== filterRole) {
        return false;
      }

      if (filterStatus === 'validated' && emp.status !== 'validated') return false;
      if (filterStatus === 'pending' && emp.status !== 'pending') return false;
      if (filterStatus === 'legacy' && emp.status !== 'legacy') return false;
      if (filterStatus === 'inactive' && emp.active) return false;

      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      } else if (sortBy === 'matchRate') {
        return b.matchRate - a.matchRate;
      } else if (sortBy === 'role') {
        return (a.jobTitle || '').localeCompare(b.jobTitle || '');
      }
      return 0;
    });

    return filtered;
  }, [employees, searchQuery, filterRole, filterStatus, sortBy]);

  // Group by status
  const { needsAttention, validated, legacy } = useMemo(() => {
    return {
      needsAttention: filteredEmployees.filter(e => e.status === 'pending'),
      validated: filteredEmployees.filter(e => e.status === 'validated'),
      legacy: filteredEmployees.filter(e => e.status === 'legacy'),
    };
  }, [filteredEmployees]);

  const handleSelectAll = () => {
    setSelectedIds(new Set(needsAttention.map(e => e.entityEmployeeId)));
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
      for (const id of ids) {
        await updateMutation.mutateAsync({
          employeeId: id,
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
      const allIds = needsAttention.map(e => e.entityEmployeeId);
      for (const id of allIds) {
        await updateMutation.mutateAsync({
          employeeId: id,
          payload: { markAsLegacy: true }
        });
      }
    } finally {
      setIsSkippingAll(false);
    }
  };

  const handleQuickFix = (emp: EmployeeMatch, field: string) => {
    setEditingEmployee({ id: emp.entityEmployeeId, field });
    switch (field) {
      case 'email':
        setEditValue(emp.email || '');
        break;
      case 'phone':
        setEditValue(emp.phoneNumber || '');
        break;
      case 'jobTitle':
        setEditValue(emp.jobTitle || '');
        break;
      case 'wage':
        setEditValue(emp.hourlyWage?.toString() || '');
        break;
    }
  };

  const handleSaveQuickFix = async () => {
    if (!editingEmployee) return;

    const payload: EmployeeUpdatePayload = {};

    switch (editingEmployee.field) {
      case 'email':
        payload.email = editValue;
        break;
      case 'phone':
        payload.phoneNumber = editValue;
        break;
      case 'jobTitle':
        payload.jobTitle = editValue;
        break;
      case 'wage':
        payload.hourlyWage = parseFloat(editValue);
        break;
    }

    await updateMutation.mutateAsync({
      employeeId: editingEmployee.id,
      payload
    });
    setEditingEmployee(null);
    setEditValue('');
  };

  const handleCancelQuickFix = () => {
    setEditingEmployee(null);
    setEditValue('');
  };

  const handleRemoveFromLegacy = async (employeeId: string) => {
    await updateMutation.mutateAsync({
      employeeId,
      payload: { markAsLegacy: false }
    });
  };

  const inactiveCount = employees.filter(e => !e.active).length;
  const missingEmailCount = employees.filter(e => !e.email).length;

  // Show loading state
  if (isLoading) {
    return (
      <div className="wizard-container">
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>⏳</div>
          <h2>Loading employee data...</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>Please wait while we fetch your employee information.</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (isError) {
    return (
      <div className="wizard-container">
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fee2e2', borderColor: '#fca5a5' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>❌</div>
          <h2>Error loading employees</h2>
          <p style={{ color: '#991b1b' }}>{(error as Error)?.message || 'Failed to load employee data'}</p>
          <button onClick={() => navigate('/onboarding')} className="button" style={{ marginTop: 'var(--space-lg)' }}>
            ← Back to start
          </button>
        </div>
      </div>
    );
  }

  // Show no data state
  if (employees.length === 0) {
    return (
      <div className="wizard-container">
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fef3c7', borderColor: '#fde047' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📭</div>
          <h2>No employee data</h2>
          <p style={{ color: '#854d0e' }}>This entity has no employee records to display.</p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', marginTop: 'var(--space-lg)' }}>
            <button onClick={() => navigate('/onboarding')} className="button button-secondary">
              ← Back to start
            </button>
            <button onClick={() => navigate(`/onboarding/${customerId}/customers`)} className="button">
              Continue to customers →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      <div className="wizard-header">
        <button onClick={() => navigate(`/customer/${customerId}`)} className="button button-secondary">
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h2>Review Employees</h2>
          <p>Validate employee data before migration</p>
        </div>
      </div>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate('/onboarding')}>
          ← Back to start
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${customerId}/customers`)}>
          Continue to customers →
        </button>
      </nav>

      {/* Legacy explanation panel */}
      <div className="panel" style={{ background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 'var(--space-lg)' }}>
        <h4>💡 About Legacy Employees</h4>
        <p>Can't fix all employee data right now? Mark employees as "legacy" to import them as-is.</p>
        <ul style={{ marginTop: 'var(--space-sm)', paddingLeft: 'var(--space-lg)' }}>
          <li>Preserve employee records and historical data</li>
          <li>Can be updated later when needed</li>
          <li>Won't block your migration</li>
        </ul>
      </div>

      {/* Stats summary */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="stat-card">
          <div className="stat-value">{needsAttention.length}</div>
          <div className="stat-label">Need Attention</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{validated.length}</div>
          <div className="stat-label">Validated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{legacy.length}</div>
          <div className="stat-label">Legacy</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{employees.length}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card" style={{ background: inactiveCount > 0 ? '#fef3c7' : '#f0fdf4' }}>
          <div className="stat-value" style={{ color: inactiveCount > 0 ? '#854d0e' : '#166534' }}>{inactiveCount}</div>
          <div className="stat-label">Inactive</div>
        </div>
        <div className="stat-card" style={{ background: missingEmailCount > 0 ? '#fee2e2' : '#f0fdf4' }}>
          <div className="stat-value" style={{ color: missingEmailCount > 0 ? '#991b1b' : '#166534' }}>{missingEmailCount}</div>
          <div className="stat-label">Missing Email</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 'var(--space-md)', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 500 }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Search by name, email, or job title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 500 }}>
              Job Role
            </label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="input"
              style={{ width: '100%' }}
            >
              <option value="all">All Roles</option>
              {jobTitles.map(title => (
                <option key={title} value={title}>{title}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 500 }}>
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input"
              style={{ width: '100%' }}
            >
              <option value="all">All Status</option>
              <option value="validated">Validated</option>
              <option value="pending">Pending</option>
              <option value="legacy">Legacy</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 500 }}>
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input"
              style={{ width: '100%' }}
            >
              <option value="matchRate">Match Rate</option>
              <option value="name">Name</option>
              <option value="role">Job Role</option>
            </select>
          </div>
        </div>
        {(searchQuery || filterRole !== 'all' || filterStatus !== 'all') && (
          <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Showing {filteredEmployees.length} of {employees.length} employees
            <button
              onClick={() => { setSearchQuery(''); setFilterRole('all'); setFilterStatus('all'); }}
              className="button button-sm"
              style={{ marginLeft: 'var(--space-sm)', padding: '2px 8px', fontSize: '0.75rem' }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Needs Attention Section */}
      {needsAttention.length > 0 && (
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3>Needs Attention ({needsAttention.length})</h3>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                onClick={handleSkipAll}
                className="button"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#991b1b' }}
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
              <button onClick={handleSelectAll} className="button button-secondary">
                Select all
              </button>
              <button onClick={handleClearSelection} className="button button-secondary">
                Clear
              </button>
            </div>
          </div>

          {/* Selected actions */}
          {selectedIds.size > 0 && (
            <div className="panel" style={{ background: '#fef3c7', borderColor: '#fbbf24', marginBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>{selectedIds.size}</strong> employee(s) selected</span>
                <button
                  onClick={() => handleMarkAsLegacy(Array.from(selectedIds))}
                  className="button"
                  style={{ background: 'rgba(249,115,22,0.1)', color: '#9a3412' }}
                  disabled={isMarkingSelected}
                >
                  {isMarkingSelected ? (
                    <>
                      <span className="spinner" style={{ marginRight: '8px', borderTopColor: '#9a3412', borderColor: 'rgba(154,52,18,0.3)' }}></span>
                      Marking {selectedIds.size} as legacy...
                    </>
                  ) : (
                    'Mark selected as legacy'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Employee list - keeping the existing detailed UI */}
          <div className="vehicle-list">
            {needsAttention.map(emp => (
              <div key={emp.entityEmployeeId} className="vehicle-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(emp.entityEmployeeId)}
                    onChange={() => handleToggleSelect(emp.entityEmployeeId)}
                    style={{ marginTop: '4px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ marginBottom: 'var(--space-xs)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                          {emp.firstName} {emp.lastName}
                          {!emp.active && (
                            <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>
                              Inactive
                            </span>
                          )}
                        </h4>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-sm)' }}>
                          {emp.jobTitle || <span style={{ color: 'var(--color-danger)' }}>No job title</span>} • ID: {emp.entityEmployeeId}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          className="badge"
                          style={{
                            background: emp.matchRate === 100 ? '#dcfce7' : emp.matchRate >= 75 ? '#fef3c7' : '#fee2e2',
                            color: emp.matchRate === 100 ? '#166534' : emp.matchRate >= 75 ? '#854d0e' : '#991b1b',
                          }}
                        >
                          {emp.matchRate}% complete
                        </div>
                      </div>
                    </div>

                    {/* Employee details grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                      <div>
                        <strong>Email:</strong>{' '}
                        {editingEmployee?.id === emp.entityEmployeeId && editingEmployee?.field === 'email' ? (
                          <div style={{ display: 'inline-flex', gap: '4px', marginLeft: '4px' }}>
                            <input
                              type="email"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="input"
                              style={{ padding: '2px 6px', fontSize: '0.875rem', width: '180px' }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveQuickFix();
                                if (e.key === 'Escape') handleCancelQuickFix();
                              }}
                            />
                            <button onClick={handleSaveQuickFix} className="button button-sm" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>✓</button>
                            <button onClick={handleCancelQuickFix} className="button button-sm" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>✗</button>
                          </div>
                        ) : (
                          <>
                            {emp.email || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                            {!emp.email && (
                              <button
                                onClick={() => handleQuickFix(emp, 'email')}
                                className="button button-sm"
                                style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '0.75rem' }}
                                disabled={updateMutation.isPending}
                              >
                                + Add
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div>
                        <strong>Phone:</strong>{' '}
                        {editingEmployee?.id === emp.entityEmployeeId && editingEmployee?.field === 'phone' ? (
                          <div style={{ display: 'inline-flex', gap: '4px', marginLeft: '4px' }}>
                            <input
                              type="tel"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="input"
                              style={{ padding: '2px 6px', fontSize: '0.875rem', width: '120px' }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveQuickFix();
                                if (e.key === 'Escape') handleCancelQuickFix();
                              }}
                            />
                            <button onClick={handleSaveQuickFix} className="button button-sm" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>✓</button>
                            <button onClick={handleCancelQuickFix} className="button button-sm" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>✗</button>
                          </div>
                        ) : (
                          <>
                            {emp.phoneNumber || <span style={{ color: 'var(--color-danger)' }}>Missing</span>}
                            {!emp.phoneNumber && (
                              <button
                                onClick={() => handleQuickFix(emp, 'phone')}
                                className="button button-sm"
                                style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '0.75rem' }}
                                disabled={updateMutation.isPending}
                              >
                                + Add
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Issues summary */}
                    {emp.issues && emp.issues.length > 0 && (
                      <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#fef3c7', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                        <strong>{emp.issues.length} issue{emp.issues.length > 1 ? 's' : ''} found</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Validated Section */}
      {validated.length > 0 && (
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>✓ Validated ({validated.length})</h3>
          <div className="vehicle-list">
            {validated.map(emp => (
              <div key={emp.entityEmployeeId} className="vehicle-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                      {emp.firstName} {emp.lastName}
                    </h4>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {emp.jobTitle} • {emp.email} • ${emp.hourlyWage?.toFixed(2)}/hr
                    </div>
                  </div>
                  <div className="badge" style={{ background: '#dcfce7', color: '#166534' }}>
                    ✓ Ready
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Legacy Section */}
      {legacy.length > 0 && (
        <section>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>Legacy ({legacy.length})</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Imported as-is. Records preserved. Can be updated later.
          </p>
          <div className="vehicle-list">
            {legacy.map(emp => (
              <div key={emp.entityEmployeeId} className="vehicle-card" style={{ background: '#fef3c7', borderColor: '#fde047' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                      {emp.firstName} {emp.lastName}
                    </h4>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {emp.jobTitle || 'No job title'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFromLegacy(emp.entityEmployeeId)}
                    className="button button-secondary button-sm"
                    disabled={updateMutation.isPending}
                  >
                    Remove from legacy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action footer */}
      <div style={{ marginTop: 'var(--space-2xl)', padding: 'var(--space-lg)', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', position: 'sticky', bottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{validated.length + legacy.length}</strong> of {employees.length} employees ready
            {filteredEmployees.length < employees.length && (
              <span style={{ marginLeft: 'var(--space-sm)', color: 'var(--color-text-secondary)' }}>
                ({filteredEmployees.length} shown with current filters)
              </span>
            )}
          </div>
          <button
            onClick={() => navigate(`/onboarding/${customerId}/customers`)}
            className="button button-primary"
          >
            Continue to customers →
          </button>
        </div>
      </div>
    </div>
  );
}

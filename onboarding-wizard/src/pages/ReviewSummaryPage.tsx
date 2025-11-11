import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWizardStore } from '../state/wizardStore';
import { onboardingApi } from '../services/onboardingApi';

export function ReviewSummaryPage() {
  const navigate = useNavigate();
  const {
    customer,
    vehicles,
    vehicleSummary,
    parts,
    partSummary
  } = useWizardStore();

  const [isCompleting, setIsCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState<any>(null);

  useEffect(() => {
    if (!customer) {
      navigate('/onboarding', { replace: true });
    }
  }, [customer, navigate]);

  const handleCompleteReview = async () => {
    if (!customer?.customerId) return;
    
    setIsCompleting(true);
    try {
      const result = await onboardingApi.completeReview(customer.customerId);
      setCompletionResult(result);
      
      alert(`✅ Onboarding completed successfully!\n\n` +
        `User-validated data exported to:\n${result.summary.userValidatedPath || 'output/' + customer.customerId + '/user-validated/'}\n\n` +
        `Vehicles: ${result.summary.vehiclesValidated}/${result.summary.vehiclesReviewed} validated\n` +
        `Parts: ${result.summary.partsValidated}/${result.summary.partsReviewed} validated`
      );
    } catch (error: any) {
      console.error('Error completing review:', error);
      
      // Display more detailed error message
      const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
      const errorDetails = error?.response?.data?.details || '';
      
      alert(
        `❌ Error completing review\n\n` +
        `Error: ${errorMessage}\n` +
        (errorDetails ? `\nDetails: ${errorDetails}\n` : '') +
        `\nPlease check the server console for more information.`
      );
    } finally {
      setIsCompleting(false);
    }
  };

  if (!customer) {
    return null;
  }

  const totalValidated = (vehicleSummary?.totals.validated ?? 0) + (partSummary?.totals.validated ?? 0);
  const totalPending = (vehicleSummary?.totals.pending ?? 0) + (partSummary?.totals.pending ?? 0);
  const totalLegacy = (vehicleSummary?.totals.legacy ?? 0) + (partSummary?.totals.legacy ?? 0);
  const totalRecords = vehicles.length + parts.length;
  const completionRate = totalRecords > 0 ? Math.round((totalValidated / totalRecords) * 100) : 0;

  return (
    <div className="stack" style={{ gap: '2rem' }}>
      {/* Hero Section */}
      <section className="panel" style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
        textAlign: 'center',
        padding: 'var(--space-2xl)'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto var(--space-lg)',
          background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)'
        }}>
          ✓
        </div>
        <h2 style={{ marginBottom: 'var(--space-sm)' }}>Onboarding Complete!</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.125rem' }}>
          Review summary for {customer.displayName || customer.customerId}
        </p>
      </section>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customer.customerId}/financial`)}>
          ← Back to financial
        </button>
        <button
          className="button"
          onClick={handleCompleteReview}
          disabled={isCompleting}
          style={{
            background: isCompleting 
              ? '#9ca3af' 
              : 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
            border: 'none',
            cursor: isCompleting ? 'not-allowed' : 'pointer'
          }}
        >
          {isCompleting ? 'Completing...' : 'Export & Complete ✓'}
        </button>
      </nav>

      {/* Overall Progress */}
      <section className="panel stack" style={{ gap: '1.5rem' }}>
        <div className="split" style={{ alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Overall Progress</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)' }}>
              {completionRate}% of records have been validated
            </p>
          </div>
          <div className="metric">
            <span>Completion</span>
            <strong>{completionRate}%</strong>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{
          width: '100%',
          height: '12px',
          background: 'rgba(15, 23, 42, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${completionRate}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)',
            transition: 'width 0.3s ease'
          }} />
        </div>

        {/* Summary Grid */}
        <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="metric">
            <span>Total records</span>
            <strong>{totalRecords}</strong>
          </div>
          <div className="metric" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
            <span>Validated</span>
            <strong style={{ color: '#065f46' }}>{totalValidated}</strong>
          </div>
          <div className="metric" style={{ background: 'rgba(251, 191, 36, 0.1)' }}>
            <span>Pending</span>
            <strong style={{ color: '#78350f' }}>{totalPending}</strong>
          </div>
          <div className="metric" style={{ background: 'rgba(100, 116, 139, 0.1)' }}>
            <span>Legacy</span>
            <strong style={{ color: '#334155' }}>{totalLegacy}</strong>
          </div>
        </div>
      </section>

      {/* Vehicles Summary */}
      {vehicleSummary && (
        <section className="panel stack" style={{ gap: '1rem' }}>
          <div className="split" style={{ alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                🚛 Vehicles
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', fontSize: '0.875rem' }}>
                Vehicle and fleet unit validation
              </p>
            </div>
            <div className="metric">
              <span>Total</span>
              <strong>{vehicleSummary.totals.total}</strong>
            </div>
          </div>

          <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="metric">
              <span>Validated</span>
              <strong style={{ color: '#065f46' }}>{vehicleSummary.totals.validated}</strong>
            </div>
            <div className="metric">
              <span>Pending</span>
              <strong style={{ color: '#78350f' }}>{vehicleSummary.totals.pending}</strong>
            </div>
            <div className="metric">
              <span>Legacy</span>
              <strong style={{ color: '#334155' }}>{vehicleSummary.totals.legacy}</strong>
            </div>
          </div>

          {vehicleSummary.topFailures.length > 0 && (
            <div className="stack" style={{ gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                Top issues
              </span>
              <div className="split" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                {vehicleSummary.topFailures.slice(0, 5).map((failure) => (
                  <span key={failure.reason} className="badge" style={{ fontSize: '0.85rem' }}>
                    {failure.reason} ({failure.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Parts Summary */}
      {partSummary && (
        <section className="panel stack" style={{ gap: '1rem' }}>
          <div className="split" style={{ alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                ⚙️ Parts
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', fontSize: '0.875rem' }}>
                AutoCare PIES parts matching
              </p>
            </div>
            <div className="metric">
              <span>Total</span>
              <strong>{partSummary.totals.total}</strong>
            </div>
          </div>

          <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="metric">
              <span>Validated</span>
              <strong style={{ color: '#065f46' }}>{partSummary.totals.validated}</strong>
            </div>
            <div className="metric">
              <span>Pending</span>
              <strong style={{ color: '#78350f' }}>{partSummary.totals.pending}</strong>
            </div>
            <div className="metric">
              <span>Legacy</span>
              <strong style={{ color: '#334155' }}>{partSummary.totals.legacy}</strong>
            </div>
          </div>

          {partSummary.topFailures.length > 0 && (
            <div className="stack" style={{ gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                Top issues
              </span>
              <div className="split" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                {partSummary.topFailures.slice(0, 5).map((failure) => (
                  <span key={failure.reason} className="badge" style={{ fontSize: '0.85rem' }}>
                    {failure.reason} ({failure.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Next Steps */}
      <section className="panel stack" style={{
        gap: '1rem',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 100%)'
      }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            🎯 Next Steps
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', fontSize: '0.875rem' }}>
            Recommended actions to complete the onboarding process
          </p>
        </div>

        <div className="stack" style={{ gap: '0.75rem' }}>
          <div className="split" style={{ alignItems: 'center', padding: 'var(--space-sm)', background: 'rgba(255, 255, 255, 0.6)', borderRadius: 'var(--radius-md)' }}>
            <span>✓ Review all pending vehicles and parts</span>
            <span className="badge" style={{ background: totalPending === 0 ? '#d1fae5' : '#fef3c7', color: totalPending === 0 ? '#065f46' : '#78350f' }}>
              {totalPending} remaining
            </span>
          </div>
          <div className="split" style={{ alignItems: 'center', padding: 'var(--space-sm)', background: 'rgba(255, 255, 255, 0.6)', borderRadius: 'var(--radius-md)' }}>
            <span>✓ Verify AutoCare matching accuracy</span>
            <span className="badge">Ready</span>
          </div>
          <div className="split" style={{ alignItems: 'center', padding: 'var(--space-sm)', background: 'rgba(255, 255, 255, 0.6)', borderRadius: 'var(--radius-md)' }}>
            <span>✓ Export reviewed data for migration</span>
            <span className="badge">Ready</span>
          </div>
        </div>
      </section>

      {/* Footer Actions */}
      <footer style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customer.customerId}/financial`)}>
          ← Back to financial
        </button>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="button button-secondary"
            onClick={() => navigate('/onboarding')}
          >
            Start new review
          </button>
          <button
            className="button"
            onClick={handleCompleteReview}
            disabled={isCompleting}
            style={{
              background: isCompleting 
                ? '#9ca3af' 
                : 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
              border: 'none',
              cursor: isCompleting ? 'not-allowed' : 'pointer'
            }}
          >
            Export & Complete ✓
          </button>
        </div>
      </footer>
    </div>
  );
}

import { PropsWithChildren, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

const STEPS = [
  { path: 'employees', label: 'Employees', disabled: false },
  { path: 'customers', label: 'Customers', disabled: false },
  { path: 'vehicles', label: 'Vehicles', disabled: false },
  { path: 'parts', label: 'Parts', disabled: false },
  { path: 'service-orders', label: 'Service Orders', disabled: false },
  { path: 'financial', label: 'Financials', disabled: false },
  { path: 'summary', label: 'Summary', disabled: false }
];

export function WizardLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const { customerId } = useParams<{ customerId?: string }>();

  const activeIndex = useMemo(() => {
    // For the initial intake page, show no active tab
    if (location.pathname === '/onboarding') {
      return -1; // No active tab for intake page
    }
    
    // Extract the step from the current path
    const pathParts = location.pathname.split('/');
    const currentStep = pathParts[pathParts.length - 1]; // Get the last part of the path
    
    const index = STEPS.findIndex((step) => step.path === currentStep);
    return index;
  }, [location.pathname]);

  return (
    <div className="wizard-shell">
      <header className="wizard-header">
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <h1 style={{ color: 'white', marginBottom: 'var(--space-xs)' }}>Customer Onboarding</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', margin: 0 }}>
            Streamline data migration and validation
          </p>
        </div>
        <nav aria-label="Onboarding steps" className="wizard-steps">
          {STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            const isComplete = index < activeIndex;
            
            // Build the correct path with session ID if available
            const stepPath = customerId 
              ? `/onboarding/${customerId}/${step.path}`
              : `/onboarding`; // Fallback to intake page if no session ID
            
            // Disable navigation if no session ID
            const isDisabled = !customerId;
            
            return (
              <Link
                key={step.path}
                to={isDisabled ? '#' : stepPath} // Use # for disabled links
                className="wizard-step"
                data-active={isActive}
                data-complete={isComplete}
                onClick={isDisabled ? (e) => e.preventDefault() : undefined}
                style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <span className="wizard-step-index">{index + 1}</span>
                <span>{step.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="wizard-main">{children}</main>
    </div>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { WizardLayout } from './components/WizardLayout';
import { CustomerIntakePage } from './pages/CustomerIntakePage';
import { VehicleReviewPage } from './pages/VehicleReviewPage';
import { PartsReviewPage } from './pages/PartsReviewPage';
import { ReviewSummaryPage } from './pages/ReviewSummaryPage';
import EmployeesReviewPage from './pages/EmployeesReviewPage';
import CustomersReviewPage from './pages/CustomersReviewPage';
import ServiceOrdersReviewPage from './pages/ServiceOrdersReviewPage';
import FinancialReviewPage from './pages/FinancialReviewPage';

export default function App() {
  return (
    <WizardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/onboarding" replace />} />
        <Route path="/onboarding" element={<CustomerIntakePage />} />
        <Route path="/onboarding/:customerId/employees" element={<EmployeesReviewPage />} />
        <Route path="/onboarding/:customerId/customers" element={<CustomersReviewPage />} />
        <Route path="/onboarding/:customerId/vehicles" element={<VehicleReviewPage />} />
        <Route path="/onboarding/:customerId/service-orders" element={<ServiceOrdersReviewPage />} />
        <Route path="/onboarding/:customerId/parts" element={<PartsReviewPage />} />
        <Route path="/onboarding/:customerId/financial" element={<FinancialReviewPage />} />
        <Route path="/onboarding/:customerId/summary" element={<ReviewSummaryPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    </WizardLayout>
  );
}

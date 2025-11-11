import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { EntityViewer } from '../App';
import { useToast } from '../hooks/use-toast';
import { BreadcrumbNavigation } from './BreadcrumbNavigation';

interface EntityDetailPageProps {}

export function EntityDetailPage({}: EntityDetailPageProps) {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) {
      setError('Entity ID is required');
      setLoading(false);
      return;
    }

    // Check if entity data was passed via navigation state
    if (location.state?.entity) {
      setEntity(location.state.entity);
      setLoading(false);
    } else {
      loadEntityData();
    }
  }, [entityId, location.state]);

  const loadEntityData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/output/${entityId}/entity.json`);
      if (!response.ok) {
        throw new Error(`Failed to load entity data: ${response.status}`);
      }
      
      const data = await response.json();
      setEntity(data);
    } catch (err) {
      console.error('Error loading entity data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load entity data');
      toast({
        title: "Error",
        description: "Failed to load entity data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Entity Details</h1>
          <p className="dashboard-subtitle">Loading entity information...</p>
        </div>
        <div className="dashboard-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="loading-spinner">Loading entity details...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Entity Details</h1>
          <p className="dashboard-subtitle">Error loading entity</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Entities
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ color: '#dc2626', fontSize: '1.1rem', fontWeight: '600' }}>Error: {error}</div>
            <button onClick={loadEntityData} className="btn-primary" style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Entity Details</h1>
          <p className="dashboard-subtitle">Entity not found</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Entities
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fefbf3', border: '1px solid #fed7aa' }}>
            <div style={{ color: '#ea580c', fontSize: '1.1rem', fontWeight: '600' }}>Entity {entityId} not found</div>
            <button onClick={handleBack} className="btn-primary" style={{ marginTop: '1rem' }}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Entity Details</h1>
        <p className="dashboard-subtitle">{entity.title || `Entity ${entityId}`}</p>
      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="entity-detail"
          entityData={entity}
          onBack={handleBack}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: entity?.title || `Entity ${entityId}`, current: true, icon: 'Building' }
          ]}
        />
        
        <div className="entity-navigation-section" style={{ marginBottom: '2rem' }}>
          <div className="navigation-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div 
              className="navigation-card" 
              style={{ 
                padding: '1.5rem', 
                border: '1px solid #e5e7eb', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                transition: 'all 0.2s',
                backgroundColor: '#f8fafc'
              }}
              onClick={() => navigate(`/entity/${entityId}/customers`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.borderColor = '#3b82f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Customers</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>View and manage fleet customers</p>
            </div>
            
            <div 
              className="navigation-card" 
              style={{ 
                padding: '1.5rem', 
                border: '2px solid #10b981', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                transition: 'all 0.2s',
                backgroundColor: '#ecfdf5'
              }}
              onClick={() => navigate(`/entity/${entityId}`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#d1fae5';
                e.currentTarget.style.borderColor = '#059669';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ecfdf5';
                e.currentTarget.style.borderColor = '#10b981';
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚀</div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: '600', color: '#059669' }}>Enhanced View</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#047857' }}>Complete entity data with all 126 tables</p>
            </div>
          </div>
        </div>
        
        <EntityViewer 
          data={entity} 
          title={`Entity ${entityId} Details`} 
          type="entity" 
        />
      </div>
    </div>
  );
}
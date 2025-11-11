import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { onboardingApi } from '../services/onboardingApi';
import { useWizardStore } from '../state/wizardStore';
import type { VehicleMatch, VehicleUpdatePayload } from '../../shared/onboarding';

const MATCH_THRESHOLD = 0.9;
const LEGACY_MATCH_WARNING = 0.85;

function formatMatchRate(rate?: number): string {
  return `${Math.round((rate ?? 0) * 100)}%`;
}

type CustomerStats = {
  customerId: string;
  customerName: string;
  customerDescription?: string;
  total: number;
  validated: number;
  legacy: number;
  sumMatchRate: number;
};

type CustomerVehicleGroup = {
  customerId: string;
  customerName: string;
  customerDescription?: string;
  vehicles: VehicleMatch[];
  stats?: CustomerStats;
};

function groupVehiclesByCustomer(
  source: VehicleMatch[],
  statsMap: Map<string, CustomerStats>
): CustomerVehicleGroup[] {
  const groups = new Map<string, CustomerVehicleGroup>();

  source.forEach((vehicle) => {
    const customerId = vehicle.customerId ?? 'unassigned';
    let group = groups.get(customerId);
    if (!group) {
      const stats = statsMap.get(customerId);
      group = {
        customerId,
        customerName: stats?.customerName || vehicle.customerName || `Customer ${customerId}`,
        customerDescription: stats?.customerDescription || vehicle.customerDescription,
        vehicles: [],
        stats
      };
      groups.set(customerId, group);
    }
    group.vehicles.push(vehicle);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const aTotal = a.stats?.total ?? a.vehicles.length;
    const bTotal = b.stats?.total ?? b.vehicles.length;
    if (bTotal !== aTotal) {
      return bTotal - aTotal;
    }
    return a.customerName.localeCompare(b.customerName);
  });
}

export function VehicleReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customer, vehicles, vehicleSummary, setVehicles, updateVehicle, setVehicleSummary } = useWizardStore();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [draggingVehicleId, setDraggingVehicleId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailPrompt, setDetailPrompt] = useState<string | null>(null);
  const [formState, setFormState] = useState<VehicleUpdatePayload>({});
  const [selectedNeedsIds, setSelectedNeedsIds] = useState<Set<string>>(new Set());
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null);
  const [collapsedValidated, setCollapsedValidated] = useState<boolean>(true);
  const [collapsedLegacy, setCollapsedLegacy] = useState<boolean>(true);
  const [openNeedsCustomers, setOpenNeedsCustomers] = useState<Set<string>>(new Set());
  const [openValidatedCustomers, setOpenValidatedCustomers] = useState<Set<string>>(new Set());
  const [openLegacyCustomers, setOpenLegacyCustomers] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditFormState, setBulkEditFormState] = useState<VehicleUpdatePayload>({});

  useEffect(() => {
    if (!customer) {
      navigate('/onboarding', { replace: true });
    }
  }, [customer, navigate]);

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', customer?.customerId],
    enabled: !!customer?.customerId,
    queryFn: async () => onboardingApi.fetchVehicles(customer!.customerId)
  });

  useEffect(() => {
    if (vehiclesQuery.data) {
      setVehicles(vehiclesQuery.data.vehicles);
      setVehicleSummary(vehiclesQuery.data.summary);
    }
  }, [vehiclesQuery.data, setVehicles, setVehicleSummary]);

  const needsAttentionVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) => vehicle.status !== 'legacy' && (vehicle.matchRate ?? 0) < MATCH_THRESHOLD
      ),
    [vehicles]
  );

  const validatedVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === 'validated' || (vehicle.matchRate ?? 0) >= MATCH_THRESHOLD),
    [vehicles]
  );

  const legacyVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === 'legacy'),
    [vehicles]
  );

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.unitId === selectedVehicleId),
    [vehicles, selectedVehicleId]
  );

  const customerStats = useMemo(() => {
    const map = new Map<string, CustomerStats>();
    vehicles.forEach((vehicle) => {
      const customerId = vehicle.customerId ?? 'unassigned';
      const existing = map.get(customerId);
      if (existing) {
        existing.total += 1;
        existing.sumMatchRate += vehicle.matchRate ?? 0;
        if (vehicle.status === 'legacy') existing.legacy += 1;
        if (vehicle.status === 'validated' || (vehicle.matchRate ?? 0) >= MATCH_THRESHOLD) {
          existing.validated += 1;
        }
        if (!existing.customerName && vehicle.customerName) existing.customerName = vehicle.customerName;
        if (!existing.customerDescription && vehicle.customerDescription) {
          existing.customerDescription = vehicle.customerDescription;
        }
      } else {
        map.set(customerId, {
          customerId,
          customerName: vehicle.customerName || `Customer ${customerId}`,
          customerDescription: vehicle.customerDescription,
          total: 1,
          validated:
            vehicle.status === 'validated' || (vehicle.matchRate ?? 0) >= MATCH_THRESHOLD ? 1 : 0,
          legacy: vehicle.status === 'legacy' ? 1 : 0,
          sumMatchRate: vehicle.matchRate ?? 0
        });
      }
    });
    return map;
  }, [vehicles]);

  const needsGroups = useMemo(
    () => groupVehiclesByCustomer(needsAttentionVehicles, customerStats),
    [needsAttentionVehicles, customerStats]
  );

  const validatedGroups = useMemo(
    () => groupVehiclesByCustomer(validatedVehicles, customerStats),
    [validatedVehicles, customerStats]
  );

  const legacyGroups = useMemo(
    () => groupVehiclesByCustomer(legacyVehicles, customerStats),
    [legacyVehicles, customerStats]
  );

  useEffect(() => {
    setSelectedNeedsIds((previous) => {
      const next = new Set<string>();
      needsAttentionVehicles.forEach((vehicle) => {
        if (previous.has(vehicle.unitId)) {
          next.add(vehicle.unitId);
        }
      });
      return next;
    });
  }, [needsAttentionVehicles]);

  useEffect(() => {
    setOpenNeedsCustomers((current) => {
      const validIds = new Set(needsGroups.map((group) => group.customerId));
      const next = new Set<string>();
      current.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [needsGroups]);

  useEffect(() => {
    if (selectedVehicle?.customerId) {
      setOpenNeedsCustomers((current) => {
        if (current.has(selectedVehicle.customerId!)) return current;
        const next = new Set(current);
        next.add(selectedVehicle.customerId!);
        return next;
      });
      setOpenValidatedCustomers((current) => {
        if (current.has(selectedVehicle.customerId!)) return current;
        const next = new Set(current);
        next.add(selectedVehicle.customerId!);
        return next;
      });
      setOpenLegacyCustomers((current) => {
        if (current.has(selectedVehicle.customerId!)) return current;
        const next = new Set(current);
        next.add(selectedVehicle.customerId!);
        return next;
      });
    }
  }, [selectedVehicle?.customerId]);

  useEffect(() => {
    if (!vehicles.length) {
      setSelectedVehicleId(null);
      setIsDetailOpen(false);
      return;
    }

    if (!selectedVehicleId || !vehicles.some((vehicle) => vehicle.unitId === selectedVehicleId)) {
      const fallback = needsAttentionVehicles[0] ?? validatedVehicles[0] ?? legacyVehicles[0];
      if (fallback) {
        setSelectedVehicleId(fallback.unitId);
      }
    }
  }, [vehicles, selectedVehicleId, needsAttentionVehicles, validatedVehicles, legacyVehicles]);

  useEffect(() => {
    if (selectedVehicle) {
      setFormState({
        vin: selectedVehicle.vin,
        make: selectedVehicle.make,
        model: selectedVehicle.model,
        modelYear: selectedVehicle.modelYear ?? undefined
      });
    }
  }, [selectedVehicle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDetailOpen(false);
      }
    };
    if (isDetailOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailOpen]);

  const updateMutation = useMutation<VehicleMatch, Error, VehicleUpdatePayload>({
    mutationFn: async (payload) => {
      if (!customer || !selectedVehicle) throw new Error('No vehicle selected');
      const updated = await onboardingApi.updateVehicle(customer.customerId, selectedVehicle.unitId, payload);
      return updated;
    },
    onSuccess: (updatedVehicle) => {
      updateVehicle(updatedVehicle.unitId, () => updatedVehicle);
      queryClient.invalidateQueries({ queryKey: ['vehicles', customer?.customerId] });
      setSelectedNeedsIds((current) => {
        if (!current.has(updatedVehicle.unitId)) return current;
        const next = new Set(current);
        next.delete(updatedVehicle.unitId);
        return next;
      });
      if (updatedVehicle.status === 'legacy') {
        setDetailPrompt('Vehicle marked as legacy and moved to the legacy list.');
        setCollapsedLegacy(false);
      } else if ((updatedVehicle.matchRate ?? 0) >= MATCH_THRESHOLD) {
        setDetailPrompt(null);
        setCollapsedValidated(false);
      } else {
        setDetailPrompt('Matching confidence is still below 90%. Adjust the details and re-run matching.');
      }
    }
  });

  const markLegacyMutation = useMutation<VehicleMatch, Error, void>({
    mutationFn: async () => {
      if (!customer || !selectedVehicle) throw new Error('No vehicle selected');
      const updated = await onboardingApi.updateVehicle(customer.customerId, selectedVehicle.unitId, {
        markAsLegacy: true
      });
      return updated;
    },
    onSuccess: (updatedVehicle) => {
      updateVehicle(updatedVehicle.unitId, () => updatedVehicle);
      queryClient.invalidateQueries({ queryKey: ['vehicles', customer?.customerId] });
      setDetailPrompt('Vehicle marked as legacy and moved to the legacy list.');
      setCollapsedLegacy(false);
      setBulkActionMessage(null);
      setSelectedNeedsIds((current) => {
        if (!current.has(updatedVehicle.unitId)) return current;
        const next = new Set(current);
        next.delete(updatedVehicle.unitId);
        return next;
      });
    }
  });

  const bulkUpdateMutation = useMutation<VehicleMatch[], Error, { vehicleIds: string[]; payload: VehicleUpdatePayload }>({
    mutationFn: async ({ vehicleIds, payload }) => {
      if (!customer) throw new Error('No customer selected');
      const updates = await Promise.all(
        vehicleIds.map(unitId => onboardingApi.updateVehicle(customer.customerId, unitId, payload))
      );
      return updates;
    },
    onSuccess: (updatedVehicles) => {
      updatedVehicles.forEach(updatedVehicle => {
        updateVehicle(updatedVehicle.unitId, () => updatedVehicle);
      });
      queryClient.invalidateQueries({ queryKey: ['vehicles', customer?.customerId] });
      setBulkActionMessage(`Successfully updated ${updatedVehicles.length} vehicle(s).`);
      setIsBulkEditOpen(false);
      setBulkEditFormState({});
      setCollapsedValidated(false);
    }
  });

  const bulkMarkLegacyMutation = useMutation<VehicleMatch[], Error, string[]>({
    mutationFn: async (vehicleIds) => {
      if (!customer) throw new Error('No customer selected');
      const updates = await Promise.all(
        vehicleIds.map(unitId => onboardingApi.updateVehicle(customer.customerId, unitId, { markAsLegacy: true }))
      );
      return updates;
    },
    onSuccess: (updatedVehicles) => {
      updatedVehicles.forEach(updatedVehicle => {
        updateVehicle(updatedVehicle.unitId, () => updatedVehicle);
      });
      queryClient.invalidateQueries({ queryKey: ['vehicles', customer?.customerId] });
      setBulkActionMessage(`Successfully marked ${updatedVehicles.length} vehicle(s) as legacy.`);
      setSelectedNeedsIds(new Set());
      setCollapsedLegacy(false);
    }
  });

  const handleDetailChange = <K extends keyof VehicleUpdatePayload>(key: K, value: VehicleUpdatePayload[K]) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    setBulkActionMessage(null);
    updateMutation.mutate(formState);
  };

  const handleLegacy = () => {
    setBulkActionMessage(null);
    markLegacyMutation.mutate();
  };

  const handleDragStart = (vehicleId: string) => {
    setDraggingVehicleId(vehicleId);
    setBulkActionMessage(null);
  };

  const handleDragEnd = () => {
    setDraggingVehicleId(null);
  };

  const handleDropToGoodList = () => {
    if (!draggingVehicleId) return;
    const droppedVehicle = vehicles.find((vehicle) => vehicle.unitId === draggingVehicleId);
    if (!droppedVehicle) return;

    setSelectedVehicleId(droppedVehicle.unitId);
    setIsDetailOpen(true);

    if ((droppedVehicle.matchRate ?? 0) < MATCH_THRESHOLD) {
      setDetailPrompt('Increase the match rate above 90% before moving this vehicle to the validated column.');
    } else {
      setDetailPrompt(null);
      setCollapsedValidated(false);
    }

    setDraggingVehicleId(null);
    setBulkActionMessage(null);
    setSelectedNeedsIds((current) => {
      if (!current.has(droppedVehicle.unitId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(droppedVehicle.unitId);
      return next;
    });
  };

  const handleDropToLegacy = () => {
    if (!draggingVehicleId) return;
    const droppedVehicle = vehicles.find((vehicle) => vehicle.unitId === draggingVehicleId);
    if (!droppedVehicle) return;

    onboardingApi.updateVehicle(customer!.customerId, droppedVehicle.unitId, { markAsLegacy: true })
      .then((updatedVehicle) => {
        updateVehicle(updatedVehicle.unitId, () => updatedVehicle);
        queryClient.invalidateQueries({ queryKey: ['vehicles', customer?.customerId] });
        setBulkActionMessage(`${droppedVehicle.label} marked as legacy.`);
        setCollapsedLegacy(false);
        setSelectedNeedsIds((current) => {
          if (!current.has(droppedVehicle.unitId)) return current;
          const next = new Set(current);
          next.delete(droppedVehicle.unitId);
          return next;
        });
      })
      .catch((error) => {
        setBulkActionMessage(`Failed to mark as legacy: ${error.message}`);
      });

    setDraggingVehicleId(null);
  };

  const toggleNeedSelection = (vehicleId: string) => {
    setSelectedNeedsIds((current) => {
      const next = new Set(current);
      if (next.has(vehicleId)) {
        next.delete(vehicleId);
      } else {
        next.add(vehicleId);
      }
      return next;
    });
    setBulkActionMessage(null);
  };

  const handleSelectAllNeeds = () => {
    setSelectedNeedsIds(new Set(needsAttentionVehicles.map((vehicle) => vehicle.unitId)));
    setBulkActionMessage(null);
  };

  const handleClearNeedsSelection = () => {
    setSelectedNeedsIds(new Set());
    setBulkActionMessage(null);
  };

  const handleMoveSelected = () => {
    const selectedVehicles = needsAttentionVehicles.filter((vehicle) => selectedNeedsIds.has(vehicle.unitId));
    if (selectedVehicles.length === 0) {
      setBulkActionMessage('Select at least one vehicle in the left column to move.');
      return;
    }

    const belowEightyFive = selectedVehicles.filter((vehicle) => (vehicle.matchRate ?? 0) < LEGACY_MATCH_WARNING);
    const belowNinety = selectedVehicles.filter((vehicle) => (vehicle.matchRate ?? 0) < MATCH_THRESHOLD);

    if (belowEightyFive.length > 0) {
      const names = belowEightyFive.map((vehicle) => vehicle.label).join(', ');
      setBulkActionMessage(
        `These vehicles are below 85% match confidence and need additional fixes: ${names}.`
      );
      const target = belowEightyFive[0];
      setSelectedVehicleId(target.unitId);
      setIsDetailOpen(true);
      setDetailPrompt('Raise the match rate above 85% to continue.');
      return;
    }

    if (belowNinety.length > 0) {
      const names = belowNinety.map((vehicle) => vehicle.label).join(', ');
      setBulkActionMessage(
        `Update these vehicles above 90% before moving: ${names}. Adjust the details and save to increase the match rate.`
      );
      const target = belowNinety[0];
      setSelectedVehicleId(target.unitId);
      setIsDetailOpen(true);
      setDetailPrompt('Increase the match rate above 90% to complete the move.');
      return;
    }

    setBulkActionMessage('All selected vehicles already meet the 90% threshold and will appear in the validated column.');
    setSelectedNeedsIds(new Set());
    setCollapsedValidated(false);
    setDetailPrompt(null);
  };

  const handleSelectByFailureReason = (reason: string) => {
    const matchingVehicles = needsAttentionVehicles.filter(vehicle =>
      vehicle.unmatchedAttributes.some(attr => attr.toLowerCase().includes(reason.toLowerCase()))
    );
    setSelectedNeedsIds(new Set(matchingVehicles.map(v => v.unitId)));
    setBulkActionMessage(`Selected ${matchingVehicles.length} vehicle(s) with issue: ${reason}`);
  };

  const handleOpenBulkEdit = () => {
    if (selectedNeedsIds.size === 0) {
      setBulkActionMessage('Select at least one vehicle to bulk edit.');
      return;
    }
    setIsBulkEditOpen(true);
    setBulkEditFormState({});
  };

  const handleBulkEditChange = <K extends keyof VehicleUpdatePayload>(key: K, value: VehicleUpdatePayload[K]) => {
    setBulkEditFormState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleBulkEditSave = () => {
    const vehicleIds = Array.from(selectedNeedsIds);
    bulkUpdateMutation.mutate({ vehicleIds, payload: bulkEditFormState });
  };

  const handleMoveSelectedToLegacy = () => {
    if (selectedNeedsIds.size === 0) {
      setBulkActionMessage('Select at least one vehicle to mark as legacy.');
      return;
    }
    const vehicleIds = Array.from(selectedNeedsIds);
    bulkMarkLegacyMutation.mutate(vehicleIds);
  };

  const handleMarkCustomerAsLegacy = (customerId: string) => {
    const customerVehicles = needsAttentionVehicles.filter(v => v.customerId === customerId);
    if (customerVehicles.length === 0) return;

    const vehicleIds = customerVehicles.map(v => v.unitId);
    bulkMarkLegacyMutation.mutate(vehicleIds);
  };

  const handleRemoveFromLegacy = (vehicleId: string) => {
    if (!customer) return;

    onboardingApi.updateVehicle(customer.customerId, vehicleId, { markAsLegacy: false })
      .then((updatedVehicle) => {
        updateVehicle(updatedVehicle.unitId, () => updatedVehicle);
        queryClient.invalidateQueries({ queryKey: ['vehicles', customer?.customerId] });
        setBulkActionMessage(`Removed from legacy. Vehicle moved back based on match rate.`);

        // Expand appropriate section based on match rate
        if ((updatedVehicle.matchRate ?? 0) >= MATCH_THRESHOLD) {
          setCollapsedValidated(false);
        }
      })
      .catch((error) => {
        setBulkActionMessage(`Failed to remove from legacy: ${error.message}`);
      });
  };

  const toggleOpenSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
      (id: string) => {
        setter((current) => {
          const next = new Set(current);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      },
    []
  );

  if (!customer) {
    return null;
  }

  const totalCount = vehicles.length;
  const needsCount = needsAttentionVehicles.length;
  const healthyCount = validatedVehicles.length;
  const legacyCount = legacyVehicles.length;

  const toggleNeedsGroup = toggleOpenSet(setOpenNeedsCustomers);
  const toggleValidatedGroup = toggleOpenSet(setOpenValidatedCustomers);
  const toggleLegacyGroup = toggleOpenSet(setOpenLegacyCustomers);

  return (
    <div className="stack">
      <section className="panel stack" style={{ gap: 'var(--space-xl)' }}>
        <div className="stack" style={{ gap: 'var(--space-sm)' }}>
          <h2>Vehicle matching review</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
            Review AutoCare matches for <strong style={{ color: 'var(--color-text-primary)' }}>{customer.displayName || 'this customer'}</strong>. Drag vehicles or
            bulk move customers once their match rate clears 90%, or mark historical units as legacy.
          </p>
        </div>
        <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="metric">
            <span>Total vehicles</span>
            <strong>{totalCount}</strong>
          </div>
          <div className="metric" style={{ background: 'rgba(248,113,113,0.12)' }}>
            <span>Needs attention (&lt; 90%)</span>
            <strong>{needsCount}</strong>
          </div>
          <div className="metric">
            <span>Validated (≥ 90%)</span>
            <strong>{healthyCount}</strong>
          </div>
          <div className="metric">
            <span>Legacy</span>
            <strong>{legacyCount}</strong>
          </div>
        </div>

        {vehicleSummary?.topFailures && vehicleSummary.topFailures.length > 0 && (
          <div className="stack" style={{ gap: 'var(--space-md)' }}>
            <div className="split" style={{ alignItems: 'center', gap: 'var(--space-md)' }}>
              <h3>Top failure reasons</h3>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8125rem' }}>
                Click to select all vehicles with that issue
              </span>
            </div>
            <div className="split" style={{ gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {vehicleSummary.topFailures.map((failure) => (
                <button
                  key={failure.reason}
                  type="button"
                  onClick={() => handleSelectByFailureReason(failure.reason)}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    padding: 'var(--space-md) var(--space-lg)',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    borderRadius: 'var(--radius-md)',
                    minWidth: '200px',
                    flex: '1 1 auto'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fee2e2';
                    e.currentTarget.style.borderColor = '#fca5a5';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fef2f2';
                    e.currentTarget.style.borderColor = '#fecaca';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="split" style={{ alignItems: 'center', gap: 'var(--space-sm)', justifyContent: 'space-between' }}>
                    <strong style={{ color: '#991b1b', fontSize: '0.875rem' }}>{failure.reason}</strong>
                    <span className="badge" style={{ background: '#991b1b', color: '#fff', fontWeight: '600' }}>
                      {failure.count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customer.customerId}/customers`)}>
          ← Back to customers
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${customer.customerId}/parts`)}>
          Continue to parts →
        </button>
      </nav>

      <div className="panel" style={{ background: '#eff6ff', borderColor: '#bfdbfe', padding: 'var(--space-lg)' }}>
        <div className="stack" style={{ gap: 'var(--space-sm)' }}>
          <h4 style={{ color: 'var(--color-primary-hover)', margin: 0 }}>💡 About Legacy Vehicles</h4>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            <strong>Don't have time to fix everything now?</strong> Mark vehicles as "legacy" to import them as-is.
            Legacy vehicles will:
          </p>
          <ul style={{ margin: '0', paddingLeft: 'var(--space-xl)', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            <li>Preserve financial records and parts history</li>
            <li>Not appear in active unit lists</li>
            <li>Require updates if you work on them again in the future</li>
          </ul>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            <strong>Tip:</strong> If a customer no longer visits your shop or has poor data quality, mark them as legacy and move on. You can always fix individual units later when needed.
          </p>
        </div>
      </div>

      <section className="panel" style={{ padding: '1.5rem' }}>
        <div className="split" style={{ gap: '2rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="split" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Needs attention</h3>
                <span style={{ color: 'rgba(15,23,42,0.6)' }}>Expand a customer to review and fix unmatched vehicles, or mark entire customers as legacy.</span>
              </div>
              <div className="split" style={{ gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    const allNeedsIds = needsAttentionVehicles.map(v => v.unitId);
                    bulkMarkLegacyMutation.mutate(allNeedsIds);
                  }}
                  disabled={needsAttentionVehicles.length === 0 || bulkMarkLegacyMutation.isPending}
                  style={{
                    background: '#fef2f2',
                    color: '#991b1b',
                    borderColor: '#fecaca',
                    fontWeight: '600'
                  }}
                  title="Skip fixing now - import all remaining vehicles as legacy"
                >
                  {bulkMarkLegacyMutation.isPending ? 'Marking...' : 'Skip all & import as legacy'}
                </button>
                <button className="button button-secondary" type="button" onClick={handleSelectAllNeeds}>
                  Select all
                </button>
                <button className="button button-secondary" type="button" onClick={handleClearNeedsSelection}>
                  Clear
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleOpenBulkEdit}
                  disabled={selectedNeedsIds.size === 0}
                >
                  Bulk edit selected
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleMoveSelectedToLegacy}
                  disabled={selectedNeedsIds.size === 0}
                  style={{
                    background: 'rgba(249,115,22,0.1)',
                    color: '#9a3412',
                    borderColor: 'rgba(249,115,22,0.3)'
                  }}
                >
                  Move selected to legacy
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={handleMoveSelected}
                  disabled={selectedNeedsIds.size === 0}
                >
                  Move selected to validated
                </button>
              </div>
            </div>
            {bulkActionMessage && (
              <div className="panel" style={{ background: 'rgba(248,113,113,0.1)', color: '#991b1b' }}>
                {bulkActionMessage}
              </div>
            )}
            <div className="stack" style={{ gap: '0.75rem' }}>
              {needsGroups.map((group) => {
                const isOpen = openNeedsCustomers.has(group.customerId);
                const stats = group.stats;
                const matchPercent = stats && stats.total > 0 ? Math.round((stats.validated / stats.total) * 100) : 0;
                const avgMatch = stats && stats.total > 0 ? Math.round((stats.sumMatchRate / stats.total) * 100) : 0;
                return (
                  <article key={group.customerId} className="panel" style={{ border: '1px solid rgba(15,23,42,0.1)' }}>
                    <div
                      onClick={() => toggleNeedsGroup(group.customerId)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <div className="split" style={{ alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div className="stack" style={{ gap: '0.35rem', flex: 1 }}>
                          <strong>{group.customerName}</strong>
                          <span style={{ color: 'rgba(15,23,42,0.6)', fontSize: '0.9rem' }}>
                            {stats
                              ? `${matchPercent}% validated • Avg confidence ${avgMatch}% • ${stats.total} vehicles`
                              : `${group.vehicles.length} vehicles`}
                          </span>
                          {group.customerDescription && (
                            <span style={{ color: 'rgba(15,23,42,0.55)', fontSize: '0.85rem' }}>
                              {typeof group.customerDescription === 'string' ? group.customerDescription : JSON.stringify(group.customerDescription)}
                            </span>
                          )}
                        </div>
                        <div className="split" style={{ gap: 'var(--space-sm)', alignItems: 'center' }}>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkCustomerAsLegacy(group.customerId);
                            }}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.35rem 0.75rem',
                              background: 'rgba(249,115,22,0.1)',
                              color: '#9a3412',
                              borderColor: 'rgba(249,115,22,0.3)'
                            }}
                            title="Mark all vehicles from this customer as legacy"
                          >
                            Mark all as legacy
                          </button>
                          <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                            ▾
                          </span>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="stack" style={{ gap: '0.75rem', marginTop: '1rem' }}>
                        {group.vehicles.map((vehicle) => (
                          <article
                            key={vehicle.unitId}
                            draggable
                            onDragStart={() => handleDragStart(vehicle.unitId)}
                            onDragEnd={handleDragEnd}
                            onClick={() => {
                              setSelectedVehicleId(vehicle.unitId);
                              setIsDetailOpen(true);
                              setBulkActionMessage(null);
                              if ((vehicle.matchRate ?? 0) < MATCH_THRESHOLD) {
                                setDetailPrompt('Increase the match rate above 90% to validate this vehicle.');
                              }
                            }}
                            className="panel"
                            style={{
                              cursor: 'grab',
                              border: selectedNeedsIds.has(vehicle.unitId)
                                ? '2px solid #2563eb'
                                : draggingVehicleId === vehicle.unitId
                                  ? '2px solid #2563eb'
                                  : '1px solid rgba(15,23,42,0.1)',
                              boxShadow: selectedNeedsIds.has(vehicle.unitId)
                                ? '0 0 0 2px rgba(37,99,235,0.15)'
                                : undefined
                            }}
                          >
                            <div className="split" style={{ alignItems: 'flex-start' }}>
                              <div>
                                <strong>{vehicle.label}</strong>
                                <p style={{ margin: '0.25rem 0', color: 'rgba(15,23,42,0.65)' }}>
                                  {vehicle.make || 'Unknown make'} • {vehicle.modelYear ?? '—'}
                                </p>
                              </div>
                              <span
                                className="badge"
                                style={{ background: 'rgba(248,113,113,0.15)', color: '#991b1b' }}
                              >
                                {formatMatchRate(vehicle.matchRate)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedNeedsIds.has(vehicle.unitId)}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => {
                                    event.stopPropagation();
                                    toggleNeedSelection(vehicle.unitId);
                                  }}
                                />
                                Select
                              </label>
                            </div>
                            {vehicle.unmatchedAttributes.length > 0 && (
                              <div className="split" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                                {vehicle.unmatchedAttributes.map((attribute) => (
                                  <span key={attribute} className="badge" style={{ background: 'rgba(251,191,36,0.2)', color: '#92400e' }}>
                                    {attribute}
                                  </span>
                                ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
              {needsGroups.length === 0 && (
                <div className="panel" style={{ background: 'rgba(34,197,94,0.12)', color: '#166534' }}>
                  All vehicles meet the 90% match target.
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div
              style={{
                flex: 1,
                minHeight: '320px',
                border: '2px dashed rgba(37,99,235,0.35)',
                borderRadius: '0.75rem',
                padding: '1rem',
                background: draggingVehicleId ? 'rgba(37,99,235,0.05)' : 'transparent'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleDropToGoodList();
              }}
            >
              <div className="split" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Validated</h3>
                  <span style={{ color: 'rgba(15,23,42,0.6)' }}>Drop vehicles here once they pass the 90% bar.</span>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setCollapsedValidated((prev) => !prev)}
                  disabled={validatedGroups.length === 0}
                >
                  {collapsedValidated ? 'Show validated customers' : 'Hide validated customers'}
                </button>
              </div>
              {validatedGroups.length === 0 ? (
                <div className="panel" style={{ background: 'rgba(248,113,113,0.1)', color: '#991b1b' }}>
                  No vehicles have cleared the 90% threshold yet.
                </div>
              ) : collapsedValidated ? (
                <div style={{ color: 'rgba(15,23,42,0.6)', fontSize: '0.9rem' }}>
                  Validated customers hidden. Expand to review.
                </div>
              ) : (
                <div className="stack" style={{ gap: '0.75rem' }}>
                  {validatedGroups.map((group) => {
                    const isOpen = openValidatedCustomers.has(group.customerId);
                    const stats = group.stats;
                    const avgMatch = stats && stats.total > 0 ? Math.round((stats.sumMatchRate / stats.total) * 100) : 0;
                    return (
                      <article key={group.customerId} className="panel" style={{ border: '1px solid rgba(15,23,42,0.1)' }}>
                        <button
                          type="button"
                          onClick={() => toggleValidatedGroup(group.customerId)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <div className="split" style={{ alignItems: 'flex-start' }}>
                            <div className="stack" style={{ gap: '0.35rem' }}>
                              <strong>{group.customerName}</strong>
                              <span style={{ color: 'rgba(15,23,42,0.6)', fontSize: '0.9rem' }}>
                                {stats
                                  ? `Validated ${stats.validated} of ${stats.total} vehicles • Avg confidence ${avgMatch}%`
                                  : `${group.vehicles.length} vehicles`}
                              </span>
                            </div>
                            <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                              ▾
                            </span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="stack" style={{ gap: '0.75rem', marginTop: '1rem' }}>
                            {group.vehicles.map((vehicle) => (
                              <article
                                key={vehicle.unitId}
                                className="panel"
                                onClick={() => {
                                  setSelectedVehicleId(vehicle.unitId);
                                  setIsDetailOpen(true);
                                  setDetailPrompt(null);
                                  setBulkActionMessage(null);
                                }}
                                style={{ cursor: 'pointer', border: '1px solid rgba(15,23,42,0.1)' }}
                              >
                                <div className="split" style={{ alignItems: 'flex-start' }}>
                                  <div>
                                    <strong>{vehicle.label}</strong>
                                    <p style={{ margin: '0.25rem 0', color: 'rgba(15,23,42,0.65)' }}>
                                      {vehicle.make || 'Unknown make'} • {vehicle.modelYear ?? '—'}
                                    </p>
                                  </div>
                                  <span
                                    className="badge"
                                    style={{ background: 'rgba(134,239,172,0.35)', color: '#166534' }}
                                  >
                                    {formatMatchRate(vehicle.matchRate)}
                                  </span>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className="panel"
              style={{
                padding: '1rem',
                background: draggingVehicleId ? 'rgba(249,115,22,0.15)' : 'rgba(30,64,175,0.04)',
                border: draggingVehicleId ? '2px dashed rgba(249,115,22,0.5)' : 'none',
                transition: 'all 0.2s'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleDropToLegacy();
              }}
            >
              <div className="split" style={{ alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Legacy vehicles</h3>
                  {draggingVehicleId ? (
                    <span style={{ color: 'rgba(15,23,42,0.6)', fontSize: '0.9rem' }}>
                      Drop here to mark as legacy
                    </span>
                  ) : (
                    <span style={{ color: 'rgba(15,23,42,0.6)', fontSize: '0.9rem' }}>
                      Imported as-is. Financial records preserved. Will require updates if used again.
                    </span>
                  )}
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setCollapsedLegacy((prev) => !prev)}
                  disabled={legacyGroups.length === 0}
                >
                  {collapsedLegacy ? 'Show legacy customers' : 'Hide legacy customers'}
                </button>
              </div>
              {legacyGroups.length === 0 ? (
                <p style={{ color: 'rgba(15,23,42,0.6)', marginTop: '0.75rem' }}>
                  No legacy vehicles yet. Mark vehicles as legacy to skip fixing them now.
                </p>
              ) : collapsedLegacy ? (
                <p style={{ color: 'rgba(15,23,42,0.6)', marginTop: '0.75rem' }}>
                  {legacyCount} legacy vehicle(s) from {legacyGroups.length} customer(s). Expand to review or remove.
                </p>
              ) : (
                <div className="stack" style={{ gap: '0.75rem', marginTop: '0.75rem' }}>
                  {legacyGroups.map((group) => {
                    const isOpen = openLegacyCustomers.has(group.customerId);
                    return (
                      <article key={group.customerId} className="panel" style={{ border: '1px solid rgba(15,23,42,0.1)' }}>
                        <button
                          type="button"
                          onClick={() => toggleLegacyGroup(group.customerId)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <div className="split" style={{ alignItems: 'flex-start' }}>
                            <div className="stack" style={{ gap: '0.35rem' }}>
                              <strong>{group.customerName}</strong>
                              <span style={{ color: 'rgba(15,23,42,0.6)', fontSize: '0.9rem' }}>
                                {group.stats ? `${group.stats.legacy} legacy vehicles` : `${group.vehicles.length} vehicles`}
                              </span>
                              {group.customerDescription && (
                                <span style={{ color: 'rgba(15,23,42,0.55)', fontSize: '0.85rem' }}>
                                  {typeof group.customerDescription === 'string' ? group.customerDescription : JSON.stringify(group.customerDescription)}
                                </span>
                              )}
                            </div>
                            <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                              ▾
                            </span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="stack" style={{ gap: '0.75rem', marginTop: '1rem' }}>
                            {group.vehicles.map((vehicle) => (
                              <article
                                key={vehicle.unitId}
                                className="panel"
                                style={{ border: '1px solid rgba(15,23,42,0.1)' }}
                              >
                                <div className="stack" style={{ gap: '0.75rem' }}>
                                  <div className="split" style={{ alignItems: 'flex-start' }}>
                                    <div>
                                      <strong>{vehicle.label}</strong>
                                      <p style={{ margin: '0.25rem 0', color: 'rgba(15,23,42,0.65)' }}>
                                        {vehicle.make || 'Unknown make'} • {vehicle.modelYear ?? '—'}
                                      </p>
                                    </div>
                                    <div className="split" style={{ gap: '0.5rem', alignItems: 'center' }}>
                                      <span className="badge" style={{ background: 'rgba(249,115,22,0.25)', color: '#9a3412' }}>
                                        Legacy
                                      </span>
                                      <span className="badge" style={{ background: 'rgba(148,163,184,0.25)', color: '#1f2937' }}>
                                        {formatMatchRate(vehicle.matchRate)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="split" style={{ gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button
                                      className="button button-secondary"
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleRemoveFromLegacy(vehicle.unitId);
                                      }}
                                      style={{
                                        fontSize: '0.85rem',
                                        padding: '0.4rem 0.75rem'
                                      }}
                                    >
                                      Remove from legacy
                                    </button>
                                    <button
                                      className="button button-secondary"
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedVehicleId(vehicle.unitId);
                                        setIsDetailOpen(true);
                                        setDetailPrompt('This vehicle is marked as legacy.');
                                        setBulkActionMessage(null);
                                      }}
                                      style={{
                                        fontSize: '0.85rem',
                                        padding: '0.4rem 0.75rem'
                                      }}
                                    >
                                      View details
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {selectedVehicle && isDetailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vehicle-detail-heading"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '420px',
            background: '#ffffff',
            boxShadow: '-12px 0 24px rgba(15,23,42,0.18)',
            padding: '2rem 1.75rem',
            overflowY: 'auto',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }}
        >
          <div className="split" style={{ alignItems: 'flex-start' }}>
            <div>
              <h3 id="vehicle-detail-heading" style={{ margin: 0 }}>
                Update vehicle: {selectedVehicle.label}
              </h3>
              <p style={{ color: 'rgba(15,23,42,0.65)', marginTop: '0.35rem' }}>
                Adjust metadata, re-run matching, or mark the vehicle as legacy to move it forward.
              </p>
            </div>
            <button className="button button-secondary" type="button" onClick={() => setIsDetailOpen(false)}>
              Close
            </button>
          </div>

          {detailPrompt && (
            <div className="panel" style={{ background: 'rgba(248,113,113,0.1)', color: '#991b1b' }}>
              {detailPrompt}
            </div>
          )}

          <div className="split" style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <div className="metric" style={{ flex: '0 0 160px' }}>
              <span>Match rate</span>
              <strong>{formatMatchRate(selectedVehicle.matchRate)}</strong>
            </div>
            <div className="metric" style={{ flex: '0 0 160px' }}>
              <span>Status</span>
              <strong style={{ textTransform: 'capitalize' }}>{selectedVehicle.status ?? 'pending'}</strong>
            </div>
          </div>

          {selectedVehicle.autoCareReference && (
            <div className="info-strip">
              <span>AutoCare reference:</span>
              <span>
                {selectedVehicle.autoCareReference.makeName ?? '—'} /
                {' '}
                {selectedVehicle.autoCareReference.modelName ?? '—'} /
                {' '}
                {selectedVehicle.autoCareReference.year ?? '—'}
              </span>
              {typeof selectedVehicle.autoCareReference.confidence === 'number' && (
                <span className="badge" style={{ background: 'rgba(37,99,235,0.12)', color: '#1e3a8a' }}>
                  Confidence {Math.round((selectedVehicle.autoCareReference.confidence ?? 0) * 100)}%
                </span>
              )}
            </div>
          )}

          <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label className="stack" style={{ gap: '0.4rem' }}>
              <span>VIN</span>
              <input
                className="input"
                value={formState.vin ?? ''}
                onChange={(event) => handleDetailChange('vin', event.target.value)}
                placeholder="17-character VIN"
              />
            </label>
            <label className="stack" style={{ gap: '0.4rem' }}>
              <span>Make</span>
              <input
                className="input"
                value={formState.make ?? ''}
                onChange={(event) => handleDetailChange('make', event.target.value)}
                placeholder="e.g. Peterbilt"
              />
            </label>
            <label className="stack" style={{ gap: '0.4rem' }}>
              <span>Model</span>
              <input
                className="input"
                value={formState.model ?? ''}
                onChange={(event) => handleDetailChange('model', event.target.value)}
                placeholder="e.g. 579"
              />
            </label>
            <label className="stack" style={{ gap: '0.4rem' }}>
              <span>Model year</span>
              <input
                className="input"
                type="number"
                value={formState.modelYear ?? ''}
                onChange={(event) => handleDetailChange('modelYear', Number(event.target.value) || undefined)}
                placeholder="YYYY"
              />
            </label>
          </div>

          <div className="stack" style={{ gap: '0.35rem' }}>
            <span>Unmatched attributes</span>
            <div className="split" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedVehicle.unmatchedAttributes.length > 0 ? (
                selectedVehicle.unmatchedAttributes.map((attribute) => (
                  <span key={attribute} className="badge">
                    {attribute}
                  </span>
                ))
              ) : (
                <span className="badge" style={{ background: 'rgba(134,239,172,0.35)', color: '#166534' }}>
                  Matched across all attributes
                </span>
              )}
            </div>
          </div>

          {selectedVehicle.suggestions.length > 0 && (
            <div className="stack" style={{ gap: '0.75rem' }}>
              <span>Recommended fixes</span>
              <div className="suggestion-grid">
                {selectedVehicle.suggestions.map((suggestion) => (
                  <div key={suggestion.suggestionId} className="suggestion-card">
                    <div>
                      <strong>{suggestion.title}</strong>
                      {suggestion.description && <p className="suggestion-copy">{suggestion.description}</p>}
                    </div>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setFormState((prev) => ({
                          ...prev,
                          ...(suggestion.payload.vin !== undefined ? { vin: suggestion.payload.vin ?? '' } : {}),
                          ...(suggestion.payload.make !== undefined ? { make: suggestion.payload.make ?? '' } : {}),
                          ...(suggestion.payload.model !== undefined ? { model: suggestion.payload.model ?? '' } : {}),
                          ...(suggestion.payload.modelYear !== undefined ? { modelYear: suggestion.payload.modelYear } : {})
                        }));
                      }}
                    >
                      Apply suggestion
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="button" onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Re-running…' : 'Re-run matching'}
            </button>
            <button className="button button-secondary" onClick={handleLegacy} disabled={markLegacyMutation.isPending}>
              {markLegacyMutation.isPending ? 'Marking…' : 'Mark as legacy'}
            </button>
          </div>

          {(updateMutation.isError || markLegacyMutation.isError) && (
            <p role="alert" className="alert">
              {(updateMutation.error as Error)?.message || (markLegacyMutation.error as Error)?.message || 'Unable to update vehicle.'}
            </p>
          )}
        </div>
      )}

      {selectedVehicle && isDetailOpen && (
        <div
          role="presentation"
          onClick={() => setIsDetailOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.35)',
            zIndex: 1000
          }}
        />
      )}

      {isBulkEditOpen && (
        <>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-edit-heading"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              background: '#ffffff',
              boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
              borderRadius: '0.75rem',
              padding: '2rem',
              overflowY: 'auto',
              zIndex: 1001
            }}
          >
            <div className="stack" style={{ gap: '1.5rem' }}>
              <div className="split" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3 id="bulk-edit-heading" style={{ margin: 0 }}>
                    Bulk edit {selectedNeedsIds.size} vehicle(s)
                  </h3>
                  <p style={{ color: 'rgba(15,23,42,0.65)', marginTop: '0.35rem' }}>
                    Apply the same changes to all selected vehicles. Leave fields empty to keep their current values.
                  </p>
                </div>
                <button className="button button-secondary" type="button" onClick={() => setIsBulkEditOpen(false)}>
                  Cancel
                </button>
              </div>

              <div className="grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label className="stack" style={{ gap: '0.4rem' }}>
                  <span>Make</span>
                  <input
                    className="input"
                    value={bulkEditFormState.make ?? ''}
                    onChange={(event) => handleBulkEditChange('make', event.target.value || undefined)}
                    placeholder="Leave empty to skip"
                  />
                </label>
                <label className="stack" style={{ gap: '0.4rem' }}>
                  <span>Model</span>
                  <input
                    className="input"
                    value={bulkEditFormState.model ?? ''}
                    onChange={(event) => handleBulkEditChange('model', event.target.value || undefined)}
                    placeholder="Leave empty to skip"
                  />
                </label>
                <label className="stack" style={{ gap: '0.4rem' }}>
                  <span>Model year</span>
                  <input
                    className="input"
                    type="number"
                    value={bulkEditFormState.modelYear ?? ''}
                    onChange={(event) => handleBulkEditChange('modelYear', Number(event.target.value) || undefined)}
                    placeholder="Leave empty to skip"
                  />
                </label>
              </div>

              <div className="panel" style={{ background: 'rgba(37,99,235,0.08)', color: '#1e3a8a', padding: '1rem' }}>
                <strong>Tip:</strong> This will update all {selectedNeedsIds.size} selected vehicle(s) with the values you provide.
                Empty fields will not modify existing data.
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={handleBulkEditSave}
                  disabled={bulkUpdateMutation.isPending}
                >
                  {bulkUpdateMutation.isPending ? 'Updating…' : `Update ${selectedNeedsIds.size} vehicle(s)`}
                </button>
              </div>

              {bulkUpdateMutation.isError && (
                <p role="alert" className="alert">
                  {(bulkUpdateMutation.error as Error)?.message || 'Unable to update vehicles.'}
                </p>
              )}
            </div>
          </div>
          <div
            role="presentation"
            onClick={() => setIsBulkEditOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.4)',
              zIndex: 1000
            }}
          />
        </>
      )}

      <footer style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="button" onClick={() => navigate(`/onboarding/${customer.customerId}/parts`)}>
          Continue to parts →
        </button>
      </footer>
    </div>
  );
}

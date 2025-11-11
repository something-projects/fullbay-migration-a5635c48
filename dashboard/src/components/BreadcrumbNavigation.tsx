import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Users, Truck, Wrench } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
  path?: string;
  icon?: string | React.ReactNode;
  current?: boolean;
  isCurrentPage?: boolean;
}

// New unified interface
interface BreadcrumbNavigationProps {
  // New unified interface properties
  pageType?: 'entity-detail' | 'customers' | 'customer-detail' | 'units' | 'unit-detail' | 'service-orders' | 'service-order-detail';
  entityData?: any;
  onBack?: () => void;
  breadcrumbItems?: BreadcrumbItem[];
  
  // Legacy simple interface properties (backward compatibility)
  backButtonText?: string;
  onBackClick?: () => void;
}

export function BreadcrumbNavigation(props: BreadcrumbNavigationProps) {
  const navigate = useNavigate();
  
  // Icon mapping
  const getIcon = (iconName?: string | React.ReactNode) => {
    if (React.isValidElement(iconName)) {
      return iconName;
    }
    
    switch (iconName) {
      case 'Building2':
        return <Building2 className="h-4 w-4" />;
      case 'Building':
        return <Building2 className="h-4 w-4" />;
      case 'Users':
        return <Users className="h-4 w-4" />;
      case 'User':
        return <Users className="h-4 w-4" />;
      case 'Truck':
        return <Truck className="h-4 w-4" />;
      case 'Wrench':
        return <Wrench className="h-4 w-4" />;
      default:
        return iconName;
    }
  };
  
  // Backward compatibility: support legacy interface
  const backButtonText = props.backButtonText || getBackButtonText(props.pageType);
  const onBackClick = props.onBackClick || props.onBack;
  const breadcrumbItems = props.breadcrumbItems || [];
  
  function getBackButtonText(pageType?: string): string {
    switch (pageType) {
      case 'entity-detail':
        return 'Back to Entities';
      case 'customer-detail':
        return 'Back to Customers';
      case 'unit-detail':
        return 'Back to Units';
      case 'service-order-detail':
        return 'Back to Service Orders';
      default:
        return 'Back';
    }
  }

  // For detail pages, only show back button
  const isDetailPage = props.pageType?.includes('-detail');
  
  return (
    <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border">
      <Button 
        variant="outline" 
        onClick={onBackClick}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        {backButtonText}
      </Button>
      
      {!isDetailPage && breadcrumbItems.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbItems.map((item, index) => {
              const isCurrentPage = item.current || item.isCurrentPage;
              const itemPath = item.href || item.path;
              
              return (
                <React.Fragment key={index}>
                  <BreadcrumbItem>
                    {isCurrentPage ? (
                      <BreadcrumbPage className="flex items-center gap-1">
                        {getIcon(item.icon)}
                        {item.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink 
                        onClick={() => itemPath && navigate(itemPath)} 
                        className="flex items-center gap-1 cursor-pointer hover:text-blue-600"
                      >
                        {getIcon(item.icon)}
                        {item.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {index < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
    </div>
  );
}

// Predefined icons
export const BreadcrumbIcons = {
  entities: <Building2 className="h-4 w-4" />,
  customers: <Users className="h-4 w-4" />,
  units: <Truck className="h-4 w-4" />,
  serviceOrders: <Wrench className="h-4 w-4" />,
};

// Helper function: generate breadcrumb items for different page types
export function createBreadcrumbItems({
  entityId,
  customerId,
  unitId,
  pageType
}: {
  entityId?: string;
  customerId?: string;
  unitId?: string;
  orderId?: string; // Keep for API compatibility but not used in breadcrumbs
  pageType: 'entity-detail' | 'customers' | 'customer-detail' | 'units' | 'unit-detail' | 'service-orders' | 'service-order-detail';
}): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];

  // Always start from Entities
  items.push({
    label: 'Entities',
    path: '/',
    icon: BreadcrumbIcons.entities
  });

  // Don't add specific entity ID to breadcrumbs - only for list pages
  // Entity details are accessed through the list, not through breadcrumbs

  // Add corresponding breadcrumbs based on page type
  switch (pageType) {
    case 'customers':
      items.push({
        label: 'Customers',
        icon: BreadcrumbIcons.customers,
        isCurrentPage: true
      });
      break;

    case 'customer-detail':
      items.push({
        label: 'Customers',
        path: `/entity/${entityId}/customers`,
        icon: BreadcrumbIcons.customers
      });
      items.push({
        label: 'Customer Details',
        isCurrentPage: true
      });
      break;

    case 'units':
      items.push({
        label: 'Customers',
        path: `/entity/${entityId}/customers`,
        icon: BreadcrumbIcons.customers
      });
      items.push({
        label: 'Units',
        icon: BreadcrumbIcons.units,
        isCurrentPage: true
      });
      break;

    case 'unit-detail':
      items.push({
        label: 'Customers',
        path: `/entity/${entityId}/customers`,
        icon: BreadcrumbIcons.customers
      });
      items.push({
        label: 'Units',
        path: `/entity/${entityId}/customer/${customerId}`,
        icon: BreadcrumbIcons.units
      });
      items.push({
        label: 'Unit Details',
        isCurrentPage: true
      });
      break;

    case 'service-orders':
      items.push({
        label: 'Customers',
        path: `/entity/${entityId}/customers`,
        icon: BreadcrumbIcons.customers
      });
      items.push({
        label: 'Units',
        path: `/entity/${entityId}/customer/${customerId}`,
        icon: BreadcrumbIcons.units
      });
      items.push({
        label: 'Service Orders',
        icon: BreadcrumbIcons.serviceOrders,
        isCurrentPage: true
      });
      break;

    case 'service-order-detail':
      items.push({
        label: 'Customers',
        path: `/entity/${entityId}/customers`,
        icon: BreadcrumbIcons.customers
      });
      items.push({
        label: 'Units',
        path: `/entity/${entityId}/customer/${customerId}`,
        icon: BreadcrumbIcons.units
      });
      items.push({
        label: 'Service Orders',
        path: `/entity/${entityId}/customer/${customerId}/unit/${unitId}/service-orders`,
        icon: BreadcrumbIcons.serviceOrders
      });
      items.push({
        label: 'Service Order Details',
        isCurrentPage: true
      });
      break;
  }

  return items;
}
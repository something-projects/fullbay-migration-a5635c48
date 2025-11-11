import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Home, Building2, Users, Truck, Wrench } from 'lucide-react';

interface NavigationItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

export function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const getBreadcrumbItems = (): NavigationItem[] => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const items: NavigationItem[] = [
      { label: 'Home', path: '/', icon: <Home className="w-4 h-4" /> }
    ];

    if (pathParts.length === 0) {
      return items;
    }

    // Parse URL structure: /{timestamp}/entity/{entityId}/customer/{customerId}/unit/{unitId}
    if (pathParts[0]) {
      // Add timestamp breadcrumb
      const timestamp = pathParts[0];
      const formattedTimestamp = formatTimestamp(timestamp);
      items.push({
        label: formattedTimestamp,
        path: `/${timestamp}`,
        icon: <Building2 className="w-4 h-4" />
      });

      if (pathParts[1] === 'entity' && pathParts[2]) {
        // Add entity breadcrumb
        items.push({
          label: `Entity ${pathParts[2]}`,
          path: `/${timestamp}/entity/${pathParts[2]}`,
          icon: <Building2 className="w-4 h-4" />
        });

        if (pathParts[3] === 'customer' && pathParts[4]) {
          // Add customer breadcrumb
          items.push({
            label: `Customer ${pathParts[4]}`,
            path: `/${timestamp}/entity/${pathParts[2]}/customer/${pathParts[4]}`,
            icon: <Users className="w-4 h-4" />
          });

          if (pathParts[5] === 'unit' && pathParts[6]) {
            // Add unit breadcrumb
            items.push({
              label: `Unit ${pathParts[6]}`,
              path: `/${timestamp}/entity/${pathParts[2]}/customer/${pathParts[4]}/unit/${pathParts[6]}`,
              icon: <Truck className="w-4 h-4" />
            });

            if (pathParts[7] === 'service-orders') {
              // Add service orders breadcrumb
              items.push({
                label: 'Service Orders',
                path: location.pathname,
                icon: <Wrench className="w-4 h-4" />
              });
            }
          }
        }
      }
    }

    return items;
  };

  const formatTimestamp = (timestamp: string) => {
    const match = timestamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
      return date.toLocaleDateString();
    }
    return timestamp;
  };

  const breadcrumbItems = getBreadcrumbItems();
  const isCurrentPage = (index: number) => index === breadcrumbItems.length - 1;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <Breadcrumb>
          <BreadcrumbList className="justify-center">
            {breadcrumbItems.map((item, index) => (
              <React.Fragment key={item.path}>
                <BreadcrumbItem>
                  {isCurrentPage(index) ? (
                    <BreadcrumbPage className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(item.path)}
                    >
                      {item.icon}
                      {item.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isCurrentPage(index) && <BreadcrumbSeparator />}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        
        {/* Quick navigation actions */}
        <div className="mt-2 flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/')}
          >
            Home
          </Button>
          {breadcrumbItems.length > 1 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                const parentPath = breadcrumbItems[breadcrumbItems.length - 2]?.path;
                if (parentPath) navigate(parentPath);
              }}
            >
              Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
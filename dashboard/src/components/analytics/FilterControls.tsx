import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Filter, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FilterOptions } from '@/types/analytics';

interface FilterControlsProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onClose: () => void;
}

export function FilterControls({ filters, onFiltersChange, onClose }: FilterControlsProps) {
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState<string>(filters.entityIds?.join(', ') || '');
  const timeoutRef = useRef<NodeJS.Timeout>();
  const onFiltersChangeRef = useRef(onFiltersChange);
  const lastExternalFilterRef = useRef<string>(filters.entityIds?.join(', ') || '');

  // Update the ref when onFiltersChange changes
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  // Sync input value when filters prop changes externally (e.g., when cleared by tab switch)
  useEffect(() => {
    const newExternalValue = filters.entityIds?.join(', ') || '';
    
    // Only update input if this is a genuine external change
    // (not triggered by our own debounced input)
    if (newExternalValue !== lastExternalFilterRef.current) {
      setInputValue(newExternalValue);
      lastExternalFilterRef.current = newExternalValue;
    }
  }, [filters.entityIds]);

  const handleResetFilters = () => {
    setInputValue('');
    lastExternalFilterRef.current = '';
    onFiltersChange({});
  };


  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      const trimmedValue = inputValue.trim();
      if (!trimmedValue) {
        lastExternalFilterRef.current = '';
        onFiltersChangeRef.current({});
        return;
      }

      const entityIds = trimmedValue
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

      // Validate each entity ID is a number
      let isValid = true;
      for (const id of entityIds) {
        if (!/^\d+$/.test(id)) {
          toast({
            title: "Invalid Entity ID",
            description: `"${id}" is not a valid entity ID. Please use numeric values only.`,
            variant: "destructive",
          });
          isValid = false;
          break;
        }
      }

      if (isValid) {
        const newFilters: FilterOptions = {
          entityIds: entityIds.length > 0 ? entityIds : undefined
        };
        // Update the ref to prevent external sync from overriding this change
        lastExternalFilterRef.current = entityIds.length > 0 ? entityIds.join(', ') : '';
        onFiltersChangeRef.current(newFilters);
      }
    }, 500);

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [inputValue]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Data Filters</span>
            </CardTitle>
            <CardDescription>
              Filter data by Entity ID - results update automatically
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          {/* Entity IDs Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Entity IDs
            </label>
            <Input
              placeholder="e.g.: 1,2,3,545"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter numeric entity IDs separated by commas. Search will trigger automatically after 0.5 seconds.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="flex items-center space-x-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>

        {/* Active Filters Summary */}
        {filters.entityIds && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Active Filter:
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                Entity IDs: {filters.entityIds.join(', ')}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Button } from './button';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious, 
  PaginationEllipsis 
} from './pagination';

interface DataTableProps {
  data: any[];
  title: string;
  maxHeight?: string;
  itemsPerPage?: number;
}

export function DataTable({ data, title, maxHeight = "400px", itemsPerPage = 10 }: DataTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="px-6 py-4 border-b">
          <h4 className="font-semibold text-card-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground">0 records</p>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>No {title.toLowerCase()} records found</p>
        </div>
      </div>
    );
  }

  // Get all unique keys from the data
  const allKeys = Array.from(new Set(
    data.flatMap(item => Object.keys(item))
  ));

  // Filter out common metadata fields we don't want to show
  const filteredKeys = allKeys.filter(key => 
    !['created', 'modified', 'id', 'Id'].some(suffix => key.endsWith(suffix)) ||
    key === 'created' || key === 'modified'
  );

  // Sort keys to put important ones first
  const sortedKeys = filteredKeys.sort((a, b) => {
    const importantKeys = ['name', 'title', 'description', 'status', 'amount', 'total', 'balance'];
    const aImportant = importantKeys.some(k => a.toLowerCase().includes(k));
    const bImportant = importantKeys.some(k => b.toLowerCase().includes(k));
    
    if (aImportant && !bImportant) return -1;
    if (!aImportant && bImportant) return 1;
    if (a === 'created') return 1;
    if (b === 'created') return -1;
    if (a === 'modified') return 1;
    if (b === 'modified') return -1;
    return a.localeCompare(b);
  });

  // Take only the first 8 columns to avoid horizontal overflow
  const displayKeys = sortedKeys.slice(0, 8);

  const formatValue = (value: any, key: string) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' && value.includes('T') && value.includes('Z')) {
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    }
    if (typeof value === 'number' && (key.toLowerCase().includes('amount') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('price'))) {
      return `$${value.toLocaleString()}`;
    }
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 47) + '...';
    }
    return value.toString();
  };

  const formatHeader = (key: string) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/Id$/, 'ID');
  };

  const toggleRowExpansion = (index: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(index)) {
      newExpandedRows.delete(index);
    } else {
      newExpandedRows.add(index);
    }
    setExpandedRows(newExpandedRows);
  };

  // Pagination logic
  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, data.length);
  const currentData = data.slice(startIndex, endIndex);

  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, 5);
      } else if (currentPage >= totalPages - 2) {
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pages.push(i);
        }
      }
    }
    
    return pages;
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-6 py-4 border-b">
        <h4 className="font-semibold text-card-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground">
          {data.length} record{data.length !== 1 ? 's' : ''} • Page {currentPage} of {totalPages}
        </p>
      </div>
      
      <div style={{ maxHeight, overflowY: 'auto' }} className="relative">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              {displayKeys.map(key => (
                <TableHead key={key} className="font-medium">
                  {formatHeader(key)}
                </TableHead>
              ))}
              <TableHead className="w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentData.map((item, index) => {
              const globalIndex = startIndex + index;
              const isExpanded = expandedRows.has(globalIndex);
              
              return (
                <React.Fragment key={globalIndex}>
                  <TableRow>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {globalIndex + 1}
                    </TableCell>
                    {displayKeys.map(key => (
                      <TableCell key={key} className="max-w-48">
                        <div className="truncate text-sm">
                          {formatValue(item[key], key)}
                        </div>
                      </TableCell>
                    ))}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRowExpansion(globalIndex)}
                        className="h-8 w-8 p-0"
                      >
                        {isExpanded ? '−' : '+'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={displayKeys.length + 2} className="p-0">
                        <div className="bg-muted/50 p-4 border-t">
                          <h5 className="font-medium mb-2">Complete Record Data:</h5>
                          <pre className="text-xs bg-background p-3 rounded border overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(item, null, 2)}
                          </pre>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              Showing {startIndex + 1} to {endIndex} of {data.length} entries
            </div>
            
            <Pagination>
              <PaginationContent className="gap-1">
                {/* First Page */}
                {currentPage > 3 && totalPages > 7 && (
                  <>
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => setCurrentPage(1)}
                        className="cursor-pointer"
                      >
                        1
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  </>
                )}
                
                {/* Previous Button */}
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50 mr-2' : 'cursor-pointer mr-2'}
                  />
                </PaginationItem>
                
                {/* Page Numbers */}
                {generatePageNumbers().map((pageNum, index) => (
                  <PaginationItem key={index}>
                    <PaginationLink
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer mx-1"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                
                {/* Next Button */}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50 ml-2' : 'cursor-pointer ml-2'}
                  />
                </PaginationItem>
                
                {/* Last Page */}
                {currentPage < totalPages - 2 && totalPages > 7 && (
                  <>
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => setCurrentPage(totalPages)}
                        className="cursor-pointer"
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  </>
                )}
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </div>
  );
}

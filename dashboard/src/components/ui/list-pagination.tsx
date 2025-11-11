
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination';

interface ListPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  totalItems: number;
  itemName?: string;
  loading?: boolean;
}

export function ListPagination({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  totalItems,
  itemName = 'items',
  loading = false
}: ListPaginationProps) {
  const generatePageNumbers = () => {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Smart pagination logic
      if (currentPage <= 3) {
        // Show first 5 pages
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
      } else if (currentPage >= totalPages - 2) {
        // Show last 5 pages
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Show current page and 2 pages on each side
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pages.push(i);
        }
      }
    }
    
    return pages;
  };

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between px-2 py-4">
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          Showing {startItem}-{endItem} of {totalItems} {itemName}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        Showing {startItem}-{endItem} of {totalItems} {itemName}
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          Page {currentPage} of {totalPages}
        </div>
        
        <Pagination>
          <PaginationContent className="gap-1">
            {/* First Page */}
            {currentPage > 3 && totalPages > 7 && (
              <>
                <PaginationItem>
                  <PaginationLink
                    onClick={() => onPageChange(1)}
                    className={loading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
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
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className={
                  currentPage === 1 || loading 
                    ? 'pointer-events-none opacity-50 mr-2' 
                    : 'cursor-pointer mr-2'
                }
              />
            </PaginationItem>
            
            {/* Page Numbers */}
            {generatePageNumbers().map((pageNum, index) => (
              <PaginationItem key={index}>
                <PaginationLink
                  onClick={() => onPageChange(pageNum)}
                  isActive={currentPage === pageNum}
                  className={loading ? 'pointer-events-none opacity-50 mx-1' : 'cursor-pointer mx-1'}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            {/* Next Button */}
            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className={
                  currentPage === totalPages || loading 
                    ? 'pointer-events-none opacity-50 ml-2' 
                    : 'cursor-pointer ml-2'
                }
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
                    onClick={() => onPageChange(totalPages)}
                    className={loading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
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
  );
}

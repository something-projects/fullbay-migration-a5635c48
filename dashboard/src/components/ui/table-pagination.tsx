
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious, 
  PaginationEllipsis 
} from './pagination';

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  loading = false
}: TablePaginationProps) {
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

  const startItem = ((currentPage - 1) * itemsPerPage) + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        Showing {startItem}-{endItem} of {totalItems} items
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="text-sm text-muted-foreground">
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

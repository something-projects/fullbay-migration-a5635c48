import React, { useState, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Select } from './ui/select';

interface EntitySearchProps {
  onSearch: (query: string, status?: string) => void;
  onClear: () => void;
  loading?: boolean;
  placeholder?: string;
  initialQuery?: string;
  className?: string;
  onStatusChange?: (status: string) => void;
  selectedStatus?: string;
}

export function EntitySearch({
  onSearch,
  onClear,
  loading = false,
  placeholder = "Search by Entity ID, Name, Legal Name, or Status...",
  initialQuery = '',
  className = '',
  onStatusChange,
  selectedStatus = ''
}: EntitySearchProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery || selectedStatus) {
      onSearch(trimmedQuery, selectedStatus);
    }
  }, [query, onSearch, selectedStatus]);

  const handleClear = useCallback(() => {
    setQuery('');
    onClear();
  }, [onClear]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const status = e.target.value;
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [onStatusChange]);

  return (
    <div className={`search-container ${className}`}>
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="search-input"
            disabled={loading}
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="search-clear-btn"
              disabled={loading}
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <Select
          value={selectedStatus}
          onChange={handleStatusChange}
          className="status-select"
          disabled={loading}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="on hold">On Hold</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <button
          type="submit"
          disabled={(!query.trim() && !selectedStatus) || loading}
          className="search-submit-btn"
        >
          {loading ? (
            <>
              <Loader2 className="search-loading-icon" size={16} />
              Searching...
            </>
          ) : (
            <>
              <Search size={16} />
              Search
            </>
          )}
        </button>
      </form>

      <style>{`
        .search-container {
          width: 100%;
          margin-bottom: 1.5rem;
        }

        .search-form {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          max-width: 1000px;
        }

        .search-input-wrapper {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: #6b7280;
          pointer-events: none;
          z-index: 1;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 16px;
          background: white;
          transition: all 0.2s ease;
          outline: none;
        }

        .search-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .search-input:disabled {
          background-color: #f9fafb;
          color: #6b7280;
          cursor: not-allowed;
        }

        .search-clear-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .search-clear-btn:hover:not(:disabled) {
          color: #374151;
          background-color: #f3f4f6;
        }

        .search-clear-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .search-submit-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background-color: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .search-submit-btn:hover:not(:disabled) {
          background-color: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .search-submit-btn:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .status-select {
          min-width: 140px;
          height: 44px;
        }

        .search-loading-icon {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .search-form {
            flex-direction: column;
            align-items: stretch;
          }
          
          .search-submit-btn {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

// Search results info component
interface SearchResultsInfoProps {
  searchQuery: string;
  totalResults: number;
  currentPage: number;
  totalPages: number;
  onClearSearch: () => void;
  className?: string;
}

export function SearchResultsInfo({
  searchQuery,
  totalResults,
  currentPage,
  totalPages,
  onClearSearch,
  className = ''
}: SearchResultsInfoProps) {
  return (
    <div className={`search-results-info ${className}`}>
      <div className="search-results-text">
        <span className="search-results-count">
          🔍 Found <strong>{totalResults}</strong> results for "<strong>{searchQuery}</strong>"
        </span>
        {totalPages > 1 && (
          <span className="search-results-pagination">
            (Page {currentPage} of {totalPages})
          </span>
        )}
      </div>
      <button
        onClick={onClearSearch}
        className="search-results-clear"
        title="Clear search and show all entities"
      >
        <X size={16} />
        Show All Entities
      </button>

      <style>{`
        .search-results-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border: 1px solid #f59e0b;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-size: 14px;
        }

        .search-results-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .search-results-count {
          color: #92400e;
          font-weight: 500;
        }

        .search-results-pagination {
          color: #a16207;
          font-size: 12px;
        }

        .search-results-clear {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid #d97706;
          border-radius: 6px;
          color: #92400e;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .search-results-clear:hover {
          background: white;
          border-color: #b45309;
          color: #78350f;
        }

        @media (max-width: 768px) {
          .search-results-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          
          .search-results-clear {
            align-self: flex-end;
          }
        }
      `}</style>
    </div>
  );
}

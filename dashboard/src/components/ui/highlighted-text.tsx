import React from 'react';

interface HighlightedTextProps {
  text: string;
  searchQuery: string;
  className?: string;
}

export function HighlightedText({ text, searchQuery, className = '' }: HighlightedTextProps) {
  if (!searchQuery || !text) {
    return <span className={className}>{text}</span>;
  }

  // Escape special regex characters in search query
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create case-insensitive regex
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  
  // Split text by matches
  const parts = text.split(regex);
  
  return (
    <span className={className}>
      {parts.map((part, index) => {
        // Check if this part matches the search query (case-insensitive)
        const isMatch = regex.test(part);
        
        // Reset regex lastIndex for next test (important for global regex)
        regex.lastIndex = 0;
        
        return isMatch ? (
          <mark
            key={index}
            style={{
              backgroundColor: '#fef08a', // yellow-200
              color: '#854d0e', // yellow-900
              padding: '0 2px',
              borderRadius: '2px',
              fontWeight: '600'
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </span>
  );
}

// Helper hook for search highlighting
export function useSearchHighlight(searchQuery: string) {
  const highlightText = React.useCallback(
    (text: string, className?: string) => (
      <HighlightedText text={text} searchQuery={searchQuery} className={className} />
    ),
    [searchQuery]
  );

  return { highlightText };
}

#!/bin/bash

# Show parts data and matching results from output directory
# Usage: ./scripts/show-parts.sh <entityId>

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <entityId> [limit] [--matched]"
    echo "Example: $0 8583            # Show first 50 parts (default)"
    echo "Example: $0 8583 10         # Show first 10 parts"
    echo "Example: $0 8583 all        # Show all parts"
    echo "Example: $0 8583 10 --matched  # Show first 10 matched parts only"
    exit 1
fi

ENTITY_ID=$1
LIMIT=${2:-50}  # Default limit is 50
SHOW_MATCHED_ONLY=false

# Check for --matched parameter
if [ "$3" = "--matched" ] || [ "$2" = "--matched" ]; then
    SHOW_MATCHED_ONLY=true
    # If --matched is the second parameter, set default limit
    if [ "$2" = "--matched" ]; then
        LIMIT=50
    fi
fi

# Convert "all" to a very large number
if [ "$LIMIT" = "all" ]; then
    LIMIT=999999
fi
# Check if entity ID starts with /tmp/ for direct path usage
if [[ "$ENTITY_ID" == /tmp/* ]]; then
    OUTPUT_DIR="$ENTITY_ID"
else
    OUTPUT_DIR="../output/$ENTITY_ID"
fi

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Error: Output directory not found: $OUTPUT_DIR"
    if [[ "$ENTITY_ID" == /tmp/* ]]; then
        echo "Make sure the comparison data exists at: $ENTITY_ID"
    else
        echo "Make sure you have processed this entity with: pnpm gen --entityId $ENTITY_ID"
    fi
    exit 1
fi

echo "=== Entity $ENTITY_ID Parts ==="
echo ""

# Table header
printf "%-25s | %-25s | %-12s | %-12s | %-25s | %-12s | %-15s\n" \
    "Part Name" "Description" "Shop Number" "Vendor Number" "Matched Part" "Match Method" "Status/Reason"

printf "%-25s-|-%-25s-|-%-12s-|-%-12s-|-%-25s-|-%-12s-|-%-15s\n" \
    "-------------------------" "-------------------------" "------------" "------------" \
    "-------------------------" "------------" "---------------"

# Process parts with optimized streaming
count=0

if [ "$SHOW_MATCHED_ONLY" = true ]; then
    # Fast path: two-stage optimization for matched parts
    
    # Stage 1: Quick grep pre-filter to find files with standardizedPart
    matched_files=$(grep -l "standardizedPart" "$OUTPUT_DIR"/customers/*/units/*/service-orders/*/entity.json 2>/dev/null)
    
    if [ -z "$matched_files" ]; then
        # No files contain standardizedPart, skip processing entirely
        echo "# No matched parts found" >&2
    else
        # Stage 2: Process only the files that contain matches
        echo "$matched_files" | while IFS= read -r file; do
            if [ $count -ge $LIMIT ]; then
                break
            fi
            
            # Extract matched parts from this file
            jq -r '.correctionParts[]? | 
                select(.standardizedPart) | 
                @json' "$file" 2>/dev/null
        done | while IFS= read -r part_json; do
            if [ -n "$part_json" ] && [ $count -lt $LIMIT ]; then
                count=$((count + 1))
                
                # Extract part data
                part_name=$(echo "$part_json" | jq -r '.title // .name // ""')
                description=$(echo "$part_json" | jq -r '.description // ""')
                shop_number=$(echo "$part_json" | jq -r '.shopNumber // ""')
                vendor_number=$(echo "$part_json" | jq -r '.vendorNumber // ""')
                
                # Check for standardized part match (we know it exists)
                std_part=$(echo "$part_json" | jq -r '.standardizedPart.partTerminologyName // .standardizedPart.partName // "-"')
                match_method=$(echo "$part_json" | jq -r '.standardizedPart.matchingMethod // "-"')
                
                # Show confidence for matched parts, failure reason for unmatched
                if [ "$std_part" != "-" ]; then
                    # Part matched - show confidence
                    status_reason=$(echo "$part_json" | jq -r '.standardizedPart.confidence // "1.0"')
                else
                    # Part not matched - show failure reason
                    failure_reason=$(echo "$part_json" | jq -r '.matchFailureReason // "NO_MATCH"')
                    status_reason="$failure_reason"
                fi
                
                # Truncate long fields
                if [ ${#part_name} -gt 25 ]; then
                    part_name="${part_name:0:22}..."
                fi
                if [ ${#description} -gt 25 ]; then
                    description="${description:0:22}..."
                fi
                if [ ${#std_part} -gt 25 ]; then
                    std_part="${std_part:0:22}..."
                fi
                
                # Print part row
                printf "%-25s | %-25s | %-12s | %-12s | %-25s | %-12s | %-15s\n" \
                    "${part_name:-'-'}" "${description:-'-'}" "${shop_number:-'-'}" "${vendor_number:-'-'}" \
                    "$std_part" "$match_method" "$status_reason"
            fi
            
            # Break if we've reached the limit
            if [ $count -ge $LIMIT ]; then
                break
            fi
        done
    fi
else
    # Normal path: process all parts
    for service_order_file in "$OUTPUT_DIR"/customers/*/units/*/service-orders/*/entity.json; do
        if [ -f "$service_order_file" ]; then
            # Extract parts and process them
            while IFS= read -r part_json; do
                if [ -n "$part_json" ] && [ $count -lt $LIMIT ]; then
                    count=$((count + 1))
                    
                    # Extract part data
                    part_name=$(echo "$part_json" | jq -r '.title // .name // ""')
                    description=$(echo "$part_json" | jq -r '.description // ""')
                    shop_number=$(echo "$part_json" | jq -r '.shopNumber // ""')
                    vendor_number=$(echo "$part_json" | jq -r '.vendorNumber // ""')
                    
                    # Check for standardized part match
                    std_part=$(echo "$part_json" | jq -r '.standardizedPart.partTerminologyName // .standardizedPart.partName // "-"')
                    match_method=$(echo "$part_json" | jq -r '.standardizedPart.matchingMethod // "-"')
                    
                    # Show confidence for matched parts, failure reason for unmatched
                    if [ "$std_part" != "-" ]; then
                        # Part matched - show confidence
                        status_reason=$(echo "$part_json" | jq -r '.standardizedPart.confidence // "1.0"')
                    else
                        # Part not matched - show failure reason
                        failure_reason=$(echo "$part_json" | jq -r '.matchFailureReason // "NO_MATCH"')
                        status_reason="$failure_reason"
                    fi
                    
                    # Truncate long fields
                    if [ ${#part_name} -gt 25 ]; then
                        part_name="${part_name:0:22}..."
                    fi
                    if [ ${#description} -gt 25 ]; then
                        description="${description:0:22}..."
                    fi
                    if [ ${#std_part} -gt 25 ]; then
                        std_part="${std_part:0:22}..."
                    fi
                    
                    # Print part row
                    printf "%-25s | %-25s | %-12s | %-12s | %-25s | %-12s | %-15s\n" \
                        "${part_name:-'-'}" "${description:-'-'}" "${shop_number:-'-'}" "${vendor_number:-'-'}" \
                        "$std_part" "$match_method" "$status_reason"
                fi
                
                # Break if we've reached the limit
                if [ $count -ge $LIMIT ]; then
                    break 2
                fi
            done < <(jq -r '.correctionParts[]? | @json' "$service_order_file" 2>/dev/null)
        fi
        
        # Break outer loop if limit reached
        if [ $count -ge $LIMIT ]; then
            break
        fi
    done
fi

echo ""
echo "Legend:"
echo "  - = No data or not matched"
echo "  Text fields are truncated if longer than 25 characters"
echo ""
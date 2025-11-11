#!/bin/bash

# Show vehicle data and matching results from output directory
# Usage: ./scripts/show-vehicles.sh <entityId>

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <entityId> [limit] [--matched]"
    echo "Example: $0 8583            # Show first 50 vehicles (default)"
    echo "Example: $0 8583 10         # Show first 10 vehicles"
    echo "Example: $0 8583 all        # Show all vehicles"
    echo "Example: $0 8583 10 --matched  # Show first 10 matched vehicles only"
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

echo "=== Entity $ENTITY_ID Vehicles ==="
echo ""

# Table header
printf "%-20s | %-10s | %-25s | %-4s | %-40s | %-15s | %-15s | %-15s\n" \
    "VIN" "Make" "Model" "Year" "CustomFields" "Matched Make" "Matched Model" "Status/Reason"

printf "%-20s-|-%-10s-|-%-25s-|-%-4s-|-%-40s-|-%-15s-|-%-15s-|-%-15s\n" \
    "--------------------" "----------" "-------------------------" "----" \
    "----------------------------------------" "---------------" "---------------" "---------------"

# Process vehicles with optimized streaming
count=0

if [ "$SHOW_MATCHED_ONLY" = true ]; then
    # Fast path: two-stage optimization for matched vehicles
    
    # Stage 1: Quick grep pre-filter to find files with standardizedVehicle
    matched_files=$(grep -l "standardizedVehicle" "$OUTPUT_DIR"/customers/*/entity.json 2>/dev/null)
    
    if [ -z "$matched_files" ]; then
        # No files contain standardizedVehicle, skip processing entirely
        echo "# No matched vehicles found" >&2
    else
        # Stage 2: Process only the files that contain matches
        echo "$matched_files" | while IFS= read -r file; do
            if [ $count -ge $LIMIT ]; then
                break
            fi
            
            # Extract matched vehicles from this file
            jq -r '.units[]? | 
                select(.standardizedVehicle and 
                       (.standardizedVehicle.makeName != null or .standardizedVehicle.modelName != null)) | 
                @json' "$file" 2>/dev/null
        done | while IFS= read -r unit_json; do
            if [ -n "$unit_json" ] && [ $count -lt $LIMIT ]; then
                count=$((count + 1))
                
                # Extract vehicle data
                vin=$(echo "$unit_json" | jq -r '.vin // ""')
                make=$(echo "$unit_json" | jq -r '.make // ""')
                model=$(echo "$unit_json" | jq -r '.model // ""')
                year=$(echo "$unit_json" | jq -r '.year // 0')
                
                # Extract custom fields
                custom_fields=$(echo "$unit_json" | jq -r '
                    if .customFields then 
                        [.customFields | to_entries[] | "\(.key):\(.value)"] | join(",") 
                    else 
                        "" 
                    end')
                
                # Check for standardized vehicle match (we know it exists)
                std_make=$(echo "$unit_json" | jq -r '.standardizedVehicle.makeName // "-"')
                std_model=$(echo "$unit_json" | jq -r '.standardizedVehicle.modelName // "-"')
                
                # Show confidence for matched vehicles, failure reason for unmatched
                if [ "$std_make" != "-" ] || [ "$std_model" != "-" ]; then
                    # Vehicle matched - show confidence
                    status_reason=$(echo "$unit_json" | jq -r '.standardizedVehicle.confidence // "1.0"')
                else
                    # Vehicle not matched - show failure reason
                    failure_reason=$(echo "$unit_json" | jq -r '.matchFailureReason // "NO_MATCH"')
                    status_reason="$failure_reason"
                fi
                
                # Truncate long fields
                if [ ${#custom_fields} -gt 40 ]; then
                    custom_fields="${custom_fields:0:37}..."
                fi
                if [ ${#model} -gt 25 ]; then
                    model="${model:0:22}..."
                fi
                if [ ${#std_model} -gt 15 ]; then
                    std_model="${std_model:0:12}..."
                fi
                
                # Print vehicle row
                printf "%-20s | %-10s | %-25s | %-4s | %-40s | %-15s | %-15s | %-15s\n" \
                    "${vin:-'-'}" "${make:-'-'}" "${model:-'-'}" "$year" \
                    "${custom_fields:-'-'}" "$std_make" "$std_model" "$status_reason"
            fi
            
            # Break if we've reached the limit
            if [ $count -ge $LIMIT ]; then
                break
            fi
        done
    fi
else
    # Normal path: process all vehicles
    for customer_dir in "$OUTPUT_DIR"/customers/*/; do
        if [ -f "$customer_dir/entity.json" ]; then
            # Extract and process vehicles directly
            while IFS= read -r unit_json; do
                if [ -n "$unit_json" ] && [ $count -lt $LIMIT ]; then
                    count=$((count + 1))
                    
                    # Extract vehicle data
                    vin=$(echo "$unit_json" | jq -r '.vin // ""')
                    make=$(echo "$unit_json" | jq -r '.make // ""')
                    model=$(echo "$unit_json" | jq -r '.model // ""')
                    year=$(echo "$unit_json" | jq -r '.year // 0')
                    
                    # Extract custom fields
                    custom_fields=$(echo "$unit_json" | jq -r '
                        if .customFields then 
                            [.customFields | to_entries[] | "\(.key):\(.value)"] | join(",") 
                        else 
                            "" 
                        end')
                    
                    # Check for standardized vehicle match
                    std_make=$(echo "$unit_json" | jq -r '.standardizedVehicle.makeName // "-"')
                    std_model=$(echo "$unit_json" | jq -r '.standardizedVehicle.modelName // "-"')
                    
                    # Show confidence for matched vehicles, failure reason for unmatched
                    if [ "$std_make" != "-" ] || [ "$std_model" != "-" ]; then
                        # Vehicle matched - show confidence
                        status_reason=$(echo "$unit_json" | jq -r '.standardizedVehicle.confidence // "1.0"')
                    else
                        # Vehicle not matched - show failure reason
                        failure_reason=$(echo "$unit_json" | jq -r '.matchFailureReason // "NO_MATCH"')
                        status_reason="$failure_reason"
                    fi
                    
                    # Truncate long fields
                    if [ ${#custom_fields} -gt 40 ]; then
                        custom_fields="${custom_fields:0:37}..."
                    fi
                    if [ ${#model} -gt 25 ]; then
                        model="${model:0:22}..."
                    fi
                    if [ ${#std_model} -gt 15 ]; then
                        std_model="${std_model:0:12}..."
                    fi
                    
                    # Print vehicle row
                    printf "%-20s | %-10s | %-25s | %-4s | %-40s | %-15s | %-15s | %-15s\n" \
                        "${vin:-'-'}" "${make:-'-'}" "${model:-'-'}" "$year" \
                        "${custom_fields:-'-'}" "$std_make" "$std_model" "$status_reason"
                fi
                
                # Break if we've reached the limit
                if [ $count -ge $LIMIT ]; then
                    break 2
                fi
            done < <(jq -r '.units[]? | @json' "$customer_dir/entity.json" 2>/dev/null)
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
echo "  Custom fields are truncated if longer than 40 characters"
echo ""
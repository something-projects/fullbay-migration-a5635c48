#!/usr/bin/env python3
"""Manual extraction of columns from SQL files to create TSV headers."""

import re

def extract_columns_from_sql(sql_content):
    """Extract column names from SQL content."""
    # Normalize content
    content = sql_content.replace('\\n', '\n')
    
    # Find the columns section
    match = re.search(r'CREATE TABLE\s+`([^`]+)`\s*\((.+?)\)\s*ENGINE', content, re.DOTALL | re.IGNORECASE)
    if not match:
        return []
    
    columns_section = match.group(2)
    columns = []
    
    # Split by comma and extract columns
    parts = columns_section.split(',')
    for part in parts:
        part = part.strip()
        # Skip constraints
        if any(keyword in part.upper() for keyword in ['PRIMARY KEY', 'UNIQUE KEY', 'KEY ', 'INDEX ', 'CONSTRAINT', 'FOREIGN KEY']):
            continue
        
        # Extract column name
        col_match = re.match(r'^\s*`([^`]+)`', part)
        if col_match:
            columns.append(col_match.group(1))
    
    return columns

# Sample SQL contents for testing
address_sql = """CREATE TABLE `Address` (\\n  `addressId` int unsigned NOT NULL AUTO_INCREMENT,\\n  `line1` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `line2` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `city` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `state` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `country` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `postalCode` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `created` datetime DEFAULT NULL,\\n  `modified` datetime DEFAULT NULL,\\n  PRIMARY KEY (`addressId`)\\n) ENGINE=InnoDB AUTO_INCREMENT=6669 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Entity Employee addresses.  All generic addresses moving forwards.'"""

columns = extract_columns_from_sql(address_sql)
print("Address columns:", columns)

# Test with Customer SQL
customer_sql = """CREATE TABLE `Customer` (\\n  `customerId` int unsigned NOT NULL AUTO_INCREMENT,\\n  `entityId` int unsigned NOT NULL,\\n  `entityLocationId` int unsigned DEFAULT NULL,\\n  `active` tinyint unsigned NOT NULL DEFAULT '1',\\n  `code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `serviceRequestCode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `status` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `createdByEntityEmployeeId` int unsigned DEFAULT NULL,\\n  `createdByIpAddress` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\\n  `created` datetime DEFAULT NULL,\\n  `modified` datetime DEFAULT NULL,\\n  PRIMARY KEY (`customerId`),\\n  UNIQUE KEY `Customer_payrixId_IDX` (`payrixId`) USING BTREE,\\n  KEY `entityId` (`entityId`)\\n) ENGINE=InnoDB AUTO_INCREMENT=31993 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""

columns = extract_columns_from_sql(customer_sql)
print("Customer columns (sample):", columns[:10])  # Show first 10
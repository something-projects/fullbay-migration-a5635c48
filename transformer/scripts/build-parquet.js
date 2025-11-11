/*
  Build Parquet for VCdb/PCdb with normalized matching keys.

  Usage:
    node transformer/scripts/autocare/build-parquet.js \
      --vcdb ./autocare-data/VCdb --pcdb ./autocare-data/PCdb \
      [--out ../output] [--db ./autocare.duckdb]

  Notes:
  - Uses @duckdb/node-api already present in transformer/package.json
  - VCdb: builds make|model|year|submodel|engine as key_norm (engine/submodel optional)
  - PCdb: builds normalized part name as key_norm
  - Matched join is not emitted here (requires applications mapping not present in this repo)
*/
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
// Load env from transformer/.env if present
try {
  // eslint-disable-next-line global-require
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  console.log('✅ Loaded .env configuration');
  if (process.env.AUTOCARE_VCDB_PATH) {
    console.log(`   AUTOCARE_VCDB_PATH: ${process.env.AUTOCARE_VCDB_PATH}`);
  }
  if (process.env.AUTOCARE_PCDB_PATH) {
    console.log(`   AUTOCARE_PCDB_PATH: ${process.env.AUTOCARE_PCDB_PATH}`);
  }
} catch (_) {
  console.log('⚠️  No .env file found, using default paths');
}

function parseArgs(argv) {
  const args = { vcdb: null, pcdb: null, out: null, db: null };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--vcdb' && v) args.vcdb = v;
    if (k === '--pcdb' && v) args.pcdb = v;
    if (k === '--out' && v) args.out = v;
    if (k === '--db' && v) args.db = v;
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv);

  const outDir = args.out || path.resolve(__dirname, '../../..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const vcdbDir = args.vcdb || process.env.AUTOCARE_VCDB_PATH || path.resolve(__dirname, '../../autocare-data/VCdb');
  const pcdbDir = args.pcdb || process.env.AUTOCARE_PCDB_PATH || path.resolve(__dirname, '../../autocare-data/PCdb');
  const dbFile = args.db || path.join(outDir, 'autocare.duckdb');

  if (!fs.existsSync(vcdbDir)) {
    console.error(`VCdb directory not found: ${vcdbDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(pcdbDir)) {
    console.error(`PCdb directory not found: ${pcdbDir}`);
    process.exit(1);
  }

  const { DuckDBInstance } = require('@duckdb/node-api');
  const db = await DuckDBInstance.create(dbFile);
  const conn = await db.connect();

  const runSQL = (sql) => conn.run(sql);
  const esc = (p) => p.replace(/'/g, "''");

  // Helpers to check optional files
  const p = (...segs) => path.join(...segs);
  const exists = (f) => fs.existsSync(f);

  try {
    // ============ Load VCdb JSONs ============
    const makePath = p(vcdbDir, 'Make.json');
    const modelPath = p(vcdbDir, 'Model.json');
    const yearPath = p(vcdbDir, 'Year.json'); // optional for mapping; YearID equals year
    const baseVehiclePath = p(vcdbDir, 'BaseVehicle.json');
    const vehiclePath = p(vcdbDir, 'Vehicle.json'); // optional
    const subModelPath = p(vcdbDir, 'SubModel.json'); // optional
    const v2ecPath = p(vcdbDir, 'VehicleToEngineConfig.json'); // optional
    const engConfigPath = p(vcdbDir, 'EngineConfig.json'); // optional
    const engBasePath = p(vcdbDir, 'EngineBase.json'); // optional

    if (!exists(makePath) || !exists(modelPath) || !exists(baseVehiclePath)) {
      throw new Error('Required VCdb files missing: Make.json, Model.json, BaseVehicle.json');
    }

    await runSQL(`DROP TABLE IF EXISTS vcdb_make;`);
    await runSQL(`CREATE TABLE vcdb_make AS SELECT * FROM read_json_auto('${esc(makePath)}');`);
    await runSQL(`DROP TABLE IF EXISTS vcdb_model;`);
    await runSQL(`CREATE TABLE vcdb_model AS SELECT * FROM read_json_auto('${esc(modelPath)}');`);
    if (exists(yearPath)) {
      await runSQL(`DROP TABLE IF EXISTS vcdb_year;`);
      await runSQL(`CREATE TABLE vcdb_year AS SELECT * FROM read_json_auto('${esc(yearPath)}');`);
    }
    await runSQL(`DROP TABLE IF EXISTS vcdb_base_vehicle;`);
    await runSQL(`CREATE TABLE vcdb_base_vehicle AS SELECT * FROM read_json_auto('${esc(baseVehiclePath)}');`);
    if (exists(vehiclePath)) {
      await runSQL(`DROP TABLE IF EXISTS vcdb_vehicle;`);
      await runSQL(`CREATE TABLE vcdb_vehicle AS SELECT * FROM read_json_auto('${esc(vehiclePath)}');`);
    }
    if (exists(subModelPath)) {
      await runSQL(`DROP TABLE IF EXISTS vcdb_submodel;`);
      await runSQL(`CREATE TABLE vcdb_submodel AS SELECT * FROM read_json_auto('${esc(subModelPath)}');`);
    }
    if (exists(v2ecPath)) {
      await runSQL(`DROP TABLE IF EXISTS vcdb_v2ec;`);
      await runSQL(`CREATE TABLE vcdb_v2ec AS SELECT * FROM read_json_auto('${esc(v2ecPath)}');`);
    }
    if (exists(engConfigPath)) {
      await runSQL(`DROP TABLE IF EXISTS vcdb_engine_config;`);
      await runSQL(`CREATE TABLE vcdb_engine_config AS SELECT * FROM read_json_auto('${esc(engConfigPath)}');`);
    }
    if (exists(engBasePath)) {
      await runSQL(`DROP TABLE IF EXISTS vcdb_engine_base;`);
      await runSQL(`CREATE TABLE vcdb_engine_base AS SELECT * FROM read_json_auto('${esc(engBasePath)}');`);
    }

    // Build enriched vcdb rows
    await runSQL(`DROP TABLE IF EXISTS vcdb;`);
    await runSQL(`
      CREATE TABLE vcdb AS
      WITH base AS (
        SELECT 
          LOWER(TRIM(m.MakeName)) AS make,
          LOWER(TRIM(md.ModelName)) AS model,
          CAST(bv.YearID AS INT) AS year,
          bv.BaseVehicleID AS base_vehicle_id
        FROM vcdb_base_vehicle bv
        JOIN vcdb_make m  ON m.MakeID = bv.MakeID
        JOIN vcdb_model md ON md.ModelID = bv.ModelID
      ),
      veh AS (
        SELECT 
          v.VehicleID,
          v.BaseVehicleID,
          COALESCE(LOWER(TRIM(sm.SubmodelName)), '') AS submodel
        FROM vcdb_vehicle v
        LEFT JOIN vcdb_submodel sm ON sm.SubmodelID = v.SubmodelID
      ),
      eng AS (
        SELECT 
          v.VehicleID,
          LOWER(TRIM(
            COALESCE(CAST(eb.Liter AS VARCHAR), '') ||
            CASE WHEN COALESCE(eb.Liter, '') != '' THEN 'l' ELSE '' END ||
            CASE WHEN COALESCE(eb.Cylinders, '') != '' THEN ' ' || CAST(eb.Cylinders AS VARCHAR) || 'cyl' ELSE '' END
          )) AS engine
        FROM vcdb_v2ec v2ec
        JOIN vcdb_vehicle v ON v.VehicleID = v2ec.VehicleID
        JOIN vcdb_engine_config ec ON ec.EngineConfigID = v2ec.EngineConfigID
        JOIN vcdb_engine_base eb ON eb.EngineBaseID = ec.EngineBaseID
      )
      SELECT 
        b.make,
        b.model,
        b.year,
        COALESCE(veh.submodel, '') AS submodel,
        COALESCE(eng.engine, '') AS engine,
        COALESCE(veh.VehicleID, b.base_vehicle_id) AS vehicle_config_id,
        b.make || '|' || b.model || '|' || CAST(b.year AS VARCHAR) || '|' ||
        COALESCE(veh.submodel, '') || '|' || COALESCE(eng.engine, '') AS key_norm
      FROM base b
      LEFT JOIN veh ON veh.BaseVehicleID = b.base_vehicle_id
      LEFT JOIN eng ON eng.VehicleID = veh.VehicleID;
    `);

    // Deduplicate by key_norm (choose lowest vehicle_config_id)
    await runSQL(`DROP TABLE IF EXISTS vcdb_dedup;`);
    await runSQL(`
      CREATE TABLE vcdb_dedup AS
      SELECT * EXCLUDE rn FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY key_norm ORDER BY vehicle_config_id) rn
        FROM vcdb
      ) WHERE rn = 1;
    `);

    // Export VCdb parquet
    const vcdbParquet = path.join(outDir, 'VCdb.parquet');
    await runSQL(`COPY (SELECT * FROM vcdb_dedup ORDER BY key_norm) TO '${esc(vcdbParquet)}' (FORMAT PARQUET);`);

    // ============ Load PCdb JSONs and export ============
    const partsPath = p(pcdbDir, 'Parts.json');
    const partsDescPath = p(pcdbDir, 'PartsDescription.json');
    if (!exists(partsPath)) {
      throw new Error(`PCdb file not found: ${partsPath}`);
    }
    await runSQL(`DROP TABLE IF EXISTS pcdb_parts;`);
    await runSQL(`CREATE TABLE pcdb_parts AS SELECT * FROM read_json_auto('${esc(partsPath)}');`);
    if (exists(partsDescPath)) {
      await runSQL(`DROP TABLE IF EXISTS pcdb_descriptions;`);
      await runSQL(`CREATE TABLE pcdb_descriptions AS SELECT * FROM read_json_auto('${esc(partsDescPath)}');`);
    }

    await runSQL(`DROP TABLE IF EXISTS pcdb;`);
    await runSQL(`
      CREATE TABLE pcdb AS
      SELECT 
        p.PartTerminologyID AS part_id,
        p.PartTerminologyName AS part_name,
        COALESCE(pd.PartsDescription, '') AS part_description,
        LOWER(REGEXP_REPLACE(p.PartTerminologyName, '[^a-zA-Z0-9\\s]', '', 'g')) AS key_norm
      FROM pcdb_parts p
      LEFT JOIN pcdb_descriptions pd ON p.PartsDescriptionId = pd.PartsDescriptionID;
    `);

    const pcdbParquet = path.join(outDir, 'PCdb.parquet');
    await runSQL(`COPY (SELECT * FROM pcdb ORDER BY key_norm) TO '${esc(pcdbParquet)}' (FORMAT PARQUET);`);

    // ============ Build enriched parts view and tokens index ============
    // Optional auxiliary tables
    const aliasPath = p(pcdbDir, 'Alias.json');
    const partsToAliasPath = p(pcdbDir, 'PartsToAlias.json');
    const relationshipsPath = p(pcdbDir, 'PartsRelationship.json');
    const supersessionPath = p(pcdbDir, 'PartsSupersession.json');
    const attributesPath = p(pcdbDir, 'PartAttribute.json');
    const interchangePath = p(pcdbDir, 'PartInterchange.json');

    if (exists(aliasPath) && exists(partsToAliasPath)) {
      await runSQL(`DROP TABLE IF EXISTS pcdb_alias;`);
      await runSQL(`CREATE TABLE pcdb_alias AS SELECT * FROM read_json_auto('${esc(aliasPath)}');`);
      await runSQL(`DROP TABLE IF EXISTS pcdb_parts_to_alias;`);
      await runSQL(`CREATE TABLE pcdb_parts_to_alias AS SELECT * FROM read_json_auto('${esc(partsToAliasPath)}');`);
    }
    if (exists(relationshipsPath)) {
      await runSQL(`DROP TABLE IF EXISTS pcdb_relationships;`);
      await runSQL(`CREATE TABLE pcdb_relationships AS SELECT * FROM read_json_auto('${esc(relationshipsPath)}');`);
    }
    if (exists(supersessionPath)) {
      await runSQL(`DROP TABLE IF EXISTS pcdb_supersessions;`);
      await runSQL(`CREATE TABLE pcdb_supersessions AS SELECT * FROM read_json_auto('${esc(supersessionPath)}');`);
    }
    if (exists(attributesPath)) {
      await runSQL(`DROP TABLE IF EXISTS pcdb_attributes;`);
      await runSQL(`CREATE TABLE pcdb_attributes AS SELECT * FROM read_json_auto('${esc(attributesPath)}');`);
    }
    if (exists(interchangePath)) {
      await runSQL(`DROP TABLE IF EXISTS pcdb_interchange;`);
      await runSQL(`CREATE TABLE pcdb_interchange AS SELECT * FROM read_json_auto('${esc(interchangePath)}');`);
    }

    await runSQL(`DROP VIEW IF EXISTS enriched_parts;`);
    {
      const hasDesc = exists(partsDescPath);
      const hasAlias = exists(aliasPath) && exists(partsToAliasPath);
      const hasRel = exists(relationshipsPath);
      const hasSup = exists(supersessionPath);
      const hasAttr = exists(attributesPath);
      const hasIc = exists(interchangePath);

      let viewSql = `
        CREATE VIEW enriched_parts AS
        SELECT 
          p.PartTerminologyID AS part_id,
          p.PartTerminologyName AS part_name,
      `;

      viewSql += hasDesc
        ? `COALESCE(pd.PartsDescription, '') AS part_description,
           COALESCE(STRING_AGG(DISTINCT pd.PartsDescription, ' | '), '') as all_descriptions,
        `
        : `'' AS part_description,
           '' as all_descriptions,
        `;

      viewSql += hasRel
        ? `COALESCE(STRING_AGG(DISTINCT CAST(rel.RelatedPartTerminologyID AS VARCHAR), ','), '') as related_part_ids,
        `
        : `'' as related_part_ids,
        `;

      if (hasSup) {
        viewSql += `COALESCE(STRING_AGG(DISTINCT CAST(ss_new.NewPartTerminologyID AS VARCHAR), ','), '') as superseded_by_ids,
                    COALESCE(STRING_AGG(DISTINCT CAST(ss_old.OldPartTerminologyID AS VARCHAR), ','), '') as supersedes_ids,
        `;
      } else {
        viewSql += `'' as superseded_by_ids,
                    '' as supersedes_ids,
        `;
      }

      viewSql += hasAlias
        ? `COALESCE(STRING_AGG(DISTINCT al.AliasName, ' | '), '') as all_aliases,
        `
        : `'' as all_aliases,
        `;

      viewSql += hasAttr
        ? `COALESCE(STRING_AGG(DISTINCT attr.attributeName || ':' || attr.attributeValue, ' | '), '') as all_attributes,
        `
        : `'' as all_attributes,
        `;

      viewSql += hasIc
        ? `COALESCE(STRING_AGG(DISTINCT CAST(ic.interchangePartNumber AS VARCHAR), ','), '') as interchange_parts,
        `
        : `'' as interchange_parts,
        `;

      // Searchable text
      viewSql += `LOWER(REGEXP_REPLACE(
          p.PartTerminologyName || ' ' ||
          ${hasDesc ? `COALESCE(pd.PartsDescription, '') || ' ' ||` : `'' ||`}
          ${hasAlias ? `COALESCE(STRING_AGG(DISTINCT al.AliasName, ' '), '') || ' ' ||` : `'' ||`}
          ${hasAttr ? `COALESCE(STRING_AGG(DISTINCT attr.attributeValue, ' '), '') || ' ' ||` : `'' ||`}
          ${hasIc ? `COALESCE(STRING_AGG(DISTINCT ic.brandName, ' '), '')` : `''`},
          '[^a-zA-Z0-9\\s]', '', 'g')) AS searchable_text
        FROM pcdb_parts p
      `;

      if (hasDesc) viewSql += `LEFT JOIN pcdb_descriptions pd ON p.PartsDescriptionId = pd.PartsDescriptionID
      `;
      if (hasRel) viewSql += `LEFT JOIN pcdb_relationships rel ON p.PartTerminologyID = rel.PartTerminologyID
      `;
      if (hasSup) viewSql += `LEFT JOIN pcdb_supersessions ss_new ON p.PartTerminologyID = ss_new.OldPartTerminologyID
                               LEFT JOIN pcdb_supersessions ss_old ON p.PartTerminologyID = ss_old.NewPartTerminologyID
      `;
      if (hasAlias) viewSql += `LEFT JOIN pcdb_parts_to_alias pta ON p.PartTerminologyID = pta.PartTerminologyID
                                LEFT JOIN pcdb_alias al ON pta.AliasID = al.AliasID
      `;
      if (hasAttr) viewSql += `LEFT JOIN pcdb_attributes attr ON p.PartTerminologyID = attr.partTerminologyId
      `;
      if (hasIc) viewSql += `LEFT JOIN pcdb_interchange ic ON p.PartTerminologyID = ic.partTerminologyId
      `;

      viewSql += `GROUP BY 1,2,3;`;
      await runSQL(viewSql);
    }

    const enrichedParquet = path.join(outDir, 'PCdb_enriched.parquet');
    await runSQL(`COPY (SELECT * FROM enriched_parts) TO '${esc(enrichedParquet)}' (FORMAT PARQUET);`);

    // Token index for fast candidate recall
    await runSQL(`DROP TABLE IF EXISTS pcdb_tokens;`);
    await runSQL(`
      CREATE TABLE pcdb_tokens AS
      SELECT part_id, token
      FROM (
        SELECT part_id, UNNEST(STRING_SPLIT(searchable_text, ' ')) AS token
        FROM enriched_parts
      ) t
      WHERE LENGTH(token) >= 3;
    `);
    const tokensParquet = path.join(outDir, 'PCdb_tokens.parquet');
    await runSQL(`COPY (SELECT * FROM pcdb_tokens) TO '${esc(tokensParquet)}' (FORMAT PARQUET);`);

    // ============ Build VCdb key variants (tall table) ============
    await runSQL(`DROP TABLE IF EXISTS vcdb_keys;`);
    await runSQL(`
      CREATE TABLE vcdb_keys AS
      SELECT vehicle_config_id, key_norm AS key, 'base' AS source FROM vcdb_dedup
      UNION ALL
      SELECT vehicle_config_id,
             REPLACE(key_norm, '-', '') AS key,
             'model_no_dash' AS source
      FROM vcdb_dedup
      UNION ALL
      SELECT vehicle_config_id,
             REGEXP_REPLACE(key_norm, '([a-z])([0-9])', '\\1-\\2', 'g') AS key,
             'model_insert_dash' AS source
      FROM vcdb_dedup;
    `);
    const keysParquet = path.join(outDir, 'VCdb_keys.parquet');
    await runSQL(`COPY (SELECT * FROM vcdb_keys) TO '${esc(keysParquet)}' (FORMAT PARQUET);`);

    console.log('Done:', [vcdbParquet, pcdbParquet, enrichedParquet, tokensParquet, keysParquet].map((f)=>path.basename(f)).join(', '));
  } finally {
    try {
      if (conn && typeof conn.close === 'function') {
        await conn.close();
      }
    } catch (_) {}
    try {
      await db.close();
    } catch (_) {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

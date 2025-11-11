/**
 * Parts Name Mappings for AutoCare PCdb Matching
 * Maps common automotive part names to PIES standard terminology
 */

export class PartsMappings {
  private static mappings: Map<string, string[]> | null = null;

  /**
   * Get the part name mappings (lazy loaded)
   */
  static getMappings(): Map<string, string[]> {
    if (!this.mappings) {
      this.mappings = this.createMappings();
    }
    return this.mappings;
  }

  /**
   * Get mapped names for a given part name
   */
  static getMappedNames(partName: string): string[] | undefined {
    const normalizedName = partName.toLowerCase().trim();
    return this.getMappings().get(normalizedName);
  }

  /**
   * Check if a part name has mappings
   */
  static hasMappings(partName: string): boolean {
    const normalizedName = partName.toLowerCase().trim();
    return this.getMappings().has(normalizedName);
  }

  /**
   * Get all mapped variations of a part name (including original)
   */
  static getAllVariations(partName: string): string[] {
    const normalizedName = partName.toLowerCase().trim();
    const mapped = this.getMappedNames(normalizedName) || [];
    return [partName, ...mapped].filter((name, index, array) => 
      array.indexOf(name) === index // Remove duplicates
    );
  }

  /**
   * Create the comprehensive parts name mappings
   */
  private static createMappings(): Map<string, string[]> {
    const mappings = new Map<string, string[]>();
    
    // Oil filters
    mappings.set('oil filter', ['Engine Oil Filter', 'Turbocharger Oil Filter']);
    mappings.set('oilfilter', ['Engine Oil Filter', 'Turbocharger Oil Filter']);
    mappings.set('engine oil filter', ['Engine Oil Filter']);
    mappings.set('turbo oil filter', ['Turbocharger Oil Filter']);
    mappings.set('turbocharger oil filter', ['Turbocharger Oil Filter']);
    
    // Air filters
    mappings.set('air filter', ['Engine Air Filter', 'Cabin Air Filter']);
    mappings.set('airfilter', ['Engine Air Filter', 'Cabin Air Filter']);
    mappings.set('air filter outer', ['Engine Air Filter']);
    mappings.set('air filter inner', ['Engine Air Filter']);
    mappings.set('engine air filter', ['Engine Air Filter']);
    mappings.set('cabin air filter', ['Cabin Air Filter']);
    mappings.set('cabin filter', ['Cabin Air Filter']);
    mappings.set('pollen filter', ['Cabin Air Filter']);
    mappings.set('hvac filter', ['Cabin Air Filter']);
    
    // Fuel filters
    mappings.set('fuel filter', ['Fuel Filter', 'Fuel Air Bleed Filter']);
    mappings.set('fuelfilter', ['Fuel Filter', 'Fuel Air Bleed Filter']);
    mappings.set('fuel strainer', ['Fuel Filter']);
    mappings.set('fuel air bleed filter', ['Fuel Air Bleed Filter']);
    
    // Hydraulic filters
    mappings.set('hydraulic filter', ['Hydraulic Filter']);
    mappings.set('filter hyd', ['Hydraulic Filter']);
    mappings.set('filterhyd', ['Hydraulic Filter']);
    mappings.set('hyd filter', ['Hydraulic Filter']);
    mappings.set('transmission filter', ['Transmission Filter', 'Hydraulic Filter']);
    mappings.set('trans filter', ['Transmission Filter', 'Hydraulic Filter']);
    
    // Spark plugs
    mappings.set('spark plug', ['Spark Plug']);
    mappings.set('sparkplug', ['Spark Plug']);
    mappings.set('plug', ['Spark Plug']);
    mappings.set('ignition plug', ['Spark Plug']);
    
    // Glow plugs
    mappings.set('glow plug', ['Glow Plug']);
    mappings.set('glowplug', ['Glow Plug']);
    mappings.set('diesel glow plug', ['Glow Plug']);
    
    // O-rings and seals
    mappings.set('o ring', ['O-Ring']);
    mappings.set('oring', ['O-Ring']);
    mappings.set('o-ring', ['O-Ring']);
    mappings.set('seal', ['Seal', 'Oil Seal']);
    mappings.set('oil seal', ['Oil Seal']);
    mappings.set('crankshaft seal', ['Crankshaft Seal']);
    mappings.set('valve stem seal', ['Valve Stem Seal']);
    mappings.set('camshaft seal', ['Camshaft Seal']);
    
    // Bearings
    mappings.set('bearing', ['Wheel Bearing', 'Drive Axle Shaft Bearing', 'Clutch Fork Shaft Bearing']);
    mappings.set('wheel bearing', ['Wheel Bearing']);
    mappings.set('hub bearing', ['Wheel Bearing']);
    mappings.set('drive axle bearing', ['Drive Axle Shaft Bearing']);
    mappings.set('axle bearing', ['Drive Axle Shaft Bearing']);
    mappings.set('clutch bearing', ['Clutch Fork Shaft Bearing']);
    mappings.set('throw out bearing', ['Clutch Release Bearing']);
    mappings.set('release bearing', ['Clutch Release Bearing']);
    
    // Fluids
    mappings.set('coolant', ['Engine Coolant', 'Engine Coolant Filter']);
    mappings.set('engine coolant', ['Engine Coolant']);
    mappings.set('antifreeze', ['Engine Coolant']);
    mappings.set('engine oil', ['Engine Oil']);
    mappings.set('motor oil', ['Engine Oil']);
    mappings.set('oil', ['Engine Oil']);
    mappings.set('hydraulic oil', ['Hydraulic Oil']);
    mappings.set('hyd oil', ['Hydraulic Oil']);
    
    // Transmission fluids
    mappings.set('transmission oil', ['Transmission Oil']);
    mappings.set('transmission fluid', ['Transmission Oil']);
    mappings.set('trans oil', ['Transmission Oil']);
    mappings.set('trans fluid', ['Transmission Oil']);
    mappings.set('gear oil', ['Gear Oil']);
    mappings.set('differential oil', ['Differential Oil']);
    mappings.set('diff oil', ['Differential Oil']);
    
    // Brake components
    mappings.set('brake pad', ['Brake Pad']);
    mappings.set('brake pads', ['Brake Pad']);
    mappings.set('disc brake pad', ['Brake Pad']);
    mappings.set('brake disc', ['Brake Disc']);
    mappings.set('brake rotor', ['Brake Disc']);
    mappings.set('disc brake rotor', ['Brake Disc']);
    mappings.set('brake drum', ['Brake Drum']);
    mappings.set('drum brake', ['Brake Drum']);
    mappings.set('brake shoe', ['Brake Shoe']);
    mappings.set('brake shoes', ['Brake Shoe']);
    mappings.set('brake caliper', ['Brake Caliper']);
    mappings.set('caliper', ['Brake Caliper']);
    mappings.set('brake cylinder', ['Brake Cylinder']);
    mappings.set('wheel cylinder', ['Brake Cylinder']);
    mappings.set('master cylinder', ['Master Cylinder']);
    mappings.set('brake master cylinder', ['Master Cylinder']);
    
    // Belts
    mappings.set('timing belt', ['Timing Belt']);
    mappings.set('cam belt', ['Timing Belt']);
    mappings.set('cambelt', ['Timing Belt']);
    mappings.set('serpentine belt', ['Serpentine Belt']);
    mappings.set('drive belt', ['Serpentine Belt']);
    mappings.set('accessory belt', ['Serpentine Belt']);
    mappings.set('v belt', ['V-Belt']);
    mappings.set('v-belt', ['V-Belt']);
    mappings.set('fan belt', ['V-Belt']);
    mappings.set('alternator belt', ['V-Belt']);
    
    // Engine components
    mappings.set('water pump', ['Water Pump']);
    mappings.set('coolant pump', ['Water Pump']);
    mappings.set('thermostat', ['Thermostat']);
    mappings.set('cooling thermostat', ['Thermostat']);
    mappings.set('radiator', ['Radiator']);
    mappings.set('cooling radiator', ['Radiator']);
    mappings.set('alternator', ['Alternator']);
    mappings.set('generator', ['Alternator']);
    mappings.set('starter', ['Starter']);
    mappings.set('starter motor', ['Starter']);
    mappings.set('ignition coil', ['Ignition Coil']);
    mappings.set('coil', ['Ignition Coil']);
    mappings.set('coil pack', ['Ignition Coil']);
    
    // Engine sensors
    mappings.set('oxygen sensor', ['Oxygen Sensor']);
    mappings.set('o2 sensor', ['Oxygen Sensor']);
    mappings.set('lambda sensor', ['Oxygen Sensor']);
    mappings.set('map sensor', ['Manifold Absolute Pressure Sensor']);
    mappings.set('maf sensor', ['Mass Air Flow Sensor']);
    mappings.set('tps sensor', ['Throttle Position Sensor']);
    mappings.set('throttle position sensor', ['Throttle Position Sensor']);
    mappings.set('crankshaft sensor', ['Crankshaft Position Sensor']);
    mappings.set('crank sensor', ['Crankshaft Position Sensor']);
    mappings.set('camshaft sensor', ['Camshaft Position Sensor']);
    mappings.set('cam sensor', ['Camshaft Position Sensor']);
    
    // Battery
    mappings.set('battery', ['Battery']);
    mappings.set('car battery', ['Battery']);
    mappings.set('automotive battery', ['Battery']);
    mappings.set('truck battery', ['Battery']);
    mappings.set('12v battery', ['Battery']);
    
    // Gaskets
    mappings.set('gasket', ['Gasket']);
    mappings.set('head gasket', ['Head Gasket']);
    mappings.set('cylinder head gasket', ['Head Gasket']);
    mappings.set('valve cover gasket', ['Valve Cover Gasket']);
    mappings.set('rocker cover gasket', ['Valve Cover Gasket']);
    mappings.set('oil pan gasket', ['Oil Pan Gasket']);
    mappings.set('sump gasket', ['Oil Pan Gasket']);
    mappings.set('intake manifold gasket', ['Intake Manifold Gasket']);
    mappings.set('exhaust manifold gasket', ['Exhaust Manifold Gasket']);
    mappings.set('exhaust gasket', ['Exhaust Manifold Gasket']);
    
    // Hoses
    mappings.set('hose', ['Hose']);
    mappings.set('radiator hose', ['Radiator Hose']);
    mappings.set('coolant hose', ['Radiator Hose']);
    mappings.set('heater hose', ['Heater Hose']);
    mappings.set('vacuum hose', ['Vacuum Hose']);
    mappings.set('brake hose', ['Brake Hose']);
    mappings.set('fuel hose', ['Fuel Hose']);
    mappings.set('power steering hose', ['Power Steering Hose']);
    mappings.set('hydraulic hose', ['Hydraulic Hose']);
    
    // Clutch components
    mappings.set('clutch', ['Clutch']);
    mappings.set('clutch kit', ['Clutch Kit']);
    mappings.set('clutch disc', ['Clutch Disc']);
    mappings.set('clutch plate', ['Clutch Disc']);
    mappings.set('friction disc', ['Clutch Disc']);
    mappings.set('pressure plate', ['Pressure Plate']);
    mappings.set('clutch pressure plate', ['Pressure Plate']);
    mappings.set('clutch cover', ['Pressure Plate']);
    mappings.set('flywheel', ['Flywheel']);
    mappings.set('dual mass flywheel', ['Flywheel']);
    
    // Suspension components
    mappings.set('shock absorber', ['Shock Absorber']);
    mappings.set('shock', ['Shock Absorber']);
    mappings.set('shocks', ['Shock Absorber']);
    mappings.set('strut', ['Strut']);
    mappings.set('struts', ['Strut']);
    mappings.set('spring', ['Spring']);
    mappings.set('coil spring', ['Spring']);
    mappings.set('leaf spring', ['Spring']);
    mappings.set('ball joint', ['Ball Joint']);
    mappings.set('tie rod', ['Tie Rod']);
    mappings.set('tie rod end', ['Tie Rod End']);
    mappings.set('control arm', ['Control Arm']);
    mappings.set('wishbone', ['Control Arm']);
    mappings.set('sway bar', ['Sway Bar']);
    mappings.set('anti roll bar', ['Sway Bar']);
    mappings.set('stabilizer bar', ['Sway Bar']);
    
    // Steering components
    mappings.set('power steering pump', ['Power Steering Pump']);
    mappings.set('steering pump', ['Power Steering Pump']);
    mappings.set('rack and pinion', ['Steering Rack']);
    mappings.set('steering rack', ['Steering Rack']);
    mappings.set('steering gear', ['Steering Gear']);
    mappings.set('steering box', ['Steering Gear']);
    
    // Exhaust components
    mappings.set('muffler', ['Muffler']);
    mappings.set('silencer', ['Muffler']);
    mappings.set('exhaust pipe', ['Exhaust Pipe']);
    mappings.set('catalytic converter', ['Catalytic Converter']);
    mappings.set('cat converter', ['Catalytic Converter']);
    mappings.set('catalyst', ['Catalytic Converter']);
    mappings.set('dpf', ['Diesel Particulate Filter']);
    mappings.set('diesel particulate filter', ['Diesel Particulate Filter']);
    mappings.set('egr valve', ['EGR Valve']);
    mappings.set('exhaust gas recirculation valve', ['EGR Valve']);
    
    // Turbocharger components
    mappings.set('turbocharger', ['Turbocharger']);
    mappings.set('turbo', ['Turbocharger']);
    mappings.set('turbocharger gasket', ['Turbocharger Gasket']);
    mappings.set('turbo gasket', ['Turbocharger Gasket']);
    mappings.set('intercooler', ['Intercooler']);
    mappings.set('charge air cooler', ['Intercooler']);
    
    // Timing components
    mappings.set('timing chain', ['Timing Chain']);
    mappings.set('cam chain', ['Timing Chain']);
    mappings.set('timing chain tensioner', ['Timing Chain Tensioner']);
    mappings.set('chain tensioner', ['Timing Chain Tensioner']);
    mappings.set('timing belt tensioner', ['Timing Belt Tensioner']);
    mappings.set('belt tensioner', ['Timing Belt Tensioner']);
    mappings.set('idler pulley', ['Idler Pulley']);
    
    // Fuel system
    mappings.set('fuel pump', ['Fuel Pump']);
    mappings.set('fuel injection pump', ['Fuel Injection Pump']);
    mappings.set('injector', ['Fuel Injector']);
    mappings.set('fuel injector', ['Fuel Injector']);
    mappings.set('diesel injector', ['Diesel Fuel Injector']);
    mappings.set('fuel rail', ['Fuel Rail']);
    mappings.set('fuel tank', ['Fuel Tank']);
    
    // Electrical components
    mappings.set('fuse', ['Fuse']);
    mappings.set('relay', ['Relay']);
    mappings.set('wiring harness', ['Wiring Harness']);
    mappings.set('wire harness', ['Wiring Harness']);
    mappings.set('connector', ['Electrical Connector']);
    mappings.set('bulb', ['Light Bulb']);
    mappings.set('headlight bulb', ['Headlight Bulb']);
    mappings.set('headlamp bulb', ['Headlight Bulb']);
    
    // Air conditioning
    mappings.set('ac compressor', ['A/C Compressor']);
    mappings.set('a/c compressor', ['A/C Compressor']);
    mappings.set('air conditioning compressor', ['A/C Compressor']);
    mappings.set('ac condenser', ['A/C Condenser']);
    mappings.set('a/c condenser', ['A/C Condenser']);
    mappings.set('ac evaporator', ['A/C Evaporator']);
    mappings.set('a/c evaporator', ['A/C Evaporator']);
    mappings.set('refrigerant', ['A/C Refrigerant']);
    mappings.set('freon', ['A/C Refrigerant']);
    
    // Body components
    mappings.set('door handle', ['Door Handle']);
    mappings.set('window regulator', ['Window Regulator']);
    mappings.set('mirror', ['Mirror']);
    mappings.set('side mirror', ['Side Mirror']);
    mappings.set('wing mirror', ['Side Mirror']);
    mappings.set('bumper', ['Bumper']);
    mappings.set('fender', ['Fender']);
    mappings.set('wing', ['Fender']);
    
    return mappings;
  }

  /**
   * Get mapping statistics
   */
  static getStats() {
    const mappings = this.getMappings();
    const totalMappings = mappings.size;
    const totalVariations = Array.from(mappings.values()).reduce((sum, variations) => sum + variations.length, 0);
    
    return {
      totalMappings,
      totalVariations,
      avgVariationsPerPart: totalVariations / totalMappings
    };
  }
}